/**
 * components/goal-lab/DriverExplainPanel.tsx
 *
 * Visual explainer for the S6 driver computation pipeline.
 * Shows 4 layers per driver:
 *   1. Raw linear sum (bar)
 *   2. Post-curve (response curve overlay)
 *   3. Post-inhibition (suppression arrows)
 *   4. Post-accumulation (EMA history sparkline)
 *   5. Final (with surprise boost)
 *
 * Reads all data from drv:* atom trace.parts — no duplicate computation.
 */

import React, { useMemo, useState } from 'react';
import { curve01Param, type CurveSpec } from '../../lib/utils/curves';
import { clamp01 } from '../../lib/util/math';

type AtomLike = { id?: string; magnitude?: number; trace?: { parts?: Record<string, unknown> } };

type Props = {
  selfId: string;
  atoms: AtomLike[];
  /** Optional: history of drv atoms from previous ticks for sparklines */
  history?: Array<{ tick: number; atoms: AtomLike[] }>;
};

const DRIVER_LABELS: Record<string, string> = {
  safetyNeed: 'Безопасность',
  controlNeed: 'Контроль',
  statusNeed: 'Статус',
  affiliationNeed: 'Привязанность',
  resolveNeed: 'Решимость',
};

const DRIVER_COLORS: Record<string, string> = {
  safetyNeed: '#ef4444',
  controlNeed: '#3b82f6',
  statusNeed: '#f59e0b',
  affiliationNeed: '#10b981',
  resolveNeed: '#8b5cf6',
};

function getDriverAtoms(atoms: AtomLike[], selfId: string) {
  const out: Record<string, { magnitude: number; parts: Record<string, any> }> = {};
  for (const a of atoms) {
    const id = String(a?.id || '');
    if (!id.startsWith('drv:') || !id.endsWith(`:${selfId}`)) continue;
    const key = id.split(':')[1];
    out[key] = {
      magnitude: clamp01(Number(a?.magnitude ?? 0)),
      parts: (a?.trace?.parts as Record<string, any>) ?? {},
    };
  }
  return out;
}

