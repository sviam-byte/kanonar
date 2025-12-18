
import React from 'react';

type SceneControl = {
  presetId: string;
  sceneId?: string;
  phaseId?: string;
  metrics?: Record<string, number>;
  norms?: Record<string, number>;
  manualInjections?: any[];
};

type Props = {
  control: SceneControl;
  presets: Array<{ id: string; title: string; phases: Array<{ id: string; label: string }>; defaultMetrics?: any; defaultNorms?: any }>;
  onChange: (next: SceneControl) => void;
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

export const ScenePanel: React.FC<Props> = ({ control, presets, onChange }) => {
  const preset = presets.find(p => p.id === control.presetId) || presets[0];

  const keysMetrics = ['crowd','hostility','chaos','urgency','scarcity','loss','novelty','resourceAccess'];
  const keysNorms = ['publicExposure','privacy','surveillance','normPressure','proceduralStrict'];

  const setMetric = (k: string, v: number) => {
    onChange({ ...control, metrics: { ...(control.metrics || {}), [k]: clamp01(v) } });
  };
  const setNorm = (k: string, v: number) => {
    onChange({ ...control, norms: { ...(control.norms || {}), [k]: clamp01(v) } });
  };

  const handlePresetChange = (newPresetId: string) => {
      // Clear manual overrides when switching presets to "turn on" the new defaults
      onChange({ 
          ...control, 
          presetId: newPresetId, 
          phaseId: undefined,
          metrics: {}, 
          norms: {} 
      });
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-canon-bg text-canon-text">
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">Scene Control</div>

        <div className="mt-3 flex gap-2">
          <div className="flex-1">
              <label className="text-[9px] text-canon-text-light uppercase font-bold block mb-1">Preset</label>
              <select
                value={control.presetId}
                onChange={e => handlePresetChange(e.target.value)}
                className="w-full px-2 py-2 rounded bg-canon-bg border border-canon-border text-xs focus:outline-none focus:border-canon-accent"
              >
                {presets.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
          </div>

          <div className="flex-1">
              <label className="text-[9px] text-canon-text-light uppercase font-bold block mb-1">Phase</label>
              <select
                value={control.phaseId || ''}
                onChange={e => onChange({ ...control, phaseId: e.target.value || undefined })}
                className="w-full px-2 py-2 rounded bg-canon-bg border border-canon-border text-xs focus:outline-none focus:border-canon-accent"
              >
                <option value="">(auto / entry)</option>
                {(preset?.phases || []).map(ph => <option key={ph.id} value={ph.id}>{ph.label}</option>)}
              </select>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 custom-scrollbar">
        <div className="text-xs font-semibold mb-2 text-canon-text-light uppercase flex justify-between">
            <span>Metrics (0..1)</span>
            <span className="text-[9px] opacity-50 lowercase font-normal">default / override</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {keysMetrics.map(k => {
            const override = control.metrics?.[k];
            const def = (preset.defaultMetrics as any)?.[k] ?? 0;
            const effective = override ?? def;
            const hasOverride = override !== undefined;
            
            return (
            <label key={k} className="text-xs block p-2 rounded border border-canon-border/20 bg-canon-bg/20 hover:bg-canon-bg/40 transition-colors">
              <div className="flex justify-between mb-1">
                  <span className={`text-canon-text-light ${hasOverride ? 'text-canon-accent' : ''}`}>{k}</span>
                  <span className="font-mono text-[9px] opacity-50">{def.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0} max={1} step={0.05}
                    value={effective}
                    onChange={e => setMetric(k, Number(e.target.value))}
                    className={`flex-1 h-1 rounded-lg appearance-none cursor-pointer ${hasOverride ? 'bg-canon-accent/30 accent-canon-accent' : 'bg-canon-border accent-canon-text-light'}`}
                  />
                  <span className="font-mono font-bold w-8 text-right">{effective.toFixed(2)}</span>
              </div>
              {hasOverride && (
                  <button onClick={() => {
                      const next = {...(control.metrics || {})};
                      delete next[k];
                      onChange({ ...control, metrics: next });
                  }} className="text-[9px] text-red-400 hover:underline mt-1 block text-right">reset</button>
              )}
            </label>
          )})}
        </div>

        <div className="text-xs font-semibold mt-6 mb-2 text-canon-text-light uppercase">Norms (0..1)</div>
        <div className="grid grid-cols-2 gap-2">
          {keysNorms.map(k => {
             const override = control.norms?.[k];
             const def = (preset.defaultNorms as any)?.[k] ?? 0;
             const effective = override ?? def;
             const hasOverride = override !== undefined;

             return (
            <label key={k} className="text-xs block p-2 rounded border border-canon-border/20 bg-canon-bg/20 hover:bg-canon-bg/40 transition-colors">
              <div className="flex justify-between mb-1">
                  <span className={`text-canon-text-light ${hasOverride ? 'text-canon-accent' : ''}`}>{k}</span>
                  <span className="font-mono text-[9px] opacity-50">{def.toFixed(2)}</span>
              </div>
               <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0} max={1} step={0.05}
                    value={effective}
                    onChange={e => setNorm(k, Number(e.target.value))}
                     className={`flex-1 h-1 rounded-lg appearance-none cursor-pointer ${hasOverride ? 'bg-canon-accent/30 accent-canon-accent' : 'bg-canon-border accent-canon-text-light'}`}
                  />
                  <span className="font-mono font-bold w-8 text-right">{effective.toFixed(2)}</span>
              </div>
               {hasOverride && (
                  <button onClick={() => {
                      const next = {...(control.norms || {})};
                      delete next[k];
                      onChange({ ...control, norms: next });
                  }} className="text-[9px] text-red-400 hover:underline mt-1 block text-right">reset</button>
              )}
            </label>
          )})}
        </div>
      </div>
    </div>
  );
};
