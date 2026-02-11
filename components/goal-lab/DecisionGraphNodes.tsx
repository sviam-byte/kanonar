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

/**
 * Rectangular node for source/context inputs.
 * The old circular style was cute but unreadable with real labels.
 */
export const SourceNode: React.FC<NodeProps<BaseNodeData>> = ({ data }) => {
  const val = data?.value;
  const isActive = Number.isFinite(val) ? Math.abs(Number(val)) > 1e-6 : true;
  const energyRaw = Number(data?.energy);
  const importanceRaw = Number(data?.importance);
  const energy = clamp01(energyRaw);
  const importance = clamp01(importanceRaw);
  return (
    <div
      style={{
        width: 260,
        minHeight: 56,
        borderRadius: 14,
        padding: '10px 12px',
        border: `1px solid rgba(56, 189, 248, ${0.25 + 0.55 * Math.max(energy, importance)})`,
        background: isActive ? 'rgba(56, 189, 248, 0.07)' : 'rgba(15, 23, 42, 0.45)',
        color: '#e2e8f0',
        boxShadow:
          energy > 0
            ? `0 0 ${6 + energy * 12}px rgba(56, 189, 248, ${0.18 + 0.32 * energy})`
            : 'none',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.15 }}>{data?.label}</div>
      {data?.subtitle ? (
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75, fontFamily: mono }} title={data.subtitle}>
          {data.subtitle}
        </div>
      ) : null}
      {Number.isFinite(val) ? (
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75, fontFamily: mono }}>{formatSmall(val)}</div>
      ) : null}
      <Badges energy={energyRaw} importance={importanceRaw} />
    </div>
  );
};

/**
 * Rectangular node for lens/trait inputs.
 * Diamond nodes look fancy but hurt readability and waste space.
 */
export const LensNode: React.FC<NodeProps<BaseNodeData>> = ({ data }) => {
  const energyRaw = Number(data?.energy);
  const importanceRaw = Number(data?.importance);
  const energy = clamp01(energyRaw);
  const importance = clamp01(importanceRaw);
  return (
    <div
      style={{
        width: 260,
        minHeight: 56,
        borderRadius: 14,
        padding: '10px 12px',
        border: `1px dashed rgba(217, 70, 239, ${0.25 + 0.55 * Math.max(energy, importance)})`,
        background: `rgba(217, 70, 239, ${0.07 + 0.22 * energy})`,
        color: '#e2e8f0',
        boxShadow: energy > 0 ? `0 0 ${6 + energy * 12}px rgba(217, 70, 239, ${0.18 + 0.32 * energy})` : 'none',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.15 }}>{data?.label}</div>
      {data?.subtitle ? (
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75, fontFamily: mono }} title={data.subtitle}>
          {data.subtitle}
        </div>
      ) : null}
      <Badges energy={energyRaw} importance={importanceRaw} />
    </div>
  );
};

/**
 * Larger rectangular node for goals.
 */
export const GoalNode: React.FC<NodeProps<BaseNodeData>> = ({ data, selected }) => {
  const energyRaw = Number(data?.energy);
  const importanceRaw = Number(data?.importance);
  const energy = clamp01(energyRaw);
  const importance = clamp01(importanceRaw);
  return (
    <div
      style={{
        width: 280,
        minHeight: 62,
        borderRadius: 14,
        padding: '10px 12px',
        border: `1px solid ${
          selected ? 'rgba(56, 189, 248, 0.75)' : `rgba(148, 163, 184, ${0.25 + 0.5 * energy})`
        }`,
        background: selected ? 'rgba(14, 116, 144, 0.28)' : 'rgba(15, 23, 42, 0.88)',
        color: '#e2e8f0',
        boxShadow: selected
          ? '0 0 0 1px rgba(56,189,248,0.35)'
          : energy > 0
            ? `0 0 ${6 + energy * 12}px rgba(34, 197, 94, ${0.2 + 0.35 * energy})`
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
      <Badges energy={energyRaw} importance={importanceRaw} />
    </div>
  );
};
