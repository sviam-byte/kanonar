import React, { useMemo, useState } from 'react';
import type { GoalLabSnapshotV1 } from '../../lib/goal-lab/snapshotTypes';
import type { ContextAtom } from '../../lib/context/v2/types';
import { getDyadMag } from '../../lib/tom/layers';
import { metricLabel, metricHelp } from '../../lib/ui/metricLexicon';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function asAtoms(x: any): ContextAtom[] {
  return Array.isArray(x) ? x : [];
}

function fmtPct(x: number) {
  return `${Math.round(clamp01(x) * 100)}`;
}

function listNearby(atoms: ContextAtom[], selfId: string) {
  const out: { id: string; closeness: number; atomId: string }[] = [];
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith('obs:nearby:')) continue;
    const subject = (a as any)?.subject;
    const target = (a as any)?.target;
    if (subject && String(subject) !== selfId) continue;
    if (!target) continue;
    const m = Number((a as any)?.magnitude ?? 0);
    if (!Number.isFinite(m)) continue;
    out.push({ id: String(target), closeness: clamp01(m), atomId: id });
  }
  out.sort((a, b) => b.closeness - a.closeness);
  return out;
}

function bar(v: number) {
  const w = Math.round(clamp01(v) * 100);
  return (
    <div className="h-2 w-28 rounded bg-black/20 border border-white/10 overflow-hidden">
      <div className="h-full bg-white/50" style={{ width: `${w}%` }} />
    </div>
  );
}

export const FriendlyDyadToMPanel: React.FC<{
  snapshotV1: GoalLabSnapshotV1;
  selfId: string;
  actorLabels?: Record<string, string>;
}> = ({ snapshotV1, selfId, actorLabels }) => {
  const atoms = useMemo(() => asAtoms((snapshotV1 as any)?.atoms), [snapshotV1]);
  const nearby = useMemo(() => listNearby(atoms, selfId), [atoms, selfId]);

  const [selected, setSelected] = useState<string | null>(nearby[0]?.id ?? null);

  const targetId = selected ?? nearby[0]?.id ?? null;

  const dyad = useMemo(() => {
    if (!targetId) return null;

    const read = (k: string) => {
      try {
        const v = getDyadMag(atoms as any, selfId, targetId, k, NaN as any);
        return Number.isFinite(v) ? clamp01(v) : null;
      } catch {
        return null;
      }
    };

    return {
      trust: read('trust'),
      threat: read('threat'),
      respect: read('respect'),
      intimacy: read('intimacy'),
      alignment: read('alignment'),
      dominance: read('dominance'),
      uncertainty: read('uncertainty'),
      support: read('support'),
    };
  }, [atoms, selfId, targetId]);

  const title = targetId ? (actorLabels?.[targetId] || targetId) : '—';

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar p-4 bg-canon-bg text-canon-text">
      <div className="text-xs text-canon-text-light mb-2">
        Здесь показывается <b>Dyad ToM</b>: как агент <b>{actorLabels?.[selfId] || selfId}</b> видит других.
        Если “никого нет” — это не баг: значит нет `obs:nearby:*` для этой перспективы.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-canon-border bg-canon-bg-light/20 p-3">
          <div className="text-xs font-semibold opacity-80 mb-2">Perceived nearby</div>
          {nearby.length === 0 ? (
            <div className="text-xs italic opacity-70">No other agents perceived.</div>
          ) : (
            <div className="space-y-2">
              {nearby.slice(0, 12).map(n => {
                const active = n.id === targetId;
                return (
                  <button
                    key={n.id}
                    onClick={() => setSelected(n.id)}
                    className={`w-full text-left rounded border px-2 py-2 transition-colors ${
                      active ? 'border-white/20 bg-white/10' : 'border-white/10 bg-black/10 hover:bg-white/10'
                    }`}
                    title={n.atomId}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">{actorLabels?.[n.id] || n.id}</div>
                      <div className="text-xs font-mono opacity-70">{fmtPct(n.closeness)}</div>
                    </div>
                    <div className="text-[10px] font-mono opacity-50">{n.atomId}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="md:col-span-2 rounded-lg border border-canon-border bg-canon-bg-light/20 p-3">
          <div className="text-xs font-semibold opacity-80 mb-2">Dyad model: {title}</div>

          {!targetId ? (
            <div className="text-xs italic opacity-70">Pick a perceived agent to see dyad ToM.</div>
          ) : !dyad ? (
            <div className="text-xs italic opacity-70">No dyad data available.</div>
          ) : (
            <div className="space-y-2">
              {([
                ['dyadTrust', dyad.trust],
                ['dyadThreat', dyad.threat],
                ['dyadRespect', dyad.respect],
                ['dyadIntimacy', dyad.intimacy],
                ['dyadAlignment', dyad.alignment],
                ['dyadDominance', dyad.dominance],
                ['dyadUncertainty', dyad.uncertainty],
                ['dyadSupport', dyad.support],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded border border-white/10 bg-black/10 px-2 py-2">
                  <div>
                    <div className="text-sm font-semibold">{metricLabel(k as any)}</div>
                    <div className="text-[11px] opacity-60">{metricHelp(k as any)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {bar(v ?? 0)}
                    <div className="w-10 text-right font-mono text-sm">{v == null ? '—' : fmtPct(v)}</div>
                  </div>
                </div>
              ))}

              <div className="mt-2 text-[11px] opacity-60">
                Примечание: “Interpersonal threat” — про <b>этого человека</b>, а “Situational threat” — про{' '}
                <b>ситуацию в целом</b>.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
