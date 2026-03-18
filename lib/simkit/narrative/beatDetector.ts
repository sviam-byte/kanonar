// lib/simkit/narrative/beatDetector.ts
// Beat detection with per-agent pipeline summary support.

import type { SimTickRecord, SimWorld } from '../core/types';
import { clamp01 } from '../../util/math';
import { FCS } from '../../config/formulaConfigSim';

export type BeatType =
  | 'mode_switch'
  | 'trust_shift'
  | 'goal_change'
  | 'conflict'
  | 'convergence'
  | 'surprise'
  | 'phase_transition'
  | 'injury'
  | 'reactive_episode'
  | 'dialogue_event';

export type NarrativeBeat = {
  tick: number;
  type: BeatType;
  agents: string[];
  summary: string;
  tension: number;
  novelty: number;
  details?: Record<string, any>;
};

function detectModeSwitches(world: SimWorld, prevWorld: SimWorld | null): NarrativeBeat[] {
  if (!prevWorld) return [];
  const beats: NarrativeBeat[] = [];
  const facts: any = world.facts || {};
  const prevFacts: any = prevWorld.facts || {};

  for (const id of Object.keys(world.characters).sort()) {
    const cur = (facts[`sim:pipeline:${id}`] as any)?.mode;
    const prev = (prevFacts[`sim:pipeline:${id}`] as any)?.mode;
    if (cur && prev && cur !== prev) {
      beats.push({
        tick: world.tickIndex,
        type: 'mode_switch',
        agents: [id],
        summary: `${world.characters[id]?.name || id} сменил режим: ${prev} → ${cur}`,
        tension: 0.6,
        novelty: 0.7,
        details: { from: prev, to: cur },
      });
    }
  }
  return beats;
}

function detectReactiveEpisodes(world: SimWorld): NarrativeBeat[] {
  const beats: NarrativeBeat[] = [];
  const facts: any = world.facts || {};

  for (const id of Object.keys(world.characters).sort()) {
    const dm = (facts[`sim:pipeline:${id}`] as any)?.decisionMode;
    if (dm === 'reactive') {
      beats.push({
        tick: world.tickIndex,
        type: 'reactive_episode',
        agents: [id],
        summary: `${world.characters[id]?.name || id} действует реактивно (System 1)`,
        tension: 0.7,
        novelty: 0.6,
        details: { decisionMode: dm },
      });
    }
  }
  return beats;
}

function detectTrustShifts(record: SimTickRecord): NarrativeBeat[] {
  const cfg = FCS.beats;
  const beats: NarrativeBeat[] = [];
  const deltas = record.trace.deltas?.facts || {};

  for (const [key, { before, after }] of Object.entries(deltas)) {
    if (!key.includes('trust')) continue;
    const bv = Number(before);
    const av = Number(after);
    if (!Number.isFinite(bv) || !Number.isFinite(av)) continue;
    const delta = Math.abs(av - bv);
    if (delta < cfg.trustDeltaThreshold) continue;

    const parts = key.split(':');
    const from = parts[2] || '?';
    const to = parts[3] || '?';
    const dir = av > bv ? 'вырос' : 'упал';

    beats.push({
      tick: record.trace.tickIndex,
      type: 'trust_shift',
      agents: [from, to],
      summary: `trust ${from}→${to} ${dir}: ${Math.round(bv * 100)}→${Math.round(av * 100)}`,
      tension: clamp01(delta * 2),
      novelty: clamp01(delta * 1.5),
      details: { from, to, before: bv, after: av, delta },
    });
  }
  return beats;
}

function detectConflicts(record: SimTickRecord): NarrativeBeat[] {
  const beats: NarrativeBeat[] = [];

  const conflicts = (record.plugins as any)?.conflicts;
  if (Array.isArray(conflicts)) {
    for (const c of conflicts) {
      beats.push({
        tick: record.trace.tickIndex,
        type: 'conflict',
        agents: [c.winnerId, c.loserId].filter(Boolean),
        summary: `конфликт: ${c.reason || 'unknown'}`,
        tension: 0.85,
        novelty: 0.8,
        details: c,
      });
    }
  }

  if (!beats.length) {
    const actions = record.trace.actionsApplied || [];
    const hostile = new Set(['attack', 'confront', 'threaten']);
    for (let i = 0; i < actions.length; i++) {
      for (let j = i + 1; j < actions.length; j++) {
        const a = actions[i];
        const b = actions[j];
        if (hostile.has(a.kind) && hostile.has(b.kind) && a.targetId === b.actorId && b.targetId === a.actorId) {
          beats.push({
            tick: record.trace.tickIndex,
            type: 'conflict',
            agents: [a.actorId, b.actorId],
            summary: `конфликт: ${a.actorId} (${a.kind}) ↔ ${b.actorId} (${b.kind})`,
            tension: 0.85,
            novelty: 0.8,
            details: { aKind: a.kind, bKind: b.kind },
          });
        }
      }
    }
  }
  return beats;
}

