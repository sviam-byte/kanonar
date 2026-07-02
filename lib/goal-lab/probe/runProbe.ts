// lib/goal-lab/probe/runProbe.ts
//
// Phase 0 of the static-basis sign-audit (docs/agents/05_GOAL_LAB_MATH.md):
// the multi-layer readout extractor. Freezes the dynamics (one tick, fixed
// seed) and reads behavior off two layers:
//   S7  goalLayerSnapshot.domains[].score01   — cheap, indirect (some axes invisible)
//   S8  decisionSnapshot best / ranked[].q    — direct, but stochastic (Gumbel)
// S8 is therefore averaged over N seeds; S7 is deterministic (taken once).
//
// Everything is read defensively: a missing stage/atom yields an empty readout,
// never a throw — a "dead" axis is a result to triage, not a crash.

import type { AgentState } from '../../../types';
import { runGoalLabPipelineV1 } from '../pipeline/runPipelineV1';
import { RNG, hashString32 } from '../../core/noise';
import { clamp01 } from '../../util/math';
import { buildProbeAgent, type ProbeScene } from './scenes';
import { scoreAction, type OtherPolicy } from './game';

export interface ProbeReadout {
  scene: string;
  selfId: string;
  axisOverrides: Record<string, number>;
  seedsUsed: number;
  ok: boolean;
  /** S7: goal domain -> score01 (heavily normalized — weak discriminator). */
  s7Domains: Record<string, number>;
  /** S7: util:plan:<self>:<plan> -> magnitude (goal-action utilities). */
  utilPlans: Record<string, number>;
  /** S8: act:prior:<self>:<target>:<verb> -> magnitude. Strongest discriminator. */
  actPriors: Record<string, number>;
  /** S6: driver name -> magnitude. */
  drivers: Record<string, number>;
  /** S8: action key -> probability over seeds. */
  s8Distribution: Record<string, number>;
  /** S8: action key -> mean Q over seeds. */
  s8MeanQ: Record<string, number>;
  /** S8: most frequently chosen action key. */
  s8TopAction: string | null;
  /** S8: Shannon entropy (bits) of the chosen-action distribution. */
  s8ActionEntropy: number;
  /** Coarse state readouts. */
  stress: number;
  ctxDanger: number;
  // --- observable B (T1, game.ts): outcomes scored from the CHOSEN action.
  // All empty/zero when the scene carries no game.
  /** Outcome label -> probability over seeds; sums to 1 on payoff scenes. */
  outcomeDistribution: Record<string, number>;
  /** Probability-weighted mean self payoff. */
  outcomeMeanSelf: number;
  /** Probability-weighted mean other payoff. */
  outcomeMeanOther: number;
  /** P(move === 'cooperate'); 0 for unilateral games / scenes without game. */
  coopRate: number;
  /** P(chosen verb absent from the game's move table) — the loud-drift gate. */
  unclassifiedRate: number;
}

export interface RunProbeOptions {
  scene: ProbeScene;
  /** Toy-agent path: absolute axis values on a 0.5 baseline. */
  axisOverrides?: Record<string, number>;
  /** Real-agent path: a populated AgentState (from realAgents.ts). */
  agentTemplate?: AgentState;
  /** Real-agent path: axis deltas applied as clamp01(baseline + δ). */
  axisDeltas?: Record<string, number>;
  /** Seeds for S8 averaging. One seed = deterministic single sample. */
  seeds?: number[];
  selfId?: string;
  /** B's stipulated move for joint-game outcome scoring. Frozen default:
   *  'cooperate' — the frame where i_defect is profitable. Scoring only; the
   *  pipeline run itself is policy-independent (B is a static prop). */
  otherPolicy?: OtherPolicy;
}

/** Clone an agent template and apply δ-deltas to its vector_base. */
function applyAxisDeltas(template: AgentState, deltas: Record<string, number>): AgentState {
  const vb = { ...(((template as any).vector_base) ?? {}) } as Record<string, number>;
  for (const [axis, d] of Object.entries(deltas)) {
    const base = Number(vb[axis]);
    if (Number.isFinite(base)) vb[axis] = clamp01(base + d);
  }
  return { ...(template as any), vector_base: vb } as AgentState;
}

