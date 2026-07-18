// NKERNEL-FOUNDATION-0 §3.5 conflict-ndecision-v1: the N analog of
// runConflictJointDecisionV1 (decisionProvider.ts) — per-participant GoalLab
// S8 over N-generic projected rows, folded into a forced joint action and
// transitioned by the pairwise N-step, with the kernel's own endogenous
// choice as the dual-run reference lane. Reuse, not re-implementation: the
// per-player GoalLab pipeline calls, temperature resolution, candidate
// bridge (buildConflictPossibilities) and projection-gate
// (resolveProjectedChoice) are the exact dyadic functions; only the
// project→row and step→transition seams are swapped for their N-generic
// analogs (projectConflictDefinitionV3ActionsV1 from NKERNEL-DEFINITION-BIND-0,
// resolveConflictNStepV1 from NKERNEL-STEP-0, resolveConflictNChoiceStepV1
// from NKERNEL-CHOICE-0 as the reference lane — the latter is already proven
// to reproduce non-forced resolveProtocolStep byte-for-byte at N = 2).
//
// Scope ADR (NKERNEL_FOUNDATION_0 §3.5/§5.5, decided 2026-07-18):
// single-target actions only. buildConflictPossibilities builds one GoalLab
// Possibility per row with a single targetId; conflict-definition-v3's
// all_others target mode can carry multiple targetIds at N > 2. Multi-target
// fan-out choice is out of scope for this slice and deferred to the same
// future ADR as coalition goals/group payoff (epic §6 item 7); any row with
// more than one targetId fails closed with 'multi_target_not_supported'.
//
// Pure additive: nothing imports this module at runtime (same invariant as
// every other NKERNEL-* module); wiring an N-generic provider into a live
// session is NKERNEL-SESSION-0's job, parity-gated, never default.

import { getMag } from '../../util/atoms';
import { arr } from '../../utils/arr';
import type { ContextAtom } from '../../context/v2/types';
import { runGoalLabPipelineV1, type GoalLabPipelineInputV1 } from '../../goal-lab/pipeline/runPipelineV1';
import type {
  ConflictAction,
  ConflictActionId,
  ConflictPhase,
  ConflictProtocol,
  ConflictProtocolId,
  ForcedActionStrategyMode,
  Result,
} from '../dynamics/types';
import { CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION } from '../definition/types';
import type { ConflictActionProjectionRow } from '../definition/types';
import { validateConflictDefinitionV3, type ConflictDefinitionV3 } from '../definition/conflictDefinitionV3';
import { conflictUtilityCandidateIdV1, resolveProjectedChoice } from '../definition/projection';
import { TRUST_EXCHANGE_ACTION_ORDER } from '../dynamics/trustExchange';
import { projectConflictDefinitionV3ActionsV1, type ConflictActionProjectionRowNV1 } from '../nkernel/ndefinitionbind';
import { resolveConflictNChoiceStepV1 } from '../nkernel/nchoice';
import { participantSetFromConflictPlayersV1 } from '../nkernel/nstate';
import { resolveConflictNStepV1 } from '../nkernel/nstep';
import type { ConflictNStepResultV1, ConflictStateNV1 } from '../nkernel/types';
import { buildConflictPossibilities } from './candidateBridge';
import {
  CONFLICT_CHOICE_POLICY_ID,
  CONFLICT_CHOICE_POLICY_VERSION,
  CONFLICT_CHOICE_TRACE_SCHEMA_VERSION,
  type ConflictChoiceTraceV1,
  type ConflictGoalEnergySourceV1,
  type ConflictPlayerDecisionInputV1,
  type ConflictRankedCandidateTraceV1,
  type ConflictTemperatureSource,
} from './types';

export const CONFLICT_NJOINT_DECISION_SCHEMA_VERSION = 'conflict-njoint-decision-v1' as const;

