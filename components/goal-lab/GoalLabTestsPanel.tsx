import React, { useMemo, useState } from 'react';
import { goalLabBasicTests } from '../../lib/goal-lab/tests/basic';
import { runScenario, type ScenarioResult } from '../../lib/goal-lab/tests/runScenario';
import { runGoalLabPipelineV1 } from '../../lib/goal-lab/pipeline/runPipelineV1';

type Props = {
  selfId: string;
  actorLabels?: Record<string, string>;
};

function formatScore(value?: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Number(value).toFixed(2);
}

/**
 * Lightweight GoalLab test runner panel for deterministic sanity checks.
 * It keeps expectations visible and captures the possibility set for inspection.
 */
export const GoalLabTestsPanel: React.FC<Props> = ({ selfId, actorLabels }) => {
  const effectiveSelfId = selfId || 'assi-the-runner';
  const label = actorLabels?.[effectiveSelfId] ?? effectiveSelfId;

  const tests = useMemo(() => goalLabBasicTests(effectiveSelfId), [effectiveSelfId]);
  const [testId, setTestId] = useState(() => tests[0]?.id ?? '');
  const [result, setResult] = useState<ScenarioResult | null>(null);

  const selected = useMemo(
    () => tests.find((t) => t.id === testId) ?? tests[0] ?? null,
    [testId, tests]
  );

  const enabledList = useMemo(() => {
    return (result?.possibilities ?? []).filter((p) => p.enabled);
  }, [result]);

  const topByMagnitude = useMemo(() => {
    const list = [...(result?.possibilities ?? [])];
    list.sort((a, b) => Number(b.magnitude ?? 0) - Number(a.magnitude ?? 0));
    return list.slice(0, 5);
  }, [result]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-3 text-[11px]">
      <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">GoalLab Tests</div>
      <div className="rounded-lg border border-slate-800 bg-black/40 p-3 space-y-2">
        <div className="text-[10px] text-slate-400">
          Self: <span className="text-slate-200 font-semibold">{label || '—'}</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px]"
            value={testId}
            onChange={(e) => setTestId(e.target.value)}
            disabled={!tests.length}
          >
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button
            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 text-[11px]"
            onClick={() => {
              if (!selected) return;
              // Deterministic pipeline run: scenario atoms + selfId.
              const world: any = {
                tick: 0,
                rngSeed: 123,
                agents: [{ entityId: selected.selfId, memory: { beliefAtoms: [] } }],
              };
              const pipeline = runGoalLabPipelineV1({
                world,
                agentId: selected.selfId,
                participantIds: [selected.selfId],
                manualAtoms: selected.atoms,
              });
              const out = runScenario(selected, pipeline);
              setResult(out);
            }}
            disabled={!selected}
          >
            Run
          </button>
          {result?.report ? (
            <button
              className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 text-[11px]"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.report ?? '');
                } catch (err) {
                  console.warn('Failed to copy report to clipboard', err);
                }
              }}
            >
              Copy report
            </button>
          ) : null}
        </div>

        {result ? (
          <div className="mt-2 text-[11px] space-y-2">
            <div className={result.ok ? 'text-emerald-300' : 'text-red-300'}>
              {result.ok ? 'PASS' : 'FAIL'}
            </div>
            {!result.ok ? (
              <ul className="list-disc pl-5 text-red-200">
                {result.failures.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : null}

            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Enabled possibilities</div>
              {enabledList.length ? (
                <ul className="mt-1 space-y-1">
                  {enabledList.map((p) => (
                    <li key={p.id} className="text-slate-300">
                      {p.id} <span className="text-slate-500">(mag {formatScore(p.magnitude)} · cost {formatScore(p.cost)})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-slate-500">No enabled possibilities.</div>
              )}
            </div>

            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Top by magnitude</div>
              {topByMagnitude.length ? (
                <ul className="mt-1 space-y-1">
                  {topByMagnitude.map((p) => (
                    <li key={p.id} className="text-slate-300">
                      {p.id} <span className="text-slate-500">(mag {formatScore(p.magnitude)} · cost {formatScore(p.cost)})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-slate-500">No possibilities available.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-slate-500">Select a test and run to see results.</div>
        )}
      </div>
    </div>
  );
};
