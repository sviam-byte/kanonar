


import React, { useMemo, useState, useEffect } from 'react';
import { CharacterEntity } from '../../types';
import {
  DyadConfigForA,
  computeDyadMetrics_A_about_B,
} from '../../lib/tom/dyad-metrics';
import { DYAD_CONFIGS } from '../../data/tom-dyad-configs';
import { makeDefaultDyadConfig } from '../../lib/tom/dyad-defaults';
import { MetricBar } from './MetricBar';
import { useSandbox } from '../../contexts/SandboxContext';

interface DyadInspectorProps {
  // If provided, overrides sandbox chars. Otherwise uses sandbox chars.
  characters?: CharacterEntity[];
}

const clamp = (x: number, min: number, max: number) =>
  Math.max(min, Math.min(max, x));

export const DyadInspector: React.FC<DyadInspectorProps> = ({ characters: propsCharacters }) => {
  // Connect to sandbox
  const { characters: sandboxCharacters, dyadConfigs, setDyadConfigFor } = useSandbox();
  
  // Use props characters if available (legacy mode), else use sandbox characters
  const characters = propsCharacters || sandboxCharacters;

  const [selectedA, setSelectedA] = useState<string | undefined>(characters[0]?.entityId);
  const [selectedB, setSelectedB] = useState<string | undefined>(characters[1]?.entityId);

  const [localConfig, setLocalConfig] = useState<DyadConfigForA>(makeDefaultDyadConfig());
  const [isNewConfig, setIsNewConfig] = useState(false);
  const [weightsJson, setWeightsJson] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  // When A changes, load existing config from Sandbox -> Static -> Default
  useEffect(() => {
    if (!selectedA) return;

    // Priority 1: Sandbox (User Session)
    let cfg = dyadConfigs[selectedA];
    
    // Priority 2: Static File (Canon)
    if (!cfg) {
        cfg = DYAD_CONFIGS[selectedA];
    }

    if (!cfg) {
      cfg = makeDefaultDyadConfig();
      setIsNewConfig(true);
    } else {
      setIsNewConfig(false);
    }

    setLocalConfig(JSON.parse(JSON.stringify(cfg))); // Deep copy to avoid ref issues
    updateJsonFromConfig(cfg);
    setSaveStatus('idle');
  }, [selectedA, dyadConfigs]);

  const updateJsonFromConfig = (cfg: DyadConfigForA) => {
    const weightsOnly = {
      like_sim_axes: cfg.like_sim_axes,
      like_opposite_axes: cfg.like_opposite_axes,
      trust_sim_axes: cfg.trust_sim_axes,
      trust_partner_axes: cfg.trust_partner_axes,
      fear_threat_axes: cfg.fear_threat_axes,
      fear_dom_axes: cfg.fear_dom_axes,
      respect_partner_axes: cfg.respect_partner_axes,
      closeness_sim_axes: cfg.closeness_sim_axes,
      dominance_axes: cfg.dominance_axes,
    };
    setWeightsJson(JSON.stringify(weightsOnly, null, 2));
    setJsonError(null);
  };

  const charA = useMemo(
    () => characters.find(c => c.entityId === selectedA),
    [characters, selectedA],
  );
  const charB = useMemo(
    () => characters.find(c => c.entityId === selectedB),
    [characters, selectedB],
  );

  const metrics = useMemo(() => {
    if (!charA || !charB || !localConfig) return null;
    return computeDyadMetrics_A_about_B(charA, charB, localConfig);
  }, [charA, charB, localConfig]);

  const handleWeightsJsonChange = (value: string) => {
    setWeightsJson(value);
    try {
      const parsed = JSON.parse(value);
      setLocalConfig({
        ...localConfig,
        // Spread existing to keep biases, overwrite weights
        ...parsed
      });
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e.message ?? 'Ошибка парсинга JSON');
    }
  };

  const updateBias = (field: keyof DyadConfigForA, v: number) => {
    setLocalConfig(prev => ({
      ...prev,
      [field]: v,
    }));
  };

  const handleCreateDraft = () => {
    const draft = makeDefaultDyadConfig();
    setLocalConfig(draft);
    updateJsonFromConfig(draft);
    setIsNewConfig(true);
  };

  // Save to Sandbox Context
  const handleSaveToSession = () => {
      if (!selectedA) return;
      setDyadConfigFor(selectedA, localConfig);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
  };

  // Developer export
  const handleCopyConfig = async () => {
    if (!selectedA || !localConfig) return;
    const snippet = `'${selectedA}': ${JSON.stringify(localConfig, null, 2)} as DyadConfigForA,`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyStatus('ok');
      setTimeout(() => setCopyStatus('idle'), 1500);
    } catch {
      setCopyStatus('err');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  return (
    <div className="p-6 space-y-6 border rounded-xl bg-neutral-900/60">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
            Инспектор Отношений (Dyad Inspector)
            </h2>
            {isNewConfig && <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 border border-yellow-500/40 rounded text-[10px] font-bold uppercase">Draft</span>}
        </div>
        
        <div className="flex gap-2">
            <button
                type="button"
                onClick={handleCreateDraft}
                className="px-3 py-1 rounded bg-neutral-700 text-xs font-semibold hover:bg-neutral-600"
            >
            Сбросить (Default)
            </button>
            <button
                type="button"
                onClick={handleSaveToSession}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${saveStatus === 'saved' ? 'bg-green-600 text-white' : 'bg-canon-accent text-black hover:bg-canon-accent/80'}`}
            >
                {saveStatus === 'saved' ? 'Сохранено в сессии' : 'Сохранить настройки'}
            </button>
        </div>
      </div>

      {/* выбор персонажей */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs mb-1 font-semibold">Наблюдатель (A)</div>
          <select
            className="w-full px-3 py-2 rounded bg-neutral-800 text-sm"
            value={selectedA ?? ''}
            onChange={e => setSelectedA(e.target.value || undefined)}
          >
            {characters.map(ch => (
              <option key={ch.entityId} value={ch.entityId}>
                {ch.title || ch.entityId}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs mb-1 font-semibold">Объект (B)</div>
          <select
            className="w-full px-3 py-2 rounded bg-neutral-800 text-sm"
            value={selectedB ?? ''}
            onChange={e => setSelectedB(e.target.value || undefined)}
          >
            {characters.map(ch => (
              <option key={ch.entityId} value={ch.entityId}>
                {ch.title || ch.entityId}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {/* метрики */}
        <div className="space-y-3 md:col-span-1">
          <h3 className="text-sm font-semibold mb-1">Метрики A → B</h3>
          {!metrics && (
            <div className="text-xs text-neutral-400">
              Выберите персонажей.
            </div>
          )}
          {metrics && (
            <div className="space-y-2">
              <MetricBar label="Симпатия (Liking)" value={metrics.liking} range="signed" />
              <MetricBar label="Доверие (Trust)" value={metrics.trust} range="01" />
              <MetricBar label="Страх (Fear)" value={metrics.fear} range="01" />
              <MetricBar label="Уважение (Respect)" value={metrics.respect} range="01" />
              <MetricBar label="Близость (Closeness)" value={metrics.closeness} range="01" />
              <MetricBar
                label="Доминирование A над B (Dominance)"
                value={metrics.dominance}
                range="signed"
              />
            </div>
          )}
        </div>

        {/* bias'ы */}
        <div className="space-y-3 md:col-span-1">
          <h3 className="text-sm font-semibold mb-1">Смещения (Biases)</h3>
          {localConfig && (
            <div className="space-y-2">
              {([
                ['bias_liking', 'Liking bias'],
                ['bias_trust', 'Trust bias'],
                ['bias_fear', 'Fear bias'],
                ['bias_respect', 'Respect bias'],
                ['bias_closeness', 'Closeness bias'],
                ['bias_dominance', 'Dominance bias'],
              ] as [keyof DyadConfigForA, string][]).map(([field, label]) => (
                <div key={field} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{label}</span>
                    <span className="tabular-nums">
                      {(localConfig[field] as number).toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={localConfig[field] as number}
                    onChange={e =>
                      updateBias(field, clamp(parseFloat(e.target.value), -1, 1))
                    }
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* веса осей JSON */}
        <div className="space-y-2 md:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold mb-1">Веса осей (JSON)</h3>
            <button
              type="button"
              onClick={handleCopyConfig}
              disabled={!localConfig || !selectedA}
              className="px-2 py-1 rounded bg-neutral-700 text-[10px] hover:bg-neutral-600 disabled:opacity-40"
            >
              {copyStatus === 'ok' ? 'Copied TS' : 'Export TS'}
            </button>
          </div>
          <p className="text-[10px] text-neutral-400">
            Редактируйте <code>*_axes</code> здесь. Изменения сразу влияют на метрики. 
            Нажмите "Сохранить настройки", чтобы запомнить их для сессии.
          </p>
          <textarea
            className="w-full h-56 rounded bg-neutral-800 text-[11px] font-mono p-2"
            value={weightsJson}
            onChange={e => handleWeightsJsonChange(e.target.value)}
          />
          {jsonError && (
            <div className="text-[11px] text-red-400">
              JSON-ошибка: {jsonError}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};