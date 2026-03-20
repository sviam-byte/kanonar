// lib/simkit/plugins/goalLabDeciderPlugin.ts
// SimKit plugin: uses GoalLab S8 decision ranking and stores rich per-agent trace
// for UI inspection in world.facts['sim:trace:<agentId>'].

import type { SimPlugin } from '../core/simulator';
import type { SimSnapshot, SimWorld, SimAction } from '../core/types';
import { runGoalLabPipelineV1 } from '../../goal-lab/pipeline/runPipelineV1';
import { arr } from '../../utils/arr';
import { toSimAction } from '../actions/fromActionCandidate';
import { buildWorldStateFromSim } from './goalLabPipelinePlugin';
import { selectDecisionMode, type DecisionMode } from '../core/decisionGate';
import { reactiveDecision } from '../core/reactiveDecision';
import { FCS } from '../../config/formulaConfigSim';
import { clamp01 } from '../../util/math';

function buildSnapshot(world: SimWorld, tickIndex: number): SimSnapshot {
  return {
    schema: 'SimKitSnapshotV1',
    id: `sim:gl:decider:t${String(tickIndex).padStart(5, '0')}`,
    time: new Date().toISOString(),
    tickIndex,
    characters: Object.values(world.characters || {}).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    locations: Object.values(world.locations || {}).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    events: (world.events || []).slice(),
    debug: {},
  } as any;
}