const DEFAULT_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function findStage(pipeline: any, stage: string): any {
  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];
  return stages.find((s: any) => String(s?.stage) === stage) ?? null;
}

function actionKey(a: any): string | null {
  if (!a) return null;
  const inner = a.action ?? a;
  const id = inner?.id ?? inner?.actionId;
  const kind = inner?.kind;
  const target = inner?.targetId ?? inner?.target;
  if (id) return String(id);
  if (kind) return `${String(kind)}${target ? ':' + String(target) : ''}`;
  return null;
}

function qOf(a: any): number {
  const v = Number(a?.q ?? a?.qNow ?? a?.score);
  return Number.isFinite(v) ? v : NaN;
}

function extractS7(pipeline: any): Record<string, number> {
  const snap = findStage(pipeline, 'S7')?.artifacts?.goalLayerSnapshot;
  const domains = Array.isArray(snap?.domains) ? snap.domains : [];
  const out: Record<string, number> = {};
  for (const d of domains) {
    const name = String(d?.domain ?? '');
    if (name) out[name] = Number(d?.score01 ?? 0);
  }
  return out;
}

function extractDrivers(pipeline: any, selfId: string): Record<string, number> {
  const atoms = findStage(pipeline, 'S6')?.atoms ?? [];
  const out: Record<string, number> = {};
  for (const a of atoms) {
    const id = String(a?.id ?? '');
    if (id.startsWith('drv:') && id.endsWith(`:${selfId}`)) {
      const name = id.slice('drv:'.length, id.length - selfId.length - 1);
      out[name] = Number(a?.magnitude ?? 0);
    }
  }
  return out;
}

/** Collect atoms whose id starts with `prefix`, keyed by the remaining suffix. */
function extractByPrefix(pipeline: any, stage: string, prefix: string): Record<string, number> {
  const atoms = findStage(pipeline, stage)?.atoms ?? [];
  const out: Record<string, number> = {};
  for (const a of atoms) {
    const id = String(a?.id ?? '');
    if (id.startsWith(prefix)) out[id.slice(prefix.length)] = Number(a?.magnitude ?? 0);
  }
  return out;
}

function ctxDangerOf(pipeline: any, selfId: string): number {
  // Prefer the subjective final danger; fall back to base ctx danger.
  for (const stage of ['S8', 'S7', 'S6', 'S3']) {
    const atoms = findStage(pipeline, stage)?.atoms ?? [];
    const hit =
      atoms.find((a: any) => String(a?.id) === `ctx:final:danger:${selfId}`) ??
      atoms.find((a: any) => String(a?.id) === `ctx:danger:${selfId}`);
    if (hit) return Number(hit.magnitude ?? 0);
  }
  return 0;
}

function shannonBits(counts: Record<string, number>): number {
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const v of Object.values(counts)) {
    if (v <= 0) continue;
    const p = v / total;
    h -= p * Math.log2(p);
  }
  return h;
}

