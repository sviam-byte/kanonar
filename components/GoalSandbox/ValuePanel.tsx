import React, { useMemo } from 'react';

function safeNum(x: any, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fmt(x: any, digits = 3): string {
  const n = Number(x);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

/**
 * Picks known keys from an object preserving key order.
 * Used to keep the panel stable across scene schema variations.
 */
function pick(obj: any, keys: string[]): Array<{ key: string; value: any }> {
  if (!obj || typeof obj !== 'object') return [];

  const out: Array<{ key: string; value: any }> = [];
  for (const k of keys) {
    if ((obj as any)[k] !== undefined && (obj as any)[k] !== null) {
      out.push({ key: k, value: (obj as any)[k] });
    }
  }
  return out;
}

/**
 * Value panel:
 *  (A) true world metrics (sceneDump.world.scene.metrics),
 *  (B) agent subjective metrics (snapshotV1.contextMind.metrics),
 *  (C) what is optimized in action choice (snapshotV1.decision).
 */
export const ValuePanel: React.FC<{ sceneDump?: any; snapshotV1?: any }> = ({ sceneDump, snapshotV1 }) => {
  const trueWorldMetrics = (sceneDump as any)?.world?.scene?.metrics ?? null;

  const agentMetrics = useMemo(() => {
    const cm = (snapshotV1 as any)?.contextMind ?? null;
    const ms = Array.isArray(cm?.metrics) ? cm.metrics : [];
    return ms
      .map((m: any) => ({ key: String(m?.key ?? ''), value: m?.value }))
      .filter((m: any) => m.key);
  }, [snapshotV1]);

  const decision = (snapshotV1 as any)?.decision ?? null;

  const goalEnergy = useMemo(() => {
    const ge = decision?.goalEnergy;
    if (!ge || typeof ge !== 'object') return [];

    return Object.entries(ge)
      .map(([k, v]) => ({ key: String(k), value: clamp01(safeNum(v, 0)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [decision]);

  const actionScores = useMemo(() => {
    const actionsRaw = Array.isArray(decision?.actions) ? decision.actions : [];
    const ge: Record<string, number> =
      (decision?.goalEnergy && typeof decision.goalEnergy === 'object') ? decision.goalEnergy : {};

    const rows = actionsRaw.map((a: any) => {
      const deltaGoals: Record<string, number> =
        (a?.deltaGoals || a?.why?.parts?.deltaGoals || a?.action?.deltaGoals || {}) as any;

      const cost = safeNum(a?.cost ?? a?.why?.parts?.cost ?? 0, 0);
      const confidence = clamp01(safeNum(a?.confidence ?? a?.why?.parts?.confidence ?? 1, 1));

      let sum = 0;
      for (const [goalId, d] of Object.entries(deltaGoals || {})) {
        const e = safeNum((ge as any)?.[goalId] ?? 0, 0);
        sum += e * safeNum(d, 0);
      }

      const q = (sum - cost) * confidence;

      return {
        id: String(a?.id ?? a?.actionId ?? a?.label ?? a?.name ?? ''),
        label: String(a?.label ?? a?.name ?? a?.id ?? ''),
        q,
        sum,
        cost,
        confidence,
        deltaGoals,
      };
    });

    rows.sort((a, b) => b.q - a.q);
    return rows.slice(0, 8);
  }, [decision]);

  const worldRows = useMemo(() => pick(trueWorldMetrics, [
    'threat', 'pressure', 'cohesion', 'legitimacy', 'route_known',
    'food', 'water', 'fatigue', 'stress',
  ]), [trueWorldMetrics]);

  const agentRows = useMemo(() => {
    const important = ['threat', 'pressure', 'support', 'crowd', 'resource', 'route_known'];
    const by = new Map(agentMetrics.map(m => [m.key, m.value]));
    const out: Array<{ key: string; value: any }> = [];

    for (const k of important) {
      if (by.has(k)) out.push({ key: k, value: by.get(k) });
    }

    for (const m of agentMetrics) {
      if (!important.includes(m.key)) out.push(m);
      if (out.length >= 18) break;
    }

    return out;
  }, [agentMetrics]);

  return (
    <div className="p-3 space-y-4">
      <div className="text-[11px] opacity-70">
        Разложение: (A) истина мира → (B) убеждения агента → (C) что оптимизируется при выборе действия.
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="rounded border border-white/10 bg-black/10 p-3">
          <div className="text-xs font-semibold mb-2">A) Истинное состояние мира (sceneDump)</div>
          {worldRows.length ? (
            <div className="space-y-1">
              {worldRows.map(r => (
                <div key={r.key} className="flex justify-between text-[11px] font-mono">
                  <span className="opacity-80">{r.key}</span>
                  <span className="opacity-95">{fmt(r.value, 3)}</span>
                </div>
              ))}
              <details className="mt-2">
                <summary className="text-[11px] opacity-70 cursor-pointer">raw metrics</summary>
                <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap break-words opacity-90">
                  {JSON.stringify(trueWorldMetrics, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="text-[11px] italic opacity-70">
              Нет world.scene.metrics в sceneDump (либо экспорт не включён, либо другая схема).
            </div>
          )}
        </div>

        <div className="rounded border border-white/10 bg-black/10 p-3">
          <div className="text-xs font-semibold mb-2">B) Оценка мира агентом (contextMind.metrics)</div>
          {agentRows.length ? (
            <div className="space-y-1">
              {agentRows.map(r => (
                <div key={r.key} className="flex justify-between text-[11px] font-mono">
                  <span className="opacity-80">{r.key}</span>
                  <span className="opacity-95">{fmt(r.value, 3)}</span>
                </div>
              ))}
              <details className="mt-2">
                <summary className="text-[11px] opacity-70 cursor-pointer">raw contextMind</summary>
                <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap break-words opacity-90">
                  {JSON.stringify((snapshotV1 as any)?.contextMind ?? null, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="text-[11px] italic opacity-70">
              Нет contextMind.metrics в snapshotV1 (либо не сформировано, либо другой формат).
            </div>
          )}
        </div>

        <div className="rounded border border-white/10 bg-black/10 p-3">
          <div className="text-xs font-semibold mb-2">C) Что оптимизируется (decision)</div>

          <div className="text-[11px] opacity-80">Сейчас это локальный Q-скоринг:</div>
          <div className="mt-1 text-[11px] font-mono opacity-95">
            q = ( Σ_goal ( goalEnergy[goal] · deltaGoals[goal] ) − cost ) · confidence
          </div>

          <div className="mt-3 text-[11px] font-semibold opacity-90">Top goalEnergy</div>
          {goalEnergy.length ? (
            <div className="mt-1 space-y-1">
              {goalEnergy.map(r => (
                <div key={r.key} className="flex justify-between text-[11px] font-mono">
                  <span className="opacity-80">{r.key}</span>
                  <span className="opacity-95">{fmt(r.value, 3)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] italic opacity-70">goalEnergy отсутствует.</div>
          )}

          <div className="mt-3 text-[11px] font-semibold opacity-90">Top actions by q (proxy)</div>
          {actionScores.length ? (
            <div className="mt-1 space-y-2">
              {actionScores.map(a => (
                <div key={a.id || a.label} className="rounded border border-white/10 bg-black/10 p-2">
                  <div className="flex justify-between text-[11px]">
                    <div className="font-mono opacity-95">{a.label || a.id}</div>
                    <div className="font-mono opacity-95">q={fmt(a.q, 4)}</div>
                  </div>
                  <div className="mt-1 flex gap-3 text-[10px] font-mono opacity-75">
                    <span>sum={fmt(a.sum, 4)}</span>
                    <span>cost={fmt(a.cost, 4)}</span>
                    <span>conf={fmt(a.confidence, 3)}</span>
                  </div>
                  <details className="mt-1">
                    <summary className="text-[10px] opacity-70 cursor-pointer">deltaGoals</summary>
                    <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap break-words opacity-90">
                      {JSON.stringify(a.deltaGoals || {}, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] italic opacity-70">decision.actions отсутствует или пуст.</div>
          )}

          <details className="mt-3">
            <summary className="text-[11px] opacity-70 cursor-pointer">raw decision</summary>
            <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap break-words opacity-90">
              {JSON.stringify(decision, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
};
