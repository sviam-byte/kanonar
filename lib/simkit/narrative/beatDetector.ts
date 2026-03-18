// lib/simkit/narrative/beatDetector.ts
// Identifies narratively significant ticks from TickTrace data.

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
  | 'escalation';

export type NarrativeBeat = {
  tick: number;
  type: BeatType;
  agents: string[];
  summary: string;
  tension: number;
  novelty: number;
  details?: Record<string, any>;
};

function detectModeSwitch(record: SimTickRecord, prevRecord: SimTickRecord | null): NarrativeBeat[] {
  if (!prevRecord) return [];
  const beats: NarrativeBeat[] = [];

  const plugins: any = record.plugins || {};
  const pipelineData = plugins.goalLabPipeline?.pipeline ?? plugins.goalLabDecider?.pipeline;
  if (pipelineData) {
    const s7 = (pipelineData.stages || []).find((s: any) => s.stage === 'S7');
    const mode = s7?.artifacts?.goalLayerSnapshot?.mode;
    if (mode?.label) {
      const prevPipeline = prevRecord.plugins?.goalLabPipeline?.pipeline;
      const prevS7 = (prevPipeline?.stages || []).find((s: any) => s.stage === 'S7');
      const prevMode = prevS7?.artifacts?.goalLayerSnapshot?.mode;
      if (prevMode?.label && prevMode.label !== mode.label) {
        beats.push({
          tick: record.trace.tickIndex,
          type: 'mode_switch',
          agents: [pipelineData.selfId || ''],
          summary: `${pipelineData.selfId} сменил режим: ${prevMode.label} → ${mode.label}`,
          tension: 0.6,
          novelty: 0.7,
          details: { from: prevMode.label, to: mode.label },
        });
      }
    }
  }
  return beats;
}

function detectTrustShifts(record: SimTickRecord): NarrativeBeat[] {
  const cfg = FCS.beats;
  const beats: NarrativeBeat[] = [];
  const deltas = record.trace.deltas?.facts || {};

  for (const [key, { before, after }] of Object.entries(deltas)) {
    if (!key.startsWith('rel:trust:') && !key.includes(':trust')) continue;
    const bv = Number(before);
    const av = Number(after);
    if (!Number.isFinite(bv) || !Number.isFinite(av)) continue;
    const delta = Math.abs(av - bv);
    if (delta < cfg.trustDeltaThreshold) continue;

    const parts = key.split(':');
    const from = parts[2] || '?';
    const to = parts[3] || '?';
    const direction = av > bv ? 'вырос' : 'упал';

    beats.push({
      tick: record.trace.tickIndex,
      type: 'trust_shift',
      agents: [from, to],
      summary: `trust ${from}→${to} ${direction}: ${Math.round(bv * 100)}→${Math.round(av * 100)}`,
      tension: clamp01(delta * 2),
      novelty: clamp01(delta * 1.5),
      details: { from, to, before: bv, after: av, delta },
    });
  }
  return beats;
}

function detectConflict(record: SimTickRecord): NarrativeBeat[] {
  const beats: NarrativeBeat[] = [];
  const actions = record.trace.actionsApplied || [];
  const hostile = new Set(['attack', 'confront', 'threaten', 'accuse']);

  for (let i = 0; i < actions.length; i++) {
    for (let j = i + 1; j < actions.length; j++) {
      const a = actions[i];
      const b = actions[j];
      if (!hostile.has(a.kind) && !hostile.has(b.kind)) continue;
      if (a.targetId === b.actorId && b.targetId === a.actorId) {
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
  return beats;
}

function detectConvergence(record: SimTickRecord): NarrativeBeat[] {
  const cfg = FCS.beats;
  const actions = record.trace.actionsApplied || [];
  const kindCount: Record<string, string[]> = {};
  for (const a of actions) {
    (kindCount[a.kind] ||= []).push(a.actorId);
  }
  const beats: NarrativeBeat[] = [];
  for (const [kind, agents] of Object.entries(kindCount)) {
    if (agents.length >= cfg.convergenceMinAgents) {
      beats.push({
        tick: record.trace.tickIndex,
        type: 'convergence',
        agents,
        summary: `конвергенция: ${agents.length} агентов делают ${kind}`,
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
  const deltas = record.trace.deltas?.chars || [];
  for (const d of deltas) {
    const hBefore = Number((d.before as any)?.health ?? 1);
    const hAfter = Number((d.after as any)?.health ?? 1);
    if (hBefore > 0.5 && hAfter <= 0.5) {
      beats.push({
        tick: record.trace.tickIndex,
        type: 'injury',
        agents: [d.id],
        summary: `${d.id} серьёзно ранен: health ${Math.round(hBefore * 100)}→${Math.round(hAfter * 100)}`,
        tension: 0.9,
        novelty: 0.9,
        details: { before: hBefore, after: hAfter },
      });
    }
  }
  return beats;
}

export function computeTension(world: SimWorld): number {
  const w = FCS.beats.tensionWeights;
  const chars = Object.values(world.characters || {});
  if (!chars.length) return 0;

  const stresses = chars.map(c => clamp01(Number(c.stress ?? 0)));
  const meanStress = stresses.reduce((s, v) => s + v, 0) / stresses.length;

  const facts: any = world.facts || {};
  let maxDanger = 0;
  for (const c of chars) {
    const d = Number(facts[`ctx:danger:${c.id}`] ?? 0);
    if (Number.isFinite(d) && d > maxDanger) maxDanger = d;
  }

  const modes = new Set<string>();
  for (const c of chars) {
    const m = String(facts[`goal:mode:${c.id}`] ?? facts[`sim:mode:${c.id}`] ?? '');
    if (m) modes.add(m);
  }
  const goalConflict = clamp01((modes.size - 1) / Math.max(1, chars.length - 1));

  let trustVol = 0;
  let trustCount = 0;
  const relations: any = facts.relations;
  if (relations && typeof relations === 'object') {
    for (const fromId of Object.keys(relations)) {
      const targets = relations[fromId];
      if (!targets || typeof targets !== 'object') continue;
      for (const toId of Object.keys(targets)) {
        const t = Number(targets[toId]?.trust ?? 0.5);
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
    w.trustVolatility * avgTrustVol * 4
  );
}

export function detectBeats(
  record: SimTickRecord,
  prevRecord: SimTickRecord | null,
  world: SimWorld,
): NarrativeBeat[] {
  const beats: NarrativeBeat[] = [
    ...detectModeSwitch(record, prevRecord),
    ...detectTrustShifts(record),
    ...detectConflict(record),
    ...detectConvergence(record),
    ...detectInjury(record),
  ];

  const tension = computeTension(world);
  for (const b of beats) {
    b.tension = Math.max(b.tension, tension);
  }

  return beats;
}
