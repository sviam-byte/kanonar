import React from 'react';
import { goalLabTestScenarios, runBasicGoalLabTests, GoalLabTestScenario, GoalLabTestResult } from '../../lib/goal-lab/tests/basic';
import { derivePossibilities } from '../../lib/context/possibilities/derivePossibilities';

export const GoalLabTestsPanel: React.FC<{ selfId: string; actorLabels?: Record<string, string> }> = ({ selfId, actorLabels }) => {
  const [results, setResults] = React.useState<GoalLabTestResult[] | null>(null);
  const scenarios = React.useMemo(() => goalLabTestScenarios(selfId || 'tester'), [selfId]);
  const [scenarioId, setScenarioId] = React.useState<string>(() => scenarios[0]?.id ?? '');
  const selected = scenarios.find(s => s.id === scenarioId) ?? scenarios[0];
  const [scenarioPoss, setScenarioPoss] = React.useState<any[] | null>(null);

  const run = React.useCallback(() => {
    const id = selfId || 'tester';
    setResults(runBasicGoalLabTests(id));
    try {
      if (selected) setScenarioPoss(derivePossibilities(selected.atoms as any, id).possibilities);
    } catch {
      setScenarioPoss(null);
    }
  }, [selfId, selected]);

  const label = actorLabels?.[selfId] || selfId || '—';
  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">GoalLab tests</div>
          <div className="text-sm font-semibold text-slate-100">Deterministic suite</div>
          <div className="text-[11px] text-slate-300">Self: {label}</div>
        </div>
        <button
          className="px-3 py-2 text-[11px] font-bold rounded bg-slate-800/50 text-slate-100 border border-slate-700 hover:border-slate-500"
          onClick={run}
        >
          Run suite
        </button>
      </div>

      {results ? (
        <div className="mt-3 space-y-2">
          {results.map(r => (
            <div key={r.id} className="flex items-center gap-2">
              <span className={`text-[10px] font-bold ${r.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                {r.ok ? 'PASS' : 'FAIL'}
              </span>
              <span className="text-[11px] text-slate-200">{r.title}</span>
              {!r.ok ? <span className="text-[10px] text-rose-200/80">({r.details})</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-[11px] text-slate-400 italic">Run the suite to see results.</div>
      )}

      <div className="mt-4 border-t border-slate-800/70 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <select
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px]"
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
          >
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <button
            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 text-[11px]"
            onClick={() => {
              const id = selfId || 'tester';
              if (selected) setScenarioPoss(derivePossibilities(selected.atoms as any, id).possibilities);
            }}
          >
            Show possibilities
          </button>
        </div>

        {scenarioPoss ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">Enabled</div>
              <ul className="text-[11px] text-slate-200 mt-1 space-y-1">
                {scenarioPoss.filter(p => p.enabled).map(p => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="truncate">{p.id}</span>
                    <span className="text-slate-500">mag {Number(p.magnitude ?? 0).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">All</div>
              <ul className="text-[11px] text-slate-200 mt-1 space-y-1">
                {scenarioPoss.map(p => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className={`truncate ${p.enabled ? 'text-emerald-300' : 'text-slate-400'}`}>{p.id}</span>
                    <span className="text-slate-500">{p.enabled ? 'ok' : 'blocked'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 italic">Select a scenario and show possibilities.</div>
        )}
      </div>
    </div>
  );
};
