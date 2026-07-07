// lib/simkit/mvp0/runMvpRollout.ts
//
// MVP-0 runner (I-1.4): the thin wrapper that makes the living cycle a FACT —
// agent → action → world change → other agent's reaction → trace → twin-diff.
// Fixed scene (mvp0Scene), the only knobs are { seed, ticks } (5–20).
//
// Output: one JSON row per tick per agent
//   { tick, agentId, action, usedAtomIds, events, menuCount, factsDigest }
// plus goldenHash = sha256(canonical JSON of rows). The golden hash is pinned
// in tests/simkit/mvp0_golden.test.ts AFTER the first honest run (A1 min-PASS).
//
// Forbidden here (MVP-0 freeze): configurability beyond seed/ticks, UI,
// CSV exporters, sweeps. Распухает — режем.

import { SimKitSimulator } from '../core/simulator';
import type { SimWorld } from '../core/types';
import { makeGoalLabDeciderPlugin } from '../plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../plugins/perceptionMemoryPlugin';
import { makeMvp0World, mvp0ScenarioId } from '../scenarios/mvp0Scene';
import { canonicalStringify, sha256Hex } from './hash';

export interface Mvp0Row {
  tick: number;
  agentId: string;
  /** Applied action this tick (post-grounding, post-validation); null if none. */
  action: { kind: string; targetId: string | null; goalLabKind: string | null } | null;
  /** usedAtomIds of the chosen candidate (sim:trace best) — A2's explainability carrier. */
  usedAtomIds: string[];
  /** Events applied this tick that this agent caused or received. */
  events: Array<{ id: string; type: string }>;
  /** Unblocked offers for this agent this tick — the deadlock guard (A1). */
  menuCount: number;
  /** sha256 of the canonicalized world.facts after the tick (world-change witness). */
  factsDigest: string;
}

export interface Mvp0Rollout {
  scenarioId: string;
  seed: number;
  ticks: number;
  agentIds: string[];
  rows: Mvp0Row[];
  goldenHash: string;
}

export type WorldTransform = (world: SimWorld) => SimWorld;

/** Build the MVP-0 simulator (plugin stack mirrors compare/batchRunner). */
export function makeMvp0Simulator(seed: number, worldTransform?: WorldTransform): SimKitSimulator {
  const base = makeMvp0World(seed);
  const world = worldTransform ? worldTransform(base) : base;
  return new SimKitSimulator({
    scenarioId: mvp0ScenarioId,
    seed,
    initialWorld: world,
    plugins: [
      makeGoalLabDeciderPlugin({ storePipeline: false }),
      makeGoalLabPipelinePlugin(),
      makePerceptionMemoryPlugin(),
    ],
    maxRecords: 64,
  });
}

/** One simulator tick → rows for every agent (extraction shared with runTwins). */
export function stepToRows(sim: SimKitSimulator): Mvp0Row[] {
  const rec = sim.step();
  const tick = Number(rec.trace.tickIndex ?? 0);
  const agentIds = Object.keys(sim.world.characters).sort();
  const rows: Mvp0Row[] = [];

  const factsDigest = sha256Hex(canonicalStringify(sim.world.facts));

  for (const agentId of agentIds) {
    const applied = (rec.trace.actionsApplied || []).find((a: any) => String(a?.actorId) === agentId) ?? null;
    const trace: any = (sim.world.facts as any)?.[`sim:trace:${agentId}`] ?? null;
    const usedAtomIds =
      trace && Number(trace?.tick ?? -1) === tick && Array.isArray(trace?.best?.usedAtomIds)
        ? trace.best.usedAtomIds.map(String)
        : [];
    const events = (rec.trace.eventsApplied || [])
      .filter((e: any) => {
        const p = e?.payload || {};
        return String(p?.actorId ?? '') === agentId || String(p?.targetId ?? '') === agentId;
      })
      .map((e: any) => ({ id: String(e?.id ?? ''), type: String(e?.type ?? '') }));
    const menuCount = (rec.trace.actionsProposed || []).filter(
      (o: any) => String(o?.actorId) === agentId && !o?.blocked,
    ).length;

    rows.push({
      tick,
      agentId,
      action: applied
        ? {
            kind: String((applied as any).kind),
            targetId: (applied as any).targetId != null ? String((applied as any).targetId) : null,
            goalLabKind: (applied as any)?.meta?.goalLabKind != null ? String((applied as any).meta.goalLabKind) : null,
          }
        : null,
      usedAtomIds,
      events,
      menuCount,
      factsDigest,
    });
  }
  return rows;
}

export function runMvpRollout(args: { seed: number; ticks?: number; worldTransform?: WorldTransform }): Mvp0Rollout {
  const seed = Number(args.seed);
  const ticks = Math.max(1, Math.min(64, Number(args.ticks ?? 20)));
  const sim = makeMvp0Simulator(seed, args.worldTransform);
  const agentIds = Object.keys(sim.world.characters).sort();

  const rows: Mvp0Row[] = [];
  for (let t = 0; t < ticks; t++) rows.push(...stepToRows(sim));

  return {
    scenarioId: mvp0ScenarioId,
    seed,
    ticks,
    agentIds,
    rows,
    goldenHash: sha256Hex(canonicalStringify(rows)),
  };
}