export type ConflictNIntegrationErrorV1 =
  | { readonly code: 'n_decision_requires_dyad'; readonly participantCount: number; readonly message: string }
  | { readonly code: 'invalid_binding'; readonly message: string }
  | { readonly code: 'missing_pipeline'; readonly playerId: string; readonly message: string }
  | { readonly code: 'unknown_actor_role'; readonly playerId: string; readonly message: string }
  | { readonly code: 'missing_rng_channel'; readonly playerId: string; readonly message: string }
  | { readonly code: 'pipeline_mismatch'; readonly playerId: string; readonly message: string }
  | { readonly code: 'missing_s8_stage'; readonly playerId: string; readonly message: string }
  | { readonly code: 'projection_failed'; readonly playerId: string; readonly message: string }
  | { readonly code: 'multi_target_not_supported'; readonly playerId: string; readonly actionId: string; readonly message: string }
  | { readonly code: 'empty_candidates'; readonly playerId: string; readonly message: string }
  | { readonly code: 'unknown_candidate'; readonly playerId: string; readonly message: string }
  | { readonly code: 'kernel_step_failed'; readonly message: string };

type ConflictNPlayerErrorCodeV1 = Exclude<
  ConflictNIntegrationErrorV1['code'],
  'kernel_step_failed' | 'n_decision_requires_dyad' | 'invalid_binding'
>;

export interface ConflictNJointDecisionArgsV1 {
  readonly state: ConflictStateNV1;
  readonly definition: ConflictDefinitionV3;
  readonly protocol: ConflictProtocol;
  readonly players: Readonly<Record<string, ConflictPlayerDecisionInputV1>>;
  readonly forcedActionStrategyMode?: ForcedActionStrategyMode;
}

export interface ConflictNJointDecisionReportV1 {
  readonly schemaVersion: typeof CONFLICT_NJOINT_DECISION_SCHEMA_VERSION;
  readonly policyId: typeof CONFLICT_CHOICE_POLICY_ID;
  readonly policyVersion: typeof CONFLICT_CHOICE_POLICY_VERSION;
  readonly protocolId: string;
  readonly tick: number;
  readonly players: readonly string[];
  readonly choices: Readonly<Record<string, ConflictChoiceTraceV1>>;
  readonly canonical: {
    readonly forcedActionStrategyMode: ForcedActionStrategyMode;
    readonly actions: Readonly<Record<string, ConflictActionId>>;
    readonly step: ConflictNStepResultV1;
  };
  // Dual-run lane (CONFLICT-CHOICE-ADR-0 §7, lifted to N): the kernel's own
  // endogenous choice, computed side by side via resolveConflictNChoiceStepV1.
  readonly reference: {
    readonly actions: Readonly<Record<string, ConflictActionId>>;
    readonly step: ConflictNStepResultV1;
  };
  readonly divergence: {
    readonly anyDifference: boolean;
    readonly byPlayer: Readonly<Record<string, {
      readonly canonicalActionId: ConflictActionId;
      readonly referenceActionId: ConflictActionId;
      readonly same: boolean;
    }>>;
  };
}

function fail(
  code: ConflictNPlayerErrorCodeV1,
  message: string,
  playerId: string,
  extra?: Record<string, unknown>,
): { ok: false; error: ConflictNIntegrationErrorV1 } {
  return { ok: false, error: { code, message, playerId, ...extra } as ConflictNIntegrationErrorV1 };
}

function failKernel(message: string): { ok: false; error: ConflictNIntegrationErrorV1 } {
  return { ok: false, error: { code: 'kernel_step_failed', message } };
}

