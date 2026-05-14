// lib/simkit/compare/perturbationVector.ts
// ProConflict Lab: epsilon-perturbation vectors for deterministic sensitivity analysis.
//
// applyPerturbations is a pure function: deep-clones the world, applies signed
// deltas to specific state fields, returns the new world. RNG channels are not
// touched, so two runs (baseline vs perturbed) with the same seed produce
// byte-identical traces in the absence of perturbations.

import type { SimWorld } from '../core/types';
import { cloneWorld } from '../core/world';

export type PerturbationTarget =
  | { kind: 'body'; field: 'stress' | 'energy' | 'health' }
  | { kind: 'tom'; toId: string; field: 'trust' | 'threat' | 'respect' | 'fear' }
  | { kind: 'fact'; key: string }
  | { kind: 'trait'; traitId: string }
  | { kind: 'belief'; atomId: string; field: 'magnitude' | 'confidence' };

export type PerturbationVector = {
  agentId: string;
  target: PerturbationTarget;
  delta: number;
  label?: string;
};

export type PerturbationApplyResult = {
  world: SimWorld;
  applied: PerturbationVector[];
  skipped: Array<{ vec: PerturbationVector; reason: string }>;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function applyOne(world: SimWorld, vec: PerturbationVector): { ok: boolean; reason?: string } {
  const t = vec.target;
  const c = world.characters[vec.agentId];

  if (t.kind === 'body') {
    if (!c) return { ok: false, reason: `agent ${vec.agentId} not in world` };
    const cur = Number(c[t.field] ?? 0);
    c[t.field] = clamp01(cur + vec.delta);
    return { ok: true };
  }

  if (t.kind === 'tom') {
    if (!c) return { ok: false, reason: `agent ${vec.agentId} not in world` };
    const facts = world.facts || (world.facts = {} as any);
    const rels = (facts.relations as Record<string, Record<string, Record<string, unknown>>>)
      || ((facts as any).relations = {});
    const fromMap = rels[vec.agentId] || (rels[vec.agentId] = {});
    const toMap = (fromMap[t.toId] as Record<string, unknown>) || (fromMap[t.toId] = {});
    const cur = Number((toMap as any)[t.field] ?? 0.5);
    (toMap as any)[t.field] = clamp01(cur + vec.delta);
    return { ok: true };
  }

  if (t.kind === 'fact') {
    const facts = world.facts || (world.facts = {} as any);
    const cur = Number((facts as any)[t.key] ?? 0);
    if (!Number.isFinite(cur)) {
      return { ok: false, reason: `fact ${t.key} is not numeric` };
    }
    (facts as any)[t.key] = clamp01(cur + vec.delta);
    return { ok: true };
  }

  if (t.kind === 'trait') {
    if (!c) return { ok: false, reason: `agent ${vec.agentId} not in world` };
    const entity = (c.entity as Record<string, any>) || (c.entity = {} as any);
    const body = (entity.body as Record<string, any>) || (entity.body = {});
    const cognition = (body.cognition as Record<string, any>) || (body.cognition = {});
    const cur = Number(cognition[t.traitId] ?? 0.5);
    cognition[t.traitId] = clamp01(cur + vec.delta);
    return { ok: true };
  }

  if (t.kind === 'belief') {
    if (!c) return { ok: false, reason: `agent ${vec.agentId} not in world` };
    const entity = (c.entity as Record<string, any>) || (c.entity = {} as any);
    const memory = (entity.memory as Record<string, any>) || (entity.memory = {});
    const list = Array.isArray(memory.beliefAtoms) ? (memory.beliefAtoms as any[]) : [];
    const idx = list.findIndex((a) => String(a?.id) === t.atomId);
    if (idx < 0) return { ok: false, reason: `belief atom ${t.atomId} not found on ${vec.agentId}` };
    const atom = list[idx];
    const cur = Number(atom?.[t.field] ?? 0);
    atom[t.field] = clamp01(cur + vec.delta);
    return { ok: true };
  }

  return { ok: false, reason: 'unknown target kind' };
}

/**
 * Apply epsilon-perturbations to a deep-cloned world. The original world is not mutated.
 * Returns the new world plus a report of which vectors applied/skipped.
 */
export function applyPerturbations(
  world: SimWorld,
  vectors: PerturbationVector[],
): PerturbationApplyResult {
  const next = cloneWorld(world);
  const applied: PerturbationVector[] = [];
  const skipped: Array<{ vec: PerturbationVector; reason: string }> = [];

  for (const vec of vectors) {
    const r = applyOne(next, vec);
    if (r.ok) applied.push(vec);
    else skipped.push({ vec, reason: r.reason || 'unknown' });
  }

  return { world: next, applied, skipped };
}

export function describePerturbation(vec: PerturbationVector): string {
  const sign = vec.delta >= 0 ? '+' : '';
  const t = vec.target;
  let path: string;
  switch (t.kind) {
    case 'body':
      path = `${vec.agentId}.body.${t.field}`;
      break;
    case 'tom':
      path = `${vec.agentId}.tom[${t.toId}].${t.field}`;
      break;
    case 'fact':
      path = `facts.${t.key}`;
      break;
    case 'trait':
      path = `${vec.agentId}.cognition.${t.traitId}`;
      break;
    case 'belief':
      path = `${vec.agentId}.belief[${t.atomId}].${t.field}`;
      break;
    default:
      path = '?';
  }
  return `${path} ${sign}${vec.delta.toFixed(3)}`;
}
