import React from 'react';

type DecisionLike = {
  best?: {
    allowed?: boolean;
    p?: { id?: string; label?: string; targetId?: string; whyAtomIds?: string[]; blockedBy?: string[]; magnitude?: number; cost?: number };
    id?: string;
  } | null;
  ranked?: Array<{
    p?: { id?: string; label?: string; targetId?: string; whyAtomIds?: string[]; blockedBy?: string[]; magnitude?: number; cost?: number };
    score?: number;
    allowed?: boolean;
  }>;
};

type Props = {
  decision: DecisionLike | null;
};

function formatActionLabel(entry?: { id?: string; label?: string; targetId?: string }) {
  if (!entry) return '—';
  const id = entry.label || entry.id || '—';
  return entry.targetId ? `${id} → ${entry.targetId}` : id;
}

function chips(xs?: string[], max = 6): string[] {
  if (!Array.isArray(xs) || xs.length === 0) return [];
  return xs.slice(0, max).map(String);
}

/**
 * Lightweight "do now" summary for the Goal Lab front panel.
 * Keeps UI stable even when decision data is missing or partial.
 */
export const DoNowCard: React.FC<Props> = ({ decision }) => {
  const choice = decision?.best?.p || (decision?.best as any);
  const choiceLabel = formatActionLabel(choice);
  const allowed = decision?.best?.allowed ?? true;
  const top = (decision?.ranked || []).slice(0, 3);
  const why = chips((choice as any)?.whyAtomIds, 6);
  const blockedBy = chips((choice as any)?.blockedBy, 6);
  const mag = (choice as any)?.magnitude;
  const cost = (choice as any)?.cost;

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-3 space-y-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Do now</div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-slate-100 font-semibold truncate">{choiceLabel}</div>
        <div
          className={`text-[9px] uppercase px-2 py-0.5 rounded ${
            allowed ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'
          }`}
        >
          {allowed ? 'allowed' : 'blocked'}
        </div>
      </div>
      {(Number.isFinite(mag) || Number.isFinite(cost)) ? (
        <div className="flex items-center gap-3 text-[10px] text-slate-500 tabular-nums">
          {Number.isFinite(mag) ? <div>mag {Number(mag).toFixed(2)}</div> : null}
          {Number.isFinite(cost) ? <div>cost {Number(cost).toFixed(2)}</div> : null}
        </div>
      ) : null}
      {why.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {why.map((id) => (
            <span key={id} className="text-[9px] font-mono bg-black/20 px-1 rounded border border-slate-800 text-slate-400">
              {id}
            </span>
          ))}
        </div>
      ) : null}
      {!allowed && blockedBy.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {blockedBy.map((id) => (
            <span key={id} className="text-[9px] font-mono bg-rose-900/10 px-1 rounded border border-rose-900/30 text-rose-200/70">
              {id}
            </span>
          ))}
        </div>
      ) : null}
      {top.length > 0 ? (
        <div className="space-y-1">
          {top.map((item, idx) => (
            <div key={`${item?.p?.id || idx}`} className="flex items-center justify-between text-[10px]">
              <div className="text-slate-400 truncate">{formatActionLabel(item?.p)}</div>
              <div className="flex items-center gap-2">
                <div className={`text-[9px] uppercase px-2 py-0.5 rounded ${
                  (item?.allowed ?? true) ? 'bg-emerald-500/10 text-emerald-200/80' : 'bg-rose-500/10 text-rose-200/80'
                }`}>{(item?.allowed ?? true) ? 'ok' : 'blocked'}</div>
                <div className="text-slate-500 tabular-nums">{Number(item?.score ?? 0).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-slate-500">Нет данных о ранжировании.</div>
      )}
    </div>
  );
};
