import { LocationMap } from '../../types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
function cellKey(x: number, y: number) { return `${x},${y}`; }

/**
 * Простая, но стабильная оценка локальных метрик карты вокруг агента.
 * Используется в GoalLab как входные world:map:* атомы.
 */
export function computeLocalMapMetrics(
  map: LocationMap | null | undefined,
  pos: { x: number; y: number } | null | undefined,
  radius = 1
): { danger: number; cover: number; obstacles: number; exits: any[]; exitsCount: number } {
  const w = Math.max(1, Number((map as any)?.width ?? 1));
  const h = Math.max(1, Number((map as any)?.height ?? 1));
  const px = Math.round(Number(pos?.x ?? 0));
  const py = Math.round(Number(pos?.y ?? 0));

  const cells = (map as any)?.cells || [];
  const byKey = new Map<string, any>();
  for (const c of cells) {
    if (!c) continue;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    byKey.set(cellKey(c.x, c.y), c);
  }

  const getCell = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    return byKey.get(cellKey(x, y)) || null;
  };

  let n = 0, sumDanger = 0, sumCover = 0, sumObst = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const c = getCell(px + dx, py + dy);
      if (!c) continue;
      const walkable = c.walkable !== false;
      const danger = clamp01(Number.isFinite(c.danger) ? c.danger : 0);
      const cover  = clamp01(Number.isFinite(c.cover)  ? c.cover  : 0);
      n += 1;
      sumDanger += danger;
      sumCover  += cover;
      sumObst   += walkable ? 0 : 1;
    }
  }

  const exits: any[] = [];
  const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
  for (const d of dirs) {
    const c = getCell(px + d.dx, py + d.dy);
    if (c && c.walkable !== false) exits.push({ x: px + d.dx, y: py + d.dy });
  }

  return {
    danger: clamp01(n ? sumDanger / n : 0),
    cover: clamp01(n ? sumCover / n : 0),
    obstacles: clamp01(n ? sumObst / n : 0),
    exits,
    exitsCount: exits.length,
  };
}

