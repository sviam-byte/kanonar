// lib/simkit/relations/canonicalWrite.ts
// Canonical relation writer: writes trust/threat/familiarity to ALL known patterns.

import type { SimWorld } from '../core/types';
import { clamp01 } from '../../util/math';

export type RelationMetrics = {
  trust?: number;
  threat?: number;
  familiarity?: number;
  respect?: number;
  fear?: number;
};

/** Write relation metrics to all canonical keys. */
export function writeRelation(world: SimWorld, from: string, to: string, metrics: RelationMetrics): void {
  const facts: any = world.facts || {};

  if (!facts.relations) facts.relations = {};
  if (!facts.relations[from]) facts.relations[from] = {};
  const prev = facts.relations[from][to] || {};
  facts.relations[from][to] = { ...prev };
  if (metrics.trust !== undefined) facts.relations[from][to].trust = clamp01(metrics.trust);
  if (metrics.threat !== undefined) facts.relations[from][to].threat = clamp01(metrics.threat);
  if (metrics.familiarity !== undefined) facts.relations[from][to].familiarity = clamp01(metrics.familiarity);
  if (metrics.respect !== undefined) facts.relations[from][to].respect = clamp01(metrics.respect);
  if (metrics.fear !== undefined) facts.relations[from][to].fear = clamp01(metrics.fear);

  if (metrics.trust !== undefined) {
    facts[`rel:trust:${from}:${to}`] = clamp01(metrics.trust);
    facts[`rel:${from}:${to}:trust`] = clamp01(metrics.trust);
  }
  if (metrics.threat !== undefined) {
    facts[`rel:threat:${from}:${to}`] = clamp01(metrics.threat);
  }
}

/** Read relation metrics from any available source. */
export function readRelation(world: SimWorld, from: string, to: string): RelationMetrics {
  const facts: any = world.facts || {};
  const nested = facts?.relations?.[from]?.[to] || {};
  return {
    trust: clamp01(Number(nested.trust ?? facts[`rel:trust:${from}:${to}`] ?? 0.5)),
    threat: clamp01(Number(nested.threat ?? facts[`rel:threat:${from}:${to}`] ?? 0.3)),
    familiarity: clamp01(Number(nested.familiarity ?? 0)),
    respect: clamp01(Number(nested.respect ?? 0.5)),
    fear: clamp01(Number(nested.fear ?? 0.2)),
  };
}