function readActorFilter(world: SimWorld): string[] {
  const raw = (world as any)?.facts?.['sim:actors'];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

function extractDecisionBest(pipeline: any): any | null {
  const s8 = pipeline?.stages?.find((s: any) => s?.stage === 'S8');
  return (s8 as any)?.artifacts?.best ?? null;
}

function decorateAction(action: SimAction, best: any): SimAction {
  return {
    ...action,
    meta: {
      ...(action as any).meta,
      source: 'goalLab',
      decisionId: String(best?.p?.id ?? best?.id ?? ''),
      score: Number((best as any)?.q ?? 0),
      cost: Number(best?.cost ?? 0),
    },
  };
}

/**
 * Extracts compact per-agent trace from pipeline for UI consumption.
 * Trace lives in world.facts['sim:trace:<agentId>'] and is safe for rendering.
 */
function extractAgentTrace(pipeline: any, actorId: string, world: SimWorld, mode: DecisionMode, gateResult: any): any {
  const stages = arr((pipeline as any)?.stages);

  // S4: emotions
  const s4atoms = arr(stages.find((s: any) => s.stage === 'S4')?.atoms);
  const emotions: Record<string, number> = {};
  for (const a of s4atoms) {
    const id = String((a as any)?.id || '');
    if (id.startsWith('emo:') && id.endsWith(`:${actorId}`)) {
      const key = id.split(':')[1] || '';
      if (key) emotions[key] = clamp01(Number((a as any)?.magnitude ?? 0));
    }
  }

  // S5: ToM dyad metrics from atoms and fallback world facts
  const s5atoms = arr(stages.find((s: any) => s.stage === 'S5')?.atoms);
  const relations: Record<string, Record<string, number>> = {};
  for (const a of s5atoms) {
    const id = String((a as any)?.id || '');
    // tom:dyad:<metric>:<from>:<to> OR rel:state:<metric>:<from>:<to>
    const m = id.match(/^(?:tom:dyad:|rel:state:)([^:]+):([^:]+):([^:]+)$/);
    if (!m) continue;
    const [, metric, fromId, toId] = m;
    if (fromId !== actorId) continue;
    if (!relations[toId]) relations[toId] = {};
    relations[toId][metric] = clamp01(Number((a as any)?.magnitude ?? 0));
  }

  const factsRels = (world.facts as any)?.relations?.[actorId];
  if (factsRels && typeof factsRels === 'object') {
    for (const [toId, metrics] of Object.entries(factsRels as Record<string, any>)) {
      if (!relations[toId]) relations[toId] = {};
      for (const [k, v] of Object.entries(metrics || {})) {
        const n = Number(v);
        if (Number.isFinite(n)) relations[toId][k] = clamp01(n);
      }
    }
  }

  // S6: drivers
  const s6atoms = arr(stages.find((s: any) => s.stage === 'S6')?.atoms);
  const drivers: Record<string, number> = {};
  for (const a of s6atoms) {
    const id = String((a as any)?.id || '');
    if (id.startsWith('drv:') && id.endsWith(`:${actorId}`)) {
      const key = id.split(':')[1] || '';
      if (key) drivers[key] = clamp01(Number((a as any)?.magnitude ?? 0));
    }
  }

  // S7: goals + active domains + goal mode
  const s7 = stages.find((s: any) => s.stage === 'S7');
  const goalSnapshot = (s7 as any)?.artifacts?.goalLayerSnapshot;
  const goals = arr(goalSnapshot?.domains).map((d: any) => ({
    domain: d.domain,
    score: clamp01(Number(d.score01 ?? 0)),
  }));
  const activeGoals = arr(goalSnapshot?.activeDomains).map((d: any) => d.domain);
  const modeLabel = goalSnapshot?.mode?.label || '';

  // S8: ranked actions (top candidates)
  const s8 = stages.find((s: any) => s.stage === 'S8');
  const ranked = arr((s8 as any)?.artifacts?.ranked).slice(0, 10).map((r: any) => ({
    action: String(r?.action?.id || r?.id || ''),
    kind: String(r?.action?.kind || r?.kind || ''),
    targetId: r?.action?.targetId || r?.targetId || null,
    q: Number(r?.q ?? 0),
    cost: Number(r?.action?.cost ?? r?.cost ?? 0),
    confidence: clamp01(Number(r?.action?.confidence ?? r?.confidence ?? 1)),
    goalContribs: (() => {
      const deltas = (r?.action?.deltaGoals || r?.deltaGoals || {});
      const out: Record<string, number> = {};
      for (const [g, d] of Object.entries(deltas)) out[g] = Number(d);
      return out;
    })(),
  }));

  const best = ranked[0] || null;

  return {
    tick: (pipeline as any)?.tick ?? 0,
    actorId,
    decisionMode: mode,
    gate: gateResult,
    emotions,
    drivers,
    goals,
    activeGoals,
    mode: modeLabel,
    relations,
    ranked,
    best: best
      ? {
          kind: best.kind,
          targetId: best.targetId,
          q: best.q,
          goalContribs: best.goalContribs,
          explanation: buildExplanation(best, ranked, drivers, emotions, modeLabel, mode),
        }
      : null,
  };
}

/** Build readable explanation for why the highest-ranked action was selected. */
function buildExplanation(
  best: any,
  ranked: any[],
  drivers: Record<string, number>,
  emotions: Record<string, number>,
  _mode: string,
  decisionMode: DecisionMode,
): string[] {
  const lines: string[] = [];

  if (decisionMode === 'reactive') {
    lines.push('⚡ Реактивное решение (System 1)');
    return lines;
  }
  if (decisionMode === 'degraded') {
    lines.push('⚠ Ослабленное обдумывание (усталость/стресс)');
  }

  const topGoalContrib = Object.entries(best.goalContribs || {})
    .sort(([, a]: any, [, b]: any) => Math.abs(Number(b)) - Math.abs(Number(a)))
    .slice(0, 2);
  for (const [goal, delta] of topGoalContrib) {
    const d = Number(delta);
    if (d > 0.01) lines.push(`↑ ${goal}: +${(d * 100).toFixed(0)}% (продвигает цель)`);
    else if (d < -0.01) lines.push(`↓ ${goal}: ${(d * 100).toFixed(0)}% (цена)`);
  }

  if (ranked.length > 1) {
    const alt = ranked[1];
    const gap = Number(best.q) - Number(alt.q);
    if (gap < 0.05) {
      lines.push(`≈ Почти равен: ${alt.kind}${alt.targetId ? `→${alt.targetId}` : ''} (Q=${alt.q.toFixed(3)}, разрыв ${(gap * 100).toFixed(1)}%)`);
    } else {
      lines.push(`> Альтернатива: ${alt.kind} (Q=${alt.q.toFixed(3)}, хуже на ${(gap * 100).toFixed(0)}%)`);
    }
  }

  const topDriver = Object.entries(drivers).sort(([, a], [, b]) => b - a)[0];
  if (topDriver && topDriver[1] > 0.4) {
    lines.push(`🔥 Главный драйвер: ${topDriver[0]} (${(topDriver[1] * 100).toFixed(0)}%)`);
  }

  const topEmo = Object.entries(emotions)
    .filter(([k]) => !['arousal', 'valence'].includes(k))
    .sort(([, a], [, b]) => b - a)[0];
  if (topEmo && topEmo[1] > 0.3) {
    lines.push(`💭 Эмоция: ${topEmo[0]} (${(topEmo[1] * 100).toFixed(0)}%)`);
  }

  return lines;
}

export function makeGoalLabDeciderPlugin(opts?: { storePipeline?: boolean; enableDualProcess?: boolean }): SimPlugin {
  return {
    id: 'plugin:goalLabDecider',
    decideActions: ({ world, tickIndex, offers }) => {
      if (String((world as any)?.facts?.['sim:decider'] ?? '') === 'heuristic') return null;

      const snapshot = buildSnapshot(world, tickIndex);
      const worldState = buildWorldStateFromSim(world, snapshot);
      const participantIds = Object.keys(world.characters || {}).sort();
      const actorFilter = readActorFilter(world);
      const actorIds = (actorFilter.length ? actorFilter : participantIds)
        .filter((id) => Boolean((world.characters || {})[id]))
        .sort();

      const actions: SimAction[] = [];

      for (const actorId of actorIds) {
        const dualProcessEnabled = opts?.enableDualProcess !== false;
        let mode: DecisionMode = 'deliberative';
        let gateResult: any = null;
        if (dualProcessEnabled) {
          const dr = selectDecisionMode(world, actorId);
          mode = dr.mode;
          gateResult = dr.gate;
        }

        if (mode === 'reactive') {
          const rr = reactiveDecision(world, actorId, offers, tickIndex);
          (world.facts as any)[`sim:trace:${actorId}`] = {
            tick: tickIndex,
            actorId,
            decisionMode: 'reactive',
            gate: gateResult,
            emotions: {},
            drivers: {},
            goals: [],
            activeGoals: [],
            mode: '',
            relations: {},
            ranked: [],
            best: rr.action
              ? {
                  kind: rr.action.kind,
                  targetId: rr.action.targetId,
                  q: 0,
                  goalContribs: {},
                  explanation: [`⚡ Реактивное: ${rr.reason}`, `Эмоция: ${rr.emotion} (${(rr.emotionValue * 100).toFixed(0)}%)`],
                }
              : null,
          };

          if (rr.action) {
            rr.action.meta = { ...(rr.action.meta || {}), decisionMode: 'reactive', gate: gateResult, reactiveReason: rr.reason };
            actions.push(rr.action);
          }
          continue;
        }

        const sceneControl: any = {};
        if (mode === 'degraded') {
          const dm = FCS.dualProcess.degradedModifiers;
          sceneControl.enableToM = dm.tomEnabled;
          sceneControl.enablePredict = dm.lookaheadEnabled;
          sceneControl._degradedTopK = dm.topK;
          sceneControl._degradedTempMult = dm.temperatureMultiplier;
          (worldState as any).decisionTemperature = (Number((worldState as any).decisionTemperature) || 1.0) * dm.temperatureMultiplier;
        }

        const pipeline = runGoalLabPipelineV1({
          world: worldState as any,
          agentId: actorId,
          participantIds,
          tickOverride: tickIndex,
          ...(mode === 'degraded' ? { sceneControl } : {}),
        });
        if (!pipeline) continue;

        const bpAtoms = arr((pipeline as any)?.beliefPersist?.beliefAtoms);
        if (bpAtoms.length) {
          const memKey = `mem:beliefAtoms:${actorId}`;
          const prev = arr((world.facts as any)?.[memKey]);
          const byId = new Map<string, any>();
          for (const a of prev) {
            const id = String((a as any)?.id || '');
            if (id) byId.set(id, a);
          }
          for (const a of bpAtoms) {
            const id = String((a as any)?.id || '');
            if (id) byId.set(id, a);
          }
          (world.facts as any)[memKey] = Array.from(byId.values());
        }

        if (opts?.storePipeline) {
          (world as any).facts['sim:goalLab:lastPipeline'] = pipeline;
        }

        const trace = extractAgentTrace(pipeline, actorId, world, mode, gateResult);
        (world.facts as any)[`sim:trace:${actorId}`] = trace;
        (world.facts as any)[`sim:pipeline:${actorId}`] = {
          mode: trace.mode,
          decisionMode: mode,
          tick: tickIndex,
        };

        const best = extractDecisionBest(pipeline);
        if (!best) continue;

        const action = toSimAction(best, tickIndex);
        if (action) {
          const decorated = decorateAction(action, best);
          decorated.meta = { ...(decorated.meta || {}), decisionMode: mode, gate: gateResult };
          actions.push(decorated);
        }
      }

      return actions;
    },
  };
}
