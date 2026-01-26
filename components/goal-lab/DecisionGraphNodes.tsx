import React from 'react';
import type { NodeProps } from 'reactflow';

type BaseNodeData = {
  label: string;
  value?: number;
  subtitle?: string;
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
 * Circular node for source/context inputs.
 */
export const SourceNode: React.FC<NodeProps<BaseNodeData>> = ({ data }) => {
  const val = data?.value;
  const isActive = Number.isFinite(val) ? Math.abs(Number(val)) > 1e-6 : true;
  return (
    <div
      style={{
        width: 86,
        height: 86,
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: isActive ? 'rgba(15, 23, 42, 0.88)' : 'rgba(15, 23, 42, 0.45)',
        color: '#e2e8f0',
        padding: 8,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1 }}>{data?.label}</div>
      {Number.isFinite(val) ? (
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75, fontFamily: mono }}>{formatSmall(val)}</div>
      ) : null}
    </div>
  );
};

/**
 * Diamond node for lens/trait inputs.
 */
export const LensNode: React.FC<NodeProps<BaseNodeData>> = ({ data }) => {
  return (
    <div
      style={{
        width: 180,
        height: 56,
        transform: 'rotate(45deg)',
        borderRadius: 12,
        border: '1px solid rgba(217, 70, 239, 0.45)',
        background: 'rgba(217, 70, 239, 0.10)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#e2e8f0',
      }}
    >
      <div style={{ transform: 'rotate(-45deg)', textAlign: 'center', padding: '0 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1 }}>{data?.label}</div>
        {data?.subtitle ? (
          <div style={{ marginTop: 3, fontSize: 10, opacity: 0.75, fontFamily: mono }}>{data.subtitle}</div>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Larger rectangular node for goals.
 */
export const GoalNode: React.FC<NodeProps<BaseNodeData>> = ({ data, selected }) => {
  return (
    <div
      style={{
        width: 280,
        minHeight: 62,
        borderRadius: 14,
        padding: '10px 12px',
        border: `1px solid ${selected ? 'rgba(56, 189, 248, 0.75)' : 'rgba(148, 163, 184, 0.35)'}`,
        background: selected ? 'rgba(14, 116, 144, 0.28)' : 'rgba(15, 23, 42, 0.88)',
        color: '#e2e8f0',
        boxShadow: selected ? '0 0 0 1px rgba(56,189,248,0.35)' : 'none',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.15 }}>{data?.label}</div>
      {data?.subtitle ? (
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75 }}>{data.subtitle}</div>
      ) : null}
      {Number.isFinite(data?.value) ? (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85, fontFamily: mono }}>
          score: {formatSmall(data.value)}
        </div>
      ) : null}
    </div>
  );
};
