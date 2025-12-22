import React, { useMemo } from 'react';
import { ContextAtom } from '../../lib/context/v2/types';
import { Slider } from '../Slider';

type Props = {
  selfId: string;
  atoms: ContextAtom[];
  manualAtoms: ContextAtom[];
  onChangeManualAtoms: (atoms: ContextAtom[]) => void;
  className?: string;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

function upsert(manual: ContextAtom[], a: ContextAtom): ContextAtom[] {
  const i = manual.findIndex(x => x.id === a.id);
  if (i >= 0) {
    const next = manual.slice();
    next[i] = a;
    return next;
  }
  return [...manual, a];
}

export const EmotionInspector: React.FC<Props> = ({
  selfId,
  atoms,
  manualAtoms,
  onChangeManualAtoms,
  className,
}) => {
  const rows = useMemo(() => {
    const isForSelf = (id: string) => id.endsWith(`:${selfId}`) || id.includes(`:${selfId}:`);

    const interesting = atoms
      .filter(a => a?.id && (a.id.startsWith('app:') || a.id.startsWith('emo:')) && isForSelf(a.id))
      .map(a => {
        const ov = manualAtoms.find(m => m.id === a.id);
        return {
          id: a.id,
          group: a.id.startsWith('app:') ? 'app' : 'emo',
          channel: a.id.split(':')[1] || a.id,
          now: clamp01(a.magnitude ?? 0),
          ov: ov ? clamp01(ov.magnitude ?? 0) : null,
          hasOv: Boolean(ov),
        };
      })
      .sort((x, y) => `${x.group}:${x.channel}`.localeCompare(`${y.group}:${y.channel}`));

    return interesting;
  }, [atoms, manualAtoms, selfId]);

  const setOverride = (id: string, v01: number) => {
    const v = clamp01(v01);
    const isApp = id.startsWith('app:');
    const a: ContextAtom = {
      id,
      ns: isApp ? 'app' : 'emo',
      kind: isApp ? 'appraisal_override' : 'emotion_override',
      origin: 'override',
      source: 'manual',
      magnitude: v,
      confidence: 1,
      tags: ['override', isApp ? 'app' : 'emo'],
      label: `Override ${id}`,
      trace: { usedAtomIds: [id], notes: ['manual override (EmotionInspector)'], parts: {} },
    } as any;
    onChangeManualAtoms(upsert(manualAtoms, a));
  };

  const clearOverride = (id: string) => {
    onChangeManualAtoms(manualAtoms.filter(a => a.id !== id));
  };

  const Section = ({ title, group }: { title: string; group: 'app' | 'emo' }) => {
    const items = rows.filter(r => r.group === group);
    return (
      <div className="border border-canon-border/40 rounded-lg bg-black/20 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-canon-text uppercase tracking-wider">{title}</div>
          <div className="text-[10px] font-mono text-canon-text-light/70">{selfId}</div>
        </div>
        {items.length === 0 ? (
          <div className="text-[12px] text-canon-text-light/70">Нет атомов.</div>
        ) : (
          <div className="space-y-2">
            {items.map(r => (
              <div key={r.id} className="border border-canon-border/30 rounded bg-black/30 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-canon-text truncate">{r.channel}</div>
                    <div className="text-[10px] font-mono text-canon-text-light/70 break-all">{r.id}</div>
                  </div>
                  <div className="text-[10px] font-mono text-canon-text-light/80 text-right shrink-0">
                    <div>now: {r.now.toFixed(2)}</div>
                    <div className={r.hasOv ? 'text-orange-300' : 'opacity-40'}>
                      ov: {(r.ov ?? r.now).toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <Slider min={0} max={1} step={0.01} value={r.ov ?? r.now} onChange={(v: number) => setOverride(r.id, v)} />
                </div>
                <div className="mt-2 flex items-center justify-end">
                  {r.hasOv ? (
                    <button
                      className="text-[10px] px-2 py-1 rounded border border-orange-500/40 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20"
                      onClick={() => clearOverride(r.id)}
                    >
                      Clear override
                    </button>
                  ) : (
                    <div className="text-[10px] text-canon-text-light/50">Override отсутствует</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={className || ''}>
      <div className="space-y-3">
        <Section title="Appraisal (app:*)" group="app" />
        <Section title="Emotions (emo:*)" group="emo" />
      </div>
    </div>
  );
};
