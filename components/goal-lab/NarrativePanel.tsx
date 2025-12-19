import React, { useMemo } from 'react';

import type { AffectState } from '../../types';
import type { ContextualMindReport } from '../../lib/tom/contextual/types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fmt2(x: any) {
  const v = Number(x);
  return Number.isFinite(v) ? v.toFixed(2) : '—';
}

function topEmotions(a: AffectState | null | undefined, n = 5) {
  const e = a?.e || ({} as any);
  return Object.entries(e)
    .filter(([, v]) => Number.isFinite(v as any))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, n)
    .map(([k, v]) => ({ id: k, v: clamp01(Number(v)) }));
}

export function NarrativePanel(props: {
  situation?: any;
  goalPreview?: any;
  contextualMind?: ContextualMindReport | null;
}) {
  const { situation, goalPreview, contextualMind } = props;

  const affect = contextualMind?.affect as any;
  const topE = useMemo(() => topEmotions(affect, 7), [affect]);
  const dyads = (contextualMind?.dyads || []).slice(0, 6);

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto custom-scrollbar pb-20 absolute inset-0">
      <div className="border border-canon-border/40 rounded-lg bg-black/20 p-3">
        <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Что происходит</div>
        <div className="text-[12px] text-canon-text-light space-y-1">
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">kind: {String(situation?.scenarioKind || 'other')}</span>
            <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">stage: {String(situation?.stage || '—')}</span>
            <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">threat: {fmt2(situation?.threatLevel)}</span>
            <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">pressure: {fmt2(situation?.timePressure)}</span>
            <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">crowd: {String(situation?.crowdSize ?? '—')}</span>
          </div>

          {goalPreview?.goals?.length ? (
            <div className="mt-2">
              <div className="text-[11px] font-semibold text-canon-text-light mb-1">Активные приоритеты</div>
              <div className="flex flex-wrap gap-2">
                {goalPreview.goals.slice(0, 6).map((g: any) => (
                  <div key={g.id} className="px-2 py-1 rounded border border-canon-border/30 bg-black/30">
                    <div className="text-[11px] font-semibold text-canon-text truncate max-w-[320px]" title={g.id}>{g.label}</div>
                    <div className="text-[9px] font-mono text-canon-text-light/70">p={fmt2(g.priority)} • a={fmt2(g.activation)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border border-canon-border/40 rounded-lg bg-black/20 p-3">
        <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Что я чувствую</div>
        {contextualMind ? (
          <>
            <div className="text-[12px] text-canon-text-light flex flex-wrap gap-2">
              <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">valence: {fmt2(affect?.valence)}</span>
              <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">arousal: {fmt2(affect?.arousal)}</span>
              <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">control: {fmt2(affect?.control)}</span>
              <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">stress: {fmt2(affect?.stress)}</span>
              <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">fatigue: {fmt2(affect?.fatigue)}</span>
            </div>

            <div className="mt-2">
              <div className="text-[11px] font-semibold text-canon-text-light mb-1">Топ эмоций (0..1)</div>
              <div className="flex flex-wrap gap-2">
                {topE.map(e => (
                  <span key={e.id} className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30 text-[11px]">
                    <span className="font-semibold">{e.id}</span>
                    <span className="font-mono opacity-80 ml-2">{fmt2(e.v)}</span>
                  </span>
                ))}
              </div>
            </div>

            {contextualMind.appraisalWhy?.length ? (
              <div className="mt-3">
                <div className="text-[11px] font-semibold text-canon-text-light mb-1">Почему (appraisal)</div>
                <div className="text-[11px] font-mono whitespace-pre-wrap opacity-80">
                  {contextualMind.appraisalWhy.slice(0, 12).join('\n')}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-[12px] text-canon-text-light/70">Нет отчёта contextualMind.</div>
        )}
      </div>

      <div className="border border-canon-border/40 rounded-lg bg-black/20 p-3">
        <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Что я думаю о других (ToM)</div>
        {dyads.length ? (
          <div className="space-y-2">
            {dyads.map((d: any) => (
              <div key={d.targetId} className="border border-canon-border/30 rounded bg-black/25 p-2">
                <div className="text-[12px] font-semibold text-canon-text">
                  {d.targetName || d.targetId}
                  <span className="text-[10px] font-mono opacity-70 ml-2">id: {d.targetId}</span>
                </div>
                <div className="mt-1 text-[11px] text-canon-text-light flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">trust: {fmt2(d.contextual?.state?.trust)}</span>
                  <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">threat: {fmt2(d.contextual?.state?.threat)}</span>
                  <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">support: {fmt2(d.contextual?.state?.support)}</span>
                  <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">dominance: {fmt2(d.contextual?.state?.dominance)}</span>
                  <span className="px-2 py-0.5 rounded bg-black/30 border border-canon-border/30">respect: {fmt2(d.contextual?.state?.respect)}</span>
                </div>

                {d.contextual?.deltaFromBase ? (
                  <div className="mt-1 text-[10px] font-mono text-canon-text-light/70">
                    Δ base→ctx:{' '}
                    {Object.entries(d.contextual.deltaFromBase)
                      .slice(0, 6)
                      .map(([k, v]) => `${k}:${fmt2(v)}`)
                      .join(' · ')}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-canon-text-light/70">Dyads не выбраны или пусто.</div>
        )}
      </div>
    </div>
  );
}
