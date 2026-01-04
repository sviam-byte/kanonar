import React, { useMemo, useState } from 'react';

import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

type Row = {
  targetId: string;
  tier?: string;
  kind?: string;
  idConfidence?: number;
  familiarity?: number;
  lastSeenAt?: unknown;
};

const num = (x: unknown, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

export const AcquaintancePanel: React.FC<{
  atoms: ContextAtom[];
  className?: string;
  onSelectTargetId?: (id: string) => void;
}> = ({ atoms, className, onSelectTargetId }) => {
  const [q, setQ] = useState('');

  const rows = useMemo<Row[]>(() => {
    const byTarget = new Map<string, Row>();

    for (const atom of arr(atoms)) {
      if ((atom as { ns?: string })?.ns !== 'soc') continue;
      const kind = String((atom as { kind?: string })?.kind ?? '');
      if (!kind.startsWith('soc_acq_')) continue;

      const targetId = String(
        (atom as { targetId?: string })?.targetId ??
          (atom as { meta?: { targetId?: string } })?.meta?.targetId ??
          '',
      );
      if (!targetId) continue;

      if (!byTarget.has(targetId)) byTarget.set(targetId, { targetId });
      const row = byTarget.get(targetId)!;

      if (kind === 'soc_acq_tier') {
        row.tier = String(
          (atom as { meta?: { tier?: string } })?.meta?.tier ??
            (atom as { tier?: string })?.tier ??
            '',
        );
        row.kind = String(
          (atom as { meta?: { kind?: string } })?.meta?.kind ??
            (atom as { kind?: string })?.kind ??
            row.kind ??
            '',
        );
        row.idConfidence = num(
          (atom as { meta?: { idConfidence?: number } })?.meta?.idConfidence,
          row.idConfidence ?? 0,
        );
        row.familiarity = num(
          (atom as { meta?: { familiarity?: number } })?.meta?.familiarity,
          row.familiarity ?? 0,
        );
        row.lastSeenAt =
          (atom as { meta?: { lastSeenAt?: unknown } })?.meta?.lastSeenAt ?? row.lastSeenAt;
      } else if (kind === 'soc_acq_idconf') {
        row.idConfidence = num(
          (atom as { magnitude?: number })?.magnitude ??
            (atom as { m?: number })?.m ??
            row.idConfidence ??
            0,
        );
      } else if (kind === 'soc_acq_familiarity') {
        row.familiarity = num(
          (atom as { magnitude?: number })?.magnitude ??
            (atom as { m?: number })?.m ??
            row.familiarity ??
            0,
        );
      } else if (kind === 'soc_acq_kind') {
        // Kind atoms usually use magnitude=1 and tags include the kind label.
        const tags = arr((atom as { tags?: string[] })?.tags).map(String);
        const derivedKind = tags.find(tag => tag !== 'acq' && tag !== 'kind') ?? '';
        if (derivedKind) row.kind = derivedKind;
      }
    }

    const search = q.trim().toLowerCase();
    return Array.from(byTarget.values())
      .filter(row =>
        !search
          ? true
          : `${row.targetId} ${row.tier ?? ''} ${row.kind ?? ''}`
              .toLowerCase()
              .includes(search),
      )
      .sort(
        (x, y) =>
          num(y.idConfidence) +
          num(y.familiarity) -
          (num(x.idConfidence) + num(x.familiarity)),
      );
  }, [atoms, q]);

  return (
    <div className={className ?? 'h-full min-h-0 flex flex-col bg-canon-bg text-canon-text'}>
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">Знакомства (Acquaintances)</div>
        <div className="text-xs text-canon-text-light mt-1">
          Recognition-layer: tier / idConfidence / familiarity / kind (из soc_acq_* атомов).
        </div>
        <div className="mt-3">
          <input
            value={q}
            onChange={event => setQ(event.target.value)}
            className="w-full px-2 py-2 rounded bg-canon-bg border border-canon-border text-xs font-mono focus:outline-none focus:border-canon-accent"
            placeholder="search target / tier / kind"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {rows.map(row => (
          <div
            key={row.targetId}
            className="p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSelectTargetId?.(row.targetId)}
                className="text-xs font-bold font-mono px-2 py-1 rounded bg-canon-bg border border-canon-border hover:bg-canon-accent hover:text-canon-bg transition-colors"
              >
                {row.targetId}
              </button>
              <span className="ml-auto text-[10px] text-canon-text-light font-mono">
                tier:{row.tier ?? '—'} · kind:{row.kind ?? '—'}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex justify-between">
                <span className="opacity-60">idConfidence</span>
                <span className="font-mono">{num(row.idConfidence).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">familiarity</span>
                <span className="font-mono">{num(row.familiarity).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-4 text-xs text-canon-text-light italic text-center">
            No acquaintance atoms (soc_acq_*) found.
          </div>
        )}
      </div>
    </div>
  );
};
