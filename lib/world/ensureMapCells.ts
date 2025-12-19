import { LocationMap, LocationMapCell } from "../../types";

export function ensureMapCells(map: LocationMap): LocationMap {
  const w = Math.max(1, map.width || 1);
  const h = Math.max(1, map.height || 1);

  const defWalkable = map.defaultWalkable ?? true;
  const defDanger = map.defaultDanger ?? 0;
  const defCover = map.defaultCover ?? 0;

  const existing = new Map<string, LocationMapCell>();
  for (const c of (map.cells || [])) {
    if (!c) continue;
    if (!Number.isFinite((c as any).x) || !Number.isFinite((c as any).y)) continue;
    existing.set(`${(c as any).x},${(c as any).y}`, c as any);
  }

  const cells: LocationMapCell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const key = `${x},${y}`;
      const c = existing.get(key);
      if (c) {
        cells.push({
          ...c,
          walkable: c.walkable ?? defWalkable,
          danger: Number.isFinite(c.danger) ? c.danger : defDanger,
          cover: Number.isFinite(c.cover) ? c.cover : defCover,
        });
      } else {
        cells.push({
          x,
          y,
          walkable: defWalkable,
          danger: defDanger,
          cover: defCover,
          elevation: 0,
          maxOccupancy: defWalkable ? 1 : 0,
        });
      }
    }
  }

  return { ...map, width: w, height: h, cells };
}
