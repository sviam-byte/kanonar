import React from 'react';

type StageFrame = {
  stage: string;
  title?: string;
  atomsAddedIds?: string[];
  warnings?: string[];
  artifacts?: Record<string, unknown>;
};

export function GoalLabConsole(props: {
  snapshotV1: { stages?: StageFrame[] } | null;
  stageId: string;
  onChangeStageId: (id: string) => void;
}) {
  const stages = props.snapshotV1?.stages ?? [];
  const current = stages.find((s) => s.stage === props.stageId) ?? stages[stages.length - 1] ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <div className="text-[10px] font-bold text-slate-500 uppercase">Pipeline</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {stages.map((s) => {
            const active = s.stage === props.stageId;
            return (
              <button
                key={s.stage}
                onClick={() => props.onChangeStageId(s.stage)}
                className={
                  'px-2 py-1 rounded text-[11px] border ' +
                  (active
                    ? 'border-slate-300 text-slate-100 bg-slate-900'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600')
                }
                title={s.title ?? s.stage}
              >
                {s.stage}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-bold text-slate-500 uppercase">Stage inspector</div>
          <div className="text-[11px] text-slate-400">{current?.title ?? current?.stage ?? '—'}</div>
        </div>

        {current ? (
          <>
            <div className="mt-2 text-[11px] text-slate-400">
              atoms added: {current.atomsAddedIds?.length ?? 0}
              {current.warnings?.length ? ` • warnings: ${current.warnings.length}` : ''}
            </div>

            <pre className="mt-2 max-h-[420px] overflow-auto text-[11px] text-slate-200 whitespace-pre-wrap">
              {JSON.stringify(current.artifacts ?? {}, null, 2)}
            </pre>
          </>
        ) : (
          <div className="mt-2 text-[11px] text-slate-500">No stages.</div>
        )}
      </div>
    </div>
  );
}
