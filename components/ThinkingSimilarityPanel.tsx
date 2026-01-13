import React, { useMemo, useState } from 'react';
import type { CharacterEntity } from '../types';
import { Branch } from '../types';
import { calculateAllCharacterMetrics } from '../lib/metrics';
import { deriveCognitionProfileFromCharacter } from '../lib/cognition/hybrid';
import { computeThinkingAndActivityCaps } from '../lib/metrics/thinking';
import { interpretThinking } from '../lib/metrics/thinkingInterpret';
import { cosineDistance, vectorStats } from '../lib/metrics/thinkingVector';
import { cognitionVector } from '../lib/metrics/cognitionVector';
import { topDeltas } from '../lib/metrics/vectorExplain';

function clamp01(x: unknown, fallback = 0.5) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

type Item = {
  c: CharacterEntity;
  thinking: any;
  caps: any;
  vec: number[];
  cog: any;
};

/**
 * Panel that finds nearest neighbors by thinking vector and shows a short interpretation.
 */
export const ThinkingSimilarityPanel: React.FC<{
  characters: CharacterEntity[];
  anchorId: string;
  onAnchorIdChange?: (id: string) => void;
  k?: number;
  title?: string;
}> = ({ characters, anchorId, onAnchorIdChange, k = 6, title = 'Похожие по типу мышления' }) => {
  const [showWhy, setShowWhy] = useState(false);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const c of characters) {
      try {
        const m = calculateAllCharacterMetrics(c, Branch.Current, []);
        const psych = (m.psych || (m.modifiableCharacter as any)?.psych) as any;
        if (!psych) continue;

        const { thinking, activityCaps } = computeThinkingAndActivityCaps({
          psych,
          latents: m.latents,
          tomQuality: clamp01(m.tomMetrics?.toM_Quality, 0.5),
          tomUncertainty: clamp01(m.tomMetrics?.toM_Unc, 0.5),
          stress01: clamp01(m.stress, 0.4),
        });

        let cognition = (psych as any).cognition;
        if (!cognition) {
          // Fallback: derive from character entity itself (trait-level prior).
          cognition = deriveCognitionProfileFromCharacter({ character: c as any });
          (psych as any).cognition = cognition;
        }
        const vec = cognitionVector(cognition, { normalize: true });
        if (!vec.length) continue;
        out.push({ c, thinking, caps: activityCaps, vec, cog: cognition });
      } catch {
        // ignore broken chars
      }
    }
    return out;
  }, [characters]);

  const anchor = useMemo(() => items.find(x => x.c.entityId === anchorId) || null, [items, anchorId]);

  const neighbors = useMemo(() => {
    if (!anchor) return [];
    const pool = items.filter(x => x.c.entityId !== anchor.c.entityId);
    return pool
      .map(x => ({ item: x, distance: cosineDistance(anchor.vec, x.vec) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k);
  }, [anchor, items, k]);

  const stats = useMemo(() => vectorStats(items.map(x => x.vec)), [items]);

  if (!characters?.length) return null;

  return (
    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold text-canon-text">{title}</div>
          <div className="text-xs text-canon-text-light">Косинусная дистанция по вектору когниции (мышление + скаляры + policy + caps).</div>
        </div>

        <div className="flex gap-2 items-center">
          <button
            className="text-xs px-2 py-1 rounded border border-canon-border text-canon-text-light hover:text-canon-text"
            onClick={() => setShowWhy(v => !v)}
          >
            {showWhy ? 'Скрыть причины' : 'Показать причины'}
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-3 flex-wrap items-end">
        <div className="flex flex-col">
          <label className="text-xs text-canon-text-light">Якорь</label>
          <select
            className="bg-canon-bg border border-canon-border rounded px-2 py-1 text-sm"
            value={anchorId}
            onChange={e => onAnchorIdChange?.(e.target.value)}
          >
            {characters.map(c => (
              <option key={c.entityId} value={c.entityId}>{c.title || c.entityId}</option>
            ))}
          </select>
        </div>
      </div>

      {stats && (
        <div className="mt-3 text-xs text-canon-text-light">
          vec-dims={stats.dim} · meanVar={stats.meanVar.toFixed(6)} · nearConstDims={stats.nearConstDims}/{stats.dim}
          {stats.meanVar < 1e-6 || stats.nearConstDims > stats.dim * 0.9 ? (
            <span className="ml-2 text-red-300">(Вектора почти константны → все расстояния будут ~0.001)</span>
          ) : null}
        </div>
      )}

      {!anchor && (
        <div className="mt-3 text-sm text-canon-text-light">Недостаточно данных психики/латентов для построения профиля.</div>
      )}

      {anchor && (
        <>
          <div className="mt-3">
            <div className="text-sm font-bold text-canon-text">Трактовка якоря: {anchor.c.title || anchor.c.entityId}</div>
            {(() => {
              const it = interpretThinking(anchor.thinking, anchor.caps);
              return (
                <div className="mt-1 text-xs text-canon-text-light space-y-1">
                  <div>{it.summary.join(' ')}</div>
                  {it.tendencies.length > 0 && <div>Склонности: {it.tendencies.join(' ')}</div>}
                  {it.risks.length > 0 && <div>Риски: {it.risks.join(' ')}</div>}
                  {showWhy && <div className="mt-1 text-[11px] opacity-90">{it.why.join(' · ')}</div>}
                </div>
              );
            })()}
          </div>

          <div className="mt-4">
            <div className="text-sm font-bold text-canon-text">Ближайшие</div>

            <div className="mt-2 space-y-2">
              {neighbors.map((nn, idx) => {
                const x = nn.item;
                const it = interpretThinking(x.thinking, x.caps);
                const deltas = topDeltas(anchor.vec, x.vec, 6);
                return (
                  <div key={x.c.entityId + ':' + idx} className="border border-canon-border/60 rounded p-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-sm text-canon-text font-semibold">{x.c.title || x.c.entityId}</div>
                      <div className="text-xs font-mono text-canon-text-light">dist={nn.distance.toFixed(3)}</div>
                    </div>
                    <div className="mt-1 text-xs text-canon-text-light">{it.summary.join(' ')}</div>
                    {it.tendencies.length > 0 && <div className="mt-1 text-xs text-canon-text-light">Склонности: {it.tendencies.join(' ')}</div>}
                    {it.risks.length > 0 && <div className="mt-1 text-xs text-canon-text-light">Риски: {it.risks.join(' ')}</div>}
                    {showWhy && <div className="mt-1 text-[11px] text-canon-text-light opacity-90">{it.why.join(' · ')}</div>}
                    {showWhy && (
                      <div className="mt-1 text-[11px] text-canon-text-light opacity-80">
                        TopΔ dims: {deltas.map(z => `#${z.i}:${z.d.toFixed(4)}`).join(' · ')}
                      </div>
                    )}
                  </div>
                );
              })}
              {neighbors.length === 0 && <div className="text-sm text-canon-text-light">Нет соседей (или данные не рассчитались).</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
