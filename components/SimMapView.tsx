// components/SimMapView.tsx
// Simple SVG map for SimKit: locations, links, and click-to-enqueue moves.

import React, { useMemo, useState } from 'react';
import type { SimSnapshot, SimAction, SimLocation, SimCharacter } from '../lib/simkit/core/types';
import type { SimKitSimulator } from '../lib/simkit/core/simulator';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

type Props = {
  sim: SimKitSimulator;
  snapshot: SimSnapshot | null;
};

type Pos = { x: number; y: number };

export const SimMapView: React.FC<Props> = ({ sim, snapshot }) => {
  const [selectedActor, setSelectedActor] = useState<string>('');

  const locs: SimLocation[] = snapshot?.locations || [];
  const chars: SimCharacter[] = snapshot?.characters || [];

  const locById = useMemo(() => {
    const m: Record<string, SimLocation> = {};
    for (const l of locs) m[l.id] = l;
    return m;
  }, [locs]);

  const positions: Record<string, Pos> = useMemo(() => {
    // Deterministic ring layout for locations.
    const ids = locs.map((l) => l.id).slice().sort();
    const out: Record<string, Pos> = {};
    const W = 900;
    const H = 520;
    const cx0 = W / 2;
    const cy0 = H / 2;
    const r = Math.min(W, H) * 0.35;
    const n = Math.max(1, ids.length);

    ids.forEach((id, i) => {
      const a = (2 * Math.PI * i) / n;
      out[id] = { x: cx0 + r * Math.cos(a), y: cy0 + r * Math.sin(a) };
    });
    return out;
  }, [locs]);

  const actorIds = useMemo(() => chars.map((c) => c.id).sort(), [chars]);
  const actor = selectedActor || actorIds[0] || '';

  function isNeighbor(fromId: string, toId: string) {
    const from = locById[fromId];
    return !!from && (from.neighbors || []).includes(toId);
  }

  function enqueueMove(toLocId: string) {
    if (!actor) return;
    const actorObj = chars.find((c) => c.id === actor);
    if (!actorObj) return;
    if (!isNeighbor(actorObj.locId, toLocId)) return;

    const a: SimAction = {
      id: `ui:move:${sim.world.tickIndex}:${actor}:${toLocId}`,
      kind: 'move',
      actorId: actor,
      targetId: toLocId,
    };
    sim.enqueueAction(a);
  }

  if (!snapshot) return <div className="text-sm opacity-70">Нет снапшота. Сделай хотя бы 1 тик.</div>;

  return (
    <div className="h-full w-full flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="font-mono text-sm opacity-80">actor</div>
        <select
          value={actor}
          onChange={(e) => setSelectedActor(e.target.value)}
          className={cx('px-3 py-2 rounded-xl border border-canon-border bg-canon-card')}
        >
          {actorIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        <div className="text-sm opacity-70">
          Кликни по соседней локации, чтобы поставить move в очередь forcedActions на следующий тик.
        </div>
      </div>

      <div className="rounded-2xl border border-canon-border bg-canon-card p-3 overflow-hidden">
        <svg viewBox="0 0 900 520" className="w-full h-[520px]">
          {/* edges */}
          {locs.flatMap((l) => {
            const p1 = positions[l.id];
            return (l.neighbors || []).map((nId) => {
              // рисуем ребро один раз
              if (String(l.id) > String(nId)) return null;
              const p2 = positions[nId];
              if (!p1 || !p2) return null;
              return (
                <line
                  key={`${l.id}--${nId}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="currentColor"
                  opacity={0.25}
                  strokeWidth={2}
                />
              );
            });
          })}

          {/* nodes */}
          {locs.map((l) => {
            const p = positions[l.id];
            if (!p) return null;

            // подсветка: является ли узел доступным перемещением для выбранного актора
            const actorObj = chars.find((c) => c.id === actor);
            const canMove = actorObj ? isNeighbor(actorObj.locId, l.id) : false;

            return (
              <g
                key={l.id}
                onClick={() => canMove && enqueueMove(l.id)}
                style={{ cursor: canMove ? 'pointer' : 'default' }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={26}
                  fill="none"
                  stroke="currentColor"
                  opacity={canMove ? 0.9 : 0.5}
                  strokeWidth={canMove ? 3 : 2}
                />
                <text x={p.x} y={p.y - 34} textAnchor="middle" fontSize="12" opacity={0.8}>
                  {l.name}
                </text>
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" opacity={0.7}>
                  {l.id}
                </text>
              </g>
            );
          })}

          {/* characters */}
          {chars.map((c, idx) => {
            const p = positions[c.locId];
            if (!p) return null;
            const dx = (idx % 3) * 10 - 10;
            const dy = Math.floor(idx / 3) * 10 - 10;
            const isSel = c.id === actor;
            return (
              <g key={c.id}>
                <circle
                  cx={p.x + dx}
                  cy={p.y + dy}
                  r={8}
                  fill="currentColor"
                  opacity={isSel ? 0.95 : 0.6}
                />
                <text x={p.x + dx + 12} y={p.y + dy + 4} fontSize="11" opacity={0.8}>
                  {c.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
