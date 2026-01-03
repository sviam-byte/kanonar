import React, { useMemo } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { getCtx } from '../../lib/context/layers';
import { metricHelp, metricLabel, metricShort } from '../../lib/ui/metricLexicon';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function findMag(atoms: ContextAtom[], id: string, fallback = 0): number {
  const a: any = atoms.find(x => String((x as any)?.id) === id);
  const m = Number(a?.magnitude);
  return Number.isFinite(m) ? clamp01(m) : clamp01(fallback);
}

function bar(v: number) {
  const w = Math.round(clamp01(v) * 100);
  return (
    <div className="h-2 w-40 rounded bg-black/20 border border-white/10 overflow-hidden">
      <div className="h-full bg-white/50" style={{ width: `${w}%` }} />
    </div>
  );
}

function row(label: string, help: string, v: number) {
  return (
    <div className="flex items-center justify-between rounded border border-white/10 bg-black/10 px-2 py-2">
      <div className="mr-3">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] opacity-60">{help}</div>
      </div>
      <div className="flex items-center gap-3">
        {bar(v)}
        <div className="w-10 text-right font-mono text-sm">{Math.round(clamp01(v) * 100)}</div>
      </div>
    </div>
  );
}

export const FrontOverviewPanel: React.FC<{
  atoms: ContextAtom[];
  selfId: string;
  actorLabels?: Record<string, string>;
}> = ({ atoms, selfId, actorLabels }) => {
  const ctx = useMemo(() => {
    return {
      danger: getCtx(atoms, selfId, 'danger', 0),
      uncertainty: getCtx(atoms, selfId, 'uncertainty', 0),
      timePressure: getCtx(atoms, selfId, 'timePressure', 0),
      normPressure: getCtx(atoms, selfId, 'normPressure', 0),
    };
  }, [atoms, selfId]);

  const sums = useMemo(() => {
    return {
      situationalThreat: findMag(atoms, `sum:threatLevel:${selfId}`, 0),
      tension: findMag(atoms, `sum:tension:${selfId}`, 0),
      clarity: findMag(atoms, `sum:clarity:${selfId}`, 0),
      coping: findMag(atoms, `sum:coping:${selfId}`, 0),
      socialExposure: findMag(atoms, `sum:socialExposure:${selfId}`, 0),
      normRisk: findMag(atoms, `sum:normRisk:${selfId}`, 0),
    };
  }, [atoms, selfId]);

  const nearby = useMemo(() => {
    const out: { id: string; closeness: number }[] = [];
    for (const a of atoms) {
      const id = String((a as any)?.id || '');
      if (!id.startsWith('obs:nearby:')) continue;
      const subject = (a as any)?.subject;
      const target = (a as any)?.target;
      if (subject && String(subject) !== selfId) continue;
      if (!target) continue;
      const m = Number((a as any)?.magnitude ?? 0);
      if (!Number.isFinite(m)) continue;
      out.push({ id: String(target), closeness: clamp01(m) });
    }
    out.sort((a, b) => b.closeness - a.closeness);
    return out;
  }, [atoms, selfId]);

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar p-4 bg-canon-bg text-canon-text">
      <div className="text-xs text-canon-text-light mb-3">
        Perspective: <b>{actorLabels?.[selfId] || selfId}</b>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-canon-border bg-canon-bg-light/20 p-3">
          <div className="text-xs font-semibold opacity-80 mb-2">Context axes (what the situation feels like)</div>
          <div className="space-y-2">
            {row(metricShort('ctxDanger' as any), metricHelp('ctxDanger' as any), ctx.danger.magnitude)}
            {row(metricShort('ctxUncertainty' as any), metricHelp('ctxUncertainty' as any), ctx.uncertainty.magnitude)}
            {row(metricShort('ctxTimePressure' as any), metricHelp('ctxTimePressure' as any), ctx.timePressure.magnitude)}
            {row(metricShort('ctxNormPressure' as any), metricHelp('ctxNormPressure' as any), ctx.normPressure.magnitude)}
          </div>

          <div className="mt-3 text-[11px] opacity-60">
            Если тут нули — это почти всегда потому, что нет атомов <span className="font-mono">ctx:*</span> или их перетёрли
            override’ы.
          </div>
        </div>

        <div className="rounded-lg border border-canon-border bg-canon-bg-light/20 p-3">
          <div className="text-xs font-semibold opacity-80 mb-2">Summary (what it boils down to)</div>
          <div className="space-y-2">
            {row(metricLabel('situationalThreat' as any), metricHelp('situationalThreat' as any), sums.situationalThreat)}
            {row(metricLabel('tension' as any), metricHelp('tension' as any), sums.tension)}
            {row(metricLabel('clarity' as any), metricHelp('clarity' as any), sums.clarity)}
            {row(metricLabel('coping' as any), metricHelp('coping' as any), sums.coping)}
            {row(metricLabel('socialExposure' as any), metricHelp('socialExposure' as any), sums.socialExposure)}
            {row(metricLabel('normRisk' as any), metricHelp('normRisk' as any), sums.normRisk)}
          </div>

          <div className="mt-3 text-[11px] opacity-60">
            Эти показатели должны идти из <span className="font-mono">sum:*</span>. Если они не меняются — значит пайплайн не
            пересобирает summary стадию.
          </div>
        </div>

        <div className="lg:col-span-2 rounded-lg border border-canon-border bg-canon-bg-light/20 p-3">
          <div className="text-xs font-semibold opacity-80 mb-2">Perceived others (who I think is around)</div>
          {nearby.length === 0 ? (
            <div className="text-xs italic opacity-70">No other agents perceived.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nearby.slice(0, 12).map(n => (
                <div key={n.id} className="px-2 py-1 rounded border border-white/10 bg-black/10 text-xs">
                  <span className="font-semibold">{actorLabels?.[n.id] || n.id}</span>
                  <span className="ml-2 font-mono opacity-70">{Math.round(n.closeness * 100)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-[11px] opacity-60">
            Этот список строится по атомам <span className="font-mono">obs:nearby:*</span>.
          </div>
        </div>
      </div>
    </div>
  );
};
