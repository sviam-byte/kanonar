import React from 'react';

type DecisionLike = {
  best?: {
    allowed?: boolean;
    p?: { id?: string; label?: string; targetId?: string };
    id?: string;
  } | null;
  ranked?: Array<{
    p?: { id?: string; label?: string; targetId?: string };
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

/**
 * Lightweight "do now" summary for the Goal Lab front panel.
 * Keeps UI stable even when decision data is missing or partial.
 */
export const DoNowCard: React.FC<Props> = ({ decision }) => {
  const choice = decision?.best?.p || (decision?.best as any);
  const choiceLabel = formatActionLabel(choice);
  const allowed = decision?.best?.allowed ?? true;
  const top = (decision?.ranked || []).slice(0, 3);

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
      {top.length > 0 ? (
        <div className="space-y-1">
          {top.map((item, idx) => (
            <div key={`${item?.p?.id || idx}`} className="flex items-center justify-between text-[10px]">
              <div className="text-slate-400 truncate">{formatActionLabel(item?.p)}</div>
              <div className="text-slate-500 tabular-nums">{Number(item?.score ?? 0).toFixed(2)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-slate-500">Нет данных о ранжировании.</div>
      )}
    </div>
  );
};