function failBinding(message: string): { ok: false; error: ConflictNIntegrationErrorV1 } {
  return { ok: false, error: { code: 'invalid_binding', message } };
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function validateCanonicalTrustBinding(args: ConflictNJointDecisionArgsV1): string | null {
  const { state, definition, protocol } = args;
  const participants = participantSetFromConflictPlayersV1(state.players);
  if (participants.ok === false) {
    return participants.errors.map((error) => error.message).join('; ');
  }
  if (protocol.id !== 'trust_exchange' || definition.protocolId !== 'trust_exchange') {
    return `canonical N decision requires trust_exchange protocol and definition, got ${protocol.id}/${definition.protocolId}`;
  }
  const validated = validateConflictDefinitionV3(definition);
  if (validated.ok === false) {
    return `invalid conflict definition: ${validated.errors.map((error) => error.message).join('; ')}`;
  }
  if (!arraysEqual(protocol.phases, ['simultaneous_choice', 'resolution'])
    || !arraysEqual(protocol.actionOrder, TRUST_EXCHANGE_ACTION_ORDER)) {
    return 'protocol phases/action order do not match the canonical trust_exchange kernel';
  }
  const protocolPlayers = Object.keys(protocol.roles);
  if (!arraysEqual(protocolPlayers, state.players)
    || protocolPlayers.some((playerId) => protocol.roles[playerId] !== 'participant')) {
    return 'protocol role binding does not exactly match the ordered conflict participants';
  }
  const definitionPlayers = definition.roles.map((role) => role.playerId);
  if (definition.playerCount !== state.players.length || !arraysEqual(definitionPlayers, state.players)) {
    return 'definition participant binding does not exactly match the ordered conflict participants';
  }
  if (definition.phases.length !== 1
    || definition.phases[0].id !== 'simultaneous_choice'
    || !arraysEqual(definition.phases[0].actorRoleIds, definition.roles.map((role) => role.id))) {
    return 'definition phase/actor binding does not match canonical simultaneous trust choice';
  }
  const expectedActions = TRUST_EXCHANGE_ACTION_ORDER.flatMap((actionId) => (
    definition.roles.map((role) => `${actionId}\u0000${role.id}`)
  ));
  const actualActions = definition.legalActions.map((action) => {
    const canonicalTarget = action.target.mode === 'all_others' || action.target.mode === 'counterparty';
    return canonicalTarget && action.phaseId === 'simultaneous_choice'
      ? `${action.id}\u0000${action.actorRoleId}`
      : '';
  });
  if (!arraysEqual(actualActions, expectedActions)) {
    return 'definition legal actions do not exactly match canonical trust actions for every participant';
  }
  for (const role of definition.roles) {
    const projected = projectConflictDefinitionV3ActionsV1(definition, role.id, 'simultaneous_choice');
    if (projected.ok === false) return `definition projection failed: ${projected.error.message}`;
    const otherId = state.players.find((playerId) => playerId !== role.playerId);
    if (!otherId
      || projected.value.length !== TRUST_EXCHANGE_ACTION_ORDER.length
      || projected.value.some((row, index) => row.actionId !== TRUST_EXCHANGE_ACTION_ORDER[index]
        || row.targetIds.length !== 1
        || row.targetIds[0] !== otherId)) {
      return `definition actions for ${role.playerId} must each target exactly the canonical counterparty`;
    }
  }
  const suppliedPlayers = Object.keys(args.players);
  if (suppliedPlayers.length !== state.players.length || state.players.some((playerId) => !suppliedPlayers.includes(playerId))) {
    return 'pipeline input binding does not exactly match conflict participants';
  }
  return null;
}

function s8Atoms(pipeline: { stages?: unknown } | null): ContextAtom[] | null {
  const stages = arr<{ stage?: string; atoms?: ContextAtom[] }>((pipeline as { stages?: unknown[] })?.stages);
  const s8 = stages.find((stage) => String(stage?.stage ?? '') === 'S8');
  if (!s8) return null;
  return arr<ContextAtom>(s8.atoms);
}

function s8DecisionArtifact(pipeline: { stages?: unknown } | null): {
  ranked: Array<Record<string, unknown>>;
  best: Record<string, unknown> | null;
  temperature: number;
  topK: number;
} | null {
  const stages = arr<{ stage?: string; artifacts?: Record<string, unknown> }>((pipeline as { stages?: unknown[] })?.stages);
  const s8 = stages.find((stage) => String(stage?.stage ?? '') === 'S8');
  const snapshot = s8?.artifacts?.decisionSnapshot as Record<string, unknown> | undefined;
  if (!snapshot) return null;
  return {
    ranked: arr<Record<string, unknown>>(snapshot.ranked),
    best: snapshot.best && typeof snapshot.best === 'object' ? snapshot.best as Record<string, unknown> : null,
    temperature: Number(snapshot.temperature ?? Number.NaN),
    topK: Number(snapshot.topK ?? Number.NaN),
  };
}

function withoutForceAction(events: unknown): unknown[] {
  return arr<unknown>(events).filter((event) => {
    if (!event || typeof event !== 'object') return true;
    const record = event as Record<string, unknown>;
    return String(record.type ?? record.kind ?? '') !== 'force_action';
  });
}

function rankedGoalEnergySources(entry: Record<string, unknown>): ConflictGoalEnergySourceV1[] {
  const why = entry.why && typeof entry.why === 'object'
    ? entry.why as Record<string, unknown>
    : {};
  const seenGoals = new Set<string>();
  const sources: ConflictGoalEnergySourceV1[] = [];
  for (const raw of arr<Record<string, unknown>>(why.goalEnergySources)) {
    const goalId = String(raw?.goalId ?? '');
    const atomId = String(raw?.atomId ?? '');
    if (!goalId || !atomId || seenGoals.has(goalId)) continue;
    seenGoals.add(goalId);
    sources.push({ goalId, atomId });
  }
  return sources;
}

function rankedUsedAtomIds(entry: Record<string, unknown>): string[] {
  const why = entry.why && typeof entry.why === 'object'
    ? entry.why as Record<string, unknown>
    : {};
  return Array.from(new Set([
    ...arr<string>(entry.usedAtomIds).map(String),
    ...arr<string>(why.usedAtomIds).map(String),
    ...rankedGoalEnergySources(entry).map((source) => source.atomId),
  ].filter(Boolean)));
}

// Identical precedence law to the dyadic provider (trait atom -> world ->
// behavioral params -> agent -> 1.0); CONFLICT-CHOICE-ADR-0 §6 forbids a
// conflict-local temperature law, N does not change that.
function resolveTemperature(
  atoms: ContextAtom[],
  world: GoalLabPipelineInputV1['world'],
  playerId: string,
): { temperature: number; source: ConflictTemperatureSource } {
  const traitTemp = getMag(atoms, `feat:char:${playerId}:trait.decisionTemperature`, -1);
  if (traitTemp >= 0) return { temperature: Math.max(0.05, traitTemp * 2.5), source: 'trait-atom' };
  const agent = arr(world?.agents).find((a) => a?.entityId === playerId);
  const worldTemp = Number((world as { decisionTemperature?: number })?.decisionTemperature ?? Number.NaN);
  if (Number.isFinite(worldTemp)) return { temperature: worldTemp, source: 'world' };
  const behavioralTemp = Number((agent as { behavioralParams?: { T0?: number } })?.behavioralParams?.T0 ?? Number.NaN);
  if (Number.isFinite(behavioralTemp)) return { temperature: behavioralTemp, source: 'agent-behavioral' };
  const agentTemp = Number((agent as { temperature?: number })?.temperature ?? Number.NaN);
  if (Number.isFinite(agentTemp)) return { temperature: agentTemp, source: 'agent' };
  return { temperature: 1.0, source: 'default' };
}

function normalizeRng(rngInput: ConflictPlayerDecisionInputV1['rng']): (() => number) | null {
  if (typeof rngInput === 'function') return rngInput;
  if (rngInput && typeof rngInput.nextFloat === 'function') return () => Number(rngInput.nextFloat());
  return null;
}

// Single documented adapter of this slice (mirrors nstate.ts's
// asKernelConflictStateV1 precedent): mints the dyadic ConflictActionProjectionRow
// shape — including a fresh, deterministic utilityCandidateId — from the N-generic
// row so buildConflictPossibilities/resolveProjectedChoice are reused verbatim,
// not re-implemented. Sound only within this epic's protocol scope
// (trust_exchange), where protocolId/phaseId/actionId values are always members
// of the kernel's own literal unions by construction (same scope boundary as
// buildTrustExchangeProtocolNV1). Requires single-target rows (ADR §5.5); the
// caller gates multi-target rows before calling this.
function toDyadicProjectionRowV1(
  row: ConflictActionProjectionRowNV1,
  tick: number,
  historyLength: number,
): ConflictActionProjectionRow {
  return {
    schemaVersion: CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION,
    protocolId: row.protocolId as ConflictProtocolId,
    phaseId: row.phaseId as ConflictPhase,
    role: 'participant',
    kernelActionId: row.actionId as ConflictActionId,
    actorId: row.actorId,
    targetIds: row.targetIds,
    legalSource: 'protocol_action_order',
    // Same opaque scheme as the dyadic candidateId() (projection.ts) — matching
    // it exactly (not a distinguishing prefix) is what makes the N = 2
    // reduction oracle byte-tight; the ID is documented opaque, never parsed.
    utilityCandidateId: conflictUtilityCandidateIdV1({
      protocolId: row.protocolId,
      phaseId: row.phaseId,
      actorId: row.actorId,
      targetIds: row.targetIds,
      tick,
      historyLength,
      kernelActionId: row.actionId,
    }),
    provenance: { source: 'conflict-kernel-observation', tick, historyLength },
  };
}

export function runConflictNJointDecisionV1(
  args: ConflictNJointDecisionArgsV1,
): Result<ConflictNJointDecisionReportV1, ConflictNIntegrationErrorV1> {
  const { state, definition, protocol } = args;
  if (state.players.length > 2) {
    return {
      ok: false,
      error: {
        code: 'n_decision_requires_dyad',
        participantCount: state.players.length,
        message: `The GoalLab decision provider is dyadic; got ${state.players.length} participants`,
      },
    };
  }
  const bindingError = validateCanonicalTrustBinding(args);
  if (bindingError) return failBinding(bindingError);
  const strategyMode = args.forcedActionStrategyMode ?? 'learn_from_utility';
  // trust_exchange has exactly one acting phase; the N-protocol constructor
  // (buildTrustExchangeProtocolNV1) always places it first (NKERNEL_FOUNDATION_0 §3.2).
  const phaseId = protocol.phases[0];

  const choices: Record<string, ConflictChoiceTraceV1> = {};
  const forcedJointActions: ConflictAction[] = [];

  for (const playerId of state.players) {
    const playerInput = args.players[playerId];
    if (!playerInput) return fail('missing_pipeline', `No GoalLab pipeline input supplied for ${playerId}`, playerId);

    const role = definition.roles.find((candidate) => candidate.playerId === playerId);
    if (!role) return fail('unknown_actor_role', `No definition role maps to participant ${playerId}`, playerId);

    const rng = normalizeRng(playerInput.rng);
    if (!rng) return fail('missing_rng_channel', `No seeded rng channel for ${playerId} (channel ${playerInput.rngChannelId || 'unnamed'})`, playerId);

    const callerSceneControl = (playerInput.pipelineInput as { sceneControl?: Record<string, unknown> }).sceneControl;
    const callerProfile = callerSceneControl?.runtimeProfile;
    const runtimeProfile = typeof callerProfile === 'string'
      ? { profileId: callerProfile, goalEnergyDomainUnionV1: true }
      : {
        ...(callerProfile && typeof callerProfile === 'object' ? callerProfile as Record<string, unknown> : {}),
        goalEnergyDomainUnionV1: true,
      };
    const pipelineInput = {
      ...playerInput.pipelineInput,
      injectedEvents: withoutForceAction(playerInput.pipelineInput.injectedEvents),
      sceneControl: { ...(callerSceneControl ?? {}), runtimeProfile },
    };
    const baselinePipeline = runGoalLabPipelineV1({
      ...pipelineInput,
      externalPossibilities: undefined,
      externalPossibilityMode: 'merge',
      decisionRng: () => 0.5,
    });
    if (!baselinePipeline) return fail('missing_pipeline', `GoalLab baseline pipeline failed for ${playerId}`, playerId);
    const hasAllPlayers = state.players.every((id) => baselinePipeline.participantIds.includes(id));
    if (baselinePipeline.selfId !== playerId || baselinePipeline.tick !== state.tick || !hasAllPlayers) {
      return fail('pipeline_mismatch', `GoalLab baseline identity does not match conflict state for ${playerId}`, playerId);
    }
    const atoms = s8Atoms(baselinePipeline);
    if (!atoms) return fail('missing_s8_stage', `Pipeline run for ${playerId} has no S8 stage`, playerId);

    const projected = projectConflictDefinitionV3ActionsV1(definition, role.id, phaseId);
    if (projected.ok === false) return fail('projection_failed', projected.error.message, playerId);
    const multiTarget = projected.value.find((row) => row.targetIds.length > 1);
    if (multiTarget) {
      return fail(
        'multi_target_not_supported',
        `action ${multiTarget.actionId} targets ${multiTarget.targetIds.length} participants; NKERNEL-DECISION-0 v1 supports single-target actions only (NKERNEL_FOUNDATION_0 §5.5)`,
        playerId,
        { actionId: multiTarget.actionId },
      );
    }
    const rows = projected.value.map((row) => toDyadicProjectionRowV1(row, state.tick, state.history.length));

    const { possibilities } = buildConflictPossibilities({ rows, atoms, selfId: playerId });
    const conflictPipeline = runGoalLabPipelineV1({
      ...pipelineInput,
      externalPossibilities: possibilities,
      externalPossibilityMode: 'replace',
      decisionRng: rng,
    });
    const decision = s8DecisionArtifact(conflictPipeline);
    if (conflictPipeline && (conflictPipeline.selfId !== playerId || conflictPipeline.tick !== state.tick)) {
      return fail('pipeline_mismatch', `GoalLab conflict pipeline identity changed for ${playerId}`, playerId);
    }
    if (!decision || decision.ranked.length !== rows.length) {
      return fail('empty_candidates', `GoalLab S8 did not rank the complete legal action set for ${playerId}`, playerId);
    }

    const { temperature, source: temperatureSource } = resolveTemperature(atoms, pipelineInput.world, playerId);
    if (!Number.isFinite(decision.temperature) || Math.abs(decision.temperature - temperature) > 1e-9) {
      return fail('empty_candidates', `GoalLab S8 temperature mismatch for ${playerId}`, playerId);
    }
    if (!Number.isFinite(decision.topK) || decision.topK < 1) {
      return fail('empty_candidates', `GoalLab S8 did not expose its sampling topK for ${playerId}`, playerId);
    }
    const chosenId = String(decision.best?.id ?? '');
    if (!chosenId) return fail('empty_candidates', `Policy returned no chosen candidate for ${playerId}`, playerId);

    const resolved = resolveProjectedChoice(rows, chosenId);
    if (resolved.ok === false) return fail('unknown_candidate', resolved.error.message, playerId);
    forcedJointActions.push(resolved.value);

    const rowByCandidateId = new Map(rows.map((row) => [row.utilityCandidateId, row]));
    const ranked: ConflictRankedCandidateTraceV1[] = decision.ranked.map((entry) => ({
      utilityCandidateId: String(entry.id ?? ''),
      kernelActionId: rowByCandidateId.get(String(entry.id ?? ''))?.kernelActionId as ConflictActionId,
      q: Number(entry?.q ?? 0),
      qUsed: Number(entry?.qUsed ?? entry?.q ?? 0),
      sampleNoise: Number(entry?.sampleNoise ?? 0),
      sampleScore: Number(entry?.sampleScore ?? 0),
      inTieBand: Boolean(entry?.inTieBand),
      inSamplingPool: Boolean(entry?.inSamplingPool),
      effectiveTemperature: Number(entry?.effectiveTemperature ?? temperature),
      marginFromBest: Number(entry?.marginFromBest ?? 0),
      chosen: Boolean(entry?.chosen),
      usedAtomIds: rankedUsedAtomIds(entry),
      goalEnergySources: rankedGoalEnergySources(entry),
    }));
    if (ranked.some((entry) => !entry.kernelActionId)) {
      return fail('unknown_candidate', `GoalLab S8 returned a candidate outside the typed projection for ${playerId}`, playerId);
    }

    choices[playerId] = {
      schemaVersion: CONFLICT_CHOICE_TRACE_SCHEMA_VERSION,
      policyId: CONFLICT_CHOICE_POLICY_ID,
      policyVersion: CONFLICT_CHOICE_POLICY_VERSION,
      playerId,
      goalEnergyMode: 'domain-union-v1',
      rngChannelId: playerInput.rngChannelId,
      temperature,
      temperatureSource,
      topK: decision.topK,
      samplingPoolCandidateIds: ranked.filter((entry) => entry.inSamplingPool).map((entry) => entry.utilityCandidateId),
      protocolId: protocol.id,
      phaseId: rows[0]?.phaseId ?? phaseId,
      projectedRows: rows,
      ranked,
      chosenUtilityCandidateId: chosenId,
      kernelActionId: resolved.value.actionId,
      usedAtomIds: arr<string>(decision.best?.usedAtomIds).map(String),
    };
  }

  const canonicalStep = resolveConflictNStepV1({
    state,
    protocol,
    forcedJointActions,
    forcedActionStrategyMode: strategyMode,
  });
  if (canonicalStep.ok === false) return failKernel(`Canonical step rejected: ${canonicalStep.error.message}`);

  // Dual-run reference lane, lifted to N: the kernel's own endogenous choice
  // (replicator + dominant action) via resolveConflictNChoiceStepV1 — already
  // proven to reproduce non-forced resolveProtocolStep byte-for-byte at N = 2
  // (NKERNEL-CHOICE-0 reduction oracle).
  const referenceChoice = resolveConflictNChoiceStepV1({ state, protocol });
  if (referenceChoice.ok === false) return failKernel(`Reference step rejected: ${referenceChoice.error.message}`);

  const byPlayer: Record<string, { canonicalActionId: ConflictActionId; referenceActionId: ConflictActionId; same: boolean }> = {};
  let anyDifference = false;
  for (const playerId of state.players) {
    const canonicalActionId = canonicalStep.value.actions[playerId];
    const referenceActionId = referenceChoice.value.chosenActions[playerId];
    const same = canonicalActionId === referenceActionId;
    if (!same) anyDifference = true;
    byPlayer[playerId] = { canonicalActionId, referenceActionId, same };
  }

  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_NJOINT_DECISION_SCHEMA_VERSION,
      policyId: CONFLICT_CHOICE_POLICY_ID,
      policyVersion: CONFLICT_CHOICE_POLICY_VERSION,
      protocolId: protocol.id,
      tick: state.tick,
      players: state.players,
      choices,
      canonical: {
        forcedActionStrategyMode: strategyMode,
        actions: canonicalStep.value.actions,
        step: canonicalStep.value,
      },
      reference: {
        actions: referenceChoice.value.chosenActions,
        step: referenceChoice.value.step,
      },
      divergence: { anyDifference, byPlayer },
    },
  };
}
