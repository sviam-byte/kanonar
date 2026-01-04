import React, { useEffect, useMemo, useState } from 'react';
import type { ContextSnapshot } from '../../lib/context/v2/types';
import { diffAtoms } from '../../lib/snapshot/diffAtoms';
import { getCanonicalAtomsFromSnapshot } from '../../lib/goal-lab/atoms/canonical';

type CastRow = {
  id: string;
  label: string;
  displayName?: string;
  snapshot: ContextSnapshot | null;
};

function fmt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toFixed(2);
}

function getName(r?: CastRow | null) {
  if (!r) return '—';
  const s = String((r as any).displayName || r.label || r.id || '').trim();
  return s || '—';
}

export function CastComparePanel({ rows, focusId }: { rows: CastRow[]; focusId?: string | null }) {
  const usable = useMemo(
    () => rows.filter(r => {
      const snap: any = r?.snapshot;
      if (!snap) return false;
      const canon = getCanonicalAtomsFromSnapshot(snap);
      return Array.isArray(canon.atoms);
    }),
    [rows]
  );

  if (!usable.length) {
    return (
      <div className="rounded-xl border border-canon-border bg-canon-bg-light/30 p-3">
        <div className="text-xs font-semibold opacity-80 mb-2">Compare (agent ↔ agent)</div>
        <div className="text-[12px] opacity-70">
          Нет пригодных снапшотов для сравнения (нужны pipelineV1.stages[*].atoms как массив).
        </div>
      </div>
    );
  }

  const [aId, setAId] = useState<string>(() => usable[0]?.id || '');
  const [bId, setBId] = useState<string>(() => usable[1]?.id || usable[0]?.id || '');

  const usableIdsKey = useMemo(() => usable.map(u => u.id).join('|'), [usable]);

  useEffect(() => {
    if (!usable.length) return;
    const ids = usable.map(u => u.id);

    // Prefer focusing A on the currently selected actor if possible
    const focus = focusId && ids.includes(focusId) ? focusId : null;
    const nextA = focus || (ids.includes(aId) ? aId : ids[0]);
    if (nextA !== aId) setAId(nextA);

    // Ensure B exists and is different from A when possible
    const nextB = ids.includes(bId) && bId !== nextA ? bId : (ids.find(id => id !== nextA) || nextA);
    if (nextB !== bId) setBId(nextB);
  }, [focusId, usableIdsKey]);

  const a = usable.find(r => r.id === aId) || usable[0];
  const b = usable.find(r => r.id === bId) || usable[1] || usable[0];
  const hasTwo = usable.length >= 2 && (a?.id || '') !== (b?.id || '');

  const summaryRows = useMemo(() => {
    const aCanon = a?.snapshot ? getCanonicalAtomsFromSnapshot(a.snapshot as any) : null;
    const bCanon = b?.snapshot ? getCanonicalAtomsFromSnapshot(b.snapshot as any) : null;
    const atomsA: any[] = aCanon?.atoms || [];
    const atomsB: any[] = bCanon?.atoms || [];
    const aId = a?.id || '';
    const bId = b?.id || '';

    const byId = (atoms: any[]) => {
      const m = new Map<string, any>();
      for (const x of Array.isArray(atoms) ? atoms : []) {
        const id = String(x?.id || '');
        if (id) m.set(id, x);
      }
      return m;
    };
    const ia = byId(atomsA);
    const ib = byId(atomsB);
    const get = (idx: Map<string, any>, self: string, k: string) => {
      const at = idx.get(`sum:${k}:${self}`) || idx.get(`sum:${k}`) || null;
      return at ? Number(at.magnitude ?? at.m ?? NaN) : NaN;
    };

    const keys: Array<[string, string]> = [
      ['Threat', 'threatLevel'],
      ['Tension', 'tension'],
      ['Clarity', 'clarity'],
      ['Coping', 'coping'],
      ['Social exposure', 'socialExposure'],
      ['Norm risk', 'normRisk'],
    ];

    return keys.map(([label, k]) => {
      const va = get(ia, aId, k);
      const vb = get(ib, bId, k);
      const delta = Number.isFinite(va) && Number.isFinite(vb) ? vb - va : NaN;
      return { label, va, vb, delta };
    });
  }, [a, b]);

  const topDiff = useMemo(() => {
    const aCanon = a?.snapshot ? getCanonicalAtomsFromSnapshot(a.snapshot as any) : null;
    const bCanon = b?.snapshot ? getCanonicalAtomsFromSnapshot(b.snapshot as any) : null;
    const atomsA = aCanon?.atoms || [];
    const atomsB = bCanon?.atoms || [];

    const diffs = diffAtoms(atomsA, atomsB);

    const scored = diffs
      .map(d => {
        const before = d.before ? Number((d.before as any).magnitude ?? 0) : 0;
        const after = d.after ? Number((d.after as any).magnitude ?? 0) : 0;
        const delta = after - before;
        const id = (d.after as any)?.id || (d.before as any)?.id || '';
        return {
          id,
          type: d.type,
          delta,
          before,
          after,
          code: (d.after as any)?.code || (d.before as any)?.code || null,
          ns: (d.after as any)?.ns || (d.before as any)?.ns || null,
          label: (d.after as any)?.label || (d.before as any)?.label || null,
          abs: Math.abs(delta),
        };
      })
      .filter(x => x.id && x.abs > 1e-6)
      .sort((x, y) => y.abs - x.abs);

    // Prefer “meaningful” namespaces first
    const pri = scored.filter(x => String(x.ns || '').match(/^(ctx|lens|emo|tom|drv|goal|decision|action)$/));
    const rest = scored.filter(x => !String(x.ns || '').match(/^(ctx|lens|emo|tom|drv|goal|decision|action)$/));

    return (pri.length ? pri : scored).slice(0, 24);
  }, [a, b]);

  return (
    <div className="rounded-xl border border-canon-border bg-canon-bg-light/30 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs font-semibold opacity-80">Compare (agent ↔ agent)</div>
        <div className="text-[11px] opacity-60">
          Это сравнение <b>перспектив A vs B</b>, не “до/после тика”.
        </div>
        <div className="flex items-center gap-2">
          <select
            className="text-[12px] bg-black/20 border border-white/10 rounded px-2 py-1"
            value={aId}
            onChange={e => setAId(e.target.value)}
          >
            {usable.map(r => (
              <option key={r.id} value={r.id}>
                {getName(r)}
              </option>
            ))}
          </select>
          <div className="text-[12px] opacity-60">vs</div>
          <select
            className="text-[12px] bg-black/20 border border-white/10 rounded px-2 py-1"
            value={bId}
            onChange={e => setBId(e.target.value)}
          >
            {usable.map(r => (
              <option key={r.id} value={r.id}>
                {getName(r)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!hasTwo ? (
        <div className="mb-3 text-[12px] opacity-70">
          Нет второго агента для сравнения (или выбран A=A). Тогда большинство Δ будет 0 — это нормально.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/10 bg-black/10 p-2">
          <div className="text-[11px] font-semibold opacity-80 mb-2">
            Summary deltas (B − A) • A: <span className="font-mono">{getName(a)}</span> • B:{' '}
            <span className="font-mono">{getName(b)}</span>
          </div>
          <div className="space-y-1">
            {summaryRows.map(r => (
              <div key={r.label} className="flex items-baseline justify-between gap-2 text-[12px]">
                <div className="opacity-70">{r.label}</div>
                <div className="font-mono opacity-90">
                  {fmt(r.va)} → {fmt(r.vb)}{' '}
                  <span className="opacity-70">({fmt(r.delta)})</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-2">
          <div className="text-[11px] font-semibold opacity-80 mb-2">Top changed atoms</div>
          <div className="space-y-1 max-h-[320px] overflow-auto custom-scrollbar pr-1">
            {topDiff.map(d => (
              <div key={d.id} className="text-[12px]">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-mono opacity-90 truncate" title={d.id}>
                    {d.id}
                  </div>
                  <div className="font-mono opacity-90">{fmt(d.delta)}</div>
                </div>
                {(d.code || d.label) && (
                  <div className="text-[11px] opacity-60 truncate" title={String(d.code || d.label)}>
                    {String(d.code || d.label)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
