// components/sim/LiveSimulator.tsx
// Prototype: standalone simulator driven by GoalLab pipeline.
// Place characters in a location → watch them live.

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { EntityType } from '../../enums';
import { getEntitiesByType, getAllCharactersWithRuntime } from '../../data';
import type { CharacterEntity, LocationEntity } from '../../types';
import { SimKitSimulator } from '../../lib/simkit/core/simulator';
import type { SimWorld, SimTickRecord, SimAction, SimCharacter } from '../../lib/simkit/core/types';
import { makeSimWorldFromSelection } from '../../lib/simkit/adapters/fromKanonarEntities';
import { makeGoalLabDeciderPlugin } from '../../lib/simkit/plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../../lib/simkit/plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../../lib/simkit/plugins/perceptionMemoryPlugin';
import { attachScenario, type ScenarioConfig } from '../../lib/simkit/core/simulatorScenario';
import { clamp01 } from '../../lib/util/math';
import { MacroMap } from './MacroMap';
import { DialoguePanel } from './DialoguePanel';
import { SetupPanel } from './SetupPanel';

// ─── Helpers ───────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  wait: 'ждёт', rest: 'отдыхает', hide: 'прячется', escape: 'убегает',
  observe: 'наблюдает', observe_area: 'осматривается', observe_target: 'наблюдает за',
  talk: 'говорит с', ask_info: 'спрашивает', negotiate: 'ведёт переговоры с',
  comfort: 'утешает', praise: 'хвалит', apologize: 'извиняется перед',
  help: 'помогает', treat: 'лечит', guard: 'охраняет', escort: 'сопровождает',
  share_resource: 'делится ресурсами с', propose_trade: 'предлагает обмен',
  command: 'командует', threaten: 'угрожает', confront: 'конфронтирует с',
  accuse: 'обвиняет', attack: 'атакует', avoid: 'избегает',
  investigate: 'расследует', verify: 'проверяет', signal: 'подаёт сигнал',
  call_backup: 'зовёт подкрепление', deceive: 'обманывает', betray: 'предаёт',
  submit: 'подчиняется', loot: 'мародёрствует', self_talk: 'размышляет',
  monologue: 'размышляет',
};

const MODE_LABELS: Record<string, string> = {
  threat_mode: '⚔ угроза', social_mode: '🤝 социум', explore_mode: '🔍 разведка',
  resource_mode: '📦 ресурсы', care_mode: '💛 забота',
};

const DRIVER_LABELS: Record<string, string> = {
  safetyNeed: 'безопасн.', controlNeed: 'контроль', statusNeed: 'статус',
  affiliationNeed: 'привязан.', resolveNeed: 'решимость', restNeed: 'отдых',
  curiosityNeed: 'любопытство',
};

function nameMap(world: SimWorld): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of Object.values(world.characters || {})) m[c.id] = c.name || c.id;
  return m;
}

function describeAction(a: SimAction, names: Record<string, string>): string {
  const actor = names[a.actorId] || a.actorId;
  const verb = ACTION_LABELS[a.kind] || a.kind;
  const target = a.targetId ? (names[a.targetId] || a.targetId) : '';
  if (target) return `${actor} ${verb} ${target}`;
  return `${actor} ${verb}`;
}

function extractGoalLab(record: SimTickRecord, agentId: string) {
  // Pipeline data is stored by goalLabPipelinePlugin or in decider artifacts.
  const pipeline = (record.plugins as any)?.goalLabPipeline?.pipeline;
  if (!pipeline || pipeline.selfId !== agentId) return null;
  return pipeline;
}

function extractDrivers(pipeline: any): Record<string, number> {
  const s6 = pipeline?.stages?.find((s: any) => s.stage === 'S6');
  if (!s6) return {};
  const drvAtoms = (s6.atoms || []).filter((a: any) => String(a?.id || '').startsWith('drv:'));
  const out: Record<string, number> = {};
  for (const a of drvAtoms) {
    const parts = String(a.id).split(':');
    if (parts.length >= 2) out[parts[1]] = clamp01(Number(a.magnitude ?? 0));
  }
  return out;
}

