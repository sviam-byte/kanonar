import React, { useMemo } from 'react';
import { curve01, CurvePreset } from '../../lib/utils/curves';

type Props = {
  temperature: number;
  onTemperature: (next: number) => void;
  preset: CurvePreset;
  onPreset: (preset: CurvePreset) => void;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
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

/**
 * Compact curve inspector for the front Goal Lab view.
 * Designed to keep non-debug UX lightweight while still explainable.
 */
export const CurvesPanel: React.FC<Props> = ({ temperature, onTemperature, preset, onPreset }) => {
  const curvePoints = useMemo(() => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 50; i++) {
      const x = i / 50;
      pts.push({ x, y: curve01(x, preset) });
    }
    return pts;
  }, [preset]);

  const w = 520;
  const h = 180;
  const pad = 22;
  const { d, toX, toY } = buildPath(curvePoints, w, h, pad);

  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Decision curve</div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">preset</div>
            <select
              className="bg-black/30 border border-slate-800 rounded px-2 py-1 text-[10px] outline-none focus:border-cyan-500/50"
              value={preset}
              onChange={(e) => onPreset(e.target.value as CurvePreset)}
            >
              {(['linear', 'smoothstep', 'sqrt', 'sigmoid', 'pow2', 'pow4'] as const).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">temperature</div>
            <input
              type="range"
              min={0.1}
              max={5.0}
              step={0.05}
              value={temperature}
              onChange={(e) => onTemperature(Number(e.target.value))}
            />
            <div className="text-[10px] text-slate-200 tabular-nums w-10 text-right">
              {temperature.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">curve01(x)</div>
        <svg width={w} height={h} className="block">
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

          <path d={d} fill="none" stroke="rgba(34,211,238,0.9)" strokeWidth={2} />

          <circle
            cx={toX(0.5)}
            cy={toY(clamp01(curve01(0.5, preset)))}
            r={4}
            fill="rgba(16,185,129,0.9)"
          />

          <rect
            x={pad}
            y={pad}
            width={w - pad * 2}
            height={h - pad * 2}
            fill="none"
            stroke="rgba(148,163,184,0.25)"
            strokeWidth={1}
          />
        </svg>
      </div>
    </div>
  );
};
