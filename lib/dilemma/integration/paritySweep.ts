import type { ConflictActionId, ConflictPlayerId } from '../dynamics/types';
import type { ConflictChoiceTraceV1, ConflictJointDecisionReportV1 } from './types';

// CONFLICT-PARITY-0 (plan §CONFLICT-6.3): dual-run parity evidence.
//
// This module is pure: it extracts one comparison record per joint decision
// from the report that runConflictJointDecisionV1 already emits, and
// aggregates records into the evidence summary quoted by
// docs/unification/CONFLICT_PARITY_0.md. Scene/world construction, the grid
// definition and artifact writing live in the harness
// (tests/dilemma/conflictParityEvidence.test.ts) — the goal here is to
// measure semantic differences between the canonical S8 lane and the kernel
// replicator+argmax reference lane, never to resolve them.

export const CONFLICT_PARITY_EVIDENCE_SCHEMA_VERSION = 'conflict-parity-evidence-v1' as const;

export interface ConflictParityMetaV1 {
  /** Stable cell id, e.g. "rel=allied|agents=coop-coop|env=calm|seed=11". */
  readonly cellId: string;
  /** Named grid dimensions (relation preset, agent pairing, environment...). */
  readonly dims: Readonly<Record<string, string>>;
  readonly seed: number;
  /** 0-based step index inside the rollout. */
  readonly tickIndex: number;
}

export interface ConflictParityPlayerRecordV1 {
  readonly playerId: ConflictPlayerId;
  readonly canonicalActionId: ConflictActionId;
  readonly referenceActionId: ConflictActionId;
  readonly agree: boolean;
  /** S8 utility per kernel action (pre-noise Q from the choice trace). */
  readonly canonicalQ: Readonly<Record<string, number>>;
  /** Kernel utility U per action from the reference step. */
  readonly referenceU: Readonly<Record<string, number>>;
  /** Updated replicator profile the reference argmax actually used. */
  readonly referenceProfile: Readonly<Record<string, number>>;
  readonly canonicalRankOrder: readonly ConflictActionId[];
  readonly referenceRankOrder: readonly ConflictActionId[];
  readonly rankTop1Agree: boolean;
  /** Fraction of action pairs ordered the same way by Q and by U. */
  readonly rankPairConcordance: number;
  /** Projection rows expose exactly the kernel's legal action set. */
  readonly legalSetMatch: boolean;
  readonly traceComplete: boolean;
}

export interface ConflictParityDecisionRecordV1 {
  readonly meta: ConflictParityMetaV1;
  readonly players: readonly ConflictPlayerId[];
  readonly jointAgree: boolean;
  readonly byPlayer: Readonly<Record<ConflictPlayerId, ConflictParityPlayerRecordV1>>;
  /**
   * Only comparable when both lanes picked the same joint action: the forced
   * (learn_from_utility) transition should then be equivalent to the kernel's
   * own step, minus the intervention marker.
   */
  readonly transitionParityWhenAgree: {
    readonly payoffsEqual: boolean;
    readonly relationsEqual: boolean;
    readonly profilesEqual: boolean;
  } | null;
}

export interface ConflictParityDivergenceExampleV1 {
  readonly meta: ConflictParityMetaV1;
  readonly playerId: ConflictPlayerId;
  readonly canonicalActionId: ConflictActionId;
  readonly referenceActionId: ConflictActionId;
  readonly canonicalQ: Readonly<Record<string, number>>;
  readonly referenceU: Readonly<Record<string, number>>;
  readonly referenceProfile: Readonly<Record<string, number>>;
}

