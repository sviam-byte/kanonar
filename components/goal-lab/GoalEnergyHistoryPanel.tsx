import React, { useMemo, useState } from 'react';

function safeNum(x: any, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function prettyGoalId(goalId: string): { label: string; domain?: string; selfId?: string } {
  // Expected canonical id: goal:domain:<domain>:<selfId>
  // We keep a graceful fallback for forward/backward compatibility.
  const s = String(goalId || '');
  const parts = s.split(':');
  if (parts.length >= 4 && parts[0] === 'goal' && parts[1] === 'domain') {
    const domain = parts[2];
    const selfId = parts.slice(3).join(':');
    return { label: domain, domain, selfId };
  }
  return { label: s };
}

function BarSeries({ values, activeIndex }: { values: number[]; activeIndex: number }) {
  const max = 1;
  return (
    <div className="flex items-end gap-[2px] h-10">
      {values.map((v, i) => {
        const h = Math.round((clamp01(v) / max) * 100);
        const active = i === activeIndex;
        return (
          <div
            key={i}
            className={
              'w-[6px] rounded-sm border ' +
              (active
                ? 'bg-canon-accent/40 border-canon-accent/70'
                : 'bg-white/5 border-white/10')
            }
            style={{ height: `${Math.max(6, h)}%` }}
            title={`iter ${i}: ${v.toFixed(3)}`}
          />
        );
      })}
    </div>
  );
}

/**
 * Visualizes S7 goal-energy propagation history from pipeline artifacts:
 * pipelineV1.stages[*].artifacts.goalDebug.energyRefine.goalEnergyHistory.
 *
 * The panel is intentionally defensive and non-throwing:
 * - works when payload is partially missing,
 * - renders explicit hints when backend debug is unavailable.
 */
export const GoalEnergyHistoryPanel: React.FC<{
  pipelineV1: any | null | undefined;
  stageId?: string;
}> = ({ pipelineV1, stageId = 'S7' }) => {
  const stage = useMemo(() => {
    const stages = Array.isArray((pipelineV1 as any)?.stages) ? (pipelineV1 as any).stages : [];
    return stages.find((s: any) => String(s?.stage || s?.id || s?.stageId) === stageId) || null;
  }, [pipelineV1, stageId]);

  const goalDebug = (stage as any)?.artifacts?.goalDebug ?? null;
  const energyRefine = goalDebug?.energyRefine ?? null;
  const goalEnergyHistory: Record<string, number[]> = energyRefine?.goalEnergyHistory ?? {};

  const keys = useMemo(() => Object.keys(goalEnergyHistory || {}), [goalEnergyHistory]);
  const maxLen = useMemo(() => {
    let m = 0;
    for (const k of keys) m = Math.max(m, Array.isArray(goalEnergyHistory[k]) ? goalEnergyHistory[k].length : 0);
    return m;
  }, [keys, goalEnergyHistory]);

  const [iter, setIter] = useState(0);
  const clampedIter = Math.max(0, Math.min(Math.max(0, maxLen - 1), iter));

  const rows = useMemo(() => {
    return keys
      .map((id) => {
        const hist = Array.isArray(goalEnergyHistory[id]) ? goalEnergyHistory[id] : [];
        const v = hist.length ? safeNum(hist[Math.min(hist.length - 1, clampedIter)], 0) : 0;
        const vLast = hist.length ? safeNum(hist[hist.length - 1], 0) : 0;
        const meta = prettyGoalId(id);
        return { id, hist, v: clamp01(v), vLast: clamp01(vLast), meta };
      })
      .sort((a, b) => b.v - a.v);
  }, [keys, goalEnergyHistory, clampedIter]);

  if (!pipelineV1) {
    return <div className="text-xs italic opacity-70">Нет pipelineV1 (панель энергии не может отобразиться).</div>;
  }

  if (!stage) {
    return (
      <div className="text-xs opacity-80">
        Не найден stage <span className="font-mono">{stageId}</span> в pipelineV1.stages.
      </div>
    );
  }

  if (!goalDebug) {
    return (
      <div className="text-xs opacity-80 space-y-2">
        <div>
          В <span className="font-mono">{stageId}</span> нет <span className="font-mono">artifacts.goalDebug</span>.
        </div>
        <div className="opacity-70">
          Это ожидаемо, если не применён backend-патч, который прокидывает debug из deriveGoalAtoms → runPipelineV1 stage S7.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <div className="text-[10px] uppercase tracking-widest opacity-70">Propagation / goal energy</div>
          <div className="text-[11px] font-mono opacity-80 truncate">
            stage={String(stageId)} tick={String(goalDebug?.tick ?? '—')} self={String(goalDebug?.selfId ?? '—')}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[10px] font-mono opacity-70">iter {clampedIter}/{Math.max(0, maxLen - 1)}</div>
          <input
            type="range"
            min={0}
            max={Math.max(0, maxLen - 1)}
            step={1}
            value={clampedIter}
            onChange={(e) => setIter(Number(e.target.value))}
            className="w-48"
            disabled={maxLen <= 1}
          />
        </div>
      </div>

      <div className="rounded border border-canon-border/30 bg-black/10 p-3">
        <div className="text-[11px] font-mono opacity-80">config</div>
        <div className="mt-1 text-[11px] font-mono opacity-70">
          steps={String(energyRefine?.config?.steps ?? '—')} decay={String(energyRefine?.config?.decay ?? '—')} topK={String(
            energyRefine?.config?.topK ?? '—'
          )}{' '}
          thr={String(energyRefine?.config?.convergenceThreshold ?? '—')}
        </div>

        {energyRefine?.convergenceByChannel ? (
          <div className="mt-2">
            <div className="text-[11px] font-mono opacity-80">convergence by channel</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(energyRefine.convergenceByChannel).map(([ch, info]: any) => (
                <div
                  key={String(ch)}
                  className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[11px] font-mono"
                  title={JSON.stringify(info)}
                >
                  <span className={String(info?.converged) === 'true' || info?.converged ? 'text-emerald-300' : 'text-amber-300'}>
                    {String(ch)}
                  </span>
                  <span className="opacity-70">: it={String(info?.iterations ?? '—')}</span>
                  <span className="opacity-70"> Δ={safeNum(info?.maxDelta, 0).toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded border border-canon-border/30 bg-black/10 p-3">
        <div className="text-[11px] font-mono opacity-80">goals</div>
        {!rows.length ? (
          <div className="text-xs italic opacity-70 mt-2">Нет goalEnergyHistory.</div>
        ) : (
          <div className="mt-2 space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono text-canon-text-light truncate" title={r.id}>
                    {r.meta.label}
                  </div>
                  <div className="text-[10px] font-mono opacity-60 truncate" title={r.id}>
                    {r.id}
                  </div>
                </div>

                <div className="shrink-0">
                  <BarSeries values={r.hist} activeIndex={clampedIter} />
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[11px] font-mono">
                    <span className="opacity-70">E=</span> {r.v.toFixed(3)}
                  </div>
                  <div className="text-[10px] font-mono opacity-60">final {r.vLast.toFixed(3)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {goalDebug?.competition ? (
        <div className="rounded border border-canon-border/30 bg-black/10 p-3">
          <div className="text-[11px] font-mono opacity-80">competition</div>
          <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap break-words opacity-80">
            {JSON.stringify(goalDebug.competition, null, 2)}
          </pre>
        </div>
      ) : null}

      {goalDebug?.signalField ? (
        <div className="rounded border border-canon-border/30 bg-black/10 p-3">
          <div className="text-[11px] font-mono opacity-80">signal field</div>
          <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap break-words opacity-80">
            {JSON.stringify(goalDebug.signalField, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
};