function extractGoals(pipeline: any): Array<{ domain: string; score: number; active: boolean }> {
  const s7 = pipeline?.stages?.find((s: any) => s.stage === 'S7');
  if (!s7) return [];
  const snap = s7.artifacts?.goalLayerSnapshot;
  if (!snap) return [];
  const domains = snap.domains || [];
  const activeSet = new Set((snap.activeDomains || []).map((a: any) => a.domain));
  return domains.map((d: any) => ({
    domain: d.domain || '',
    score: d.score01 || 0,
    active: activeSet.has(d.domain),
  }));
}

function extractMode(pipeline: any): string {
  const s7 = pipeline?.stages?.find((s: any) => s.stage === 'S7');
  return s7?.artifacts?.goalLayerSnapshot?.mode?.label || s7?.artifacts?.goalLayerSnapshot?.mode?.id || '';
}

function extractDecision(pipeline: any): { action: string; q: number; target?: string } | null {
  const s8 = pipeline?.stages?.find((s: any) => s.stage === 'S8');
  const best = s8?.artifacts?.best;
  if (!best) return null;
  const parts = String(best.id || '').split(':');
  return {
    action: parts[1] || best.kind || '',
    q: Number(best.q ?? 0),
    target: best.targetId || undefined,
  };
}

function getRelations(world: SimWorld): Array<{ from: string; to: string; trust: number }> {
  const rels = (world.facts as any)?.relations;
  if (!rels || typeof rels !== 'object') return [];
  const out: Array<{ from: string; to: string; trust: number }> = [];
  for (const [fromId, targets] of Object.entries(rels)) {
    if (!targets || typeof targets !== 'object') continue;
    for (const [toId, metrics] of Object.entries(targets as any)) {
      const trust = Number((metrics as any)?.trust ?? 0.5);
      out.push({ from: fromId, to: toId, trust });
    }
  }
  return out;
}

// ─── Bar Component ─────────────────────────────────────────────────────────

const Bar: React.FC<{ value: number; color?: string; label?: string; maxWidth?: number }> = ({
  value, color = '#4ade80', label, maxWidth = 100,
}) => {
  const w = Math.max(0, Math.min(maxWidth, value * maxWidth));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'monospace' }}>
      {label && <span style={{ width: 80, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
      <div style={{ width: maxWidth, height: 8, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: w, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ width: 32, textAlign: 'right', color: '#cbd5e1' }}>{(value * 100).toFixed(0)}%</span>
    </div>
  );
};

// ─── Narrative Log ─────────────────────────────────────────────────────────

type NarrativeEntry = { tick: number; lines: string[]; highlight?: boolean };

const NarrativeLog: React.FC<{ entries: NarrativeEntry[] }> = ({ entries }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); }, [entries.length]);

  return (
    <div ref={ref} style={{
      flex: 1, overflowY: 'auto', padding: 12, fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
      lineHeight: 1.7, background: '#020617', border: '1px solid #1e293b', borderRadius: 8,
    }}>
      {entries.length === 0 && <span style={{ color: '#334155' }}>Нажми ▶ Step или ▶▶ Run...</span>}
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: 6, borderLeft: e.highlight ? '2px solid #f59e0b' : '2px solid #1e293b', paddingLeft: 8 }}>
          <span style={{ color: '#475569', fontSize: 10 }}>t{e.tick}</span>
          {e.lines.map((line, j) => (
            <div key={j} style={{ color: e.highlight ? '#fbbf24' : '#94a3b8' }}>{line}</div>
          ))}
        </div>
      ))}
    </div>
  );
};

// ─── Agent Card ────────────────────────────────────────────────────────────