export interface ConflictParityAggregateV1 {
  readonly schemaVersion: typeof CONFLICT_PARITY_EVIDENCE_SCHEMA_VERSION;
  readonly nDecisions: number;
  readonly nPlayerDecisions: number;
  readonly actionAgreementRate: number;
  readonly jointAgreementRate: number;
  readonly rankTop1AgreementRate: number;
  readonly meanRankPairConcordance: number;
  readonly legalSetMatchRate: number;
  readonly traceCompleteRate: number;
  readonly agreementByDim: Readonly<Record<string, Readonly<Record<string, { n: number; agree: number; rate: number }>>>>;
  readonly agreementByTick: Readonly<Record<string, { n: number; agree: number; rate: number }>>;
  /** confusion[canonicalActionId][referenceActionId] = player-decision count. */
  readonly confusion: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly actionShare: {
    readonly canonical: Readonly<Record<string, number>>;
    readonly reference: Readonly<Record<string, number>>;
  };
  readonly transitionParity: {
    readonly nJointAgree: number;
    readonly payoffsEqual: number;
    readonly relationsEqual: number;
    readonly profilesEqual: number;
  };
  readonly divergenceExamples: readonly ConflictParityDivergenceExampleV1[];
}

function rankOrder(
  values: Readonly<Record<string, number>>,
  actionOrder: readonly ConflictActionId[],
): ConflictActionId[] {
  // Stable: descending value, kernel action order breaks exact ties.
  return [...actionOrder].sort((a, b) => {
    const diff = (values[b] ?? 0) - (values[a] ?? 0);
    if (diff !== 0) return diff;
    return actionOrder.indexOf(a) - actionOrder.indexOf(b);
  });
}

export function rankPairConcordanceV1(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
  actionOrder: readonly ConflictActionId[],
): number {
  let pairs = 0;
  let concordant = 0;
  for (let i = 0; i < actionOrder.length; i += 1) {
    for (let j = i + 1; j < actionOrder.length; j += 1) {
      const x = actionOrder[i];
      const y = actionOrder[j];
      const da = Math.sign((a[x] ?? 0) - (a[y] ?? 0));
      const db = Math.sign((b[x] ?? 0) - (b[y] ?? 0));
      // A tie in either ranking is neither evidence for nor against: count
      // a shared tie as agreement, but exclude one-sided ties from the
      // denominator entirely.
      if (da === 0 || db === 0) {
        if (da === 0 && db === 0) {
          pairs += 1;
          concordant += 1;
        }
        continue;
      }
      pairs += 1;
      if (da === db) concordant += 1;
    }
  }
  return pairs === 0 ? 1 : concordant / pairs;
}

function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return set.size === a.length && new Set(b).size === b.length && b.every((id) => set.has(id));
}

function hasCompleteGoalEnergyTrace(
  sources: readonly { readonly goalId: string; readonly atomId: string }[] | undefined,
): boolean {
  if (!sources?.length) return false;
  const goalIds = sources.map((source) => source.goalId);
  const atomIds = sources.map((source) => source.atomId);
  return sources.every((source) => Boolean(source.goalId) && Boolean(source.atomId))
    && new Set(goalIds).size === goalIds.length
    && new Set(atomIds).size === atomIds.length;
}

export function isConflictChoiceTraceCompleteV1(choice: ConflictChoiceTraceV1): boolean {
  const projectedActionIds = choice.projectedRows.map((row) => row.kernelActionId);
  const rankedActionIds = choice.ranked.map((entry) => entry.kernelActionId);
  const chosenEntries = choice.ranked.filter((entry) => entry.chosen);
  const samplingPoolCandidateIds = choice.ranked
    .filter((entry) => entry.inSamplingPool)
    .map((entry) => entry.utilityCandidateId);
  return choice.ranked.length === choice.projectedRows.length
    && sameIdSet(rankedActionIds, projectedActionIds)
    && choice.usedAtomIds.length > 0
    && choice.samplingPoolCandidateIds.length > 0
    && sameIdSet(choice.samplingPoolCandidateIds, samplingPoolCandidateIds)
    && chosenEntries.length === 1
    && chosenEntries[0].utilityCandidateId === choice.chosenUtilityCandidateId
    && chosenEntries[0].kernelActionId === choice.kernelActionId
    && choice.ranked.every((entry) => Number.isFinite(entry.q)
      && Number.isFinite(entry.effectiveTemperature)
      && entry.usedAtomIds.length > 0
      && hasCompleteGoalEnergyTrace(entry.goalEnergySources)
      && entry.goalEnergySources?.every((source) => entry.usedAtomIds.includes(source.atomId)) === true);
}