const CurveChart: React.FC<{
  spec: CurveSpec | undefined;
  rawValue: number;
  shapedValue: number;
  color: string;
  width?: number;
  height?: number;
}> = ({ spec, rawValue, shapedValue, color, width = 120, height = 60 }) => {
  const effectiveSpec = spec ?? { type: 'linear' as const };
  const pad = 4;
  const iW = width - pad * 2;
  const iH = height - pad * 2;
  const toX = (x: number) => pad + x * iW;
  const toY = (y: number) => pad + (1 - y) * iH;

  const points = useMemo(() => {
    const pts: string[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const y = curve01Param(x, effectiveSpec);
      pts.push(`${toX(x).toFixed(1)},${toY(y).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [effectiveSpec, iH, iW]);

  return (
    <svg width={width} height={height} className="bg-black/30 rounded">
      {/* Grid */}
      <line x1={pad} y1={toY(0.5)} x2={width - pad} y2={toY(0.5)} stroke="#334155" strokeWidth={0.5} strokeDasharray="2,2" />
      <line x1={toX(0.5)} y1={pad} x2={toX(0.5)} y2={height - pad} stroke="#334155" strokeWidth={0.5} strokeDasharray="2,2" />
      {/* Curve */}
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7} />
      {/* Current point */}
      <circle cx={toX(rawValue)} cy={toY(shapedValue)} r={3} fill={color} />
      {/* Projection lines */}
      <line x1={toX(rawValue)} y1={toY(0)} x2={toX(rawValue)} y2={toY(shapedValue)} stroke={color} strokeWidth={0.5} strokeDasharray="1,2" opacity={0.5} />
      <line x1={toX(0)} y1={toY(shapedValue)} x2={toX(rawValue)} y2={toY(shapedValue)} stroke={color} strokeWidth={0.5} strokeDasharray="1,2" opacity={0.5} />
    </svg>
  );
};

const InhibitionView: React.FC<{
  trace: { suppression: number; sources: Record<string, number> } | undefined;
}> = ({ trace }) => {
  if (!trace || trace.suppression <= 0.001) {
    return <span className="text-slate-600 text-[9px]">нет подавления</span>;
  }
  const entries = Object.entries(trace.sources)
    .filter(([, v]) => v > 0.001)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([src, val]) => (
        <span key={src} className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: `${DRIVER_COLORS[src] ?? '#666'}22`, color: DRIVER_COLORS[src] ?? '#999' }}>
          {DRIVER_LABELS[src]?.slice(0, 3) ?? src} -{Math.round(val * 100)}%
        </span>
      ))}
      <span className="text-[9px] text-slate-400 ml-1">= -{Math.round(trace.suppression * 100)}%</span>
    </div>
  );
};

const Sparkline: React.FC<{
  values: number[];
  color: string;
  width?: number;
  height?: number;
}> = ({ values, color, width = 80, height = 20 }) => {
  if (values.length < 2) return null;
  const pad = 2;
  const iW = width - pad * 2;
  const iH = height - pad * 2;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * iW;
      const y = pad + (1 - clamp01(v)) * iH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1} opacity={0.8} />
      <circle cx={pad + iW} cy={pad + (1 - clamp01(values[values.length - 1])) * iH} r={2} fill={color} />
    </svg>
  );
};

export const DriverExplainPanel: React.FC<Props> = ({ selfId, atoms, history }) => {
  const drivers = useMemo(() => getDriverAtoms(atoms, selfId), [atoms, selfId]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const driverKeys = ['safetyNeed', 'controlNeed', 'statusNeed', 'affiliationNeed', 'resolveNeed'];

  const historyMap = useMemo(() => {
    if (!history?.length) return {} as Record<string, number[]>;
    const out: Record<string, number[]> = {};
    for (const key of driverKeys) {
      out[key] = history.map((h) => {
        const a = h.atoms.find((x) => String(x?.id) === `drv:${key}:${selfId}`);
        return clamp01(Number(a?.magnitude ?? 0));
      });
    }
    return out;
  }, [history, selfId]);

  return (
    <div className="space-y-1 font-mono text-xs">
      <div className="text-slate-400 text-[10px] uppercase tracking-widest mb-2">S6 Drivers — {selfId}</div>

      {driverKeys.map((key) => {
        const d = drivers[key];
        if (!d) return null;
        const p = d.parts ?? {};
        const color = DRIVER_COLORS[key] ?? '#888';
        const label = DRIVER_LABELS[key] ?? key;
        const isExpanded = expanded === key;

        return (
          <div
            key={key}
            className="border border-slate-800 rounded p-2 hover:border-slate-600 cursor-pointer"
            onClick={() => setExpanded(isExpanded ? null : key)}
          >
            {/* Header row */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <div className="text-slate-300 w-28">{label}</div>
              {/* Main bar */}
              <div className="flex-1 h-3 bg-slate-900 rounded overflow-hidden relative">
                {/* Raw linear (dim) */}
                {p.rawLinear != null && (
                  <div className="absolute inset-y-0 left-0 opacity-20 rounded" style={{ width: `${Math.round(clamp01(p.rawLinear) * 100)}%`, backgroundColor: color }} />
                )}
                {/* Final (bright) */}
                <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.round(d.magnitude * 100)}%`, backgroundColor: color, opacity: 0.8 }} />
              </div>
              <div className="w-10 text-right tabular-nums text-slate-200">{Math.round(d.magnitude * 100)}%</div>
              {/* Sparkline */}
              {historyMap[key] && <Sparkline values={historyMap[key]} color={color} />}
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="mt-2 ml-4 space-y-2 text-[10px] text-slate-400">
                {/* Layer breakdown */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-slate-500 mb-1">Кривая отклика</div>
                    <CurveChart spec={p.curveSpec} rawValue={clamp01(p.rawLinear ?? d.magnitude)} shapedValue={clamp01(p.shaped ?? d.magnitude)} color={color} />
                    <div className="mt-1">raw: {(p.rawLinear ?? 0).toFixed(2)} → shaped: {(p.shaped ?? d.magnitude).toFixed(2)}</div>
                    {p.curveSpec && (p.curveSpec as CurveSpec).type !== 'linear' && (
                      <div className="text-slate-500">
                        {(p.curveSpec as any).type}
                        {(p.curveSpec as any).center != null && ` center=${(p.curveSpec as any).center}`}
                        {(p.curveSpec as any).slope != null && ` slope=${(p.curveSpec as any).slope}`}
                        {(p.curveSpec as any).k != null && ` k=${(p.curveSpec as any).k}`}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-slate-500 mb-1">Подавление</div>
                    <InhibitionView trace={p.inhibition as any} />
                    {p.postInhibition != null && <div className="mt-1">после: {Number(p.postInhibition).toFixed(2)}</div>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-slate-500 mb-1">Накопление (EMA)</div>
                    {p.accumulation ? (
                      <>
                        <div>prev: {(p.accumulation as any).prevPressure?.toFixed(2) ?? '?'}</div>
                        <div>alpha: {(p.accumulation as any).alpha?.toFixed(2) ?? '?'}</div>
                        <div>blended: {(p.accumulation as any).blended?.toFixed(2) ?? '?'}</div>
                      </>
                    ) : (
                      <span className="text-slate-600">нет данных</span>
                    )}
                  </div>

                  <div>
                    <div className="text-slate-500 mb-1">Surprise boost</div>
                    <div>+{((Number(p.surpriseBoost ?? 0)) * 100).toFixed(0)}%</div>
                  </div>
                </div>

                {/* Input signals */}
                <div className="text-slate-600 border-t border-slate-800 pt-1 mt-1">
                  Входы:{' '}
                  {Object.entries(p)
                    .filter(([k]) => !['rawLinear', 'curveSpec', 'shaped', 'inhibition', 'postInhibition', 'accumulation', 'surpriseBoost'].includes(k))
                    .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : JSON.stringify(v)}`)
                    .join(', ')}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div className="text-[9px] text-slate-600 mt-2 flex gap-3">
        <span>■ тусклый = raw linear</span>
        <span>■ яркий = final</span>
        <span>↗ = history</span>
        <span>клик = детали</span>
      </div>
    </div>
  );
};

export default DriverExplainPanel;
