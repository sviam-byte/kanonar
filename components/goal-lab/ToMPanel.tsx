import React, { useMemo, useState } from 'react';
import { ContextAtom } from '../../lib/context/v2/types';

type ToMPanelProps = {
  atoms: ContextAtom[];
  defaultSelfId?: string;
  defaultOtherId?: string;
};

export const ToMPanel: React.FC<ToMPanelProps> = ({ atoms, defaultSelfId, defaultOtherId }) => {
  const parseDyad = (id: string) => {
    // tom:dyad:self:other:metric
    // tom:effective:dyad:self:other:metric
    const parts = id.split(':');
    if (parts.length < 5) return null;
    if (parts[0] !== 'tom') return null;
    if (parts[1] === 'dyad') {
      return { kind: 'base' as const, self: parts[2], other: parts[3], metric: parts[4] };
    }
    if (parts[1] === 'effective' && parts[2] === 'dyad') {
      // tom:effective:dyad:self:other:metric  => len >= 6
      if (parts.length < 6) return null;
      return { kind: 'effective' as const, self: parts[3], other: parts[4], metric: parts[5] };
    }
    return null;
  };

  const parseCtxDyad = (id: string) => {
    // tom:dyad:self:other:trust_ctx OR threat_ctx
    const parts = id.split(':');
    if (parts.length < 5) return null;
    if (parts[0] !== 'tom' || parts[1] !== 'dyad') return null;
    const metric = parts[4];
    if (!metric.endsWith('_ctx')) return null;
    return { self: parts[2], other: parts[3], metric };
  };

  const parsePolicy = (id: string) => {
    // tom:mode:self
    // tom:predict:self:other:key
    // tom:att:self:other:key
    // tom:help:self:other:willingness
    // tom:afford:self:other:action:xyz (and optional :EU)
    const parts = id.split(':');
    if (parts.length < 2) return null;
    if (parts[0] !== 'tom') return null;

    if (parts[1] === 'mode' && parts.length >= 3) return { type: 'mode' as const, self: parts[2] };

    if ((parts[1] === 'predict' || parts[1] === 'att' || parts[1] === 'help') && parts.length >= 5) {
      return {
        type: parts[1] as 'predict' | 'att' | 'help',
        self: parts[2],
        other: parts[3],
        key: parts.slice(4).join(':'),
      };
    }

    if (parts[1] === 'afford' && parts.length >= 6) {
      return { type: 'afford' as const, self: parts[2], other: parts[3], key: parts.slice(4).join(':') };
    }

    return null;
  };

  const data = useMemo(() => {
    const baseDyads = atoms.filter(a => a.id.startsWith('tom:dyad:') && !a.id.includes('_ctx'));
    const ctxDyads = atoms.filter(a => a.id.startsWith('tom:dyad:') && a.id.includes('_ctx'));
    const effectiveDyads = atoms.filter(a => a.id.startsWith('tom:effective:dyad:'));
    const bias = atoms.filter(a => a.id.startsWith('tom:ctx:') || a.id.includes(':bias:') || a.id.startsWith('tom:bias:'));

    const policy = atoms.filter(a =>
      a.id.startsWith('tom:mode:') ||
      a.id.startsWith('tom:predict:') ||
      a.id.startsWith('tom:att:') ||
      a.id.startsWith('tom:help:') ||
      a.id.startsWith('tom:afford:')
    );

    const selfIds = new Set<string>();
    const otherIdsBySelf = new Map<string, Set<string>>();

    for (const a of [...baseDyads, ...ctxDyads, ...effectiveDyads, ...policy]) {
      const p = parsePolicy(a.id);
      if (p?.self) selfIds.add(p.self);
      if (p && 'other' in p && (p as any).other) {
        const other = (p as any).other as string;
        if (!otherIdsBySelf.has(p.self)) otherIdsBySelf.set(p.self, new Set<string>());
        otherIdsBySelf.get(p.self)!.add(other);
      }

      const d = parseDyad(a.id);
      if (d) {
        selfIds.add(d.self);
        if (!otherIdsBySelf.has(d.self)) otherIdsBySelf.set(d.self, new Set<string>());
        otherIdsBySelf.get(d.self)!.add(d.other);
      }

      const c = parseCtxDyad(a.id);
      if (c) {
        selfIds.add(c.self);
        if (!otherIdsBySelf.has(c.self)) otherIdsBySelf.set(c.self, new Set<string>());
        otherIdsBySelf.get(c.self)!.add(c.other);
      }
    }

    return {
      baseDyads,
      ctxDyads,
      effectiveDyads,
      bias,
      policy,
      selfIds: Array.from(selfIds).sort(),
      otherIdsBySelf,
    };
  }, [atoms]);

  const [selfId, setSelfId] = useState<string>('');
  const otherOptions = useMemo(() => {
    const set = data.otherIdsBySelf.get(selfId) || new Set<string>();
    return Array.from(set).sort();
  }, [data.otherIdsBySelf, selfId]);
  const [otherId, setOtherId] = useState<string>('');

  // Sync selfId with new atoms / perspective
  const lastDefaultSelfRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!selfId) {
      const init =
        (defaultSelfId && data.selfIds.includes(defaultSelfId)) ? defaultSelfId :
        (data.selfIds[0] || '');
      if (init) setSelfId(init);
      return;
    }

    if (defaultSelfId && lastDefaultSelfRef.current !== defaultSelfId) {
      lastDefaultSelfRef.current = defaultSelfId;
      if (data.selfIds.includes(defaultSelfId) && selfId !== defaultSelfId) {
        setSelfId(defaultSelfId);
      }
    }

    if (selfId && data.selfIds.length > 0 && !data.selfIds.includes(selfId)) {
      setSelfId(data.selfIds[0]);
    }
  }, [defaultSelfId, data.selfIds, selfId]);

  // Sync otherId with new atoms / selfId
  const lastDefaultOtherRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!otherId) {
      const init =
        (defaultOtherId && otherOptions.includes(defaultOtherId)) ? defaultOtherId :
        (otherOptions[0] || '');
      if (init) setOtherId(init);
      return;
    }

    if (defaultOtherId && lastDefaultOtherRef.current !== defaultOtherId) {
      lastDefaultOtherRef.current = defaultOtherId;
      if (otherOptions.includes(defaultOtherId) && otherId !== defaultOtherId) {
        setOtherId(defaultOtherId);
      }
    }

    if (otherId && otherOptions.length > 0 && !otherOptions.includes(otherId)) {
      setOtherId(otherOptions[0] || '');
    }
  }, [defaultOtherId, otherOptions, otherId]);

  const atomRow = (a: ContextAtom) => (
    <div key={a.id} className="flex justify-between items-center text-xs p-1 hover:bg-white/5 rounded">
      <span className="truncate flex-1 mr-2" title={a.id}>{a.label || a.id}</span>
      <span className="font-mono text-canon-blue font-bold">{(a.magnitude ?? 0).toFixed(2)}</span>
    </div>
  );

  const renderList = (title: string, list: ContextAtom[]) => (
    <div className="mb-5">
      <h4 className="text-xs font-bold text-canon-accent uppercase mb-2 border-b border-canon-border/30 pb-1">
        {title} ({list.length})
      </h4>
      <div className="space-y-1">
        {list.length === 0 && <div className="text-[10px] italic text-canon-text-light">None</div>}
        {list.map(atomRow)}
      </div>
    </div>
  );

  const dyadFor = (prefix: string, metric: string) => {
    const id = `${prefix}:${selfId}:${otherId}:${metric}`;
    return atoms.find(a => a.id === id);
  };

  const modeAtom = atoms.find(a => a.id === `tom:mode:${selfId}`);

  const policyForDyad = useMemo(() => {
    const isTarget = (a: ContextAtom) => {
      const p = parsePolicy(a.id);
      if (!p) return false;
      if (p.type === 'mode') return p.self === selfId;
      return (p as any).self === selfId && (p as any).other === otherId;
    };

    const list = data.policy.filter(isTarget);

    const predict = list.filter(a => a.id.startsWith('tom:predict:'));
    const att = list.filter(a => a.id.startsWith('tom:att:'));
    const help = list.filter(a => a.id.startsWith('tom:help:'));
    const afford = list.filter(a => a.id.startsWith('tom:afford:') && !a.id.endsWith(':EU'));
    const affordEU = list.filter(a => a.id.startsWith('tom:afford:') && a.id.endsWith(':EU'));

    afford.sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0));

    return { predict, att, help, afford, affordEU };
  }, [data.policy, selfId, otherId]);

  const keyMetrics = useMemo(() => {
    const metrics = ['trust', 'threat', 'support', 'intimacy', 'respect', 'alignment', 'dominance', 'uncertainty'];
    return metrics.map(m => {
      const a = dyadFor('tom:effective:dyad', m);
      return { metric: m, value: a?.magnitude ?? null, id: a?.id ?? `tom:effective:dyad:${selfId}:${otherId}:${m}` };
    });
  }, [atoms, selfId, otherId]);

  return (
    <div className="h-full min-h-0 bg-canon-bg text-canon-text p-4 overflow-auto custom-scrollbar">
      <div className="mb-4 flex gap-2 items-end">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase text-canon-text-light mb-1">Self</div>
          <select
            className="w-full bg-black/20 border border-canon-border/40 rounded px-2 py-1 text-xs"
            value={selfId}
            onChange={e => setSelfId(e.target.value)}
          >
            {data.selfIds.length === 0 && <option value="">(none)</option>}
            {data.selfIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase text-canon-text-light mb-1">Other</div>
          <select
            className="w-full bg-black/20 border border-canon-border/40 rounded px-2 py-1 text-xs"
            value={otherId}
            onChange={e => setOtherId(e.target.value)}
          >
            {otherOptions.length === 0 && <option value="">(none)</option>}
            {otherOptions.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-5">
        <h4 className="text-xs font-bold text-canon-accent uppercase mb-2 border-b border-canon-border/30 pb-1">
          Mode (System-1 / System-2)
        </h4>
        <div className="text-xs p-2 rounded bg-white/5 border border-canon-border/30">
          <div className="flex justify-between items-center">
            <span className="truncate" title={modeAtom?.id || `tom:mode:${selfId}`}>
              {modeAtom?.label || `tom:mode:${selfId}`}
            </span>
            <span className="font-mono text-canon-blue font-bold">{(modeAtom?.magnitude ?? 0).toFixed(2)}</span>
          </div>
          <div className="text-[10px] text-canon-text-light mt-1">
            {modeAtom?.magnitude != null && modeAtom.magnitude >= 0.55 ? 'System-2 weighted policy' : 'System-1 weighted policy'}
          </div>
        </div>
      </div>

      <div className="mb-5">
        <h4 className="text-xs font-bold text-canon-accent uppercase mb-2 border-b border-canon-border/30 pb-1">
          Effective dyad (key metrics)
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {keyMetrics.map(k => (
            <div key={k.metric} className="p-2 rounded bg-white/5 border border-canon-border/30">
              <div className="text-[10px] uppercase text-canon-text-light">{k.metric}</div>
              <div className="flex justify-between items-center">
                <div className="text-[10px] text-canon-text-light truncate mr-2" title={k.id}>{k.id}</div>
                <div className="font-mono text-canon-blue font-bold text-xs">
                  {k.value == null ? '—' : k.value.toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {renderList('Predictions (tom:predict)', policyForDyad.predict)}
      {renderList('Attitude (tom:att)', policyForDyad.att)}
      {renderList('Help willingness (tom:help)', policyForDyad.help)}
      {renderList('Affordances (policy π(a))', policyForDyad.afford)}

      <details className="mb-5">
        <summary className="text-xs font-bold text-canon-accent uppercase cursor-pointer select-none">
          Debug: base/ctx/effective + bias
        </summary>
        <div className="mt-3">
          {renderList('Dyads (base)', data.baseDyads)}
          {renderList('Dyads (ctx)', data.ctxDyads)}
          {renderList('Dyads (effective)', data.effectiveDyads)}
          {renderList('Bias', data.bias)}
          {renderList('Affordance EU (tom:afford:*:EU)', policyForDyad.affordEU)}
        </div>
      </details>
    </div>
  );
};
