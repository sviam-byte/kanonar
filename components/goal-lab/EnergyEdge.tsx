import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';

type EnergyEdgeData = {
  /** raw weight (can be negative) */
  weight?: number;
  /** optional original weight if `weight` is used for flow */
  rawWeight?: number;
  /** precomputed 0..1 */
  strength?: number;
  /** label text shown above the edge */
  label?: string;
  /** optional diagnostics for "why this edge exists" */
  meta?: {
    atomId?: string;
    source?: string;
    formula?: string;
    explanation?: string;
  };
};

/**
 * Clamp any number into the [0..1] range.
 * This keeps UI styling stable even if inputs are noisy.
 */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Custom edge that renders a colored path, an optional label,
 * and an animated "energy" dot flowing along the edge.
 */
export const EnergyEdge: React.FC<EdgeProps<EnergyEdgeData>> = (props) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
  } = props;

  const weight = Number(data?.weight ?? data?.rawWeight ?? 0);
  const isPositive = weight >= 0;
  const strength = clamp01(Number(data?.strength ?? Math.abs(weight)));

  // Slightly faster dots for stronger edges.
  const durSec = (2.8 / Math.max(0.2, 0.35 + strength)).toFixed(2);
  const dotRadius = 2.5 + strength * 2.0;

  const stroke = isPositive ? '#22c55e' : '#ef4444';
  const opacity = Math.max(0.18, 0.15 + strength);
  const strokeWidth = Math.max(1, 1 + strength * 5);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const label = typeof data?.label === 'string'
    ? data.label
    : `${weight >= 0 ? '+' : ''}${weight.toFixed(2)}`;

  const meta = data?.meta;
  const metaText = meta
    ? [
        meta.atomId ? `atom: ${meta.atomId}` : null,
        meta.source ? `source: ${meta.source}` : null,
        meta.formula ? `formula: ${meta.formula}` : null,
        meta.explanation ? `note: ${meta.explanation}` : null,
      ].filter(Boolean).join('\n')
    : '';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth,
          opacity,
          ...style,
        }}
      />

      {/* Moving energy dot (SVG animateMotion). */}
      {strength >= 0.12 ? (
        <g>
          <circle r={dotRadius} fill={stroke} opacity={Math.max(0.18, opacity)}>
            <animateMotion dur={`${durSec}s`} repeatCount="indefinite" path={edgePath} />
          </circle>
        </g>
      ) : null}

      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: metaText ? 'auto' : 'none',
              fontSize: 10,
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              color: stroke,
              opacity: Math.max(0.35, opacity),
              background: 'rgba(2, 6, 23, 0.65)',
              border: `1px solid rgba(148, 163, 184, 0.22)`,
              padding: '2px 6px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
            }}
            title={metaText || undefined}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
};
