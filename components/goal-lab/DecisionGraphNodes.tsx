import React from 'react';
import type { NodeProps } from 'reactflow';

type BaseNodeData = {
  label: string;
  value?: number;
  subtitle?: string;
  /** 0..1 energy value from spread */
  energy?: number;
  /** 0..1 importance value derived from base weights */
  importance?: number;
};

const mono =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

/**
 * Compact numeric formatting for node badges.
 */
function formatSmall(v?: number): string {
  const x = Number(v);
  if (!Number.isFinite(x)) return '';
  const rounded = Math.round(x * 100) / 100;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

/**
 * Clamp any numeric value into the [0..1] range.
 */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Render energy/importance badges when values are available.
 */
function Badges({ energy, importance }: { energy?: number; importance?: number }) {
  const eRaw = Number(energy);
  const impRaw = Number(importance);
  const e = clamp01(eRaw);
  const imp = clamp01(impRaw);
  if (!Number.isFinite(eRaw) && !Number.isFinite(impRaw)) return null;
  return (
    <div style={{ marginTop: 6, display: 'flex', gap: 6, justifyContent: 'center' }}>
      {Number.isFinite(eRaw) ? (
        <span
          style={{
            padding: '2px 6px',
            borderRadius: 999,
            fontSize: 9,
            fontFamily: mono,
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.35)',
          }}
        >
          E:{e.toFixed(2)}
        </span>
      ) : null}
      {Number.isFinite(impRaw) ? (
        <span
          style={{
            padding: '2px 6px',
            borderRadius: 999,
            fontSize: 9,
            fontFamily: mono,
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
          }}
        >
          imp:{imp.toFixed(2)}
        </span>
      ) : null}
    </div>
  );
}

function RectNode({
  data,
  selected,
  accent = 'rgba(148,163,184,0.35)',
  glow = 'rgba(56,189,248,0.22)',
  width = 280,
}: {
  data?: BaseNodeData;
  selected?: boolean;
  accent?: string;
  glow?: string;
  width?: number;
}) {
  const energyRaw = Number(data?.energy);
  const importanceRaw = Number(data?.importance);
  const energy = clamp01(energyRaw);
  const importance = clamp01(importanceRaw);
  const intensity = Math.max(energy, importance);

  return (
    <div
      style={{
        width,
        minHeight: 62,
        borderRadius: 14,
        padding: '10px 12px',
        border: `1px solid ${selected ? 'rgba(56, 189, 248, 0.75)' : accent}`,
        background: selected ? 'rgba(14, 116, 144, 0.18)' : 'rgba(15, 23, 42, 0.88)',
        color: '#e2e8f0',
        boxShadow: intensity > 0 ? `0 0 ${6 + intensity * 14}px ${glow}` : 'none',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.15 }}>{data?.label}</div>
      {data?.subtitle ? (
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75, fontFamily: mono, whiteSpace: 'pre-line' }}>
          {data.subtitle}
        </div>
      ) : null}
      {Number.isFinite(data?.value) ? (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85, fontFamily: mono }}>
          score: {formatSmall(data?.value)}
        </div>
      ) : null}
      <Badges energy={energyRaw} importance={importanceRaw} />
    </div>
  );
}

/**
 * Source/context inputs — now rectangular (no circles).
 */
export const SourceNode: React.FC<NodeProps<BaseNodeData>> = ({ data }) => {
  return (
    <RectNode
      data={data}
      width={260}
      accent="rgba(148,163,184,0.30)"
      glow="rgba(250,204,21,0.20)"
    />
  );
};

/**
 * Lens/traits — now rectangular (no diamonds).
 */
export const LensNode: React.FC<NodeProps<BaseNodeData>> = ({ data }) => {
  return (
    <RectNode
      data={data}
      width={260}
      accent="rgba(217,70,239,0.35)"
      glow="rgba(217,70,239,0.22)"
    />
  );
};

/**
 * Larger rectangular node for goals.
 */
export const GoalNode: React.FC<NodeProps<BaseNodeData>> = ({ data, selected }) => {
  return (
    <RectNode
      data={data}
      selected={selected}
      width={300}
      accent="rgba(148,163,184,0.35)"
      glow="rgba(34,197,94,0.20)"
    />
  );
};
