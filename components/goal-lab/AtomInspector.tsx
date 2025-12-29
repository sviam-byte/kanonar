import React from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { describeAtom } from '../../lib/context/v2/describeAtom';

export function AtomInspector({ atom, allAtoms: _allAtoms }: { atom: ContextAtom | null; allAtoms: ContextAtom[] }) {
  if (!atom) return null;

  const d = describeAtom(atom);
  const used = atom.trace?.usedAtomIds || [];
  const parts = atom.trace?.parts || null;
  const isDerived = (atom as any).origin === 'derived';

  return (
    <div style={{ padding: 12, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{d.title}</div>
      <div style={{ opacity: 0.85, marginTop: 6 }}>{d.meaning}</div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        <div><b>ID:</b> {d.id}</div>
        {(atom as any).code && <div><b>Code:</b> {(atom as any).code}</div>}
        {(atom as any).specId && <div><b>Spec:</b> {(atom as any).specId}</div>}
        {(atom as any).params && (
          <div>
            <b>Params:</b>{' '}
            <pre style={{ whiteSpace: 'pre-wrap', display: 'inline-block', margin: 0 }}>
              {JSON.stringify((atom as any).params, null, 2)}
            </pre>
          </div>
        )}
        {typeof atom.magnitude === 'number' && <div><b>Value:</b> {atom.magnitude.toFixed(3)}</div>}
        {d.scale && (
          <div style={{ marginTop: 6 }}>
            <div><b>Scale:</b> [{d.scale.min}..{d.scale.max}] {d.scale.unit || ''}</div>
            <div><b>Low:</b> {d.scale.lowMeans}</div>
            <div><b>High:</b> {d.scale.highMeans}</div>
            {d.scale.typical && <div><b>Typical:</b> {d.scale.typical}</div>}
          </div>
        )}
        {d.formula && <div style={{ marginTop: 6 }}><b>Formula:</b> {d.formula}</div>}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Trace</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          <div><b>origin:</b> {d.origin} <b>source:</b> {d.source} <b>ns:</b> {d.ns} <b>kind:</b> {d.kind}</div>
          {used.length > 0 ? (
            <>
              <div style={{ marginTop: 6 }}><b>usedAtomIds:</b></div>
              <ul style={{ marginTop: 4 }}>
                {used.slice(0, 50).map((id: string) => <li key={id}>{id}</li>)}
              </ul>
            </>
          ) : (
            isDerived
              ? <div style={{ marginTop: 6, opacity: 0.75 }}>Нет usedAtomIds (для derived это плохо — нужно добавить).</div>
              : <div style={{ marginTop: 6, opacity: 0.75 }}>usedAtomIds: —</div>
          )}

          {parts ? (
            <>
              <div style={{ marginTop: 6 }}><b>parts:</b></div>
              <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.9 }}>{JSON.stringify(parts, null, 2)}</pre>
            </>
          ) : (
            <div style={{ marginTop: 6, opacity: 0.75 }}>Нет parts (желательно для ctx/threat/tom).</div>
          )}
        </div>
      </div>

      {(d.producedBy?.length || d.consumedBy?.length) ? (
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
          {d.producedBy?.length ? <div><b>Produced by:</b> {d.producedBy.join(', ')}</div> : null}
          {d.consumedBy?.length ? <div><b>Consumed by:</b> {d.consumedBy.join(', ')}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
