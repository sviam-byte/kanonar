import React from 'react';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fmt(x: any, digits = 2) {
  const n = Number(x);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(digits);
}

function getTopDomains(atoms: any[], selfId: string, k = 5) {
  const out: { domain: string; magnitude: number; id: string }[] = [];
  const suffix = `:${selfId}`;
  for (const a of Array.isArray(atoms) ? atoms : []) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith('goal:domain:')) continue;
    if (!id.endsWith(suffix)) continue;
    const domain = id.slice('goal:domain:'.length, id.length - suffix.length);
    out.push({ domain, magnitude: clamp01(Number((a as any)?.magnitude ?? 0)), id });
  }
  out.sort((a, b) => b.magnitude - a.magnitude);
  return out.slice(0, k);
}

function getTopEmotions(summary: any, k = 5) {
  const top = summary?.emotions?.topEmotions;
  const arr = Array.isArray(top) ? top : [];
  return arr
    .map((e: any) => ({
      key: String(e?.key || ''),
      magnitude: clamp01(Number(e?.magnitude ?? 0)),
    }))
    .filter(e => e.key)
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, k);
}

export function FrontOverviewPanel(props: { snapshot: any; selfId: string }) {
  const { snapshot, selfId } = props;
  const summary = snapshot?.summary || {};
  const ctx = summary?.context || {};
  const decision = snapshot?.decision || {};

  const topDomains = getTopDomains(snapshot?.atoms || [], selfId, 5);
  const topEmo = getTopEmotions(summary, 5);
  const ranked = Array.isArray(decision?.ranked) ? decision.ranked : [];
  const topActions = ranked.slice(0, 5);

  const best = decision?.best;
  const bestId = best?.p?.id || best?.id || '';

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="text-[12px] uppercase tracking-wide opacity-70 mb-2">Front output</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-md border border-white/10 p-2">
          <div className="text-[11px] opacity-60 mb-1">Context (axes)</div>
          <div className="text-[12px] leading-6">
            <div>
              danger: <b>{fmt(ctx?.axes?.danger)}</b>
            </div>
            <div>
              uncertainty: <b>{fmt(ctx?.axes?.uncertainty)}</b>
            </div>
            <div>
              timePressure: <b>{fmt(ctx?.axes?.timePressure)}</b>
            </div>
            <div>
              normPressure: <b>{fmt(ctx?.axes?.normPressure)}</b>
            </div>
            <div className="opacity-60 text-[11px] mt-1">
              (this is what should drive “feels different” between scenes)
            </div>
          </div>
        </div>

        <div className="rounded-md border border-white/10 p-2">
          <div className="text-[11px] opacity-60 mb-1">Decision</div>
          <div className="text-[12px] leading-6">
            <div>
              best: <b>{String(bestId || '—')}</b>
            </div>
            <div>
              score: <b>{fmt(best?.score)}</b>
            </div>
            <div className="mt-2 text-[11px] opacity-60">top candidates:</div>
            <div className="text-[12px]">
              {topActions.length === 0 ? (
                <div className="opacity-60">—</div>
              ) : (
                <ul className="list-disc pl-4">
                  {topActions.map((r: any, i: number) => (
                    <li key={String(r?.p?.id || r?.id || i)}>
                      {String(r?.p?.id || r?.id)}{' '}
                      <span className="opacity-60">({fmt(r?.score ?? r?.utility)})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-white/10 p-2">
          <div className="text-[11px] opacity-60 mb-1">Top emotions</div>
          <div className="text-[12px]">
            {topEmo.length === 0 ? (
              <div className="opacity-60">—</div>
            ) : (
              <ul className="list-disc pl-4">
                {topEmo.map((e: any) => (
                  <li key={e.key}>
                    {e.key} <span className="opacity-60">({fmt(e.magnitude)})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-md border border-white/10 p-2">
          <div className="text-[11px] opacity-60 mb-1">Top goal domains</div>
          <div className="text-[12px]">
            {topDomains.length === 0 ? (
              <div className="opacity-60">—</div>
            ) : (
              <ul className="list-disc pl-4">
                {topDomains.map(d => (
                  <li key={d.id}>
                    {d.domain} <span className="opacity-60">({fmt(d.magnitude)})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