const AgentCard: React.FC<{
  char: SimCharacter;
  pipeline: any;
  names: Record<string, string>;
  selected: boolean;
  onSelect: () => void;
}> = ({ char, pipeline, names, selected, onSelect }) => {
  const drivers = pipeline ? extractDrivers(pipeline) : {};
  const goals = pipeline ? extractGoals(pipeline) : [];
  const mode = pipeline ? extractMode(pipeline) : '';
  const decision = pipeline ? extractDecision(pipeline) : null;

  const modeLabel = MODE_LABELS[mode] || mode || '—';

  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? '#0c1929' : '#0f172a',
        border: selected ? '1px solid #3b82f6' : '1px solid #1e293b',
        borderRadius: 8, padding: 10, cursor: 'pointer', transition: 'all 0.2s',
        minWidth: 200,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{char.name || char.id}</span>
        <span style={{ fontSize: 10, color: '#64748b', background: '#1e293b', padding: '2px 6px', borderRadius: 4 }}>
          {modeLabel}
        </span>
      </div>

      {/* Vitals */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <Bar value={char.health} color="#22c55e" label="HP" maxWidth={48} />
        <Bar value={char.energy} color="#3b82f6" label="EN" maxWidth={48} />
        <Bar value={1 - char.stress} color="#a855f7" label="CAL" maxWidth={48} />
      </div>

      {/* Decision */}
      {decision && (
        <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 6, fontFamily: 'monospace' }}>
          → {ACTION_LABELS[decision.action] || decision.action}
          {decision.target ? ` → ${names[decision.target] || decision.target}` : ''}
          <span style={{ color: '#475569', marginLeft: 6 }}>Q={decision.q.toFixed(3)}</span>
        </div>
      )}

      {/* Goals (active only) */}
      {goals.filter(g => g.active).map(g => (
        <Bar key={g.domain} value={g.score} color="#22d3ee" label={g.domain} maxWidth={60} />
      ))}

      {/* Drivers (top 3) */}
      {selected && Object.entries(drivers)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([key, val]) => (
          <Bar key={key} value={val} color="#f97316" label={DRIVER_LABELS[key] || key} maxWidth={60} />
        ))
      }
    </div>
  );
};

// ─── Relations Mini ────────────────────────────────────────────────────────