export function extractConflictParityRecordV1(
  report: ConflictJointDecisionReportV1,
  meta: ConflictParityMetaV1,
): ConflictParityDecisionRecordV1 {
  const byPlayer: Record<ConflictPlayerId, ConflictParityPlayerRecordV1> = {};

  for (const playerId of report.players) {
    const choice = report.choices[playerId];
    const referenceBreakdowns = report.reference.step.utilities[playerId] ?? [];
    const actionOrder = referenceBreakdowns.map((entry) => entry.actionId);

    const canonicalQ: Record<string, number> = {};
    for (const entry of choice.ranked) canonicalQ[entry.kernelActionId] = entry.q;
    const referenceU: Record<string, number> = {};
    for (const entry of referenceBreakdowns) referenceU[entry.actionId] = entry.U;
    const referenceProfile: Record<string, number> = {
      ...(report.reference.step.strategyProfiles[playerId]?.probabilities ?? {}),
    };

    const canonicalRankOrder = rankOrder(canonicalQ, actionOrder);
    const referenceRankOrder = rankOrder(referenceU, actionOrder);
    const canonicalActionId = report.canonical.actions[playerId];
    const referenceActionId = report.reference.actions[playerId];

    const projectedActionIds = choice.projectedRows.map((row) => row.kernelActionId);
    const traceComplete = isConflictChoiceTraceCompleteV1(choice);

    byPlayer[playerId] = {
      playerId,
      canonicalActionId,
      referenceActionId,
      agree: canonicalActionId === referenceActionId,
      canonicalQ,
      referenceU,
      referenceProfile,
      canonicalRankOrder,
      referenceRankOrder,
      rankTop1Agree: canonicalRankOrder[0] === referenceRankOrder[0],
      rankPairConcordance: rankPairConcordanceV1(canonicalQ, referenceU, actionOrder),
      legalSetMatch: sameIdSet(projectedActionIds, actionOrder),
      traceComplete,
    };
  }

  const jointAgree = report.divergence.anyDifference === false;
  const transitionParityWhenAgree = jointAgree
    ? {
      payoffsEqual: JSON.stringify(report.canonical.step.outcome.payoffs)
        === JSON.stringify(report.reference.step.outcome.payoffs),
      relationsEqual: JSON.stringify(report.canonical.step.state.relations)
        === JSON.stringify(report.reference.step.state.relations),
      profilesEqual: JSON.stringify(report.canonical.step.state.strategyProfiles)
        === JSON.stringify(report.reference.step.state.strategyProfiles),
    }
    : null;

  return {
    meta,
    players: report.players,
    jointAgree,
    byPlayer,
    transitionParityWhenAgree,
  };
}

const DIVERGENCE_EXAMPLE_CAP_PER_PAIR = 3;

