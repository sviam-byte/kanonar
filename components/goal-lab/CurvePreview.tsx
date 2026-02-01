import React, { useMemo } from 'react';
import { curve01, type CurvePreset } from '../../lib/utils/curves';

type Props = {
  preset: CurvePreset;
  x: number;
  y?: number;
  width?: number;
  height?: number;
};

/**
 * Clamp any numeric value into [0..1] to keep the preview stable.
 */
function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Tiny curve preview widget with a highlighted (x, y) sample.
 */
export const CurvePreview: React.FC<Props> = ({ preset, x, y, width = 220, height = 70 }) => {
  const pad = 10;
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  const toX = (t: number) => pad + clamp01(t) * innerW;
  const toY = (t: number) => pad + (1 - clamp01(t)) * innerH;

  const pts = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      out.push(`${toX(t).toFixed(2)},${toY(curve01(t, preset)).toFixed(2)}`);
    }
    return out.join(' ');
  }, [preset, width, height]);

  const x0 = clamp01(x);
  const y0 = clamp01(typeof y === 'number' && Number.isFinite(y) ? y : curve01(x0, preset));

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} className="block">
        <rect x={pad} y={pad} width={innerW} height={innerH} fill="none" stroke="rgba(148,163,184,0.25)" />
        <polyline points={pts} fill="none" stroke="rgba(34,211,238,0.9)" strokeWidth={2} />
        <circle cx={toX(x0)} cy={toY(y0)} r={4} fill="rgba(16,185,129,0.9)" />
      </svg>
      <div className="text-[10px] text-canon-text-light/80 font-mono">
        x={x0.toFixed(2)} → y={y0.toFixed(2)}
        <div className="opacity-70">{preset}</div>
      </div>
    </div>
  );
};
