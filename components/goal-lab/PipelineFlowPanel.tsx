import React, { useMemo } from 'react';
import { arr } from '../../lib/utils/arr';

type Props = {
  pipeline?: any | null; // pipelineV1 (debug)
};

function n(x: any, d = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : d;
}

export const PipelineFlowPanel: React.FC<Props> = ({ pipeline }) => {
  const stages = useMemo(() => {
    const s = arr((pipeline as any)?.stages);
    return s.map((st: any, idx: number) => {
      const id = String(st?.stage ?? st?.id ?? `S${idx}`);
      const title = String(st?.title ?? st?.label ?? '');
      const stats = st?.stats ?? {};
      const warnings = arr(st?.warnings);
      const addedIds = arr(st?.atomsAddedIds ?? st?.addedIds ?? st?.atomsAdded ?? []).map(String).filter(Boolean);
      return {
        id,
        title,
        atomCount: n(stats?.atomCount, n(st?.atomCount, 0)),
        addedCount: n(stats?.addedCount, addedIds.length),
        missingTraceDerivedCount: n(stats?.missingTraceDerivedCount, 0),
        warningsCount: warnings.length,
        warnings,
        addedIds,
      };
    });
  }, [pipeline]);

  const totalWarnings = stages.reduce((s, st) => s + st.warningsCount, 0);
  const totalMissingTrace = stages.reduce((s, st) => s + st.missingTraceDerivedCount, 0);

  if (!stages.length) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        <div className="p-3 border-b border-canon-border/30 bg-canon-bg/40">
          <div className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">Pipeline Flow</div>
          <div className="text-[12px] text-canon-text-light/70 mt-2">Нет pipelineV1.stages (debug pipeline).</div>
        </div>
        <div className="p-3 text-[12px] text-canon-text-light/60">
          Проверь, что runPipelineV1 возвращает stages и что они прокинуты в GoalLabResults.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="p-3 border-b border-canon-border/30 bg-canon-bg/40 shrink-0 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">Pipeline Flow</div>
          <div className="text-[11px] text-canon-text-light/70 mt-1">Карта стадий (S0..S8) с ключевыми цифрами и варнингами.</div>
        </div>
        <div className="text-[10px] font-mono text-canon-text-light/70 text-right">
          stages: {stages.length}
          <div>warnings: {totalWarnings}</div>
          <div>missingTrace: {totalMissingTrace}</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-3">
        <div className="flex flex-col items-center gap-3">
          {stages.map((st, idx) => (
            <React.Fragment key={st.id}>
              <div className="w-full max-w-[860px] rounded-xl border border-canon-border/40 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-canon-text-light">{st.id}</div>
                    <div className="text-[12px] text-canon-text truncate" title={st.title}>{st.title || '—'}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-canon-text-light/70 font-mono">
                      <span className="px-2 py-1 rounded border border-white/10 bg-black/30">atoms: {st.atomCount}</span>
                      <span className="px-2 py-1 rounded border border-white/10 bg-black/30">+added: {st.addedCount}</span>
                      <span className="px-2 py-1 rounded border border-white/10 bg-black/30">missingTrace: {st.missingTraceDerivedCount}</span>
                      <span className="px-2 py-1 rounded border border-white/10 bg-black/30">warnings: {st.warningsCount}</span>
                    </div>
                  </div>
                  {st.warningsCount ? (
                    <div className="shrink-0 text-[10px] px-2 py-1 rounded border border-yellow-400/30 bg-yellow-500/10 text-yellow-200 font-mono">
                      ⚠ {st.warningsCount}
                    </div>
                  ) : null}
                </div>

                <details className="mt-2">
                  <summary className="text-[11px] text-canon-text-light cursor-pointer select-none">Key outputs (first 14 ids)</summary>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1">
                    {st.addedIds.slice(0, 14).map((id) => (
                      <div key={id} className="text-[10px] font-mono text-canon-text-light/70 truncate" title={id}>
                        {id}
                      </div>
                    ))}
                  </div>
                </details>

                {st.warningsCount ? (
                  <details className="mt-2">
                    <summary className="text-[11px] text-yellow-200 cursor-pointer select-none">Warnings</summary>
                    <pre className="mt-2 text-[10px] bg-black/30 border border-canon-border/30 rounded p-2 overflow-auto whitespace-pre-wrap font-mono text-canon-text-light/70">
                      {JSON.stringify(st.warnings, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
              {idx < stages.length - 1 ? (
                <div className="text-[18px] text-canon-text-light/50 select-none">↓</div>
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