export function runProbe(opts: RunProbeOptions): ProbeReadout {
  const scene = opts.scene;
  const axisOverrides = opts.axisOverrides ?? {};
  const seeds = opts.seeds ?? DEFAULT_SEEDS;
  const selfId = opts.selfId ?? (opts.agentTemplate as any)?.entityId ?? 'A';

  const chosenCounts: Record<string, number> = {};
  const qSums: Record<string, number> = {};
  const qCounts: Record<string, number> = {};

  let s7Domains: Record<string, number> = {};
  let utilPlans: Record<string, number> = {};
  let actPriors: Record<string, number> = {};
  let drivers: Record<string, number> = {};
  let stress = 0;
  let ctxDanger = 0;
  let okCount = 0;
  let s7Captured = false;

  for (const seed of seeds) {
    // Real-agent path (agentTemplate + axisDeltas) or toy-agent path (axisOverrides).
    const self = opts.agentTemplate
      ? applyAxisDeltas(opts.agentTemplate, opts.axisDeltas ?? {})
      : buildProbeAgent(selfId, axisOverrides);
    // Per-seed decision channel: without it the pipeline falls back to a constant
    // rng (0.5) and the Gumbel choice never varies across seeds.
    (self as any).rngChannels = {
      ...((self as any).rngChannels ?? {}),
      decide: new RNG((hashString32(`${seed}:${selfId}:decide`) >>> 0) || 1),
    };
    const { world, agentId, participantIds } = scene.build(self);
    (world as any).rngSeed = seed;
    const manualAtoms = scene.manualAtoms?.(agentId) ?? [];

    let pipeline: any = null;
    try {
      pipeline = runGoalLabPipelineV1({ world, agentId, participantIds, manualAtoms });
    } catch {
      pipeline = null;
    }
    if (!pipeline) continue;
    okCount += 1;

    // S7 + drivers + state: deterministic, capture once.
    if (!s7Captured) {
      s7Domains = extractS7(pipeline);
      utilPlans = extractByPrefix(pipeline, 'S7', `util:plan:${agentId}:`);
      actPriors = extractByPrefix(pipeline, 'S8', `act:prior:${agentId}:`);
      drivers = extractDrivers(pipeline, agentId);
      stress = Number(self.body?.acute?.stress ?? 0);
      ctxDanger = ctxDangerOf(pipeline, agentId);
      s7Captured = true;
    }

    // S8: aggregate chosen action + Q over seeds.
    const s8 = findStage(pipeline, 'S8')?.artifacts;
    const best = s8?.best ?? s8?.decisionSnapshot?.digest?.linearBest;
    const key = actionKey(best);
    if (key) chosenCounts[key] = (chosenCounts[key] ?? 0) + 1;

    const ranked = Array.isArray(s8?.ranked) ? s8.ranked : [];
    for (const r of ranked) {
      const k = actionKey(r);
      const q = qOf(r);
      if (k && Number.isFinite(q)) {
        qSums[k] = (qSums[k] ?? 0) + q;
        qCounts[k] = (qCounts[k] ?? 0) + 1;
      }
    }
  }

  const total = Object.values(chosenCounts).reduce((s, v) => s + v, 0);
  const s8Distribution: Record<string, number> = {};
  for (const [k, c] of Object.entries(chosenCounts)) s8Distribution[k] = total > 0 ? c / total : 0;

  const s8MeanQ: Record<string, number> = {};
  for (const [k, sum] of Object.entries(qSums)) s8MeanQ[k] = sum / Math.max(1, qCounts[k]);

  let s8TopAction: string | null = null;
  let bestCount = -1;
  for (const [k, c] of Object.entries(chosenCounts)) {
    if (c > bestCount) { bestCount = c; s8TopAction = k; }
  }

  // Observable B: fold the chosen-action distribution through the scene's
  // game. Post-loop and deterministic per action key, so it is consistent
  // with s8Distribution by construction; re-scoring under the other policy
  // is a free pure-function call (scoreAction is exported).
  const otherPolicy = opts.otherPolicy ?? 'cooperate';
  const outcomeDistribution: Record<string, number> = {};
  let outcomeMeanSelf = 0;
  let outcomeMeanOther = 0;
  let coopRate = 0;
  let unclassifiedRate = 0;
  if (scene.game && total > 0) {
    for (const [key, c] of Object.entries(chosenCounts)) {
      const p = c / total;
      const s = scoreAction(scene.game, key, otherPolicy);
      outcomeDistribution[s.label] = (outcomeDistribution[s.label] ?? 0) + p;
      outcomeMeanSelf += p * s.self;
      outcomeMeanOther += p * s.other;
      if (s.move === 'cooperate') coopRate += p;
      if (s.move === null) unclassifiedRate += p;
    }
  }

  return {
    scene: scene.id,
    selfId,
    axisOverrides,
    seedsUsed: okCount,
    ok: okCount > 0,
    s7Domains,
    utilPlans,
    actPriors,
    drivers,
    s8Distribution,
    s8MeanQ,
    s8TopAction,
    s8ActionEntropy: shannonBits(chosenCounts),
    stress,
    ctxDanger,
    outcomeDistribution,
    outcomeMeanSelf,
    outcomeMeanOther,
    coopRate,
    unclassifiedRate,
  };
}
