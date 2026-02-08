import React, { useMemo } from 'react';
import { generateGoalLabReportMarkdown } from '../../lib/goal-lab/reporting/generateGoalLabReport';

export const GoalLabReportPanel: React.FC<{ pipelineV1: any }> = ({ pipelineV1 }) => {
  const md = useMemo(() => {
    if (!pipelineV1) return '';
    try {
      // Generate a readable, deterministic report for debugging decisions.
      return generateGoalLabReportMarkdown(pipelineV1, { maxAtoms: 140, maxGoals: 40, maxActions: 24 });
    } catch (e) {
      return `Report generation failed: ${String((e as any)?.message ?? e)}`;
    }
  }, [pipelineV1]);

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">GoalLab</div>
          <div className="text-sm font-semibold text-slate-100">Report</div>
          <div className="text-[11px] text-slate-300">Text + Mermaid: where goals and actions come from.</div>
        </div>
        <button
          className="px-3 py-2 text-[11px] font-bold rounded bg-slate-800/50 text-slate-100 border border-slate-700 hover:border-slate-500"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(md);
            } catch {}
          }}
          disabled={!md}
        >
          Copy markdown
        </button>
      </div>

      <div className="mt-3">
        {!md ? (
          <div className="text-[12px] text-slate-400 italic">No pipeline data for report.</div>
        ) : (
          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-200/90 font-mono bg-black/20 border border-slate-900 rounded p-3 overflow-x-auto">
            {md}
          </pre>
        )}
      </div>
    </div>
  );
};
