import React, { useMemo } from 'react';

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function getMapImage(loc: any): string | null {
  const img = loc?.map?.image ?? loc?.image ?? loc?.mapImage ?? null;
  if (typeof img !== 'string' || !img.length) return null;
  // normalize: "images/foo.png" -> "/images/foo.png"
  if (img.startsWith('images/')) return `/${img}`;
  return img;
}

function getMapSize(loc: any) {
  const w = loc?.map?.width ?? loc?.width ?? 1024;
  const h = loc?.map?.height ?? loc?.height ?? 768;
  return { w: Number.isFinite(w) ? w : 1024, h: Number.isFinite(h) ? h : 768 };
}

function nodePos(loc: any, nodeId: string | null | undefined) {
  const nodes = loc?.nav?.nodes ?? loc?.nodes ?? [];
  const n = nodes.find((x: any) => String(x?.id) === String(nodeId));
  if (!n) return null;
  return { x: Number(n.x ?? 0), y: Number(n.y ?? 0) };
}

export function LocationMapView({
  location,
  characters,
  highlightId,
  onPickCharacter,
}: {
  location: any;
  characters: any[];
  highlightId?: string | null;
  onPickCharacter?: (id: string) => void;
}) {
  const img = getMapImage(location);
  const { w, h } = getMapSize(location);

  const charsHere = useMemo(() => {
    const locId = location?.id;
    return (characters || []).filter((c: any) => (c?.locId ?? c?.locationId ?? c?.location_id) === locId);
  }, [characters, location?.id]);

  const nodes = location?.nav?.nodes ?? location?.nodes ?? [];

  return (
    <div className="canon-card p-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{location?.title ?? location?.id ?? 'Location'}</div>
        <div className="text-xs opacity-70">
          {img ? img : 'no map.image on this place'}
        </div>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-xl canon-border"
        style={{ aspectRatio: `${w} / ${h}` }}
      >
        {img ? (
          <img
            src={img}
            alt={location?.title ?? location?.id}
            className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-70 text-xs">
            Map image missing (expected location.map.image or location.image)
          </div>
        )}

        {/* overlay */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* nodes (optional) */}
          {nodes.map((n: any) => (
            <g key={String(n.id)}>
              <circle cx={n.x} cy={n.y} r={8} opacity={0.35} />
              <text x={n.x + 10} y={n.y + 4} fontSize={12} opacity={0.6}>
                {String(n.id)}
              </text>
            </g>
          ))}

          {/* characters */}
          {charsHere.map((c: any) => {
            const pos =
              (c?.pos?.x != null && c?.pos?.y != null)
                ? { x: Number(c.pos.x), y: Number(c.pos.y) }
                : nodePos(location, c?.pos?.nodeId ?? null);

            if (!pos) return null;

            const isHi = highlightId && String(highlightId) === String(c.id);
            const r = isHi ? 12 : 10;
            const alpha = clamp01(isHi ? 0.9 : 0.7);

            return (
              <g
                key={String(c.id)}
                style={{ cursor: onPickCharacter ? 'pointer' : 'default' }}
                onClick={() => onPickCharacter?.(String(c.id))}
              >
                <circle cx={pos.x} cy={pos.y} r={r} opacity={alpha} />
                <text x={pos.x + r + 4} y={pos.y + 4} fontSize={12} opacity={0.9}>
                  {c.title ?? c.name ?? c.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
