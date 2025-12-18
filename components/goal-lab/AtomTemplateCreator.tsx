
// components/goal-lab/AtomTemplateCreator.tsx
import React, { useMemo, useState } from 'react';
import { getCatalogTemplates } from '../../lib/context/catalog/catalogTemplates';
import { AtomOverrideLayer } from '../../lib/context/overrides/types';
import { ContextAtom } from '../../lib/context/v2/types';

type Props = {
  layer: AtomOverrideLayer;
  onChange: (layer: AtomOverrideLayer) => void;
  className?: string;
};

function now() { return Date.now(); }

export const AtomTemplateCreator: React.FC<Props> = ({ layer, onChange, className }) => {
  const templates = useMemo(() => getCatalogTemplates(), []);
  const groups = useMemo(() => {
    const m = new Map<string, typeof templates>();
    for (const t of templates) {
      const arr = m.get(t.group) || [];
      arr.push(t);
      m.set(t.group, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [templates]);

  const first = templates[0];
  const [templateKey, setTemplateKey] = useState<string>(first?.key || '');
  const template = useMemo(() => templates.find(t => t.key === templateKey) || first, [templates, templateKey, first]);

  const [args, setArgs] = useState<Record<string, any>>(() => {
    const init: any = {};
    if (template?.fields) for (const f of template.fields) init[f.key] = f.defaultValue ?? '';
    // extra generic field
    init.tags = '';
    init.confidence = 1;
    return init;
  });

  function resetArgs(nextKey: string) {
    const t = templates.find(x => x.key === nextKey);
    const init: any = {};
    if (t?.fields) for (const f of t.fields) init[f.key] = f.defaultValue ?? '';
    init.tags = '';
    init.confidence = 1;
    setArgs(init);
  }

  function pushUpsert(atom: ContextAtom) {
    onChange({
      ...layer,
      updatedAt: now(),
      ops: [...(layer.ops || []), { op: 'upsert', atom }]
    });
  }

  return (
    <div className={className ?? 'h-full min-h-0 flex flex-col bg-canon-bg text-canon-text'}>
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">Catalog Templates</div>
        <div className="text-xs text-canon-text-light mt-1">Templates are generated from AtomCatalog specs.</div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3 custom-scrollbar">
        <div className="space-y-2">
          <div className="text-xs text-canon-text-light font-bold uppercase">Template</div>
          <select
            value={templateKey}
            onChange={e => { setTemplateKey(e.target.value); resetArgs(e.target.value); }}
            className="px-2 py-2 rounded bg-canon-bg border border-canon-border text-sm w-full focus:outline-none focus:border-canon-accent"
          >
            {groups.map(([g, items]) => (
              <optgroup key={g} label={g}>
                {items.map(t => <option key={t.key} value={t.key}>{t.title}</option>)}
              </optgroup>
            ))}
          </select>
          {template?.description && <div className="text-xs text-canon-text-light italic">{template.description}</div>}
        </div>

        <div className="rounded border border-canon-border p-3 space-y-3 bg-canon-bg/30">
          {template?.fields?.map(f => (
            <div key={f.key} className="space-y-1">
              <div className="text-xs text-canon-text-light font-bold">{f.label}</div>
              {f.type === 'number' ? (
                <input
                  type="number"
                  value={args[f.key]}
                  onChange={e => setArgs(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                  className="w-full px-2 py-2 font-mono text-xs rounded bg-canon-bg border border-canon-border focus:border-canon-accent focus:outline-none"
                  placeholder={f.placeholder}
                />
              ) : (
                <input
                  value={args[f.key]}
                  onChange={e => setArgs(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full px-2 py-2 font-mono text-xs rounded bg-canon-bg border border-canon-border focus:border-canon-accent focus:outline-none"
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="space-y-1">
              <div className="text-xs text-canon-text-light font-bold">confidence (0..1)</div>
              <input
                type="number"
                value={args.confidence}
                onChange={e => setArgs(prev => ({ ...prev, confidence: Number(e.target.value) }))}
                className="w-full px-2 py-2 font-mono text-xs rounded bg-canon-bg border border-canon-border focus:border-canon-accent focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-canon-text-light font-bold">extra tags (comma-sep)</div>
              <input
                value={args.tags}
                onChange={e => setArgs(prev => ({ ...prev, tags: e.target.value }))}
                className="w-full px-2 py-2 font-mono text-xs rounded bg-canon-bg border border-canon-border focus:border-canon-accent focus:outline-none"
                placeholder="e.g. test,debug"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => template && pushUpsert(template.build(args))}
              className="w-full px-3 py-2 text-xs font-bold rounded bg-canon-blue text-canon-bg hover:bg-opacity-90 transition-colors"
            >
              Add override atom
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
