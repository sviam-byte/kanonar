import React from 'react';
import type { NodeProps } from 'reactflow';

type BaseNodeData = {
  label: string;
  value?: number;
  subtitle?: string;
  /** spread energy (0..1) */
  energy?: number;
  /** normalized importance (0..1) */
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
 * Clamp helper for optional energy/importance metadata.
 */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Shared badges for energy + importance overlays.
 */
function NodeBadges({ energy, importance }: { energy: number; importance: number }) {
  if (energy <= 0 && importance <= 0) return null;

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6, fontSize: 9, fontFamily: mono, opacity: 0.8 }}>
      {energy > 0 ? <span style={{ color: '#38bdf8' }}>E:{energy.toFixed(2)}</span> : null}
      {importance > 0 ? <span style={{ color: '#facc15' }}>imp:{importance.toFixed(2)}</span> : null}
    </div>
  );
}

/**
 * Circular node for source/context inputs.
 */
export const SourceNode: React.FC<NodeProps<BaseNodeData>> = ({ data }) => {
  const val = data?.value;
  const isActive = Number.isFinite(val) ? Math.abs(Number(val)) > 1e-6 : true;
  const energy = clamp01(Number(data?.energy ?? 0));
  const importance = clamp01(Number(data?.importance ?? 0));
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
        border: `1px solid rgba(148, 163, 184, ${0.35 + energy * 0.4})`,
        background: isActive ? 'rgba(15, 23, 42, 0.88)' : 'rgba(15, 23, 42, 0.45)',
        color: '#e2e8f0',
        padding: 8,
        textAlign: 'center',
        boxShadow: energy > 0 ? `0 0 10px rgba(56, 189, 248, ${energy * 0.45})` : 'none',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1 }}>{data?.label}</div>
      {Number.isFinite(val) ? (
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75, fontFamily: mono }}>{formatSmall(val)}</div>
      ) : null}
      <NodeBadges energy={energy} importance={importance} />
    </div>
  );
};

/**
 * Diamond node for lens/trait inputs.
 */
export const LensNode: React.FC<NodeProps<BaseNodeData>> = ({ data }) => {
  const energy = clamp01(Number(data?.energy ?? 0));
  const importance = clamp01(Number(data?.importance ?? 0));
  return (
    <div
      style={{
        width: 180,
        height: 56,
        transform: 'rotate(45deg)',
        borderRadius: 12,
        border: `1px solid rgba(217, 70, 239, ${0.45 + energy * 0.4})`,
        background: 'rgba(217, 70, 239, 0.10)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#e2e8f0',
        boxShadow: energy > 0 ? `0 0 10px rgba(217, 70, 239, ${energy * 0.4})` : 'none',
      }}
    >
      <div style={{ transform: 'rotate(-45deg)', textAlign: 'center', padding: '0 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1 }}>{data?.label}</div>
        {data?.subtitle ? (
          <div style={{ marginTop: 3, fontSize: 10, opacity: 0.75, fontFamily: mono }}>{data.subtitle}</div>
        ) : null}
        <NodeBadges energy={energy} importance={importance} />
      </div>
    </div>
  );
};

/**
 * Larger rectangular node for goals.
 */
export const GoalNode: React.FC<NodeProps<BaseNodeData>> = ({ data, selected }) => {
  const energy = clamp01(Number(data?.energy ?? 0));
  const importance = clamp01(Number(data?.importance ?? 0));
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
        boxShadow: selected
          ? '0 0 0 1px rgba(56,189,248,0.35)'
          : energy > 0
            ? `0 0 12px rgba(56, 189, 248, ${energy * 0.5})`
            : 'none',
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
      <NodeBadges energy={energy} importance={importance} />
    </div>
  );
};
