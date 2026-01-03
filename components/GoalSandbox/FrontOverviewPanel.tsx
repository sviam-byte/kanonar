import React, { useMemo } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import type { GoalLabSnapshotV1 } from '../../lib/goal-lab/snapshotTypes';
import { getCtx } from '../../lib/context/layers';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x?.id === id);
  const m = (a as any)?.magnitude;
  return typeof m === 'number' && Number.isFinite(m) ? m : fb;
}

function listNearby(atoms: ContextAtom[], selfId: string): { id: string; closeness: number; atomId: string }[] {
  // obs:nearby:OTHER:closeness (with subject=selfId, target=OTHER)
  const out: { id: string; closeness: number; atomId: string }[] = [];
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith('obs:nearby:')) continue;
    const target = (a as any)?.target;
    const subject = (a as any)?.subject;
    if (subject && String(subject) !== selfId) continue;
    if (typeof target !== 'string' || !target) continue;
    const closeness = Number((a as any)?.magnitude ?? 0);
    if (!Number.isFinite(closeness)) continue;
    out.push({ id: target, closeness: clamp01(closeness), atomId: id });
  }
  out.sort((a, b) => b.closeness - a.closeness);
  return out;
}

export const FrontOverviewPanel: React.FC<{
  snapshotV1: GoalLabSnapshotV1;
  selfId: string;
  actorLabels?: Record<string, string>;
}> = ({ snapshotV1, selfId, actorLabels }) => {
  const atoms = useMemo(() => (Array.isArray(snapshotV1?.atoms) ? snapshotV1.atoms : []), [snapshotV1]);
  const summary = (snapshotV1 as any)?.summary || null;

  const axes = useMemo(() => {
    const pick = (axis: string) => getCtx(atoms, selfId, axis, 0);
    return {
      danger: pick('danger'),
      uncertainty: pick('uncertainty'),
      timePressure: pick('timePressure'),
      normPressure: pick('normPressure'),
    };
  }, [atoms, selfId]);

  const emo = useMemo(() => {
    const keys = ['fear', 'anger', 'shame', 'resolve', 'care', 'valence', 'arousal'];
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = clamp01(getMag(atoms, `emo:${k}:${selfId}`, 0));
    return out;
  }, [atoms, selfId]);

  const nearby = useMemo(() => listNearby(atoms, selfId), [atoms, selfId]);

  const kv = [
    {
      k: 'Threat',
      v:
        summary?.threatLevel ??
        clamp01(getMag(atoms, `threat:final:${selfId}`, getMag(atoms, 'threat:final', 0))),
    },
    { k: 'Norm risk', v: summary?.normRisk ?? 0 },
    { k: 'Stress', v: clamp01(getMag(atoms, `feat:char:${selfId}:body.stress`, 0)) },
    { k: 'Fatigue', v: clamp01(getMag(atoms, `feat:char:${selfId}:body.fatigue`, 0)) },
  ];

  const axisRow = (
    label: string,
    p: { magnitude: number; confidence: number; layer: string; id: string | null }
  ) => (
    <div className="flex items-center justify-between p-2 border border-canon-border/30 rounded bg-black/20">
      <div>
        <div className="text-xs font-semibold text-canon-text">{label}</div>
        <div className="text-[10px] font-mono text-canon-text-light">
          {p.id ? `${p.id} (${p.layer})` : `missing (${p.layer})`}
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-extrabold text-canon-accent">
          {Math.round(clamp01(p.magnitude) * 100)}
        </div>
        <div className="text-[10px] font-mono text-canon-text-light">
          c={Math.round(clamp01(p.confidence) * 100)}%
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar p-4 bg-canon-bg text-canon-text">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-canon-text-light">Perspective</div>
          <div className="text-lg font-extrabold">{actorLabels?.[selfId] || selfId}</div>
          <div className="text-[11px] text-canon-text-light">tick: {snapshotV1?.tick ?? 0}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {kv.map(x => (
            <div key={x.k} className="p-2 border border-canon-border/30 rounded bg-black/20">
              <div className="text-[10px] text-canon-text-light">{x.k}</div>
              <div className="text-base font-bold">{Math.round(clamp01(Number(x.v ?? 0)) * 100)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {axisRow('Danger', axes.danger as any)}
        {axisRow('Uncertainty', axes.uncertainty as any)}
        {axisRow('Time pressure', axes.timePressure as any)}
        {axisRow('Norm pressure', axes.normPressure as any)}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {Object.entries(emo).map(([k, v]) => (
          <div key={k} className="p-2 border border-canon-border/30 rounded bg-black/20">
            <div className="text-[10px] text-canon-text-light">emo:{k}</div>
            <div className="text-base font-bold">{Math.round(clamp01(v) * 100)}</div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="text-xs font-semibold text-canon-text-light uppercase tracking-wider">
          Nearby agents (perception)
        </div>
        {nearby.length === 0 ? (
          <div className="mt-2 text-xs italic text-canon-text-light">None.</div>
        ) : (
          <div className="mt-2 space-y-2">
            {nearby.slice(0, 12).map(n => (
              <div
                key={n.id}
                className="flex items-center justify-between p-2 border border-canon-border/30 rounded bg-black/20"
              >
                <div>
                  <div className="text-sm font-semibold">{actorLabels?.[n.id] || n.id}</div>
                  <div className="text-[10px] font-mono text-canon-text-light">{n.atomId}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold">{Math.round(n.closeness * 100)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