export function aggregateConflictParityEvidenceV1(
  records: readonly ConflictParityDecisionRecordV1[],
): ConflictParityAggregateV1 {
  let nPlayerDecisions = 0;
  let agreeCount = 0;
  let jointAgreeCount = 0;
  let rankTop1Count = 0;
  let concordanceSum = 0;
  let legalSetCount = 0;
  let traceCompleteCount = 0;

  const agreementByDim: Record<string, Record<string, { n: number; agree: number; rate: number }>> = {};
  const agreementByTick: Record<string, { n: number; agree: number; rate: number }> = {};
  const confusion: Record<string, Record<string, number>> = {};
  const canonicalShare: Record<string, number> = {};
  const referenceShare: Record<string, number> = {};
  const transitionParity = { nJointAgree: 0, payoffsEqual: 0, relationsEqual: 0, profilesEqual: 0 };
  const divergenceExamples: ConflictParityDivergenceExampleV1[] = [];
  const examplesPerPair: Record<string, number> = {};

  for (const record of records) {
    if (record.jointAgree) jointAgreeCount += 1;
    if (record.transitionParityWhenAgree) {
      transitionParity.nJointAgree += 1;
      if (record.transitionParityWhenAgree.payoffsEqual) transitionParity.payoffsEqual += 1;
      if (record.transitionParityWhenAgree.relationsEqual) transitionParity.relationsEqual += 1;
      if (record.transitionParityWhenAgree.profilesEqual) transitionParity.profilesEqual += 1;
    }

    for (const playerId of record.players) {
      const player = record.byPlayer[playerId];
      nPlayerDecisions += 1;
      concordanceSum += player.rankPairConcordance;
      if (player.agree) agreeCount += 1;
      if (player.rankTop1Agree) rankTop1Count += 1;
      if (player.legalSetMatch) legalSetCount += 1;
      if (player.traceComplete) traceCompleteCount += 1;

      canonicalShare[player.canonicalActionId] = (canonicalShare[player.canonicalActionId] ?? 0) + 1;
      referenceShare[player.referenceActionId] = (referenceShare[player.referenceActionId] ?? 0) + 1;
      if (!confusion[player.canonicalActionId]) confusion[player.canonicalActionId] = {};
      confusion[player.canonicalActionId][player.referenceActionId] =
        (confusion[player.canonicalActionId][player.referenceActionId] ?? 0) + 1;

      for (const [dim, value] of Object.entries(record.meta.dims)) {
        if (!agreementByDim[dim]) agreementByDim[dim] = {};
        if (!agreementByDim[dim][value]) agreementByDim[dim][value] = { n: 0, agree: 0, rate: 0 };
        agreementByDim[dim][value].n += 1;
        if (player.agree) agreementByDim[dim][value].agree += 1;
      }
      const tickKey = String(record.meta.tickIndex);
      if (!agreementByTick[tickKey]) agreementByTick[tickKey] = { n: 0, agree: 0, rate: 0 };
      agreementByTick[tickKey].n += 1;
      if (player.agree) agreementByTick[tickKey].agree += 1;

      if (!player.agree) {
        const pairKey = `${player.canonicalActionId}->${player.referenceActionId}`;
        const used = examplesPerPair[pairKey] ?? 0;
        if (used < DIVERGENCE_EXAMPLE_CAP_PER_PAIR) {
          examplesPerPair[pairKey] = used + 1;
          divergenceExamples.push({
            meta: record.meta,
            playerId,
            canonicalActionId: player.canonicalActionId,
            referenceActionId: player.referenceActionId,
            canonicalQ: player.canonicalQ,
            referenceU: player.referenceU,
            referenceProfile: player.referenceProfile,
          });
        }
      }
    }
  }

  for (const dim of Object.keys(agreementByDim)) {
    for (const value of Object.keys(agreementByDim[dim])) {
      const cell = agreementByDim[dim][value];
      cell.rate = cell.n === 0 ? 0 : cell.agree / cell.n;
    }
  }
  for (const tickKey of Object.keys(agreementByTick)) {
    const cell = agreementByTick[tickKey];
    cell.rate = cell.n === 0 ? 0 : cell.agree / cell.n;
  }

  return {
    schemaVersion: CONFLICT_PARITY_EVIDENCE_SCHEMA_VERSION,
    nDecisions: records.length,
    nPlayerDecisions,
    actionAgreementRate: nPlayerDecisions === 0 ? 0 : agreeCount / nPlayerDecisions,
    jointAgreementRate: records.length === 0 ? 0 : jointAgreeCount / records.length,
    rankTop1AgreementRate: nPlayerDecisions === 0 ? 0 : rankTop1Count / nPlayerDecisions,
    meanRankPairConcordance: nPlayerDecisions === 0 ? 0 : concordanceSum / nPlayerDecisions,
    legalSetMatchRate: nPlayerDecisions === 0 ? 0 : legalSetCount / nPlayerDecisions,
    traceCompleteRate: nPlayerDecisions === 0 ? 0 : traceCompleteCount / nPlayerDecisions,
    agreementByDim,
    agreementByTick,
    confusion,
    actionShare: { canonical: canonicalShare, reference: referenceShare },
    transitionParity,
    divergenceExamples,
  };
}
