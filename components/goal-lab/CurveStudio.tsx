import React, { useMemo, useState } from 'react';
import { curve01, CurvePreset } from '../../lib/utils/curves';

type AtomLike = { id?: string; magnitude?: number; m?: number };

type Props = {
  selfId: string;
  atoms: AtomLike[];
  preset: CurvePreset;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getAtomMag(atoms: AtomLike[], id: string, fb = 0): number {
  const a = (atoms || []).find((x) => String((x as any)?.id) === id) as any;
  const v = a?.magnitude ?? a?.m;
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function prioToMultiplier(prio01: number): number {
  return 0.60 + 0.80 * clamp01(prio01);
}

function computeContextWeight(maxSignal01: number, preset: CurvePreset): number {
  const m = curve01(clamp01(maxSignal01), preset);
  return 0.35 + 0.65 * m;
}

function buildPath(points: Array<{ x: number; y: number }>, w: number, h: number, pad: number) {
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const toX = (x: number) => pad + x * innerW;
  const toY = (y: number) => pad + (1 - y) * innerH;

  let d = '';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const X = toX(p.x);
    const Y = toY(p.y);
    d += i === 0 ? `M ${X.toFixed(2)} ${Y.toFixed(2)}` : ` L ${X.toFixed(2)} ${Y.toFixed(2)}`;
  }
  return { d, toX, toY };
}

const AxisLegend: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <div className="flex items-center justify-between gap-3 text-[10px] border border-slate-800 rounded px-2 py-1 bg-black/20">
      <div className="text-slate-400 uppercase tracking-widest">{label}</div>
      <div className="text-slate-200 font-bold tabular-nums">{value}</div>
    </div>
  );
};

