// components/goal-lab/EmotionInspector.tsx
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

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function upsertManualAtom(
  manualAtoms: ContextAtom[],
  a: ContextAtom,
  onChange: (atoms: ContextAtom[]) => void,
) {
  const idx = manualAtoms.findIndex(x => x.id === a.id);
  const next = [...manualAtoms];
  if (idx >= 0) next[idx] = a;
  else next.push(a);
  onChange(next);
}

function removeManualAtom(
  manualAtoms: ContextAtom[],
  id: string,
  onChange: (atoms: ContextAtom[]) => void,
) {
  onChange(manualAtoms.filter(a => a.id !== id));
}

export const EmotionInspector: React.FC<Props> = ({
  selfId,
  atoms,
  manualAtoms,
  onChangeManualAtoms,
  className,
}) => {
  const rows = useMemo(() => {
    const interesting = atoms.filter(a => {
      if (!a?.id) return false;
      if (a.id.startsWith('emo:') || a.id.startsWith('app:')) {
        // allow both ...:<selfId> and ...:<selfId>:<otherId> patterns
        return a.id.endsWith(`:${selfId}`) || a.id.includes(`:${selfId}:`);
      }
      return false;
    });

    // Stable order: app:* first, then emo:*, alpha by channel
    const key = (id: string) => {
      const p = id.split(':');
      const ns = p[0] || 'misc';
      const chan = p[1] || '';
      return `${ns === 'app' ? '0' : '1'}:${chan}:${id}`;
    };

    return interesting
      .slice()
      .sort((a, b) => key(a.id).localeCompare(key(b.id)))
      .map(a => {
        const override = manualAtoms.find(m => m.id === a.id);
        return {
          id: a.id,
          ns: a.id.split(':')[0],
          channel: a.id.split(':')[1] || a.kind || 'value',
          value: clamp01(a.magnitude ?? 0),
          overrideValue: override ? clamp01(override.magnitude ?? 0) : null,
          hasOverride: Boolean(override),
        };
      });
  }, [atoms, manualAtoms, selfId]);

  const groups = useMemo(() => {
    const app = rows.filter(r => r.ns === 'app');
    const emo = rows.filter(r => r.ns === 'emo');
    return { app, emo };
  }, [rows]);

  const setOverride = (id: string, value01: number) => {
    const v = clamp01(value01);
    const isApp = id.startsWith('app:');
    upsertManualAtom(
      manualAtoms,
      {
        id,
        ns: isApp ? 'app' : 'emo',
        kind: isApp ? 'appraisal_override' : 'emotion_override',
        origin: 'override',
        source: 'manual',
        magnitude: v,
        confidence: 1,
        tags: ['override', 'emotion'],
        label: `Override ${id}`,
        trace: { usedAtomIds: [id], notes: ['manual override from EmotionInspector'] },
      } as any,
      onChangeManualAtoms,
    );
  };

  const clearOverride = (id: string) => {
    removeManualAtom(manualAtoms, id, onChangeManualAtoms);
  };

  const Section = ({ title, items }: { title: string; items: typeof rows }) => (
    <div className="border border-canon-border/40 rounded-lg bg-black/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold text-canon-text uppercase tracking-wider">{title}</div>
        <div className="text-[10px] text-canon-text-light/70 font-mono">agent: {selfId}</div>
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
                  <div>now: {(r.value ?? 0).toFixed(2)}</div>
                  <div className={r.hasOverride ? 'text-orange-300' : 'opacity-40'}>
                    ov: {(r.overrideValue ?? r.value ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="mt-2">
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={r.overrideValue ?? r.value ?? 0}
                  onChange={(v: number) => setOverride(r.id, v)}
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                {r.hasOverride ? (
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

  return (
    <div className={className || ''}>
      <div className="space-y-3">
        <Section title="Appraisal (app:*)" items={groups.app as any} />
        <Section title="Emotions (emo:*)" items={groups.emo as any} />
        <div className="text-[10px] text-canon-text-light/60">
          Значения выставляются как override-атомы с тем же id (manualAtoms). Для работы требуется,
          чтобы override-слой имел приоритет над derived (см. mergeEpistemic).
        </div>
      </div>
    </div>
  );
};