const RelationsMini: React.FC<{ relations: Array<{ from: string; to: string; trust: number }>; names: Record<string, string> }> = ({ relations, names }) => {
  if (!relations.length) return null;
  // Deduplicate: keep strongest per pair.
  const pairs = new Map<string, { from: string; to: string; trust: number }>();
  for (const r of relations) {
    const key = [r.from, r.to].sort().join('↔');
    const existing = pairs.get(key);
    if (!existing || Math.abs(r.trust - 0.5) > Math.abs(existing.trust - 0.5)) pairs.set(key, r);
  }
  const sorted = Array.from(pairs.values()).sort((a, b) => Math.abs(b.trust - 0.5) - Math.abs(a.trust - 0.5)).slice(0, 10);

  return (
    <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
      <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Отношения</div>
      {sorted.map((r, i) => {
        const delta = r.trust - 0.5;
        const color = delta > 0.05 ? '#22c55e' : delta < -0.05 ? '#ef4444' : '#475569';
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
            <span>{names[r.from] || r.from} → {names[r.to] || r.to}</span>
            <span style={{ color }}>{(r.trust * 100).toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Controls Bar ──────────────────────────────────────────────────────────

const ControlsBar: React.FC<{
  tick: number;
  running: boolean;
  speed: number;
  onStep: () => void;
  onRun: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeedChange: (v: number) => void;
}> = ({ tick, running, speed, onStep, onRun, onPause, onReset, onSpeedChange }) => {
  const btn = (label: string, onClick: () => void, disabled = false, accent = false) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 16px', borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: accent ? '#3b82f6' : '#1e293b', color: disabled ? '#334155' : accent ? '#fff' : '#94a3b8',
        fontSize: 13, fontWeight: 600, fontFamily: '"JetBrains Mono", monospace', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
      background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b',
    }}>
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: '#3b82f6', fontWeight: 700, minWidth: 60 }}>
        t={tick}
      </span>
      {btn('▶ Step', onStep, running)}
      {running ? btn('⏸ Pause', onPause) : btn('▶▶ Run', onRun, false, true)}
      {btn('⟲ Reset', onReset)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
        <span style={{ fontSize: 10, color: '#475569' }}>Speed</span>
        <input
          type="range" min={50} max={2000} step={50} value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          style={{ width: 80, accentColor: '#3b82f6' }}
        />
        <span style={{ fontSize: 10, color: '#64748b', width: 40, fontFamily: 'monospace' }}>{speed}ms</span>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────

export const LiveSimulator: React.FC = () => {
  const allCharacters = useMemo(() => getAllCharactersWithRuntime() as CharacterEntity[], []);
  const allLocations = useMemo(() => getEntitiesByType(EntityType.Location) as LocationEntity[], []);

  // ─── Setup state ───
  const [phase, setPhase] = useState<'setup' | 'run'>('setup');
  const [selectedLocationId, setSelectedLocationId] = useState('');

  // ─── Run state ───
  const simRef = useRef<SimKitSimulator | null>(null);
  const [tick, setTick] = useState(0);
  const [narrative, setNarrative] = useState<NarrativeEntry[]>([]);
  const [snapshot, setSnapshot] = useState<SimWorld | null>(null);
  const [lastRecord, setLastRecord] = useState<SimTickRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(400);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const runRef = useRef(false);
  // Optional scenario-layer wiring (phases/triggers/degradation).
  const scenarioConfig = useMemo<ScenarioConfig | null>(() => null, []);

  // ─── Callbacks ───

  const handleStart = useCallback((config: {
    selectedCharIds: string[];
    selectedLocIds: string[];
    placements: Record<string, string>;
  }) => {
    const locations = allLocations.filter(l => config.selectedLocIds.includes(l.entityId));
    const characters = allCharacters.filter(c => config.selectedCharIds.includes(c.entityId));
    if (!locations.length || characters.length < 2) return;

    // Guard placement map at integration boundary to avoid invalid location ids.
    const defaultLocId = locations[0].entityId;
    const locationSet = new Set(locations.map(l => l.entityId));
    const placements: Record<string, string> = {};
    for (const c of characters) {
      const requestedLoc = config.placements?.[c.entityId];
      placements[c.entityId] = requestedLoc && locationSet.has(requestedLoc) ? requestedLoc : defaultLocId;
    }

    const seed = Date.now() % 100000;

    const world = makeSimWorldFromSelection({
      seed,
      locations,
      characters,
      placements,
    } as any);

    const decider = makeGoalLabDeciderPlugin({ storePipeline: true });
    const pipeline = makeGoalLabPipelinePlugin();
    const memory = makePerceptionMemoryPlugin();

    const sim = new SimKitSimulator({
      scenarioId: 'sim:live',
      seed,
      initialWorld: world,
      plugins: [decider, pipeline, memory],
      maxRecords: 200,
    });
    if (scenarioConfig) attachScenario(sim, scenarioConfig);

    simRef.current = sim;
    setTick(0);
    setNarrative([]);
    setSnapshot(sim.world);
    setLastRecord(null);
    setSelectedAgentId(characters[0]?.entityId || '');
    setSelectedLocationId(defaultLocId);
    setPhase('run');
  }, [allCharacters, allLocations, scenarioConfig]);

  const doStep = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;

    const record = sim.step();
    const names = nameMap(sim.world);
    const actions = record.trace.actionsApplied || [];

    // Build narrative lines.
    const lines = actions.map(a => describeAction(a, names));
    if (!lines.length) lines.push('(ничего не произошло)');

    // Detect highlights (trust shifts, mode changes, surprise).
    let highlight = false;
    const deltas = record.trace.deltas?.facts || {};
    for (const [key, { before, after }] of Object.entries(deltas)) {
      if (key.startsWith('ctx:lastAction:')) continue;
      if (typeof before === 'number' && typeof after === 'number' && Math.abs(after - before) > 0.08) {
        highlight = true;
        break;
      }
    }

    setTick(sim.world.tickIndex);
    setSnapshot({ ...sim.world } as any);
    setLastRecord(record);
    setNarrative(prev => [...prev, { tick: record.trace.tickIndex, lines, highlight }]);

    return record;
  }, []);

  const handleStep = useCallback(() => { doStep(); }, [doStep]);

  const handleRun = useCallback(() => {
    runRef.current = true;
    setRunning(true);
  }, []);

  const handlePause = useCallback(() => {
    runRef.current = false;
    setRunning(false);
  }, []);

  const handleReset = useCallback(() => {
    runRef.current = false;
    setRunning(false);
    setPhase('setup');
    simRef.current = null;
    setNarrative([]);
    setSnapshot(null);
    setLastRecord(null);
    setTick(0);
  }, []);

  // Auto-run loop.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (!runRef.current) { clearInterval(id); return; }
      doStep();
    }, speed);
    return () => clearInterval(id);
  }, [running, speed, doStep]);

  // ─── Derived data ───

  const names = useMemo(() => snapshot ? nameMap(snapshot as any) : {}, [snapshot]);

  const characters = useMemo(() => {
    if (!snapshot) return [];
    return Object.values((snapshot as any).characters || {}).sort((a: any, b: any) => a.id.localeCompare(b.id)) as SimCharacter[];
  }, [snapshot]);

  const relations = useMemo(() => snapshot ? getRelations(snapshot as any) : [], [snapshot]);
  const worldView = simRef.current?.world ?? null;

  // Pipeline data for selected agent.
  const selectedPipeline = useMemo(() => {
    if (!lastRecord || !selectedAgentId) return null;
    // The pipeline plugin only stores for one agent. Decider stores last pipeline.
    const stored = (lastRecord.plugins as any)?.goalLabPipeline?.pipeline;
    if (stored?.selfId === selectedAgentId) return stored;
    // Also check sim facts for stored pipeline.
    const fromFacts = (snapshot as any)?.facts?.['sim:goalLab:lastPipeline'];
    if (fromFacts?.selfId === selectedAgentId) return fromFacts;
    return stored || fromFacts || null;
  }, [lastRecord, selectedAgentId, snapshot]);

  // ─── Render ───

  if (phase === 'setup') {
    return (
      <div style={{ background: '#020617', minHeight: '100vh', color: '#e2e8f0' }}>
        <SetupPanel
          characters={allCharacters}
          locations={allLocations}
          onStart={handleStart}
        />
      </div>
    );
  }

  return (
    <div style={{
      background: '#020617', minHeight: '100vh', color: '#e2e8f0',
      display: 'flex', flexDirection: 'column', fontFamily: '"JetBrains Mono", monospace',
    }}>
      {/* Controls */}
      <div style={{ padding: '8px 12px' }}>
        <ControlsBar
          tick={tick} running={running} speed={speed}
          onStep={handleStep} onRun={handleRun} onPause={handlePause} onReset={handleReset}
          onSpeedChange={setSpeed}
        />
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, gap: 8, padding: '0 12px 12px', minHeight: 0 }}>
        {/* Left: Map + Narrative + Dialogue */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 8 }}>
          {worldView && (
            <MacroMap
              world={worldView}
              selectedAgentId={selectedAgentId}
              selectedLocationId={selectedLocationId}
              onSelectAgent={setSelectedAgentId}
              onSelectLocation={setSelectedLocationId}
              height={260}
              width={700}
            />
          )}
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
            Нарратив
          </div>
          <NarrativeLog entries={narrative} />
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
            Диалоги
          </div>
          <div style={{ minHeight: 140, maxHeight: 220, border: '1px solid #1e293b', borderRadius: 8, background: '#020617', padding: 6 }}>
            <DialoguePanel world={worldView as any} actorLabels={names} />
          </div>
        </div>

        {/* Right: Agent cards + relations */}
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
            Агенты
          </div>
          {characters.map((c) => (
            <AgentCard
              key={c.id}
              char={c}
              pipeline={c.id === selectedAgentId ? selectedPipeline : null}
              names={names}
              selected={c.id === selectedAgentId}
              onSelect={() => setSelectedAgentId(c.id)}
            />
          ))}
          <div style={{ marginTop: 8 }}>
            <RelationsMini relations={relations} names={names} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveSimulator;
