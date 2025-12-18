
import React, { useMemo, useState } from 'react';
import type { ContextualMindReport } from '../../lib/tom/contextual/types';
import { MetricBar } from './MetricBar';

const fmt = (x: number | undefined) => (Number.isFinite(x as any) ? (x as number).toFixed(3) : '—');

function row(label: string, a?: number, b?: number) {
  const d = Number.isFinite(a as any) && Number.isFinite(b as any) ? (b! - a!).toFixed(3) : '—';
  const big = Number.isFinite(a as any) && Number.isFinite(b as any) && Math.abs(b! - a!) >= 0.2;
  return (
    <div className="grid grid-cols-4 gap-2 text-[11px]">
      <div className="text-canon-text-light">{label}</div>
      <div className="font-mono">{fmt(a)}</div>
      <div className="font-mono">{fmt(b)}</div>
      <div className={`font-mono ${big ? 'text-red-400' : 'text-canon-accent'}`}>Δ {d}</div>
    </div>
  );
}

export const ContextualMindPanel: React.FC<{ report: ContextualMindReport | null | undefined }> = ({ report }) => {
  const [openTarget, setOpenTarget] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  if (!report) return <div className="text-xs text-canon-text-light italic">No contextual mind data.</div>;

  const a: any = report.affect as any;
  const selfFear = a?.e?.fear ?? a?.fear ?? 0;
  const selfAnger = a?.e?.anger ?? a?.anger ?? 0;
  const selfShame = a?.e?.shame ?? a?.shame ?? 0;
  const selfHope = a?.hope ?? a?.e?.hope ?? 0;
  const selfFatigue = a?.fatigue ?? a?.e?.fatigue ?? a?.exhaustion ?? 0;

  const dyads = report.dyads || [];
  const hist = report.history || [];

  const last2 = useMemo(() => hist.slice(-2), [hist]);

  return (
    <div className="space-y-4">
      {/* SELF AFFECT */}
      <div className="bg-canon-bg-light/30 border border-canon-border/50 rounded-lg p-3">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs font-bold text-canon-accent uppercase">Context emotions</div>
          <div className="text-[10px] text-canon-text-light font-mono">tick {report.tick}</div>
        </div>

        <div className="space-y-2">
          <MetricBar label="Valence" value={a?.valence ?? 0} range="signed" />
          <MetricBar label="Arousal" value={a?.arousal ?? 0} />
          <MetricBar label="Control" value={a?.control ?? 0.5} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 pt-3 border-t border-canon-border/30">
          <MetricBar label="Fear" value={selfFear} />
          <MetricBar label="Anger" value={selfAnger} />
          <MetricBar label="Shame" value={selfShame} />
          <MetricBar label="Guilt" value={a?.e?.guilt ?? a?.guilt ?? 0} />
          <MetricBar label="Hope" value={selfHope} />
          <MetricBar label="Stress" value={a?.stress ?? 0} />
          <MetricBar label="Fatigue" value={selfFatigue} />
          <MetricBar label="Stability" value={a?.stability ?? 0} />
        </div>
        
        {report.affectSources && (
             <div className="mt-2 text-[9px] text-canon-text-light opacity-50 flex gap-2">
                 <span>Source: {report.affectSources.contextualAffectPath}</span>
             </div>
        )}

        {report.appraisalWhy?.length ? (
          <div className="mt-2 text-[10px] text-canon-text-light">
            <div className="opacity-70">Appraisal why:</div>
            <div className="font-mono opacity-80">{report.appraisalWhy.slice(0, 10).join(' · ')}</div>
          </div>
        ) : null}
        
        {(report as any).appraisalTrace ? (
            <div className="mt-2 bg-canon-bg-light/20 border border-canon-border/30 rounded p-2">
                <div className="text-[11px] font-semibold text-canon-text-light mb-1">Appraisal trace (debug)</div>
                <pre className="text-[10px] text-canon-text-light font-mono whitespace-pre-wrap">
                {JSON.stringify((report as any).appraisalTrace, null, 2)}
                </pre>
            </div>
        ) : null}

        {report.signals ? (
          <div className="mt-2 text-[10px] text-canon-text-light">
            <div className="opacity-70">Signals:</div>
            <div className="font-mono opacity-80">
              sceneThreat={fmt(report.signals.sceneThreat01)} · mapHazard={fmt(report.signals.mapHazard01)} · safeHub=
              {String(report.signals.safeHub)} · private=
              {String(report.signals.privateSpace)} · topGoalP=
              {fmt(report.signals.topGoalPriority)}
            </div>
            
            {report.signals.axes ? (
              <div className="mt-2 bg-canon-bg-light/20 border border-canon-border/30 rounded p-2">
                <div className="text-[11px] font-semibold text-canon-text-light mb-1">Context axes</div>
                <pre className="text-[10px] text-canon-text-light font-mono whitespace-pre-wrap">
                  {JSON.stringify(report.signals.axes, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}

        {last2.length === 2 ? (
          <div className="mt-3 pt-3 border-t border-canon-border/30 text-[10px] text-canon-text-light">
            <div className="opacity-70 mb-1">Tick-to-tick:</div>
            <div className="font-mono opacity-80">
              fear {fmt(last2[0]?.self?.fear)}→{fmt(last2[1]?.self?.fear)} · anger {fmt(last2[0]?.self?.anger)}→{fmt(last2[1]?.self?.anger)} · stress{' '}
              {fmt(last2[0]?.self?.stress)}→{fmt(last2[1]?.self?.stress)}
            </div>
          </div>
        ) : null}
      </div>

      {/* TARGET DEBUG */}
      {report.targetsDebug ? (
        <div className="bg-canon-bg-light/30 border border-canon-border/50 rounded-lg p-3 text-[11px]">
          <div className="text-xs font-bold text-canon-accent uppercase mb-2">Targets debug</div>
          <div className="text-canon-text-light">
            sources: relations={report.targetsDebug.sources.relationsCount} · nearby={report.targetsDebug.sources.nearbyCount} · worldTomKeys={report.targetsDebug.sources.worldTomKeyCount}
          </div>
          <div className="font-mono text-canon-text-light mt-1">candidates: {report.targetsDebug.candidates.join(', ') || '—'}</div>
          {report.primaryTargetId && (
              <div className="mt-1 text-green-400">Primary Target: {report.primaryTargetId}</div>
          )}
        </div>
      ) : null}

      {/* DYADS */}
      <div>
        <div className="text-xs font-bold text-canon-accent uppercase mb-2">Dyads (Base vs Contextual)</div>
        {dyads.length === 0 ? (
          <div className="text-xs text-canon-text-light italic">No dyads.</div>
        ) : (
          <div className="space-y-2">
            {dyads.map((d) => {
              const base = d.base?.state;
              const cur = d.contextual.state;

              const isOpen = openTarget === d.targetId;
              const fatigue = d.dyadAffect.fatigue ?? d.dyadAffect.exhaustion ?? 0;

              return (
                <div key={d.targetId} className="bg-canon-bg border border-canon-border/60 rounded-lg p-3">
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-xs font-bold text-canon-text truncate pr-2">{d.targetName ?? d.targetId}</div>
                    <div className="text-[10px] text-canon-text-light font-mono">
                      baseConf={fmt(d.base?.confidenceOverall)} · ctxConf={fmt(d.contextual.confidence)} · role={d.role?.label ?? '—'}
                    </div>
                  </div>

                  {/* quick axis bars */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <MetricBar label="Trust (ctx)" value={cur.trust} />
                    <MetricBar label="Threat (ctx)" value={cur.threat} />
                    <MetricBar label="Support (ctx)" value={cur.support} />
                    <MetricBar label="Attach (ctx)" value={cur.attachment} />
                  </div>

                  {/* dyad affect */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 pt-3 border-t border-canon-border/30">
                    <MetricBar label="Fear→target" value={d.dyadAffect.fear} />
                    <MetricBar label="Anger→target" value={d.dyadAffect.anger} />
                    <MetricBar label="Shame→target" value={d.dyadAffect.shame} />
                    <MetricBar label="Hope→target" value={d.dyadAffect.hope} />
                    <MetricBar label="Fatigue" value={fatigue} />
                  </div>

                  {/* details toggle */}
                  <button
                    className="mt-3 text-[11px] text-canon-accent hover:underline"
                    onClick={() => setOpenTarget(isOpen ? null : d.targetId)}
                    type="button"
                  >
                    {isOpen ? 'Hide details' : 'Show details'}
                  </button>

                  {isOpen ? (
                    <div className="mt-3 pt-3 border-t border-canon-border/30 space-y-2">
                      <div className="text-[11px] text-canon-text-light">
                        ctxAxes: danger={fmt(d.contextual.ctxAxes?.danger)} · intimacy={fmt(d.contextual.ctxAxes?.intimacy)} · hierarchy={fmt(d.contextual.ctxAxes?.hierarchy)} · publicness={fmt(d.contextual.ctxAxes?.publicness)} · normPressure={fmt(d.contextual.ctxAxes?.normPressure)}
                      </div>

                      <div className="bg-canon-bg-light/20 border border-canon-border/30 rounded p-2">
                        <div className="text-[11px] font-semibold text-canon-text-light mb-1">State compare</div>
                        {row('trust', base?.trust, cur.trust)}
                        {row('threat', base?.threat, cur.threat)}
                        {row('support', base?.support, cur.support)}
                        {row('attachment', base?.attachment, cur.attachment)}
                        {row('dominance', base?.dominance, cur.dominance)}
                        {row('respect', base?.respect, cur.respect)}
                        {row('alignment', base?.alignment, cur.alignment)}
                        {row('predictability', base?.predictability, cur.predictability)}
                      </div>

                      {d.base?.decomposition ? (
                        <div className="bg-canon-bg-light/20 border border-canon-border/30 rounded p-2">
                          <div className="text-[11px] font-semibold text-canon-text-light mb-1">V3 decomposition (debug)</div>
                          <pre className="text-[10px] text-canon-text-light font-mono whitespace-pre-wrap">
                            {JSON.stringify(d.base.decomposition, null, 2)}
                          </pre>
                        </div>
                      ) : null}

                      {d.base?.domains || d.base?.norms ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {d.base?.domains ? (
                            <div className="bg-canon-bg-light/20 border border-canon-border/30 rounded p-2">
                              <div className="text-[11px] font-semibold text-canon-text-light mb-1">domains</div>
                              <pre className="text-[10px] text-canon-text-light font-mono whitespace-pre-wrap">
                                {JSON.stringify(d.base.domains, null, 2)}
                              </pre>
                            </div>
                          ) : null}
                          {d.base?.norms ? (
                            <div className="bg-canon-bg-light/20 border border-canon-border/30 rounded p-2">
                              <div className="text-[11px] font-semibold text-canon-text-light mb-1">norms</div>
                              <pre className="text-[10px] text-canon-text-light font-mono whitespace-pre-wrap">
                                {JSON.stringify(d.base.norms, null, 2)}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-canon-border/50">
           <button 
               onClick={() => setShowRaw(!showRaw)}
               className="text-[10px] text-canon-text-light uppercase font-bold tracking-wider hover:text-canon-accent"
           >
               {showRaw ? '▼ Hide Raw JSON' : '▶ Show Raw JSON'}
           </button>
           
           {showRaw && (
               <div className="mt-2 p-3 bg-black/40 border border-canon-border/30 rounded overflow-x-auto">
                   <pre className="text-[10px] font-mono text-green-400">
                       {JSON.stringify(report, null, 2)}
                   </pre>
               </div>
           )}
      </div>
    </div>
  );
};
