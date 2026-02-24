/**
 * CurvesPanel — SVG visualization of non-linear response curves.
 * Shows raw→felt personality curves (sigmoid, pow, sqrt, etc) per energy channel.
 */
import React, { useMemo } from 'react';

const cl = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

function evalCurve(t: number, spec: any): number {
  const x = cl(t);
  if (!spec || typeof spec === 'string') {
    switch (spec) {
      case 'linear': return x;
      case 'smoothstep': return x * x * (3 - 2 * x);
      case 'sqrt': return Math.sqrt(x);
      case 'pow2': return x * x;
      case 'pow4': return x * x * x * x;
      case 'sigmoid': { const k = 10, y = 1 / (1 + Math.exp(-k * (x - 0.5))), y0 = 1 / (1 + Math.exp(k * 0.5)), y1 = 1 / (1 + Math.exp(-k * 0.5)); return (y - y0) / (y1 - y0); }
      default: return x;
    }
  }
  if (spec.type === 'pow') return Math.pow(x, Math.max(0.01, spec.k ?? 1));
  if (spec.type === 'exp') { const k = spec.k ?? 1; if (Math.abs(k) < 1e-6) return x; return cl((Math.exp(k * x) - 1) / (Math.exp(k) - 1)); }
  if (spec.type === 'sigmoid') { const c = spec.center ?? 0.5, s = spec.slope ?? 10; const sg = (z: number) => 1 / (1 + Math.exp(-s * (z - c))); return cl((sg(x) - sg(0)) / (sg(1) - sg(0))); }
  if (spec.preset) return evalCurve(x, spec.preset);
  return x;
}

function CurveSVG({ spec, label, rawV }: { spec: any; label: string; rawV?: number }) {
  const W = 120, H = 60, p = 2;
  const pts = Array.from({ length: 41 }, (_, i) => { const t = i / 40; return `${p + t * (W - 2 * p)},${H - p - evalCurve(t, spec) * (H - 2 * p)}`; }).join(' ');
  return (
    <svg width={W} height={H} className="bg-slate-900/60 rounded border border-slate-800/30">
      <line x1={p} y1={H - p} x2={W - p} y2={H - p} stroke="#334155" strokeWidth="0.5" />
      <line x1={p} y1={p} x2={p} y2={H - p} stroke="#334155" strokeWidth="0.5" />
      <line x1={p} y1={H - p} x2={W - p} y2={p} stroke="#475569" strokeWidth="0.5" strokeDasharray="2" />
      <polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth="1.5" />
      {rawV != null && <circle cx={p + cl(rawV) * (W - 2 * p)} cy={H - p - evalCurve(rawV, spec) * (H - 2 * p)} r="3" fill="#f59e0b" stroke="#000" strokeWidth="0.5" />}
      <text x={W / 2} y={H - 1} textAnchor="middle" fill="#64748b" fontSize="7">{label}</text>
    </svg>
  );
}

type Props = { atoms: any[]; selfId: string; world?: any };

export const CurvesPanel: React.FC<Props> = ({ atoms, selfId, world }) => {
  const profiles = useMemo(() => {
    const ep = (world as any)?.energyProfiles?.[selfId] || {};
    const curves: Record<string, any> = ep.curves || {};
    const defaults: Record<string, string> = { threat: 'sigmoid', norm: 'smoothstep', attachment: 'sqrt', curiosity: 'linear', status: 'pow2', autonomy: 'smoothstep', resource: 'linear', uncertainty: 'sigmoid' };
    return ['threat', 'norm', 'attachment', 'curiosity', 'status', 'autonomy', 'resource', 'uncertainty'].map(ch => {
      const spec = curves[ch] || defaults[ch] || 'smoothstep';
      const raw = Number((atoms.find((a: any) => String(a?.id) === `ener:raw:${ch}:${selfId}`) as any)?.magnitude ?? 0);
      const felt = Number((atoms.find((a: any) => String(a?.id) === `ener:felt:${ch}:${selfId}`) as any)?.magnitude ?? 0);
      return { ch, spec, raw, felt, specLabel: typeof spec === 'string' ? spec : spec?.type || '?' };
    });
  }, [atoms, selfId, world]);

  return (
    <div className="space-y-2 text-[10px]">
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Response Curves</div>
      <div className="text-[8px] text-cyan-700 font-mono bg-cyan-950/20 border border-cyan-900/20 rounded px-1.5 py-0.5">
        felt = curve(raw). Non-linear curves amplify/dampen signals per personality.
      </div>

      <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2">
        <div className="text-[9px] font-bold text-slate-500 mb-1">Per-Channel Curves ƒ(personality)</div>
        <div className="grid grid-cols-2 gap-2">
          {profiles.filter(p => p.raw > 0.01 || p.felt > 0.01).map(p => (
            <div key={p.ch} className="text-center">
              <CurveSVG spec={p.spec} label={`${p.ch} (${p.specLabel})`} rawV={p.raw} />
              <div className="text-[8px] text-slate-600 mt-0.5">raw=<span className="text-amber-400">{p.raw.toFixed(2)}</span> → felt=<span className="text-rose-400">{p.felt.toFixed(2)}</span></div>
            </div>
          ))}
        </div>
        {profiles.every(p => p.raw <= 0.01 && p.felt <= 0.01) && <div className="text-[9px] text-slate-600 italic">No active channels. Build world to see curves with data.</div>}
      </div>

      <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2">
        <div className="text-[9px] font-bold text-slate-500 mb-1">Curve Gallery — all presets</div>
        <div className="grid grid-cols-3 gap-1.5">
          {['linear', 'smoothstep', 'sqrt', 'sigmoid', 'pow2', 'pow4'].map(n => <div key={n} className="text-center"><CurveSVG spec={n} label={n} /></div>)}
        </div>
      </div>

      <div className="border border-slate-800/40 rounded bg-slate-950/40 p-2">
        <div className="text-[9px] font-bold text-slate-500 mb-1">Parametric Curves</div>
        <div className="grid grid-cols-3 gap-1.5">
          {[{ type: 'pow', k: 0.5 }, { type: 'pow', k: 3 }, { type: 'exp', k: 3 }, { type: 'exp', k: -2 }, { type: 'sigmoid', center: 0.3, slope: 15 }, { type: 'sigmoid', center: 0.7, slope: 8 }]
            .map((spec, i) => <div key={i} className="text-center"><CurveSVG spec={spec} label={`${spec.type} ${Object.entries(spec).filter(([k]) => k !== 'type').map(([k, v]) => `${k}=${v}`).join(',')}`} /></div>)}
        </div>
      </div>
    </div>
  );
};
