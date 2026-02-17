import React, { useMemo } from 'react';
import { buildPredictedWorldSummary } from '../../lib/goal-lab/pipeline/lookahead';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function safeStr(x: any): string {
  try {
    return x == null ? '' : String(x);
  } catch {
    return '';
  }
}

function fmt(x: any): string {
  return Number.isFinite(Number(x)) ? Number(x).toFixed(3) : '—';
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

const FEATURE_LABELS: Record<string, string> = {
  threat: 'Угроза', escape: 'Бегство', cover: 'Укрытие', visibility: 'Видимость',
  socialTrust: 'Доверие', emotionValence: 'Эмоц. валентность',
  resourceAccess: 'Ресурсы', scarcity: 'Дефицит', fatigue: 'Усталость', stress: 'Стресс',
};

type Props = {
  pipelineV1: any;
  agentLabel?: string;
  onSwitchToDebug?: () => void;
  onSwitchToConsole?: () => void;
};

/**
 * EasyModePanel — one screen, three blocks, zero config.
 * Shows leading goals, chosen action explanation, and flip analysis.
 */
export const EasyModePanel: React.FC<Props> = ({ pipelineV1, agentLabel, onSwitchToDebug, onSwitchToConsole }) => {
  const data = useMemo(() => {
    if (!pipelineV1) return null;
    const stages = arr(pipelineV1.stages);
    const s8 = stages.find((s: any) => s?.stage === 'S8');
    const s9 = stages.find((s: any) => s?.stage === 'S9');
    if (!s8) return null;
    const arts = s8.artifacts || {};
    return {
      digest: arts.decisionSnapshot?.digest || null,
      goalEnergy: arts.decisionSnapshot?.goalEnergy || {},
      ranked: arr(arts.decisionSnapshot?.ranked || arts.decisionSnapshot?.rankedOverridden),
      best: arts.decisionSnapshot?.best || arts.best || null,
      linearApprox: arts.decisionSnapshot?.linearApprox || null,
      featureVector: arts.decisionSnapshot?.featureVector || null,
      transSnap: s9?.artifacts?.transitionSnapshot || null,
    };
  }, [pipelineV1]);

  if (!data) return <div className="p-4 text-slate-500">Нет данных — выберите агента и сцену</div>;

  const { digest, goalEnergy, ranked, best, linearApprox, featureVector, transSnap } = data;
  const goalEntries = Object.entries(goalEnergy)
    .map(([id, e]) => ({ id, e: Number(e) }))
    .filter((x) => Math.abs(x.e) > 1e-6)
    .sort((a, b) => Math.abs(b.e) - Math.abs(a.e));

  const chosen = digest?.chosen || best || null;
  const chosenEval = arr(transSnap?.perAction || linearApprox?.perAction).find(
    (a: any) => safeStr(a?.actionId) === safeStr(chosen?.actionId || chosen?.id),
  );
  const z0 = featureVector?.z || transSnap?.z0?.z || null;
  const summary = chosenEval && z0 ? buildPredictedWorldSummary(chosenEval, z0) : null;
  const flips = arr(linearApprox?.flipCandidates || transSnap?.flipCandidates).filter((f: any) => f?.wouldFlip);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-cyan-400 uppercase tracking-widest font-bold">Решение агента</div>
          {agentLabel ? <div className="text-lg text-slate-200 font-bold">{agentLabel}</div> : null}
        </div>
        <div className="flex gap-2">
          {onSwitchToDebug ? <button onClick={onSwitchToDebug} className="px-2 py-1 text-xs border border-slate-700 rounded">Debug</button> : null}
          {onSwitchToConsole ? <button onClick={onSwitchToConsole} className="px-2 py-1 text-xs border border-slate-700 rounded">Console</button> : null}
        </div>
      </div>

      <section className="rounded border border-cyan-500/20 bg-cyan-950/10 p-3 space-y-2">
        <div className="text-[10px] text-cyan-400 uppercase tracking-widest">Ведущие цели</div>
        {goalEntries.slice(0, 6).map(({ id, e }) => (
          <div key={id} className="flex items-center gap-2 text-[12px]">
            <div className="w-28 truncate text-slate-300">{id}</div>
            <div className="flex-1 h-2 bg-slate-800 rounded"><div className="h-2 bg-cyan-500/60" style={{ width: `${Math.min(100, Math.abs(e) * 100)}%` }} /></div>
            <div className="w-10 text-right text-cyan-300 font-mono">{fmtPct(e)}</div>
          </div>
        ))}
      </section>

      <section className="rounded border border-emerald-500/20 bg-emerald-950/10 p-3 space-y-2">
        <div className="text-[10px] text-emerald-400 uppercase tracking-widest">Выбранное действие</div>
        <div className="text-emerald-200 font-bold">{safeStr(chosen?.kind || chosen?.actionId || '—')}</div>
        <div className="text-slate-400 text-sm">Q={fmt(ranked.find((r: any) => safeStr(r?.id || r?.actionId) === safeStr(chosen?.actionId || chosen?.id))?.q)}</div>
      </section>

      <section className="rounded border border-violet-500/20 bg-violet-950/10 p-3 space-y-2">
        <div className="text-[10px] text-violet-400 uppercase tracking-widest">Что перевернёт решение?</div>
        {flips.length ? flips.slice(0, 3).map((f: any) => (
          <div key={f.feature} className="text-violet-200 text-sm">
            {FEATURE_LABELS[f.feature] || f.feature}: ΔQ≈{Number(f.deltaQ).toFixed(4)}
          </div>
        )) : <div className="text-slate-500 text-sm">Решение устойчиво при ±0.1</div>}

        {summary ? (
          <div className="mt-2 rounded border border-slate-700/50 bg-black/20 p-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Предсказание мира после действия</div>
            {summary.statements.filter((st) => Math.abs(st.delta) > 0.015).slice(0, 5).map((st) => (
              <div key={st.feature} className="text-[12px] text-slate-300">
                {FEATURE_LABELS[st.feature] || st.feature}: {st.current.toFixed(2)} → {st.predicted.toFixed(2)}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
};
