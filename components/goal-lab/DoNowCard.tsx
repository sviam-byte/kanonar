import React from 'react';

type DecisionLike = {
  best?: any;
  ranked?: any[];
  /**
   * Debug payload returned by newer decision engines.
   * Kept optional for backward compatibility with legacy snapshots.
   */
  debug?: any;
  /**
   * Some pipeline builds expose the same debug data under `digest`.
   */
  digest?: any;
};

type Props = {
  decision: DecisionLike | null;
};

function formatActionLabel(entry?: any) {
  if (!entry) return '—';
  const id = entry.label || entry.id || '—';
  return entry.targetId ? `${id} → ${entry.targetId}` : id;
}

function chips(xs?: string[], max = 6): string[] {
  if (!Array.isArray(xs) || xs.length === 0) return [];
  return xs.slice(0, max).map(String);
}

function formatMetric(value: unknown, digits = 3): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function resolveDecisionDebug(decision: DecisionLike | null) {
  return (decision as any)?.debug || (decision as any)?.digest || null;
}

/**
 * Lightweight "do now" summary for the Goal Lab front panel.
 * Supports both legacy decision format (p/score) and new format (action/q).
 */
export const DoNowCard: React.FC<Props> = ({ decision }) => {
  const isNew = Boolean(decision?.ranked?.[0]?.action);
  const choice = isNew ? decision?.best : (decision?.best?.p || decision?.best);
  const choiceLabel = formatActionLabel(choice);

  const top = (decision?.ranked || []).slice(0, 5);
  const why = chips((choice as any)?.whyAtomIds, 6);
  const blockedBy = chips((choice as any)?.blockedBy, 6);
  const mag = (choice as any)?.magnitude;
  const cost = (choice as any)?.cost;
  const dbg = resolveDecisionDebug(decision);
  const leading = dbg?.leadingGoal || dbg?.leading || null;
  const linear = dbg?.linearBest || dbg?.linear || null;
  const pomdp = dbg?.pomdpBest || dbg?.pomdp || dbg?.lookaheadBest || null;

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-3 space-y-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Do now</div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-slate-100 font-semibold truncate">{choiceLabel}</div>
        <div className="text-[9px] uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-200/80">best</div>
      </div>
      {(Number.isFinite(mag) || Number.isFinite(cost)) ? (
        <div className="flex items-center gap-3 text-[10px] text-slate-500 tabular-nums">
          {Number.isFinite(mag) ? <div>mag {Number(mag).toFixed(2)}</div> : null}
          {Number.isFinite(cost) ? <div>cost {Number(cost).toFixed(2)}</div> : null}
        </div>
      ) : null}
      {dbg ? (
        <div className="space-y-1 text-[10px] text-slate-400 font-mono">
          {leading?.id ? (
            <div>
              lead goal: <span className="text-slate-200">{String(leading.id)}</span>{' '}
              <span className="text-slate-500">E={formatMetric(leading.energy)}</span>
            </div>
          ) : null}
          {linear ? (
            <div>
              linear best: <span className="text-slate-200">{formatActionLabel(linear)}</span>{' '}
              {linear.qNow != null ? <span className="text-slate-500">q={formatMetric(linear.qNow)}</span> : null}
            </div>
          ) : null}
          {pomdp ? (
            <div>
              pomdp best: <span className="text-slate-200">{formatActionLabel(pomdp)}</span>{' '}
              {pomdp.qLookahead != null ? <span className="text-slate-500">qL={formatMetric(pomdp.qLookahead)}</span> : null}
            </div>
          ) : null}
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
      {blockedBy.length > 0 ? (
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
            <div key={`${(isNew ? item?.action?.id : item?.p?.id) || idx}`} className="flex items-center justify-between text-[10px]">
              <div className="text-slate-400 truncate">
                {formatActionLabel(isNew ? item?.action : item?.p)}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-slate-500 tabular-nums">
                  {isNew ? Number(item?.q ?? 0).toFixed(3) : Number(item?.score ?? 0).toFixed(2)}
                </div>
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
