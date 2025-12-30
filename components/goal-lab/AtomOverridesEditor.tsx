
// components/goal-lab/AtomOverridesEditor.tsx
import React, { useMemo, useState } from 'react';
import { ContextAtom } from '../../lib/context/v2/types';
import { normalizeAtom } from '../../lib/context/v2/infer';
import { AtomOverrideLayer, AtomOverrideOp } from '../../lib/context/overrides/types';
import { arr } from '../../lib/utils/arr';

type Props = {
  baseAtoms: ContextAtom[];
  layer: AtomOverrideLayer;
  onChange: (layer: AtomOverrideLayer) => void;
  className?: string;
};

function now() { return Date.now(); }

export const AtomOverridesEditor: React.FC<Props> = ({ baseAtoms, layer, onChange, className }) => {
  const [jsonText, setJsonText] = useState<string>(
    JSON.stringify({
      id: 'manual:example',
      kind: 'manual',
      magnitude: 0.5,
      label: 'Example override atom',
      source: 'manual',
      tags: ['override'],
      confidence: 1
    }, null, 2)
  );

  const [deleteId, setDeleteId] = useState<string>('');

  const ops = arr(layer.ops);

  const opsPreview = useMemo(() => {
    const next = ops.slice().reverse().slice(0, 50);
    if (!Array.isArray(next)) {
      console.error('Expected array, got', next);
      return [];
    }
    return next;
  }, [ops]);

  function pushOp(op: AtomOverrideOp) {
    const next: AtomOverrideLayer = {
      ...layer,
      updatedAt: now(),
      ops: [...arr(layer.ops), op]
    };
    onChange(next);
  }

  function clearAll() {
    onChange({ ...layer, updatedAt: now(), ops: [] });
  }

  function addUpsertFromJson() {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed.id !== 'string') throw new Error('Atom must have string id');
      const atom = normalizeAtom({ ...parsed, source: parsed.source ?? 'manual' }) as any as ContextAtom;
      pushOp({ op: 'upsert', atom: { ...atom, origin: 'override', tags: [...arr(atom.tags), 'override'] } });
    } catch (e: any) {
      alert(`Invalid JSON: ${e?.message || String(e)}`);
    }
  }

  function addDelete() {
    if (!deleteId.trim()) return;
    pushOp({ op: 'delete', id: deleteId.trim() });
  }

  return (
    <div className={className ?? 'h-full min-h-0 flex flex-col'}>
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold mb-2 text-canon-text">Atom Overrides</div>
        <div className="text-xs text-canon-text-light">
          Upsert replaces by id. Delete removes by id. Overrides are applied after atomization.
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-4">
        <div className="space-y-2">
          <div className="text-xs text-canon-text-light font-bold uppercase">Upsert atom (JSON)</div>
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            className="w-full h-44 p-2 font-mono text-[10px] rounded bg-canon-bg border border-canon-border text-canon-text focus:outline-none focus:border-canon-accent"
          />
          <div className="flex gap-2">
            <button onClick={addUpsertFromJson} className="px-3 py-2 text-xs rounded bg-canon-blue text-canon-bg font-bold hover:bg-opacity-90">
              Add upsert
            </button>
            <button onClick={clearAll} className="px-3 py-2 text-xs rounded bg-canon-bg border border-canon-border hover:bg-red-900/30 hover:text-red-400 hover:border-red-500">
              Clear overrides
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-canon-text-light font-bold uppercase">Delete atom by id</div>
          <div className="flex gap-2">
            <input
              value={deleteId}
              onChange={e => setDeleteId(e.target.value)}
              className="flex-1 px-2 py-2 font-mono text-xs rounded bg-canon-bg border border-canon-border text-canon-text focus:outline-none focus:border-canon-accent"
              placeholder="atom id"
            />
            <button onClick={addDelete} className="px-3 py-2 text-xs rounded bg-canon-bg border border-canon-border hover:bg-canon-accent hover:text-canon-bg">
              Delete
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-canon-text-light font-bold uppercase">Recent ops ({ops.length} total)</div>
          <div className="rounded border border-canon-border overflow-hidden bg-canon-bg/30">
            {opsPreview.map((op, idx) => (
              <div key={idx} className="px-2 py-2 border-b border-canon-border text-[10px] font-mono last:border-0 flex justify-between">
                <span className={op.op === 'delete' ? 'text-red-400' : 'text-green-400'}>{op.op.toUpperCase()}</span>
                {op.op === 'delete'
                  ? <span className="text-canon-text-light">{op.id}</span>
                  : <span className="text-canon-text">{op.atom.id} (Mag: {(op.atom.magnitude ?? 0).toFixed(2)})</span>}
              </div>
            ))}
            {opsPreview.length === 0 && <div className="px-2 py-4 text-xs text-canon-text-light text-center italic">No ops applied.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
