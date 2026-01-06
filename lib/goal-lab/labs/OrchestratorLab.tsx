// lib/goal-lab/labs/OrchestratorLab.tsx
// UI panel to inspect orchestrator trace stored in snapshot.debug.orchestrator.

import React, { useMemo, useState } from 'react';

type Props = {
  snapshot: any; // GoalLabSnapshotV1
};

function jsonDownload(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function OrchestratorLab({ snapshot }: Props) {
  const trace = snapshot?.debug?.orchestrator;
  const [stageId, setStageId] = useState<string>('all');

  const stageIds = useMemo(() => {
    const ids = (trace?.stages || []).map((s: any) => String(s.id));
    return ['all', ...ids];
  }, [trace]);

  const filteredStages = useMemo(() => {
    const ss = trace?.stages || [];
    if (stageId === 'all') return ss;
    return ss.filter((s: any) => String(s.id) === stageId);
  }, [trace, stageId]);

  if (!trace) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Orchestrator Lab</div>
        <div style={{ opacity: 0.75 }}>No orchestrator trace in snapshot.debug.orchestrator</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontWeight: 800 }}>Orchestrator Lab</div>
          <div style={{ opacity: 0.8, fontFamily: 'monospace' }}>
            {trace.tickId} @ {trace.time} | atomsOut={trace.atomsOutCount}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {stageIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          <button onClick={() => jsonDownload(`orchestrator-${trace.tickId}.json`, trace)}>
            Export trace.json
          </button>
        </div>
      </div>

      <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Human log</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{(trace.humanLog || []).join('\n')}</pre>
      </div>

      <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Atom changes</div>
        <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.9 }}>
          {(trace.atomChanges || []).slice(0, 200).map((c: any) => {
            const b = c.before?.magnitude ?? 0;
            const a = c.after?.magnitude ?? 0;
            const d = a - b;
            const sign = d >= 0 ? '+' : '';
            return (
              <div key={`${c.op}:${c.id}`}>
                {String(c.op).toUpperCase()} {c.id}  {b.toFixed(3)}→{a.toFixed(3)} ({sign}{d.toFixed(3)})
              </div>
            );
          })}
          {(trace.atomChanges || []).length > 200 ? <div>… ({trace.atomChanges.length - 200} more)</div> : null}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredStages.map((s: any) => (
          <div key={s.id} style={{ padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              {s.id} {s.tookMs != null ? <span style={{ opacity: 0.75 }}>({s.tookMs}ms)</span> : null}
            </div>

            {(s.producers || []).map((p: any) => (
              <div key={p.name} style={{ padding: 10, marginTop: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700 }}>
                    {p.name}{p.version ? <span style={{ opacity: 0.7 }}> v{p.version}</span> : null}
                  </div>
                  <div style={{ fontFamily: 'monospace', opacity: 0.8 }}>
                    {p.tookMs != null ? `${p.tookMs}ms` : ''}
                  </div>
                </div>

                <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.9, marginTop: 6 }}>
                  <div>inputs: {(p.inputRefs || []).slice(0, 20).join(', ')}{(p.inputRefs || []).length > 20 ? '…' : ''}</div>
                  <div>
                    out: +{(p.outputs?.atomsAdded || []).length} ~{(p.outputs?.atomsUpdated || []).length} -{(p.outputs?.atomsRemoved || []).length}
                  </div>
                </div>

                {(p.why || []).length ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>why</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.9 }}>
                      {(p.why || []).slice(0, 40).map((w: any, i: number) => (
                        <div key={i}>
                          because={w.because}{w.rule ? ` rule=${w.rule}` : ''}{w.math ? ` math=${w.math}` : ''}
                          {w.weight != null ? ` w=${w.weight}` : ''}{w.note ? ` // ${w.note}` : ''}
                        </div>
                      ))}
                      {(p.why || []).length > 40 ? <div>…</div> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
