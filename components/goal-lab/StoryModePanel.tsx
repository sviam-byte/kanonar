import React, { useMemo } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fmt2(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function resolveBest(decision: any): any | null {
  if (!decision?.best) return null;
  const b = decision.best;
  // Keep compatibility for both new ({id, kind, ...}) and legacy ({p:{id,targetId}, ...}) shapes.
  if (b?.action) return b.action;
  return b;
}

function buildGoalEnergyMap(atoms: ContextAtom[], selfId: string): Array<{ goalId: string; E: number; atomId: string }> {
  const out: Array<{ goalId: string; E: number; atomId: string }> = [];
  const activePrefix = `util:activeGoal:${selfId}:`;

  for (const a of arr(atoms)) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith(activePrefix)) continue;
    const goalId = id.slice(activePrefix.length);
    out.push({ goalId, E: clamp01(Number((a as any)?.magnitude ?? 0)), atomId: id });
  }

  if (out.length) return out.sort((x, y) => y.E - x.E);

  // Fallback for mixed snapshots where goal energy lives in goal:domain:*.
  for (const a of arr(atoms)) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith('goal:domain:')) continue;
    const parts = id.split(':');
    const goalId = String(parts[2] || '');
    const ownerId = String(parts[3] || '');
    if (!goalId || ownerId !== selfId) continue;
    out.push({ goalId, E: clamp01(Number((a as any)?.magnitude ?? 0)), atomId: id });
  }

  return out.sort((x, y) => y.E - x.E);
}

type Props = {
  atoms: ContextAtom[];
  decision: any;
  selfId: string;
  actorLabels?: Record<string, string>;
  onJumpToAtomId?: (id: string) => void;
};

export const StoryModePanel: React.FC<Props> = ({ atoms, decision, selfId, actorLabels, onJumpToAtomId }) => {
  const best = useMemo(() => resolveBest(decision), [decision]);

  const bestQ = useMemo(() => {
    const ranked = arr(decision?.ranked);
    const bestId = String(best?.id || best?.p?.id || '');
    if (!bestId) return null;
    const hit = ranked.find((r: any) => String(r?.action?.id || r?.p?.id || r?.id || '') === bestId);
    const q = Number(hit?.q ?? hit?.score);
    return Number.isFinite(q) ? q : null;
  }, [decision, best]);

  const topGoals = useMemo(() => buildGoalEnergyMap(arr(atoms), selfId).slice(0, 3), [atoms, selfId]);

  const targetLabel = useMemo(() => {
    const tid = String(best?.targetId || best?.p?.targetId || '');
    if (!tid) return null;
    return actorLabels?.[tid] || tid;
  }, [best, actorLabels]);

  const jump = (id: string) => {
    if (!id || !onJumpToAtomId) return;
    onJumpToAtomId(id);
  };

  const bestActionAtomId = String(best?.id || best?.p?.id || '')
    ? `action:score:${selfId}:${String(best?.id || best?.p?.id || '')}`
    : null;

  const readableAction = String(best?.kind || best?.id || best?.p?.id || 'wait');
  const paragraph = best
    ? `Сейчас ${selfId} воспринимает ситуацию как смесь давления и приоритетов, поэтому лидирует действие «${readableAction}»${targetLabel ? ` на цель ${targetLabel}` : ''}${bestQ !== null ? ` с ожидаемой полезностью Q=${fmt2(bestQ)}` : ''}.`
    : `Для ${selfId} нет выбранного действия в decision.best — вероятно, не хватает ranked данных для narrative режима.`;

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar p-4 space-y-4 bg-canon-bg text-canon-text">
      <div>
        <div className="text-sm font-bold text-canon-text">Story mode</div>
        <div className="text-[11px] text-canon-text-light mt-1">
          Человеко-читаемое объяснение решения + быстрые переходы в атомы для проверки происхождения.
        </div>
      </div>

      <div className="border border-canon-border/40 rounded bg-black/20 p-3">
        <div className="text-xs font-bold text-canon-text-light uppercase mb-2">Narrative</div>
        <p className="text-[12px] leading-relaxed text-canon-text-light">{paragraph}</p>
      </div>

      <div className="border border-canon-border/40 rounded bg-black/20 p-3">
        <div className="text-xs font-bold text-canon-text-light uppercase mb-2">Jump to key atoms</div>
        <div className="flex flex-wrap gap-2">
          {bestActionAtomId ? (
            <button
              className="px-2 py-1 rounded border border-white/10 bg-black/30 hover:bg-black/40 text-[10px] font-mono"
              onClick={() => jump(bestActionAtomId)}
              title="Open chosen action score atom"
            >
              action: {bestActionAtomId}
            </button>
          ) : null}

          {topGoals.map((g) => (
            <button
              key={g.goalId}
              className="px-2 py-1 rounded border border-white/10 bg-black/30 hover:bg-black/40 text-[10px] font-mono"
              onClick={() => jump(g.atomId)}
              title="Open goal atom"
            >
              goal: {g.goalId} ({fmt2(g.E)})
            </button>
          ))}

          {arr(['danger', 'control', 'uncertainty']).map((axis) => (
            <button
              key={axis}
              className="px-2 py-1 rounded border border-white/10 bg-black/30 hover:bg-black/40 text-[10px] font-mono"
              onClick={() => jump(`ctx:final:${axis}:${selfId}`)}
              title="Open final context axis atom"
            >
              ctx:final:{axis}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
