import React, { useMemo, useState, useEffect, useRef } from 'react';
import { EntityType, LocationEntity, HazardVolume, ZoneVolume, Vec3, Euler, VolumeShape } from '../types';
import { getEntitiesByType } from '../data';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
let __uidCounter = 0;
const uid = (p = "id") => `${p}-${Date.now().toString(16)}-${(__uidCounter++).toString(16)}`;

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

const Card: React.FC<{ title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  right,
  children,
  className,
}) => (
  <div className={cx('rounded-xl border border-canon-border bg-canon-bg/40', className)}>
    <div className="px-4 py-3 border-b border-canon-border flex items-center justify-between">
      <div className="text-xs font-bold tracking-wide text-canon-text uppercase">{title}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const Btn: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  kind?: 'ghost' | 'primary' | 'danger';
  title?: string;
}> = ({ onClick, disabled, children, kind = 'ghost', title }) => (
  <button
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={cx(
      'px-3 py-2 rounded-lg border text-xs font-bold transition',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      kind === 'ghost' && 'border-canon-border bg-transparent hover:bg-white/5 text-canon-text',
      kind === 'primary' && 'border-transparent bg-canon-accent/20 hover:bg-canon-accent/25 text-canon-text',
      kind === 'danger' && 'border-transparent bg-red-500/20 hover:bg-red-500/25 text-canon-text'
    )}
  >
    {children}
  </button>
);

const Inp: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={cx(
      'w-full px-3 py-2 rounded-lg border border-canon-border bg-canon-bg/40 text-xs text-canon-text',
      'placeholder:text-canon-text-light/40'
    )}
  />
);

const Sel: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select
    {...props}
    className={cx('w-full px-3 py-2 rounded-lg border border-canon-border bg-canon-bg/40 text-xs text-canon-text')}
  />
);

