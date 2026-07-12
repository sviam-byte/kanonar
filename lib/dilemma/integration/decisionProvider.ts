import { decideAction } from '../../decision/decide';
import { buildActionCandidates } from '../../decision/actionCandidateUtils';
import { getMag } from '../../util/atoms';
import { arr } from '../../utils/arr';
import type { ContextAtom } from '../../context/v2/types';
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
  type ConflictIntegrationError,
  type ConflictJointDecisionArgsV1,
  type ConflictJointDecisionReportV1,
  type ConflictRankedCandidateTraceV1,
  type ConflictTemperatureSource,
} from './types';

// topK mirrors the pipeline's non-priorFirst S8 default (TOPK-POOL-CAP);
// with |legal actions| = 3 it never truncates the pool, but the policy
// contract stays byte-compatible with goal_lab_s8_gumbel_v1.
const POLICY_TOP_K = 10;

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

// Same precedence as runPipelineV1 S8 (trait atom -> world -> behavioral
// params -> agent -> 1.0); CONFLICT-CHOICE-ADR-0 §6 forbids a conflict-local
// temperature law.
function resolveTemperature(
  atoms: ContextAtom[],
  world: ConflictJointDecisionArgsV1['players'][string]['world'],
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
    if (!playerInput || !playerInput.pipeline) {
      return fail('missing_pipeline', `No GoalLab pipeline run supplied for ${playerId}`, playerId);
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

    const atoms = s8Atoms(playerInput.pipeline);
    if (!atoms) {
      return fail('missing_s8_stage', `Pipeline run for ${playerId} has no S8 stage`, playerId);
    }

    const projected = projectLegalActions(definition, state, protocol, playerId);
    if (projected.ok === false) {
      return fail('projection_failed', projected.error.message, playerId);
    }
    const rows = projected.value;

    const { possibilities } = buildConflictPossibilities({ rows, atoms, selfId: playerId });
    const { actions, goalEnergy } = buildActionCandidates({
      selfId: playerId,
      atoms,
      possibilities,
      currentTick: state.tick,
    });
    if (!actions.length) {
      return fail('empty_candidates', `No conflict candidates were built for ${playerId}`, playerId);
    }

    const { temperature, source: temperatureSource } = resolveTemperature(atoms, playerInput.world, playerId);
    const decision = decideAction({ actions, goalEnergy, temperature, rng, topK: POLICY_TOP_K });
    const chosenId = String(decision?.best?.id ?? '');
    if (!chosenId) {
      return fail('empty_candidates', `Policy returned no chosen candidate for ${playerId}`, playerId);
    }

    const resolved = resolveProjectedChoice(rows, chosenId);
    if (resolved.ok === false) {
      return fail('unknown_candidate', resolved.error.message, playerId);
    }
    forcedJointActions.push(resolved.value);

    const rowByCandidateId = new Map(rows.map((row) => [row.utilityCandidateId, row]));
    const ranked: ConflictRankedCandidateTraceV1[] = arr(decision.ranked).map((entry) => ({
      utilityCandidateId: String(entry?.action?.id ?? ''),
      kernelActionId: rowByCandidateId.get(String(entry?.action?.id ?? ''))?.kernelActionId as ConflictActionId,
      q: Number(entry?.q ?? 0),
      qUsed: Number(entry?.qUsed ?? entry?.q ?? 0),
      sampleNoise: Number(entry?.sampleNoise ?? 0),
      sampleScore: Number(entry?.sampleScore ?? 0),
      inTieBand: Boolean(entry?.inTieBand),
      marginFromBest: Number(entry?.marginFromBest ?? 0),
      chosen: Boolean(entry?.chosen),
    }));

    choices[playerId] = {
      schemaVersion: CONFLICT_CHOICE_TRACE_SCHEMA_VERSION,
      policyId: CONFLICT_CHOICE_POLICY_ID,
      policyVersion: CONFLICT_CHOICE_POLICY_VERSION,
      playerId,
      rngChannelId: playerInput.rngChannelId,
      temperature,
      temperatureSource,
      topK: POLICY_TOP_K,
      protocolId: protocol.id,
      phaseId: rows[0]?.phaseId ?? 'simultaneous_choice',
      projectedRows: rows,
      ranked,
      chosenUtilityCandidateId: chosenId,
      kernelActionId: resolved.value.actionId,
      usedAtomIds: arr<string>(decision?.best?.why?.usedAtomIds).map(String),
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