export const CurveStudio: React.FC<Props> = ({ selfId, atoms, preset }) => {
  const danger = clamp01(getAtomMag(atoms, `ctx:danger:${selfId}`, 0));
  const unc = clamp01(getAtomMag(atoms, `ctx:uncertainty:${selfId}`, 0));
  const time = clamp01(getAtomMag(atoms, `ctx:timePressure:${selfId}`, 0));
  const norm = clamp01(getAtomMag(atoms, `ctx:normPressure:${selfId}`, 0));
  const maxSignal = Math.max(danger, unc, time, norm);
  const ctxW = computeContextWeight(maxSignal, preset);

  const axisPrios = useMemo(() => {
    const out: Array<{ axis: string; prio: number; mul: number }> = [];
    const suffix = `:${selfId}`;
    for (const a of atoms || []) {
      const id = String((a as any)?.id || '');
      if (!id.startsWith('ctx:prio:')) continue;
      if (!id.endsWith(suffix)) continue;
      const axis = id.slice('ctx:prio:'.length, id.length - suffix.length);
      const prio = clamp01(getAtomMag(atoms, id, 0.5));
      out.push({ axis, prio, mul: prioToMultiplier(prio) });
    }
    out.sort((a, b) => b.prio - a.prio);
    return out;
  }, [atoms, selfId]);

  const [selectedAxis, setSelectedAxis] = useState<string>(() => axisPrios[0]?.axis || '');

  const selected = axisPrios.find((x) => x.axis === selectedAxis) || axisPrios[0] || null;

  const w = 520;
  const h = 180;
  const pad = 22;

  const curvePoints = useMemo(() => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 50; i++) {
      const x = i / 50;
      pts.push({ x, y: curve01(x, preset) });
    }
    return pts;
  }, [preset]);

  const ctxWPoints = useMemo(() => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 50; i++) {
      const x = i / 50;
      pts.push({ x, y: computeContextWeight(x, preset) });
    }
    // Normalize 0.35..1.0 -> 0..1 for the chart.
    const normPts = pts.map((p) => ({ x: p.x, y: clamp01((p.y - 0.35) / 0.65) }));
    return { raw: pts, norm: normPts };
  }, [preset]);

  const mkChart = (
    title: string,
    points01: Array<{ x: number; y: number }>,
    marker?: { x: number; y: number; label?: string }
  ) => {
    const { d, toX, toY } = buildPath(points01, w, h, pad);

    return (
      <div className="border border-slate-800 rounded-lg bg-slate-950/30 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">{title}</div>
          <div className="text-[10px] text-slate-500">
            preset: <span className="text-slate-200 font-bold">{preset}</span>
          </div>
        </div>
        <div className="p-3">
          <svg width={w} height={h} className="block">
            {/* grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line
                  x1={pad}
                  y1={pad + (1 - t) * (h - pad * 2)}
                  x2={w - pad}
                  y2={pad + (1 - t) * (h - pad * 2)}
                  stroke="rgba(148,163,184,0.15)"
                  strokeWidth={1}
                />
                <line
                  x1={pad + t * (w - pad * 2)}
                  y1={pad}
                  x2={pad + t * (w - pad * 2)}
                  y2={h - pad}
                  stroke="rgba(148,163,184,0.10)"
                  strokeWidth={1}
                />
              </g>
            ))}

            {/* curve */}
            <path d={d} fill="none" stroke="rgba(34,211,238,0.9)" strokeWidth={2} />

            {/* marker */}
            {marker ? (
              <g>
                <circle cx={toX(marker.x)} cy={toY(marker.y)} r={5} fill="rgba(16,185,129,0.95)" />
                {marker.label ? (
                  <text
                    x={toX(marker.x) + 8}
                    y={toY(marker.y) - 8}
                    fontSize={10}
                    fill="rgba(226,232,240,0.85)"
                  >
                    {marker.label}
                  </text>
                ) : null}
              </g>
            ) : null}

            {/* axes */}
            <rect
              x={pad}
              y={pad}
              width={w - pad * 2}
              height={h - pad * 2}
              fill="none"
              stroke="rgba(148,163,184,0.25)"
              strokeWidth={1}
            />

            <text x={pad} y={h - 6} fontSize={10} fill="rgba(148,163,184,0.7)">
              0
            </text>
            <text x={w - pad - 8} y={h - 6} fontSize={10} fill="rgba(148,163,184,0.7)">
              1
            </text>
            <text x={6} y={pad + 4} fontSize={10} fill="rgba(148,163,184,0.7)">
              1
            </text>
            <text x={6} y={h - pad} fontSize={10} fill="rgba(148,163,184,0.7)">
              0
            </text>
          </svg>
        </div>
      </div>
    );
  };

  const ctxWeightMarker = {
    x: maxSignal,
    // Marker plotted on normalized chart (0.35..1.0 -> 0..1).
    y: clamp01((ctxW - 0.35) / 0.65),
    label: `ctxW=${ctxW.toFixed(2)} (x=${maxSignal.toFixed(2)})`,
  };

  const prioMarker = selected
    ? {
        x: selected.prio,
        y: clamp01((selected.mul - 0.60) / 0.80),
        label: `${selected.axis}: prio=${selected.prio.toFixed(2)} → x${selected.mul.toFixed(2)}`,
      }
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">Curves</div>
        <div className="text-[10px] text-slate-400">
          Visualizing how inputs are warped before they hit goal logits.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {mkChart(
          'curve01(x) • non-linear response',
          curvePoints,
          {
            x: maxSignal,
            y: curve01(maxSignal, preset),
            label: `x=${maxSignal.toFixed(2)} → y=${curve01(maxSignal, preset).toFixed(2)}`,
          }
        )}

        {mkChart('contextWeight(x) • 0.35..1.0 (normalized)', ctxWPoints.norm, ctxWeightMarker)}
      </div>

      <div className="border border-slate-800 rounded-lg bg-slate-950/30 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">
            prioToMultiplier(prio) • per-axis scaling
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[10px] text-slate-500">axis</div>
            <select
              className="bg-black/30 border border-slate-800 rounded px-2 py-1 text-[10px] outline-none focus:border-cyan-500/50"
              value={selectedAxis}
              onChange={(e) => setSelectedAxis(e.target.value)}
            >
              {(axisPrios || []).map((p) => (
                <option key={p.axis} value={p.axis}>
                  {p.axis}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {mkChart(
            'prio → multiplier (normalized)',
            Array.from({ length: 51 }, (_, i) => {
              const x = i / 50;
              const y01 = clamp01((prioToMultiplier(x) - 0.60) / 0.80);
              return { x, y: y01 };
            }),
            prioMarker
          )}

          <div className="border border-slate-800 rounded-lg bg-black/20 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Current inputs</div>
            <div className="grid grid-cols-2 gap-2">
              <AxisLegend label="danger" value={danger.toFixed(2)} />
              <AxisLegend label="uncertainty" value={unc.toFixed(2)} />
              <AxisLegend label="timePressure" value={time.toFixed(2)} />
              <AxisLegend label="normPressure" value={norm.toFixed(2)} />
              <AxisLegend label="maxSignal" value={maxSignal.toFixed(2)} />
              <AxisLegend label="contextWeight" value={ctxW.toFixed(2)} />
            </div>

            <div className="pt-2 border-t border-slate-800">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">
                Top priorities
              </div>
              <div className="space-y-1 max-h-[180px] overflow-auto custom-scrollbar pr-1">
                {(axisPrios || []).slice(0, 12).map((p) => (
                  <div
                    key={p.axis}
                    className={`flex items-center justify-between gap-2 text-[10px] px-2 py-1 rounded border ${
                      p.axis === selectedAxis ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-slate-800 bg-black/10'
                    }`}
                  >
                    <div className="text-slate-200 font-semibold truncate">{p.axis}</div>
                    <div className="text-slate-500 tabular-nums">
                      prio {p.prio.toFixed(2)} → x{p.mul.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