function num(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

function eul(yaw = 0, pitch = 0, roll = 0): Euler {
  return { yaw, pitch, roll };
}

type Draft = {
  entityId: string;
  title: string;
  description?: string;
  spatial: { pos: Vec3; rot: Euler; size: Vec3 };
  connections: Record<string, any>;
  hazardVolumes: HazardVolume[];
  zoneVolumes: ZoneVolume[];
};

function emptyDraft(): Draft {
  return {
    entityId: 'location-new',
    title: 'Новая Локация',
    description: '',
    spatial: { pos: v3(0, 0, 0), rot: eul(0, 0, 0), size: v3(20, 6, 20) },
    connections: {},
    hazardVolumes: [],
    zoneVolumes: [],
  };
}

function shapeLabel(s: VolumeShape) {
  if (s.kind === 'box') return `box ${s.size.x}×${s.size.y}×${s.size.z}`;
  if (s.kind === 'sphere') return `sphere r=${s.radius}`;
  return `cyl r=${s.radius} h=${s.height}`;
}

function toTSLocation(d: Draft): string {
  const obj: any = {
    type: EntityType.Location,
    entityId: d.entityId,
    title: d.title,
    description: d.description || undefined,
    spatial: {
      pos: d.spatial.pos,
      rot: d.spatial.rot,
      size: d.spatial.size,
    },
    connections: Object.keys(d.connections).length ? d.connections : undefined,
    hazardVolumes: d.hazardVolumes.length ? d.hazardVolumes : undefined,
    zoneVolumes: d.zoneVolumes.length ? d.zoneVolumes : undefined,
  };

  // чистим undefined
  const clean = JSON.parse(JSON.stringify(obj));

  return [
    `import { EntityType, LocationEntity } from '../types';`,
    ``,
    `export const ${d.entityId.replace(/[^a-zA-Z0-9_]/g, '_')}: LocationEntity = ${JSON.stringify(clean, null, 2)};`,
    ``,
  ].join('\n');
}

/**
 * Preview: топ-даун X/Z.
 * Ось X вправо, Z вниз. Y показываем в подписи, но не рисуем.
 */
function drawPreview(canvas: HTMLCanvasElement, d: Draft) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // bg
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.fillRect(0, 0, W, H);

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  const step = 24;
  for (let x = 0; x <= W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // world->screen mapping
  // центрируем draft.spatial.pos в центр канвы
  const scale = 6; // px per world unit (упрощенно)
  const cx0 = W / 2;
  const cy0 = H / 2;

  const toScreen = (p: Vec3) => {
    const dx = (p.x - d.spatial.pos.x) * scale;
    const dz = (p.z - d.spatial.pos.z) * scale;
    return { x: cx0 + dx, y: cy0 + dz };
  };

  // bbox location
  const half = { x: d.spatial.size.x / 2, z: d.spatial.size.z / 2 };
  const p1 = toScreen({ x: d.spatial.pos.x - half.x, y: 0, z: d.spatial.pos.z - half.z });
  const p2 = toScreen({ x: d.spatial.pos.x + half.x, y: 0, z: d.spatial.pos.z + half.z });

  ctx.fillStyle = 'rgba(102,217,255,0.08)';
  ctx.strokeStyle = 'rgba(102,217,255,0.35)';
  ctx.lineWidth = 2;
  ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
  ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);

  // hazards
  for (const hz of d.hazardVolumes) {
    const intensity = clamp01(hz.intensity);
    const c = toScreen(hz.transform.pos);

    ctx.strokeStyle = `rgba(255,92,122,${0.25 + intensity * 0.35})`;
    ctx.fillStyle = `rgba(255,92,122,${0.05 + intensity * 0.12})`;
    ctx.lineWidth = 2;

    if (hz.shape.kind === 'sphere') {
      const r = hz.shape.radius * scale;
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(2, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (hz.shape.kind === 'box') {
      const w = hz.shape.size.x * scale;
      const h = hz.shape.size.z * scale;
      ctx.fillRect(c.x - w / 2, c.y - h / 2, w, h);
      ctx.strokeRect(c.x - w / 2, c.y - h / 2, w, h);
    } else {
      // cylinder как circle в top-down
      const r = hz.shape.radius * scale;
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(2, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.font =
      '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    ctx.fillText(`${hz.hazardKind} ${Math.round(intensity * 100)}%`, c.x + 8, c.y - 8);
  }

  // title
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.fillText(`${d.entityId} · ${d.title}`, 14, 22);

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font =
    '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  ctx.fillText(
    `pos=(${d.spatial.pos.x},${d.spatial.pos.y},${d.spatial.pos.z}) size=(${d.spatial.size.x},${d.spatial.size.y},${d.spatial.size.z})`,
    14,
    42
  );
}

export const LocationConstructorPage: React.FC = () => {
  const allLocations = useMemo(() => getEntitiesByType(EntityType.Location) as LocationEntity[], []);
  const locationIds = useMemo(() => allLocations.map((l) => l.entityId).sort(), [allLocations]);

  const [baseId, setBaseId] = useState<string>('');
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [activeHazardId, setActiveHazardId] = useState<string | null>(null);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);

  const [exportText, setExportText] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // load base
  useEffect(() => {
    if (!baseId) return;
    const base = allLocations.find((l) => l.entityId === baseId);
    if (!base) return;

    const spatial = (base as any).spatial || { pos: v3(0, 0, 0), rot: eul(0, 0, 0), size: v3(20, 6, 20) };
    const hz = ((base as any).hazardVolumes || []) as HazardVolume[];
    const zones = ((base as any).zoneVolumes || []) as ZoneVolume[];

    setDraft({
      entityId: base.entityId + '_copy',
      title: (base.title || base.entityId) + ' (copy)',
      description: (base as any).description || '',
      spatial: {
        pos: { x: num(spatial.pos?.x, 0), y: num(spatial.pos?.y, 0), z: num(spatial.pos?.z, 0) },
        rot: { yaw: num(spatial.rot?.yaw, 0), pitch: num(spatial.rot?.pitch, 0), roll: num(spatial.rot?.roll, 0) },
        size: { x: num(spatial.size?.x, 20), y: num(spatial.size?.y, 6), z: num(spatial.size?.z, 20) },
      },
      connections: { ...(base.connections || {}) },
      hazardVolumes: hz.map((h) => ({ ...h, id: h.id || uid('hz') })),
      zoneVolumes: zones.map((z) => ({ ...z, id: z.id || uid('zone') })),
    });

    setActiveHazardId(null);
    setActiveZoneId(null);
  }, [baseId, allLocations]);

  // preview render
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // set fixed size for crispness
    const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const cssW = 980;
    const cssH = 520;
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    c.width = cssW * DPR;
    c.height = cssH * DPR;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawPreview(c, draft);
  }, [draft]);

  const activeHazard = useMemo(
    () => draft.hazardVolumes.find((h) => h.id === activeHazardId) || null,
    [draft.hazardVolumes, activeHazardId]
  );
  const activeZone = useMemo(
    () => draft.zoneVolumes.find((z) => z.id === activeZoneId) || null,
    [draft.zoneVolumes, activeZoneId]
  );

  function updateSpatial(path: 'pos' | 'rot' | 'size', key: keyof Vec3 | keyof Euler, value: number) {
    setDraft((d) => ({
      ...d,
      spatial: {
        ...d.spatial,
        [path]: { ...(d.spatial as any)[path], [key]: value },
      } as any,
    }));
  }

  function addConnection(toId: string) {
    if (!toId) return;
    setDraft((d) => {
      const next = { ...d.connections };
      if (!next[toId]) next[toId] = { cost: 1, tags: [] };
      return { ...d, connections: next };
    });
  }

  function removeConnection(toId: string) {
    setDraft((d) => {
      const next = { ...d.connections };
      delete next[toId];
      return { ...d, connections: next };
    });
  }

  function addHazard(kind: string) {
    const id = uid('hz');
    const hz: HazardVolume = {
      id,
      hazardKind: kind || 'radiation',
      intensity: 0.3,
      shape: { kind: 'sphere', radius: 6 },
      transform: { pos: { ...draft.spatial.pos } },
      falloff: { kind: 'linear', radius: 10 },
      tags: [],
    };
    setDraft((d) => ({ ...d, hazardVolumes: [...d.hazardVolumes, hz] }));
    setActiveHazardId(id);
  }

  function updateHazard(id: string, patch: Partial<HazardVolume>) {
    setDraft((d) => ({
      ...d,
      hazardVolumes: d.hazardVolumes.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
  }

  function updateHazardShape(id: string, shape: VolumeShape) {
    setDraft((d) => ({
      ...d,
      hazardVolumes: d.hazardVolumes.map((h) => (h.id === id ? { ...h, shape } : h)),
    }));
  }

  function deleteHazard(id: string) {
    setDraft((d) => ({ ...d, hazardVolumes: d.hazardVolumes.filter((h) => h.id !== id) }));
    setActiveHazardId((prev) => (prev === id ? null : prev));
  }

  function addZone(name: string) {
    const id = uid('zone');
    const z: ZoneVolume = {
      id,
      name: name || 'Zone',
      shape: { kind: 'box', size: { x: 8, y: 3, z: 8 } },
      transform: { pos: { ...draft.spatial.pos }, rot: { ...draft.spatial.rot } },
      tags: [],
    };
    setDraft((d) => ({ ...d, zoneVolumes: [...d.zoneVolumes, z] }));
    setActiveZoneId(id);
  }

  function updateZone(id: string, patch: Partial<ZoneVolume>) {
    setDraft((d) => ({
      ...d,
      zoneVolumes: d.zoneVolumes.map((z) => (z.id === id ? { ...z, ...patch } : z)),
    }));
  }

  function updateZoneShape(id: string, shape: VolumeShape) {
    setDraft((d) => ({
      ...d,
      zoneVolumes: d.zoneVolumes.map((z) => (z.id === id ? { ...z, shape } : z)),
    }));
  }

  function deleteZone(id: string) {
    setDraft((d) => ({ ...d, zoneVolumes: d.zoneVolumes.filter((z) => z.id !== id) }));
    setActiveZoneId((prev) => (prev === id ? null : prev));
  }

  function doExport() {
    setExportText(toTSLocation(draft));
  }

  async function copyExport() {
    const t = exportText || toTSLocation(draft);
    try {
      await navigator.clipboard.writeText(t);
      setExportText(t);
    } catch {
      setExportText(t);
    }
  }

  const [newHazKind, setNewHazKind] = useState('radiation');
  const [newZoneName, setNewZoneName] = useState('Checkpoint');
  const [newConnId, setNewConnId] = useState('');

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="text-lg font-bold text-canon-text">Конструктор Локаций</div>
        <div className="text-xs text-canon-text-light font-mono">3D pos/rot/size + hazard volumes + export to code</div>
        <div className="grow" />
        <Btn kind="primary" onClick={doExport}>
          Export TS
        </Btn>
        <Btn onClick={copyExport} title="Копировать в буфер">
          Copy
        </Btn>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* left */}
        <div className="col-span-4 flex flex-col gap-4">
          <Card
            title="Base (клонировать из канонара)"
            right={
              <Btn
                onClick={() => {
                  setBaseId('');
                  setDraft(emptyDraft());
                }}
              >
                New
              </Btn>
            }
          >
            <div className="space-y-2">
              <div className="text-[11px] text-canon-text-light">Выбери существующую локацию как основу (опционально)</div>
              <Sel value={baseId} onChange={(e) => setBaseId(e.target.value)}>
                <option value="">(none)</option>
                {locationIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </Sel>
            </div>
          </Card>

          <Card title="Meta">
            <div className="space-y-2">
              <div>
                <div className="text-[11px] text-canon-text-light mb-1">entityId</div>
                <Inp value={draft.entityId} onChange={(e) => setDraft((d) => ({ ...d, entityId: e.target.value }))} />
              </div>
              <div>
                <div className="text-[11px] text-canon-text-light mb-1">title</div>
                <Inp value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              </div>
              <div>
                <div className="text-[11px] text-canon-text-light mb-1">description (optional)</div>
                <Inp
                  value={draft.description || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </div>
            </div>
          </Card>

          <Card title="Spatial (3D)">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-[11px] text-canon-text-light mb-1">pos.x</div>
                <Inp value={String(draft.spatial.pos.x)} onChange={(e) => updateSpatial('pos', 'x', num(e.target.value, 0))} />
              </div>
              <div>
                <div className="text-[11px] text-canon-text-light mb-1">pos.y</div>
                <Inp value={String(draft.spatial.pos.y)} onChange={(e) => updateSpatial('pos', 'y', num(e.target.value, 0))} />
              </div>
              <div>
                <div className="text-[11px] text-canon-text-light mb-1">pos.z</div>
                <Inp value={String(draft.spatial.pos.z)} onChange={(e) => updateSpatial('pos', 'z', num(e.target.value, 0))} />
              </div>

              <div>
                <div className="text-[11px] text-canon-text-light mb-1">yaw</div>
                <Inp value={String(draft.spatial.rot.yaw)} onChange={(e) => updateSpatial('rot', 'yaw', num(e.target.value, 0))} />
              </div>
              <div>
                <div className="text-[11px] text-canon-text-light mb-1">pitch</div>
                <Inp value={String(draft.spatial.rot.pitch)} onChange={(e) => updateSpatial('rot', 'pitch', num(e.target.value, 0))} />
              </div>
              <div>
                <div className="text-[11px] text-canon-text-light mb-1">roll</div>
                <Inp value={String(draft.spatial.rot.roll)} onChange={(e) => updateSpatial('rot', 'roll', num(e.target.value, 0))} />
              </div>

              <div>
                <div className="text-[11px] text-canon-text-light mb-1">size.x</div>
                <Inp value={String(draft.spatial.size.x)} onChange={(e) => updateSpatial('size', 'x', num(e.target.value, 20))} />
              </div>
              <div>
                <div className="text-[11px] text-canon-text-light mb-1">size.y</div>
                <Inp value={String(draft.spatial.size.y)} onChange={(e) => updateSpatial('size', 'y', num(e.target.value, 6))} />
              </div>
              <div>
                <div className="text-[11px] text-canon-text-light mb-1">size.z</div>
                <Inp value={String(draft.spatial.size.z)} onChange={(e) => updateSpatial('size', 'z', num(e.target.value, 20))} />
              </div>
            </div>
          </Card>

          <Card title="Connections">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Sel value={newConnId} onChange={(e) => setNewConnId(e.target.value)}>
                  <option value="">select location...</option>
                  {locationIds
                    .filter((id) => id !== draft.entityId)
                    .map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                </Sel>
                <Btn
                  onClick={() => {
                    addConnection(newConnId);
                    setNewConnId('');
                  }}
                  disabled={!newConnId}
                >
                  Add
                </Btn>
              </div>
              <div className="space-y-1 max-h-[200px] overflow-auto">
                {Object.keys(draft.connections).length === 0 && (
                  <div className="text-[11px] text-canon-text-light">нет связей</div>
                )}
                {Object.keys(draft.connections)
                  .sort()
                  .map((id) => (
                    <div key={id} className="flex items-center justify-between gap-2 px-2 py-2 rounded border border-canon-border bg-canon-bg/20">
                      <div className="text-xs font-mono text-canon-text truncate">{id}</div>
                      <Btn kind="danger" onClick={() => removeConnection(id)}>
                        Del
                      </Btn>
                    </div>
                  ))}
              </div>
            </div>
          </Card>
        </div>

        {/* center preview */}
        <div className="col-span-8 flex flex-col gap-4">
          <Card title="Preview (top-down X/Z)">
            <div className="overflow-hidden rounded-lg border border-canon-border bg-black/20">
              <canvas ref={canvasRef} />
            </div>
            <div className="mt-2 text-[11px] text-canon-text-light">
              Hazards рисуются в X/Z. Y хранится в данных (pos.y/size.y/height).
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card
              title="Hazard Volumes"
              right={
                <div className="flex items-center gap-2">
                  <Inp value={newHazKind} onChange={(e) => setNewHazKind(e.target.value)} placeholder="kind" />
                  <Btn onClick={() => addHazard(newHazKind)}>Add</Btn>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-[11px] text-canon-text-light">Список</div>
                  <div className="space-y-1 max-h-[240px] overflow-auto">
                    {draft.hazardVolumes.length === 0 && (
                      <div className="text-[11px] text-canon-text-light">нет hazards</div>
                    )}
                    {draft.hazardVolumes.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => setActiveHazardId(h.id)}
                        className={cx(
                          'w-full text-left px-2 py-2 rounded border text-xs',
                          activeHazardId === h.id
                            ? 'border-canon-accent bg-canon-accent/10'
                            : 'border-canon-border bg-canon-bg/20 hover:bg-white/5'
                        )}
                      >
                        <div className="font-mono text-canon-text">{h.id}</div>
                        <div className="text-[11px] text-canon-text-light">
                          {h.hazardKind} · {shapeLabel(h.shape)} · {Math.round(clamp01(h.intensity) * 100)}%
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] text-canon-text-light">Inspector</div>
                  {!activeHazard && <div className="text-[11px] text-canon-text-light">выбери hazard</div>}
                  {activeHazard && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="grow">
                          <div className="text-[11px] text-canon-text-light mb-1">kind</div>
                          <Inp
                            value={activeHazard.hazardKind}
                            onChange={(e) => updateHazard(activeHazard.id, { hazardKind: e.target.value })}
                          />
                        </div>
                        <div className="w-24">
                          <div className="text-[11px] text-canon-text-light mb-1">int</div>
                          <Inp
                            value={String(activeHazard.intensity)}
                            onChange={(e) => updateHazard(activeHazard.id, { intensity: clamp01(num(e.target.value, 0.3)) })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-[11px] text-canon-text-light mb-1">pos.x</div>
                          <Inp
                            value={String(activeHazard.transform.pos.x)}
                            onChange={(e) =>
                              updateHazard(activeHazard.id, {
                                transform: { ...activeHazard.transform, pos: { ...activeHazard.transform.pos, x: num(e.target.value, 0) } },
                              })
                            }
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-canon-text-light mb-1">pos.y</div>
                          <Inp
                            value={String(activeHazard.transform.pos.y)}
                            onChange={(e) =>
                              updateHazard(activeHazard.id, {
                                transform: { ...activeHazard.transform, pos: { ...activeHazard.transform.pos, y: num(e.target.value, 0) } },
                              })
                            }
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-canon-text-light mb-1">pos.z</div>
                          <Inp
                            value={String(activeHazard.transform.pos.z)}
                            onChange={(e) =>
                              updateHazard(activeHazard.id, {
                                transform: { ...activeHazard.transform, pos: { ...activeHazard.transform.pos, z: num(e.target.value, 0) } },
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <div className="grow">
                          <div className="text-[11px] text-canon-text-light mb-1">shape</div>
                          <Sel
                            value={activeHazard.shape.kind}
                            onChange={(e) => {
                              const k = e.target.value as any;
                              if (k === 'sphere') updateHazardShape(activeHazard.id, { kind: 'sphere', radius: 6 });
                              else if (k === 'box') updateHazardShape(activeHazard.id, { kind: 'box', size: { x: 8, y: 3, z: 8 } });
                              else updateHazardShape(activeHazard.id, { kind: 'cylinder', radius: 5, height: 4 });
                            }}
                          >
                            <option value="sphere">sphere</option>
                            <option value="box">box</option>
                            <option value="cylinder">cylinder</option>
                          </Sel>
                        </div>
                        <Btn kind="danger" onClick={() => deleteHazard(activeHazard.id)}>
                          Delete
                        </Btn>
                      </div>

                      {/* shape params */}
                      {activeHazard.shape.kind === 'sphere' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">radius</div>
                            <Inp
                              value={String(activeHazard.shape.radius)}
                              onChange={(e) =>
                                updateHazardShape(activeHazard.id, {
                                  kind: 'sphere',
                                  radius: Math.max(0.1, num(e.target.value, 6)),
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                      {activeHazard.shape.kind === 'box' && (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">sx</div>
                            <Inp
                              value={String(activeHazard.shape.size.x)}
                              onChange={(e) =>
                                updateHazardShape(activeHazard.id, {
                                  kind: 'box',
                                  size: { ...activeHazard.shape.size, x: Math.max(0.1, num(e.target.value, 8)) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">sy</div>
                            <Inp
                              value={String(activeHazard.shape.size.y)}
                              onChange={(e) =>
                                updateHazardShape(activeHazard.id, {
                                  kind: 'box',
                                  size: { ...activeHazard.shape.size, y: Math.max(0.1, num(e.target.value, 3)) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">sz</div>
                            <Inp
                              value={String(activeHazard.shape.size.z)}
                              onChange={(e) =>
                                updateHazardShape(activeHazard.id, {
                                  kind: 'box',
                                  size: { ...activeHazard.shape.size, z: Math.max(0.1, num(e.target.value, 8)) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                      {activeHazard.shape.kind === 'cylinder' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">radius</div>
                            <Inp
                              value={String(activeHazard.shape.radius)}
                              onChange={(e) =>
                                updateHazardShape(activeHazard.id, {
                                  kind: 'cylinder',
                                  radius: Math.max(0.1, num(e.target.value, 5)),
                                  height: activeHazard.shape.height,
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">height</div>
                            <Inp
                              value={String(activeHazard.shape.height)}
                              onChange={(e) =>
                                updateHazardShape(activeHazard.id, {
                                  kind: 'cylinder',
                                  radius: activeHazard.shape.radius,
                                  height: Math.max(0.1, num(e.target.value, 4)),
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card
              title="Zones (optional)"
              right={
                <div className="flex items-center gap-2">
                  <Inp value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} placeholder="name" />
                  <Btn onClick={() => addZone(newZoneName)}>Add</Btn>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-[11px] text-canon-text-light">Список</div>
                  <div className="space-y-1 max-h-[240px] overflow-auto">
                    {draft.zoneVolumes.length === 0 && <div className="text-[11px] text-canon-text-light">нет zones</div>}
                    {draft.zoneVolumes.map((z) => (
                      <button
                        key={z.id}
                        onClick={() => setActiveZoneId(z.id)}
                        className={cx(
                          'w-full text-left px-2 py-2 rounded border text-xs',
                          activeZoneId === z.id
                            ? 'border-canon-accent bg-canon-accent/10'
                            : 'border-canon-border bg-canon-bg/20 hover:bg-white/5'
                        )}
                      >
                        <div className="font-mono text-canon-text">{z.id}</div>
                        <div className="text-[11px] text-canon-text-light">
                          {z.name} · {shapeLabel(z.shape)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] text-canon-text-light">Inspector</div>
                  {!activeZone && <div className="text-[11px] text-canon-text-light">выбери zone</div>}
                  {activeZone && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="grow">
                          <div className="text-[11px] text-canon-text-light mb-1">name</div>
                          <Inp value={activeZone.name} onChange={(e) => updateZone(activeZone.id, { name: e.target.value })} />
                        </div>
                        <Btn kind="danger" onClick={() => deleteZone(activeZone.id)}>
                          Delete
                        </Btn>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-[11px] text-canon-text-light mb-1">pos.x</div>
                          <Inp
                            value={String(activeZone.transform.pos.x)}
                            onChange={(e) =>
                              updateZone(activeZone.id, {
                                transform: { ...activeZone.transform, pos: { ...activeZone.transform.pos, x: num(e.target.value, 0) } },
                              })
                            }
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-canon-text-light mb-1">pos.y</div>
                          <Inp
                            value={String(activeZone.transform.pos.y)}
                            onChange={(e) =>
                              updateZone(activeZone.id, {
                                transform: { ...activeZone.transform, pos: { ...activeZone.transform.pos, y: num(e.target.value, 0) } },
                              })
                            }
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-canon-text-light mb-1">pos.z</div>
                          <Inp
                            value={String(activeZone.transform.pos.z)}
                            onChange={(e) =>
                              updateZone(activeZone.id, {
                                transform: { ...activeZone.transform, pos: { ...activeZone.transform.pos, z: num(e.target.value, 0) } },
                              })
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] text-canon-text-light mb-1">shape</div>
                        <Sel
                          value={activeZone.shape.kind}
                          onChange={(e) => {
                            const k = e.target.value as any;
                            if (k === 'sphere') updateZoneShape(activeZone.id, { kind: 'sphere', radius: 6 });
                            else if (k === 'box') updateZoneShape(activeZone.id, { kind: 'box', size: { x: 8, y: 3, z: 8 } });
                            else updateZoneShape(activeZone.id, { kind: 'cylinder', radius: 5, height: 4 });
                          }}
                        >
                          <option value="box">box</option>
                          <option value="sphere">sphere</option>
                          <option value="cylinder">cylinder</option>
                        </Sel>
                      </div>

                      {activeZone.shape.kind === 'sphere' && (
                        <div>
                          <div className="text-[11px] text-canon-text-light mb-1">radius</div>
                          <Inp
                            value={String(activeZone.shape.radius)}
                            onChange={(e) =>
                              updateZoneShape(activeZone.id, { kind: 'sphere', radius: Math.max(0.1, num(e.target.value, 6)) })
                            }
                          />
                        </div>
                      )}
                      {activeZone.shape.kind === 'box' && (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">sx</div>
                            <Inp
                              value={String(activeZone.shape.size.x)}
                              onChange={(e) =>
                                updateZoneShape(activeZone.id, {
                                  kind: 'box',
                                  size: { ...activeZone.shape.size, x: Math.max(0.1, num(e.target.value, 8)) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">sy</div>
                            <Inp
                              value={String(activeZone.shape.size.y)}
                              onChange={(e) =>
                                updateZoneShape(activeZone.id, {
                                  kind: 'box',
                                  size: { ...activeZone.shape.size, y: Math.max(0.1, num(e.target.value, 3)) },
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">sz</div>
                            <Inp
                              value={String(activeZone.shape.size.z)}
                              onChange={(e) =>
                                updateZoneShape(activeZone.id, {
                                  kind: 'box',
                                  size: { ...activeZone.shape.size, z: Math.max(0.1, num(e.target.value, 8)) },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                      {activeZone.shape.kind === 'cylinder' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">radius</div>
                            <Inp
                              value={String(activeZone.shape.radius)}
                              onChange={(e) =>
                                updateZoneShape(activeZone.id, {
                                  kind: 'cylinder',
                                  radius: Math.max(0.1, num(e.target.value, 5)),
                                  height: activeZone.shape.height,
                                })
                              }
                            />
                          </div>
                          <div>
                            <div className="text-[11px] text-canon-text-light mb-1">height</div>
                            <Inp
                              value={String(activeZone.shape.height)}
                              onChange={(e) =>
                                updateZoneShape(activeZone.id, {
                                  kind: 'cylinder',
                                  radius: activeZone.shape.radius,
                                  height: Math.max(0.1, num(e.target.value, 4)),
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <Card title="Export (TS)">
            <div className="flex gap-2 mb-2">
              <Btn kind="primary" onClick={doExport}>
                Generate
              </Btn>
              <Btn onClick={copyExport}>Copy</Btn>
              <Btn onClick={() => setExportText('')}>Clear</Btn>
            </div>
            <textarea
              value={exportText}
              onChange={(e) => setExportText(e.target.value)}
              className="w-full h-[260px] rounded-lg border border-canon-border bg-canon-bg/40 text-xs text-canon-text font-mono p-3"
              placeholder="Нажми Export TS…"
            />
            <div className="mt-2 text-[11px] text-canon-text-light">
              Вставляй экспорт в `data/entities/...` или куда ты складываешь сущности. Этот лаб код не пишет сам — только генерит.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
