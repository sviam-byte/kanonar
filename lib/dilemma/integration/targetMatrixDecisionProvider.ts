// Additive target-aware GoalLab decision provider. One baseline pipeline is
// evaluated per actor; one independent S8 sampling run is evaluated per
// directed actor-target cell.

import { getMag } from '../../util/atoms';
import { arr } from '../../utils/arr';
import type { ContextAtom } from '../../context/v2/types';
import { runGoalLabPipelineV1, type GoalLabPipelineInputV1 } from '../../goal-lab/pipeline/runPipelineV1';
import type { ConflictActionId, ConflictPhase, ConflictProtocol, ConflictProtocolId, ForcedActionStrategyMode, Result } from '../dynamics/types';
import { TRUST_EXCHANGE_ACTION_ORDER } from '../dynamics/trustExchange';
import { CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION, type ConflictActionProjectionRow } from '../definition/types';
import { validateConflictDefinitionV3, type ConflictDefinitionV3 } from '../definition/conflictDefinitionV3';
import { conflictUtilityCandidateIdV1, resolveProjectedChoice } from '../definition/projection';
import { projectConflictDefinitionV3ActionsV1, type ConflictActionProjectionRowNV1 } from '../nkernel/ndefinitionbind';
import { participantSetFromConflictPlayersV1 } from '../nkernel/nstate';
import { buildConflictDirectedActionMatrixV1, type ConflictDirectedActionMatrixV1 } from '../nkernel/ntargetmatrix';
import { resolveConflictTargetMatrixChoiceStepV1 } from '../nkernel/ntargetchoice';
import { resolveConflictTargetMatrixStepV1, type ConflictTargetMatrixStateV1, type ConflictTargetMatrixStepResultV1 } from '../nkernel/ntargetstep';
import { buildConflictPossibilities } from './candidateBridge';
import {
  CONFLICT_CHOICE_POLICY_ID,
  CONFLICT_CHOICE_POLICY_VERSION,
  CONFLICT_CHOICE_TRACE_SCHEMA_VERSION,
  type ConflictChoiceTraceV1,
  type ConflictGoalEnergySourceV1,
  type ConflictRankedCandidateTraceV1,
  type ConflictTemperatureSource,
} from './types';

export const CONFLICT_TARGET_MATRIX_DECISION_SCHEMA_VERSION = 'conflict-target-matrix-decision-v1' as const;

export type ConflictDecisionRngV1 = (() => number) | { nextFloat: () => number };

export interface ConflictTargetDecisionRngInputV1 {
  readonly rng: ConflictDecisionRngV1 | null;
  readonly rngChannelId: string;
}

export interface ConflictTargetMatrixPlayerDecisionInputV1 {
  readonly pipelineInput: Omit<GoalLabPipelineInputV1, 'externalPossibilities' | 'externalPossibilityMode' | 'decisionRng'>;
  readonly rngByTarget: Readonly<Record<string, ConflictTargetDecisionRngInputV1>>;
}

export interface ConflictTargetMatrixDecisionArgsV1 {
  readonly state: ConflictTargetMatrixStateV1;
  readonly definition: ConflictDefinitionV3;
  readonly protocol: ConflictProtocol;
  readonly players: Readonly<Record<string, ConflictTargetMatrixPlayerDecisionInputV1>>;
  readonly forcedActionStrategyMode?: ForcedActionStrategyMode;
}

export type ConflictTargetMatrixIntegrationErrorV1 =
  | { readonly code: 'invalid_binding'; readonly message: string }
  | { readonly code: 'missing_pipeline'; readonly actorId: string; readonly message: string }
  | { readonly code: 'pipeline_mismatch'; readonly actorId: string; readonly message: string }
  | { readonly code: 'missing_s8_stage'; readonly actorId: string; readonly message: string }
  | { readonly code: 'invalid_rng_map'; readonly actorId: string; readonly targetId?: string; readonly message: string }
  | { readonly code: 'projection_failed'; readonly actorId: string; readonly message: string }
  | { readonly code: 'empty_candidates'; readonly actorId: string; readonly targetId: string; readonly message: string }
  | { readonly code: 'unknown_candidate'; readonly actorId: string; readonly targetId: string; readonly message: string }
  | { readonly code: 'kernel_step_failed'; readonly message: string };