function detectConvergence(record: SimTickRecord): NarrativeBeat[] {
  const cfg = FCS.beats;
  const actions = record.trace.actionsApplied || [];
  const kindCount: Record<string, string[]> = {};
  for (const a of actions) (kindCount[a.kind] ||= []).push(a.actorId);
  const beats: NarrativeBeat[] = [];
  for (const [kind, agents] of Object.entries(kindCount)) {
    if (agents.length >= cfg.convergenceMinAgents) {
      beats.push({
        tick: record.trace.tickIndex,
        type: 'convergence',
        agents,
        summary: `конвергенция: ${agents.length} агентов → ${kind}`,
        tension: 0.4,
        novelty: 0.5,
        details: { kind, count: agents.length },
      });
    }
  }
  return beats;
}

function detectInjury(record: SimTickRecord): NarrativeBeat[] {
  const beats: NarrativeBeat[] = [];
  for (const d of record.trace.deltas?.chars || []) {
    const hB = Number((d.before as any)?.health ?? 1);
    const hA = Number((d.after as any)?.health ?? 1);
    if (hB > 0.5 && hA <= 0.5) {
      beats.push({
        tick: record.trace.tickIndex,
        type: 'injury',
        agents: [d.id],
        summary: `${d.id} серьёзно ранен: health ${Math.round(hB * 100)}→${Math.round(hA * 100)}`,
        tension: 0.9,
        novelty: 0.9,
        details: { before: hB, after: hA },
      });
    }
  }
  return beats;
}

function detectPhaseTransition(world: SimWorld, prevWorld: SimWorld | null): NarrativeBeat[] {
  if (!prevWorld) return [];
  const cur = (world.facts as any)['scenario:phase'];
  const prev = (prevWorld.facts as any)['scenario:phase'];
  if (cur && prev && cur !== prev) {
    const label = (world.facts as any)['scenario:phaseLabel'] || cur;
    return [{
      tick: world.tickIndex,
      type: 'phase_transition',
      agents: [],
      summary: `фаза сценария: ${prev} → ${label}`,
      tension: 0.5,
      novelty: 0.9,
      details: { from: prev, to: cur },
    }];
  }
  return [];
}

function detectDialogueEvents(record: SimTickRecord): NarrativeBeat[] {
  const beats: NarrativeBeat[] = [];
  const actions = record.trace.actionsApplied || [];
  for (const a of actions) {
    if (a.kind !== 'respond') continue;
    const response = (a as any).payload?.responseAct;
    if (response === 'accept' || response === 'reject') {
      beats.push({
        tick: record.trace.tickIndex,
        type: 'dialogue_event',
        agents: [a.actorId, a.targetId || ''].filter(Boolean),
        summary: `${a.actorId} ${response === 'accept' ? 'принял' : 'отклонил'} предложение ${a.targetId || ''}`,
        tension: response === 'reject' ? 0.5 : 0.3,
        novelty: 0.4,
        details: { responseAct: response },
      });
    }
  }
  return beats;
}

export function computeTension(world: SimWorld): number {
  const w = FCS.beats.tensionWeights;
  const chars = Object.values(world.characters || {});
  if (!chars.length) return 0;

  const stresses = chars.map((c) => clamp01(Number(c.stress ?? 0)));
  const meanStress = stresses.reduce((s, v) => s + v, 0) / stresses.length;

  const facts: any = world.facts || {};
  let maxDanger = 0;
  for (const c of chars) {
    const d = Number(facts[`ctx:danger:${c.id}`] ?? 0);
    if (Number.isFinite(d) && d > maxDanger) maxDanger = d;
  }

  const modes = new Set<string>();
  for (const c of chars) {
    const m = (facts[`sim:pipeline:${c.id}`] as any)?.mode;
    if (m) modes.add(m);
  }
  const goalConflict = clamp01((modes.size - 1) / Math.max(1, chars.length - 1));

  let trustVol = 0;
  let trustCount = 0;
  const rels: any = facts.relations;
  if (rels && typeof rels === 'object') {
    for (const from of Object.keys(rels)) {
      const targets = rels[from];
      if (!targets || typeof targets !== 'object') continue;
      for (const to of Object.keys(targets)) {
        const t = Number(targets[to]?.trust ?? 0.5);
        trustVol += Math.abs(t - 0.5);
        trustCount++;
      }
    }
  }
  const avgTrustVol = trustCount > 0 ? trustVol / trustCount : 0;

  return clamp01(
    w.meanStress * meanStress +
    w.maxDanger * clamp01(maxDanger) +
    w.goalConflict * goalConflict +
    w.trustVolatility * avgTrustVol * 4,
  );
}

export function detectBeats(
  record: SimTickRecord,
  _prevRecord: SimTickRecord | null,
  world: SimWorld,
  prevWorld?: SimWorld | null,
): NarrativeBeat[] {
  const beats: NarrativeBeat[] = [
    ...detectModeSwitches(world, prevWorld ?? null),
    ...detectReactiveEpisodes(world),
    ...detectTrustShifts(record),
    ...detectConflicts(record),
    ...detectConvergence(record),
    ...detectInjury(record),
    ...detectPhaseTransition(world, prevWorld ?? null),
    ...detectDialogueEvents(record),
  ];

  const tension = computeTension(world);
  for (const b of beats) b.tension = Math.max(b.tension, tension);

  return beats;
}
