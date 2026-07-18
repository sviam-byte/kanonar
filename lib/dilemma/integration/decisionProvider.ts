import { getMag } from '../../util/atoms';
import { arr } from '../../utils/arr';
import type { ContextAtom } from '../../context/v2/types';
import { runGoalLabPipelineV1, type GoalLabPipelineInputV1 } from '../../goal-lab/pipeline/runPipelineV1';
import type {
  ConflictAction,
  ConflictActionId,
  ConflictPlayerId,
  Result,
} from '../dynamics/types';
import { TRUST_EXCHANGE_DEFINITION } from '../definition/trustExchangeDefinition';
import { projectLegalActions, resolveProjectedChoice } from '../definition/projection';
import { buildConflictPossibilities } from './candidateBridge';
import {
  CONFLICT_CHOICE_POLICY_ID,
  CONFLICT_CHOICE_POLICY_VERSION,
  CONFLICT_CHOICE_TRACE_SCHEMA_VERSION,
  CONFLICT_JOINT_DECISION_SCHEMA_VERSION,
  type ConflictChoiceTraceV1,
  type ConflictGoalEnergySourceV1,
  type ConflictIntegrationError,
  type ConflictJointDecisionArgsV1,
  type ConflictJointDecisionReportV1,
  type ConflictRankedCandidateTraceV1,
  type ConflictTemperatureSource,
} from './types';

function fail(
  code: ConflictIntegrationError['code'],
  message: string,
  playerId?: ConflictPlayerId,
): { ok: false; error: ConflictIntegrationError } {
  return { ok: false, error: { code, message, playerId } };
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

// Same precedence as runPipelineV1 S8 (trait atom -> world -> behavioral
// params -> agent -> 1.0); CONFLICT-CHOICE-ADR-0 §6 forbids a conflict-local
// temperature law.
function resolveTemperature(
  atoms: ContextAtom[],
  world: GoalLabPipelineInputV1['world'],
  playerId: ConflictPlayerId,
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

export function runConflictJointDecisionV1(
  args: ConflictJointDecisionArgsV1,
): Result<ConflictJointDecisionReportV1, ConflictIntegrationError> {
  const definition = args.definition ?? TRUST_EXCHANGE_DEFINITION;
  const state = args.state;
  const protocol = definition.createProtocol(state.players);
  const strategyMode = args.forcedActionStrategyMode ?? 'learn_from_utility';

  const choices: Record<ConflictPlayerId, ConflictChoiceTraceV1> = {};
  const forcedJointActions: ConflictAction[] = [];

  for (const playerId of state.players) {
    const playerInput = args.players[playerId];
    if (!playerInput) {
      return fail('missing_pipeline', `No GoalLab pipeline input supplied for ${playerId}`, playerId);
    }

    // Fail-closed seed contract (ADR §6): no neutral-0.5 fallback here.
    const rngRaw = playerInput.rng;
    const rng = typeof rngRaw === 'function'
      ? rngRaw
      : rngRaw && typeof rngRaw.nextFloat === 'function'
        ? () => Number(rngRaw.nextFloat())
        : null;
    if (!rng) {
      return fail('missing_rng_channel', `No seeded rng channel for ${playerId} (channel ${playerInput.rngChannelId || 'unnamed'})`, playerId);
    }

    // CONFLICT-PARITY-0: conflict candidates carry goal-domain deltas, so the
    // S8 goal-energy map must include domain energies (union mode) or every
    // conflict Q collapses to -cost and the choice degenerates to pure Gumbel
    // noise. Opt-in per run; the caller's runtime profile is preserved.
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
    // Baseline нужен только для belief-атомов: он не должен расходовать
    // канонический Conflict RNG-канал до настоящего S8 choice.
    const baselinePipeline = runGoalLabPipelineV1({
      ...pipelineInput,
      externalPossibilities: undefined,
      externalPossibilityMode: 'merge',
      decisionRng: () => 0.5,
    });
    if (!baselinePipeline) {
      return fail('missing_pipeline', `GoalLab baseline pipeline failed for ${playerId}`, playerId);
    }
    const hasAllPlayers = state.players.every((id) => baselinePipeline.participantIds.includes(id));
    if (baselinePipeline.selfId !== playerId || baselinePipeline.tick !== state.tick || !hasAllPlayers) {
      return fail('pipeline_mismatch', `GoalLab baseline identity does not match conflict state for ${playerId}`, playerId);
    }
    const atoms = s8Atoms(baselinePipeline);
    if (!atoms) {
      return fail('missing_s8_stage', `Pipeline run for ${playerId} has no S8 stage`, playerId);
    }

    const projected = projectLegalActions(definition, state, protocol, playerId);
    if (projected.ok === false) {
      return fail('projection_failed', projected.error.message, playerId);
    }
    const rows = projected.value;

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
    if (!chosenId) {
      return fail('empty_candidates', `Policy returned no chosen candidate for ${playerId}`, playerId);
    }

    const resolved = resolveProjectedChoice(rows, chosenId);
    if (resolved.ok === false) {
      return fail('unknown_candidate', resolved.error.message, playerId);
    }
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
      phaseId: rows[0]?.phaseId ?? 'simultaneous_choice',
      projectedRows: rows,
      ranked,
      chosenUtilityCandidateId: chosenId,
      kernelActionId: resolved.value.actionId,
      usedAtomIds: arr<string>(decision.best?.usedAtomIds).map(String),
    };
  }

  const canonicalStep = definition.step(state, protocol, {
    forcedJointActions,
    forcedActionStrategyMode: strategyMode,
  });
  if (canonicalStep.ok === false) {
    return fail('kernel_step_failed', `Canonical step rejected: ${canonicalStep.error.message}`);
  }

  // Dual-run reference lane (ADR §7): kernel-internal replicator+argmax.
  const referenceStep = definition.step(state, protocol);
  if (referenceStep.ok === false) {
    return fail('kernel_step_failed', `Reference step rejected: ${referenceStep.error.message}`);
  }

  const byPlayer: Record<ConflictPlayerId, { canonicalActionId: ConflictActionId; referenceActionId: ConflictActionId; same: boolean }> = {};
  let anyDifference = false;
  for (const playerId of state.players) {
    const canonicalActionId = canonicalStep.value.actions[playerId];
    const referenceActionId = referenceStep.value.actions[playerId];
    const same = canonicalActionId === referenceActionId;
    if (!same) anyDifference = true;
    byPlayer[playerId] = { canonicalActionId, referenceActionId, same };
  }

  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_JOINT_DECISION_SCHEMA_VERSION,
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
        actions: referenceStep.value.actions,
        step: referenceStep.value,
      },
      divergence: { anyDifference, byPlayer },
    },
  };
}
