import React, { useMemo } from 'react';
import { arr } from '../../lib/utils/arr';
import { GOAL_DEFS } from '../../lib/goals/space';

type WorldMetrics = Record<string, any>;

/**
 * Safely converts unknown input to number.
 * Falls back to a caller-provided default when conversion is not finite.
 */
function safeNum(x: any, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

/**
 * Clamps numeric values into [0..1] to keep bar/probability rendering stable.
 */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Numeric formatter used by compact debug labels.
 */
function fmt(x: any, digits = 3): string {
  const n = Number(x);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

/**
 * Heuristic "goal utility" projection for current world metrics.
 *
 * Important:
 * - This panel is explain/debug-oriented and intentionally keeps a lightweight,
 *   explicit mapping close to planner-v4 semantics.
 * - Unknown goals/domains degrade to neutral utility (0.5), preserving UI stability.
 */
function evaluateGoalInWorld(goalId: string, worldMetrics: WorldMetrics | null | undefined): number {
  const metrics = worldMetrics && typeof worldMetrics === 'object' ? worldMetrics : null;
  if (!metrics) return 0.5;

  const def = (GOAL_DEFS as any)?.[goalId];
  const domains: string[] = Array.isArray(def?.domains) ? def.domains : [];

  let u = 0;
  let wSum = 0;

  for (const dom of domains) {
    switch (dom) {
      case 'leader_legitimacy':
        u += clamp01(safeNum(metrics.legitimacy, 50) / 100);
        wSum += 1;
        break;
      case 'group_cohesion':
        u += clamp01(safeNum(metrics.cohesion, 50) / 100);
        wSum += 1;
        break;
      case 'threat':
      case 'survival':
        u += 1 - clamp01(safeNum(metrics.threat, 50) / 100);
        wSum += 1;
        break;
      case 'information':
        u += clamp01(safeNum(metrics.route_known, 50) / 100);
        wSum += 1;
        break;
      default:
        break;
    }
  }

  if (wSum === 0) return 0.5;
  return clamp01(u / wSum);
}

/**
 * Compact horizontal progress bar used for distribution and utility rows.
 */
function GoalBar({ label, value }: { label: string; value: number }) {
  const v = clamp01(value);
  return (
    <div className="flex items-center gap-2">
      <div className="w-44 text-[11px] text-canon-text-light truncate" title={label}>{label}</div>
      <div className="flex-1 h-2 rounded bg-white/10 overflow-hidden">
        <div className="h-2 bg-canon-accent/60" style={{ width: `${Math.round(v * 100)}%` }} />
      </div>
      <div className="w-14 text-[11px] font-mono text-canon-text text-right">{Math.round(v * 100)}%</div>
    </div>
  );
}

export const ValueFunctionPanel: React.FC<{
  sceneDump?: any;
  snapshotV1?: any;
  goalScores?: any[];
  tunedGoalScores?: any[];
  decision?: any;
}> = ({ sceneDump, snapshotV1, goalScores, tunedGoalScores, decision }) => {
  const worldMetrics: WorldMetrics | null = (sceneDump as any)?.world?.scene?.metrics ?? null;

  const trueWorldRows = useMemo(() => {
    const keys = ['threat', 'pressure', 'cohesion', 'legitimacy', 'route_known', 'food', 'water', 'fatigue', 'stress'];
    const m = worldMetrics && typeof worldMetrics === 'object' ? worldMetrics : {};
    return keys.filter(k => (m as any)[k] != null).map(k => ({ key: k, value: (m as any)[k] }));
  }, [worldMetrics]);

  const agentMetrics = useMemo(() => {
    const cm = (snapshotV1 as any)?.contextMind ?? null;
    const metrics = arr(cm?.metrics);
    const order = ['threat', 'pressure', 'support', 'crowd'];
    const byKey = new Map(metrics.map((m: any) => [String(m?.key), m]));
    const out: any[] = [];

    for (const k of order) {
      const m = byKey.get(k);
      if (m) out.push(m);
    }
    for (const m of metrics) {
      const k = String(m?.key || '');
      if (!order.includes(k)) out.push(m);
    }

    return out;
  }, [snapshotV1]);

  const goalDist = useMemo(() => {
    const src = arr((tunedGoalScores && tunedGoalScores.length) ? tunedGoalScores : goalScores);
    return src
      .map((g: any) => ({
        goalId: String(g.goalId ?? g.id ?? ''),
        p: safeNum(g.probability ?? g.score ?? g.dynamic ?? 0)
      }))
      .filter(g => g.goalId)
      .sort((a, b) => b.p - a.p)
      .slice(0, 12);
  }, [goalScores, tunedGoalScores]);

  const expectedV = useMemo(() => {
    if (!worldMetrics) return null;

    const byGoal = goalDist.map(g => ({ ...g, u: evaluateGoalInWorld(g.goalId, worldMetrics) }));

    let s = 0;
    let w = 0;
    for (const g of byGoal) {
      const p = clamp01(g.p);
      s += p * g.u;
      w += p;
    }

    const v = w > 1e-9 ? clamp01(s / w) : 0.5;
    return { v, byGoal };
  }, [worldMetrics, goalDist]);

  const energyRows = useMemo(() => {
    const ge = (decision as any)?.goalEnergy;
    if (!ge || typeof ge !== 'object') return [];

    return Object.entries(ge)
      .map(([k, v]) => ({ key: String(k), value: clamp01(safeNum(v, 0)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [decision]);

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar p-4 space-y-6">
      <div className="border border-canon-border/40 rounded-lg bg-black/20 p-4">
        <div className="text-xs uppercase tracking-wider text-canon-text-light/70">Value Overview</div>
        <div className="mt-2 flex items-end gap-4">
          <div>
            <div className="text-[11px] text-canon-text-light/70">Expected Utility V(s)</div>
            <div className="text-3xl font-semibold text-canon-text">{expectedV ? fmt(expectedV.v, 3) : '—'}</div>
          </div>
          <div className="text-[11px] text-canon-text-light/70 max-w-xl">
            Calculated from top goal distribution and heuristic domain-to-metric mapping.
            If world metrics are missing, the panel stays neutral and explanatory.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="border border-canon-border/40 rounded-lg bg-black/20 p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-canon-text-light/70">World Metrics (sceneDump.world.scene.metrics)</div>
          {trueWorldRows.length ? (
            <div className="space-y-2">
              {trueWorldRows.map(row => (
                <div key={row.key} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-canon-text-light">{row.key}</span>
                  <span className="font-mono text-canon-text">{fmt(row.value, 2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-canon-text-light/70">No scene metrics found.</div>
          )}
        </section>

        <section className="border border-canon-border/40 rounded-lg bg-black/20 p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-canon-text-light/70">Agent Metrics (snapshotV1.contextMind.metrics)</div>
          {agentMetrics.length ? (
            <div className="space-y-2">
              {agentMetrics.map((m: any, idx: number) => (
                <div key={`${String(m?.key || 'metric')}-${idx}`} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-canon-text-light">{String(m?.key ?? 'unknown')}</span>
                  <span className="font-mono text-canon-text">{fmt((m as any)?.value, 2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-canon-text-light/70">No contextMind metrics found.</div>
          )}
        </section>
      </div>

      <section className="border border-canon-border/40 rounded-lg bg-black/20 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-canon-text-light/70">Goal Distribution (Top)</div>
        {goalDist.length ? (
          <div className="space-y-2">
            {goalDist.map(g => (
              <GoalBar key={g.goalId} label={g.goalId} value={clamp01(g.p)} />
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-canon-text-light/70">No goal scores available.</div>
        )}
      </section>

      <section className="border border-canon-border/40 rounded-lg bg-black/20 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-canon-text-light/70">Per-Goal Utility in Current World</div>
        {expectedV?.byGoal?.length ? (
          <div className="space-y-2">
            {expectedV.byGoal.map(g => (
              <div key={`utility-${g.goalId}`} className="space-y-1">
                <GoalBar label={g.goalId} value={g.u} />
                <div className="text-[11px] text-canon-text-light/70 pl-1">
                  p={fmt(g.p, 3)} • u={fmt(g.u, 3)} • p×u={fmt(clamp01(g.p) * g.u, 3)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-canon-text-light/70">World metrics unavailable; utility decomposition is neutral.</div>
        )}
      </section>

      <section className="border border-canon-border/40 rounded-lg bg-black/20 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-canon-text-light/70">Decision Goal Energy (Top)</div>
        {energyRows.length ? (
          <div className="space-y-2">
            {energyRows.map(row => (
              <GoalBar key={`energy-${row.key}`} label={row.key} value={row.value} />
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-canon-text-light/70">No decision.goalEnergy found in snapshot.</div>
        )}
      </section>
    </div>
  );
};