export interface ConflictTargetMatrixDecisionReportV1 {
  readonly schemaVersion: typeof CONFLICT_TARGET_MATRIX_DECISION_SCHEMA_VERSION;
  readonly policyId: typeof CONFLICT_CHOICE_POLICY_ID;
  readonly policyVersion: typeof CONFLICT_CHOICE_POLICY_VERSION;
  readonly protocolId: string;
  readonly tick: number;
  readonly players: readonly string[];
  readonly choices: Readonly<Record<string, Readonly<Record<string, ConflictChoiceTraceV1>>>>;
  readonly canonical: {
    readonly forcedActionStrategyMode: ForcedActionStrategyMode;
    readonly actionMatrix: ConflictDirectedActionMatrixV1;
    readonly step: ConflictTargetMatrixStepResultV1;
  };
  readonly reference: {
    readonly actionMatrix: ConflictDirectedActionMatrixV1;
    readonly step: ConflictTargetMatrixStepResultV1;
  };
  readonly divergence: {
    readonly anyDifference: boolean;
    readonly byActorTarget: Readonly<Record<string, Readonly<Record<string, {
      readonly canonicalActionId: ConflictActionId;
      readonly referenceActionId: ConflictActionId;
      readonly same: boolean;
    }>>>>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameOrdered(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function validateBinding(args: ConflictTargetMatrixDecisionArgsV1): string | null {
  const { state, definition, protocol } = args;
  const participants = participantSetFromConflictPlayersV1(state.players);
  if (participants.ok === false) return participants.errors.map((error) => error.message).join('; ');
  if (protocol.id !== 'trust_exchange' || definition.protocolId !== 'trust_exchange') {
    return `target-matrix decision requires trust_exchange protocol and definition, got ${protocol.id}/${definition.protocolId}`;
  }
  const validated = validateConflictDefinitionV3(definition);
  if (validated.ok === false) return `invalid conflict definition: ${validated.errors.map((error) => error.message).join('; ')}`;
  if (!sameOrdered(protocol.phases, ['simultaneous_choice', 'resolution'])
    || !sameOrdered(protocol.actionOrder, TRUST_EXCHANGE_ACTION_ORDER)) return 'protocol phases/action order are not canonical';
  if (!sameOrdered(Object.keys(protocol.roles), state.players)
    || state.players.some((id) => protocol.roles[id] !== 'participant')) return 'protocol roles do not exactly match participants';
  if (definition.playerCount !== state.players.length
    || !sameOrdered(definition.roles.map((role) => role.playerId), state.players)) return 'definition participants do not exactly match state';
  if (definition.phases.length !== 1 || definition.phases[0].id !== 'simultaneous_choice'
    || !sameOrdered(definition.phases[0].actorRoleIds, definition.roles.map((role) => role.id))) return 'definition phase binding is not canonical';
  const expectedActions = TRUST_EXCHANGE_ACTION_ORDER.flatMap((actionId) => definition.roles.map((role) => `${actionId}\0${role.id}`));
  const actualActions = definition.legalActions.map((action) => (
    (action.target.mode === 'all_others' || action.target.mode === 'counterparty') && action.phaseId === 'simultaneous_choice'
      ? `${action.id}\0${action.actorRoleId}` : ''
  ));
  if (!sameOrdered(actualActions, expectedActions)) return 'definition legal actions are not canonical trust actions';
  if (!sameMembers(Object.keys(args.players), state.players)) return 'pipeline inputs do not exactly match participants';
  return null;
}

function validateRngMaps(args: ConflictTargetMatrixDecisionArgsV1): ConflictTargetMatrixIntegrationErrorV1 | null {
  const seenRngs = new Set<ConflictDecisionRngV1>();
  const seenChannelIds = new Set<string>();
  for (const actorId of args.state.players) {
    const rawInput: unknown = args.players[actorId];
    if (!isRecord(rawInput) || !isRecord(rawInput.pipelineInput)) {
      return { code: 'missing_pipeline', actorId, message: `No valid pipeline input supplied for ${actorId}` };
    }
    const input = rawInput as unknown as ConflictTargetMatrixPlayerDecisionInputV1;
    if (!isRecord(input.rngByTarget)) return { code: 'invalid_rng_map', actorId, message: `rngByTarget for ${actorId} must be an object` };
    const expected = args.state.players.filter((id) => id !== actorId);
    const actual = Object.keys(input.rngByTarget);
    if (actual.length !== expected.length || expected.some((id) => !actual.includes(id))) {
      const targetId = expected.find((id) => !actual.includes(id)) ?? actual.find((id) => !expected.includes(id));
      return { code: 'invalid_rng_map', actorId, targetId, message: `rngByTarget for ${actorId} must contain exactly all non-self targets` };
    }
    for (const targetId of expected) {
      const channel = input.rngByTarget[targetId];
      if (!channel || !normalizeRng(channel.rng) || typeof channel.rngChannelId !== 'string' || channel.rngChannelId.length === 0) {
        return { code: 'invalid_rng_map', actorId, targetId, message: `Missing seeded named RNG channel for ${actorId} -> ${targetId}` };
      }
      if (seenRngs.has(channel.rng) || seenChannelIds.has(channel.rngChannelId)) {
        return { code: 'invalid_rng_map', actorId, targetId, message: `RNG identity and channel id must be unique for ${actorId} -> ${targetId}` };
      }
      seenRngs.add(channel.rng);
      seenChannelIds.add(channel.rngChannelId);
    }
  }
  return null;
}

function s8Atoms(pipeline: { stages?: unknown } | null): ContextAtom[] | null {
  const stage = arr<{ stage?: string; atoms?: ContextAtom[] }>((pipeline as { stages?: unknown[] })?.stages)
    .find((candidate) => candidate.stage === 'S8');
  return stage ? arr(stage.atoms) : null;
}

function s8Decision(pipeline: { stages?: unknown } | null): { ranked: Array<Record<string, unknown>>; best: Record<string, unknown> | null; temperature: number; topK: number } | null {
  const stage = arr<{ stage?: string; artifacts?: Record<string, unknown> }>((pipeline as { stages?: unknown[] })?.stages)
    .find((candidate) => candidate.stage === 'S8');
  const snapshot = stage?.artifacts?.decisionSnapshot;
  if (!isRecord(snapshot)) return null;
  return {
    ranked: arr<Record<string, unknown>>(snapshot.ranked),
    best: isRecord(snapshot.best) ? snapshot.best : null,
    temperature: Number(snapshot.temperature ?? Number.NaN),
    topK: Number(snapshot.topK ?? Number.NaN),
  };
}

function normalizeRng(input: ConflictDecisionRngV1 | null): (() => number) | null {
  if (typeof input === 'function') return input;
  if (input && typeof input.nextFloat === 'function') return () => Number(input.nextFloat());
  return null;
}

function withoutForceAction(events: unknown): unknown[] {
  return arr<unknown>(events).filter((event) => !isRecord(event) || String(event.type ?? event.kind ?? '') !== 'force_action');
}

function sources(entry: Record<string, unknown>): ConflictGoalEnergySourceV1[] {
  const why = isRecord(entry.why) ? entry.why : {};
  const seen = new Set<string>();
  return arr<Record<string, unknown>>(why.goalEnergySources).flatMap((raw) => {
    const goalId = String(raw.goalId ?? '');
    const atomId = String(raw.atomId ?? '');
    if (!goalId || !atomId || seen.has(goalId)) return [];
    seen.add(goalId);
    return [{ goalId, atomId }];
  });
}

function usedAtoms(entry: Record<string, unknown>): string[] {
  const why = isRecord(entry.why) ? entry.why : {};
  return Array.from(new Set([
    ...arr<string>(entry.usedAtomIds).map(String),
    ...arr<string>(why.usedAtomIds).map(String),
    ...sources(entry).map((source) => source.atomId),
  ].filter(Boolean)));
}

function resolveTemperature(atoms: ContextAtom[], world: GoalLabPipelineInputV1['world'], actorId: string): { temperature: number; source: ConflictTemperatureSource } {
  const trait = getMag(atoms, `feat:char:${actorId}:trait.decisionTemperature`, -1);
  if (trait >= 0) return { temperature: Math.max(0.05, trait * 2.5), source: 'trait-atom' };
  const agent = arr(world?.agents).find((candidate) => candidate?.entityId === actorId);
  const worldValue = Number((world as { decisionTemperature?: number })?.decisionTemperature ?? Number.NaN);
  if (Number.isFinite(worldValue)) return { temperature: worldValue, source: 'world' };
  const behavioral = Number((agent as { behavioralParams?: { T0?: number } })?.behavioralParams?.T0 ?? Number.NaN);
  if (Number.isFinite(behavioral)) return { temperature: behavioral, source: 'agent-behavioral' };
  const direct = Number((agent as { temperature?: number })?.temperature ?? Number.NaN);
  return Number.isFinite(direct) ? { temperature: direct, source: 'agent' } : { temperature: 1, source: 'default' };
}

function toCellRow(row: ConflictActionProjectionRowNV1, targetId: string, tick: number, historyLength: number): ConflictActionProjectionRow {
  return {
    schemaVersion: CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION,
    protocolId: row.protocolId as ConflictProtocolId,
    phaseId: row.phaseId as ConflictPhase,
    role: 'participant',
    kernelActionId: row.actionId as ConflictActionId,
    actorId: row.actorId,
    targetIds: [targetId],
    legalSource: 'protocol_action_order',
    utilityCandidateId: conflictUtilityCandidateIdV1({
      protocolId: row.protocolId, phaseId: row.phaseId, actorId: row.actorId,
      targetIds: [targetId], tick, historyLength, kernelActionId: row.actionId,
    }),
    provenance: { source: 'conflict-kernel-observation', tick, historyLength },
  };
}

export function runConflictTargetMatrixDecisionV1(
  args: ConflictTargetMatrixDecisionArgsV1,
): Result<ConflictTargetMatrixDecisionReportV1, ConflictTargetMatrixIntegrationErrorV1> {
  const binding = validateBinding(args);
  if (binding) return { ok: false, error: { code: 'invalid_binding', message: binding } };
  const rngError = validateRngMaps(args);
  if (rngError) return { ok: false, error: rngError };
  const mode = args.forcedActionStrategyMode ?? 'learn_from_utility';
  const phaseId = args.protocol.phases[0];
  const choices: Record<string, Record<string, ConflictChoiceTraceV1>> = {};
  const actions: Record<string, Record<string, ConflictActionId>> = {};

  for (const actorId of args.state.players) {
    const input = args.players[actorId];
    const role = args.definition.roles.find((candidate) => candidate.playerId === actorId);
    if (!role) return { ok: false, error: { code: 'invalid_binding', message: `No role maps to ${actorId}` } };
    const sceneControl = (input.pipelineInput as { sceneControl?: Record<string, unknown> }).sceneControl;
    const profile = sceneControl?.runtimeProfile;
    const runtimeProfile = typeof profile === 'string'
      ? { profileId: profile, goalEnergyDomainUnionV1: true }
      : { ...(isRecord(profile) ? profile : {}), goalEnergyDomainUnionV1: true };
    const pipelineInput = {
      ...input.pipelineInput,
      injectedEvents: withoutForceAction(input.pipelineInput.injectedEvents),
      sceneControl: { ...(sceneControl ?? {}), runtimeProfile },
    };
    const baseline = runGoalLabPipelineV1({
      ...pipelineInput, externalPossibilities: undefined, externalPossibilityMode: 'merge', decisionRng: () => 0.5,
    });
    if (!baseline) return { ok: false, error: { code: 'missing_pipeline', actorId, message: `GoalLab baseline failed for ${actorId}` } };
    if (baseline.selfId !== actorId || baseline.tick !== args.state.tick
      || !args.state.players.every((id) => baseline.participantIds.includes(id))) {
      return { ok: false, error: { code: 'pipeline_mismatch', actorId, message: `GoalLab baseline identity does not match ${actorId}` } };
    }
    const atoms = s8Atoms(baseline);
    if (!atoms) return { ok: false, error: { code: 'missing_s8_stage', actorId, message: `Baseline for ${actorId} has no S8` } };
    const projection = projectConflictDefinitionV3ActionsV1(args.definition, role.id, phaseId);
    if (projection.ok === false) return { ok: false, error: { code: 'projection_failed', actorId, message: projection.error.message } };
    const expectedTargets = args.state.players.filter((id) => id !== actorId);
    if (projection.value.length !== TRUST_EXCHANGE_ACTION_ORDER.length
      || projection.value.some((row, index) => row.actionId !== TRUST_EXCHANGE_ACTION_ORDER[index]
        || !sameOrdered(row.targetIds, expectedTargets))) {
      return { ok: false, error: { code: 'projection_failed', actorId, message: `Projection for ${actorId} is not canonical all-others trust_exchange` } };
    }
    choices[actorId] = {};
    actions[actorId] = {};
    for (const targetId of expectedTargets) {
      const rows = projection.value.map((row) => toCellRow(row, targetId, args.state.tick, args.state.history.length));
      const { possibilities } = buildConflictPossibilities({ rows, atoms, selfId: actorId });
      const channel = input.rngByTarget[targetId];
      const rng = normalizeRng(channel.rng)!;
      const conflictPipeline = runGoalLabPipelineV1({
        ...pipelineInput, externalPossibilities: possibilities, externalPossibilityMode: 'replace', decisionRng: rng,
      });
      if (conflictPipeline && (conflictPipeline.selfId !== actorId || conflictPipeline.tick !== args.state.tick)) {
        return { ok: false, error: { code: 'pipeline_mismatch', actorId, message: `Cell pipeline identity changed for ${actorId} -> ${targetId}` } };
      }
      const decision = s8Decision(conflictPipeline);
      if (!decision || decision.ranked.length !== rows.length) {
        return { ok: false, error: { code: 'empty_candidates', actorId, targetId, message: `S8 did not rank the complete action set for ${actorId} -> ${targetId}` } };
      }
      const { temperature, source } = resolveTemperature(atoms, pipelineInput.world, actorId);
      if (!Number.isFinite(decision.temperature) || Math.abs(decision.temperature - temperature) > 1e-9
        || !Number.isFinite(decision.topK) || decision.topK < 1) {
        return { ok: false, error: { code: 'empty_candidates', actorId, targetId, message: `Invalid S8 sampling metadata for ${actorId} -> ${targetId}` } };
      }
      const chosenId = String(decision.best?.id ?? '');
      const resolved = resolveProjectedChoice(rows, chosenId);
      if (!chosenId || resolved.ok === false) {
        return { ok: false, error: { code: 'unknown_candidate', actorId, targetId, message: resolved.ok === false ? resolved.error.message : 'Policy returned no candidate' } };
      }
      const rowById = new Map(rows.map((row) => [row.utilityCandidateId, row]));
      const ranked: ConflictRankedCandidateTraceV1[] = decision.ranked.map((entry) => ({
        utilityCandidateId: String(entry.id ?? ''),
        kernelActionId: rowById.get(String(entry.id ?? ''))?.kernelActionId as ConflictActionId,
        q: Number(entry.q ?? 0), qUsed: Number(entry.qUsed ?? entry.q ?? 0),
        sampleNoise: Number(entry.sampleNoise ?? 0), sampleScore: Number(entry.sampleScore ?? 0),
        inTieBand: Boolean(entry.inTieBand), inSamplingPool: Boolean(entry.inSamplingPool),
        effectiveTemperature: Number(entry.effectiveTemperature ?? temperature),
        marginFromBest: Number(entry.marginFromBest ?? 0), chosen: Boolean(entry.chosen),
        usedAtomIds: usedAtoms(entry), goalEnergySources: sources(entry),
      }));
      if (ranked.some((entry) => !entry.kernelActionId)) {
        return { ok: false, error: { code: 'unknown_candidate', actorId, targetId, message: `S8 returned a candidate outside projection for ${actorId} -> ${targetId}` } };
      }
      actions[actorId][targetId] = resolved.value.actionId;
      choices[actorId][targetId] = {
        schemaVersion: CONFLICT_CHOICE_TRACE_SCHEMA_VERSION,
        policyId: CONFLICT_CHOICE_POLICY_ID, policyVersion: CONFLICT_CHOICE_POLICY_VERSION,
        playerId: actorId, goalEnergyMode: 'domain-union-v1', rngChannelId: channel.rngChannelId,
        temperature, temperatureSource: source, topK: decision.topK,
        samplingPoolCandidateIds: ranked.filter((entry) => entry.inSamplingPool).map((entry) => entry.utilityCandidateId),
        protocolId: args.protocol.id, phaseId: rows[0]?.phaseId ?? phaseId,
        projectedRows: rows, ranked, chosenUtilityCandidateId: chosenId,
        kernelActionId: resolved.value.actionId, usedAtomIds: arr<string>(decision.best?.usedAtomIds).map(String),
      };
    }
  }

  const matrix = buildConflictDirectedActionMatrixV1(args.state.players, actions);
  if (matrix.ok === false) return { ok: false, error: { code: 'kernel_step_failed', message: matrix.errors.map((error) => error.message).join('; ') } };
  const canonical = resolveConflictTargetMatrixStepV1({ state: args.state, protocol: args.protocol, actionMatrix: matrix.value, forcedActionStrategyMode: mode });
  if (canonical.ok === false) return { ok: false, error: { code: 'kernel_step_failed', message: `Canonical step rejected: ${canonical.error.message}` } };
  const reference = resolveConflictTargetMatrixChoiceStepV1({ state: args.state, protocol: args.protocol });
  if (reference.ok === false) return { ok: false, error: { code: 'kernel_step_failed', message: `Reference step rejected: ${reference.error.message}` } };
  const byActorTarget: Record<string, Record<string, { canonicalActionId: ConflictActionId; referenceActionId: ConflictActionId; same: boolean }>> = {};
  let anyDifference = false;
  for (const actorId of args.state.players) {
    byActorTarget[actorId] = {};
    for (const targetId of args.state.players) {
      if (actorId === targetId) continue;
      const canonicalActionId = matrix.value.actionsByActorTarget[actorId][targetId];
      const referenceActionId = reference.value.chosenActionMatrix.actionsByActorTarget[actorId][targetId];
      const same = canonicalActionId === referenceActionId;
      anyDifference ||= !same;
      byActorTarget[actorId][targetId] = { canonicalActionId, referenceActionId, same };
    }
  }
  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_TARGET_MATRIX_DECISION_SCHEMA_VERSION,
      policyId: CONFLICT_CHOICE_POLICY_ID, policyVersion: CONFLICT_CHOICE_POLICY_VERSION,
      protocolId: args.protocol.id, tick: args.state.tick, players: args.state.players, choices,
      canonical: { forcedActionStrategyMode: mode, actionMatrix: matrix.value, step: canonical.value },
      reference: { actionMatrix: reference.value.chosenActionMatrix, step: reference.value.step },
      divergence: { anyDifference, byActorTarget },
    },
  };
}
