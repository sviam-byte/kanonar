// components/sim/LiveSimulator.tsx
// v6: Full simulator shell with:
//   - MacroMap (location graph)
//   - LocationMapPanel (actual cell map from LocationEntity)
//   - AgentInspector (full trace: decision, alternatives, emotions, relations)
//   - NarrativeLog + DialoguePanel
//   - Compact agent list for selection

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { EntityType } from '../../enums';
import { getEntitiesByType, getAllCharactersWithRuntime } from '../../data';
import type { CharacterEntity, LocationEntity } from '../../types';
import { SimKitSimulator } from '../../lib/simkit/core/simulator';
import type { SimWorld, SimAction, SimCharacter } from '../../lib/simkit/core/types';
import { makeSimWorldFromSelection } from '../../lib/simkit/adapters/fromKanonarEntities';
import { makeGoalLabDeciderPlugin } from '../../lib/simkit/plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../../lib/simkit/plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../../lib/simkit/plugins/perceptionMemoryPlugin';
import { MacroMap } from './MacroMap';
import { DialoguePanel } from './DialoguePanel';
import { SetupPanel } from './SetupPanel';
import { AgentInspector } from './AgentInspector';
import { LocationMapPanel } from './LocationMapPanel';
import { TimelineChart } from './TimelineChart';

// ─── Helpers ───────────────────────────────────────────────────────────

const ACTION_RU: Record<string, string> = {
  wait: 'ждёт', rest: 'отдыхает', hide: 'прячется', escape: 'убегает',
  observe: 'наблюдает', observe_area: 'осматривается', talk: 'говорит с',
  ask_info: 'спрашивает', negotiate: 'переговоры с', comfort: 'утешает',
  help: 'помогает', treat: 'лечит', guard: 'охраняет', attack: 'атакует',
  avoid: 'избегает', confront: 'конфронтирует с', threaten: 'угрожает',
  command: 'командует', respond: 'отвечает', move: 'идёт в',
  move_cell: 'двигается',
  investigate: 'расследует', share_resource: 'делится',
  accuse: 'обвиняет', praise: 'хвалит', apologize: 'извиняется',
  submit: 'подчиняется', deceive: 'обманывает', self_talk: 'размышляет',
  retreat: 'отступает', rally: 'собирает группу', suppress: 'подавляет',
  patrol: 'патрулирует', cover_fire: 'прикрывает', take_cover: 'укрывается',
  hold_position: 'удерживает позицию',
  confide: 'доверяется', encourage: 'подбадривает', warn: 'предупреждает',
  plead: 'умоляет', challenge: 'бросает вызов',
  mourn: 'скорбит', celebrate: 'празднует',
  escort: 'сопровождает', signal: 'подаёт сигнал', call_backup: 'зовёт подкрепление',
  loot: 'мародёрствует', betray: 'предаёт', recruit: 'вербует',
  cooperate: 'сотрудничает с', protect: 'защищает',
  propose_trade: 'предлагает сделку', verify: 'проверяет',
  observe_target: 'наблюдает за', monologue: 'рассуждает вслух',
  question_about: 'расспрашивает',
};

const SOCIAL_RU: Record<string, string> = {
  inform: 'делится информацией', offer_resource: 'предлагает помощь',
  request_access: 'просит доступ', intimidate: 'давит',
  insult: 'оскорбляет', confront: 'противостоит',
  help: 'помогает', cooperate: 'предлагает сотрудничество',
  protect: 'обещает защиту', submit: 'уступает',
  threaten: 'угрожает',
};

function nameMap(world: SimWorld): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of Object.values(world.characters || {})) m[c.id] = c.name || c.id;
  return m;
}

function describeAction(a: SimAction, names: Record<string, string>, world?: SimWorld): string {
  const actor = names[a.actorId] || a.actorId;
  const target = a.targetId ? (names[a.targetId] || a.targetId) : '';
  const mode = (a.meta as any)?.decisionMode;
  const prefix = mode === 'reactive' ? '⚡ ' : mode === 'degraded' ? '⚠ ' : '';

  // ── Intent actions: show what the intent is ABOUT, not raw kind ──
  if (a.kind === 'start_intent') {
    const original = (a.payload as any)?.intent?.originalAction;
    const origKind = original?.kind || '';
    const social = original?.meta?.social || '';
    const socialRu = SOCIAL_RU[social] || social;
    const origVerb = ACTION_RU[origKind] || origKind;
    const reason = getTopReason(a, world);
    const what = socialRu
      ? `${actor} начинает: ${origVerb} ${target} (${socialRu})`
      : `${actor} начинает: ${origVerb} ${target}`;
    return reason ? `${prefix}${what} — ${reason}` : `${prefix}${what}`;
  }

  if (a.kind === 'continue_intent') {
    const suppressed = (a.meta as any)?.suppressedAction;
    const intentData = world?.facts?.[`intent:${a.actorId}`] as any;
    const original = intentData?.intent?.originalAction;
    const stageIdx = intentData?.stageIndex ?? '?';
    const stageKind = intentData?.intentScript?.stages?.[stageIdx]?.kind || '';
    const origKind = original?.kind || '';
    const origVerb = ACTION_RU[origKind] || origKind;

    // Keep stage labels explicit for UI traceability:
    // user should see the transaction phase, not a generic "continue".
    const stageRu: Record<string, string> = {
      approach: 'подходит к', attach: 'обращается к',
      execute: 'говорит с', detach: 'завершает',
    };
    const stageLabel = stageRu[stageKind] || stageKind;
    const base = target
      ? `${actor} ${stageLabel} ${target}`
      : `${actor} продолжает: ${origVerb}`;
    if (suppressed) {
      return `${prefix}${base} (хотел ${ACTION_RU[suppressed] || suppressed})`;
    }
    return `${prefix}${base}`;
  }

  const verb = ACTION_RU[a.kind] || a.kind;
  const reason = getTopReason(a, world);
  const base = target ? `${prefix}${actor} ${verb} ${target}` : `${prefix}${actor} ${verb}`;
  return reason ? `${base} — ${reason}` : base;
}

function getTopReason(a: SimAction, world?: SimWorld): string {
  if (!world) return '';
  const trace = (world.facts as any)?.[`sim:trace:${a.actorId}`];
  if (!trace) return '';

  const drivers: Record<string, number> = trace.drivers || {};
  const topDriver = Object.entries(drivers)
    .filter(([, v]) => typeof v === 'number' && v > 0.2)
    .sort((x, y) => y[1] - x[1])[0];

  const goals: Array<{ domain: string; score: number }> = trace.activeGoals || trace.goals || [];
  const topGoal = goals.length ? goals[0] : null;

  const DRIVER_RU: Record<string, string> = {
    safetyNeed: 'безопасность', controlNeed: 'контроль',
    statusNeed: 'статус', affiliationNeed: 'привязанность',
    resolveNeed: 'решимость', restNeed: 'усталость',
    curiosityNeed: 'любопытство',
  };
  const GOAL_RU: Record<string, string> = {
    safety: 'безопасность', control: 'контроль', affiliation: 'связи',
    status: 'статус', exploration: 'исследование', order: 'порядок',
    rest: 'отдых', wealth: 'ресурсы',
  };

  const parts: string[] = [];
  if (topGoal) {
    const goalName = GOAL_RU[topGoal.domain] || topGoal.domain;
    parts.push(`цель: ${goalName}`);
  }
  if (topDriver) {
    const drvName = DRIVER_RU[topDriver[0]] || topDriver[0];
    parts.push(`${drvName} ${Math.round(topDriver[1] * 100)}%`);
  }

  const ci = trace.communicativeIntent;
  if (ci?.topic?.primary) {
    parts.push(`тема: ${ci.topic.primary}`);
  }

  return parts.join(', ');
}

type NarrativeEntry = { tick: number; lines: string[]; highlight?: boolean; beats?: string[] };

const NarrativeLog: React.FC<{ entries: NarrativeEntry[] }> = ({ entries }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Auto-scroll keeps newest causal chain visible while running.
    // This is intentionally smooth to preserve readability in live mode.
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div ref={ref} style={{
      flex: 1,
      minHeight: 120,
      maxHeight: 250,
      overflowY: 'auto',
      padding: 8,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 11,
      lineHeight: 1.7,
      background: '#020617',
      border: '1px solid #1e293b',
      borderRadius: 6,
    }}>
      {!entries.length && <span style={{ color: '#334155' }}>Нажми ▶ Step или ▶▶ Run...</span>}
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: 4, borderLeft: e.highlight ? '2px solid #f59e0b' : '2px solid #1e293b', paddingLeft: 6 }}>
          <span style={{ color: '#475569', fontSize: 9 }}>t{e.tick}</span>
          {e.lines.map((line, j) => (
            <div key={j} style={{ color: e.highlight ? '#fbbf24' : '#94a3b8' }}>{line}</div>
          ))}
          {e.beats?.map((b, j) => (
            <div key={`b${j}`} style={{ color: '#22d3ee', fontSize: 10, paddingLeft: 8 }}>★ {b}</div>
          ))}
        </div>
      ))}
    </div>
  );
};

const AgentListItem: React.FC<{
  char: SimCharacter;
  world: SimWorld;
  selected: boolean;
  names: Record<string, string>;
  onClick: () => void;
}> = ({ char, world, selected, names, onClick }) => {
  // Read-only render view: no mutation here to keep debug list deterministic.
  const trace = (world.facts as any)?.[`sim:trace:${char.id}`];
  const action = trace?.best;
  const modeIcon = trace?.decisionMode === 'reactive' ? '⚡' : trace?.decisionMode === 'degraded' ? '⚠' : '';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 6px',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 10,
        transition: 'all 0.15s',
        background: selected ? '#0c1929' : 'transparent',
        border: selected ? '1px solid #3b82f6' : '1px solid transparent',
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: char.health > 0.5 ? '#22c55e' : char.health > 0.2 ? '#f59e0b' : '#ef4444',
        }}
      />
      <span style={{ flex: 1, fontWeight: selected ? 700 : 400, color: selected ? '#e2e8f0' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {modeIcon} {char.name || char.id}
      </span>
      {action && (() => {
        let label = ACTION_RU[action.kind] || action.kind;
        const tgt = action.targetId ? `→${(names[action.targetId] || action.targetId).slice(0, 6)}` : '';

        const intentData = (world.facts as any)?.[`intent:${char.id}`];
        if (intentData?.intent?.originalAction) {
          const orig = intentData.intent.originalAction;
          const origLabel = ACTION_RU[orig.kind] || orig.kind;
          const social = orig.meta?.social;
          label = social ? `${origLabel} (${SOCIAL_RU[social] || social})` : origLabel;
        }

        const explanation = Array.isArray(trace?.best?.explanation) ? trace.best.explanation[0] : '';
        const explShort = explanation ? explanation.replace(/^[⚡⚠🎯📋]\s*/, '').slice(0, 30) : '';

        return (
          <span style={{ color: '#64748b', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}
            title={explanation || undefined}
          >
            {label}{tgt}{explShort ? ` · ${explShort}` : ''}
          </span>
        );
      })()}
    </div>
  );
};

const ControlsBar: React.FC<{
  tick: number;
  running: boolean;
  speed: number;
  tension?: number;
  onStep: () => void;
  onRun: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeedChange: (s: number) => void;
}> = ({ tick, running, speed, tension, onStep, onRun, onPause, onReset, onSpeedChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
    <button onClick={onStep} disabled={running} style={btnStyle(!running)}>▶ Step</button>
    {running ? <button onClick={onPause} style={btnStyle(true)}>⏸ Pause</button> : <button onClick={onRun} style={btnStyle(true)}>▶▶ Run</button>}
    <button onClick={onReset} style={btnStyle(true)}>↺ Reset</button>
    <span style={{ color: '#64748b', fontSize: 10 }}>t={tick}</span>
    {tension !== undefined && (
      <span style={{ color: tension > 0.6 ? '#ef4444' : tension > 0.3 ? '#f59e0b' : '#22c55e', fontSize: 10 }}>
        ◆ {Math.round(tension * 100)}%
      </span>
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
      <span style={{ color: '#475569', fontSize: 9 }}>Speed</span>
      <input
        type="range"
        min={50}
        max={1500}
        step={50}
        value={speed}
        onChange={(e) => onSpeedChange(Number(e.target.value))}
        style={{ width: 80, accentColor: '#3b82f6' }}
      />
      <span style={{ color: '#475569', fontSize: 9, width: 40 }}>{speed}ms</span>
    </div>
  </div>
);

const btnStyle = (enabled: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: 4,
  border: '1px solid #334155',
  fontSize: 11,
  cursor: enabled ? 'pointer' : 'not-allowed',
  fontWeight: 600,
  background: enabled ? '#1e293b' : '#0f172a',
  color: enabled ? '#e2e8f0' : '#475569',
  fontFamily: '"JetBrains Mono", monospace',
});

export const LiveSimulator: React.FC = () => {
  const allCharacters = useMemo(() => getAllCharactersWithRuntime() as CharacterEntity[], []);
  const allLocations = useMemo(() => getEntitiesByType(EntityType.Location) as LocationEntity[], []);

  const [phase, setPhase] = useState<'setup' | 'run'>('setup');
  const simRef = useRef<SimKitSimulator | null>(null);
  const [tick, setTick] = useState(0);
  const [narrative, setNarrative] = useState<NarrativeEntry[]>([]);
  const [snapshot, setSnapshot] = useState<SimWorld | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(400);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const runRef = useRef(false);

  const handleStart = useCallback((config: {
    selectedCharIds: string[];
    selectedLocIds: string[];
    placements: Record<string, string>;
  }) => {
    const locations = allLocations.filter((l) => config.selectedLocIds.includes(l.entityId));
    const characters = allCharacters.filter((c) => config.selectedCharIds.includes(c.entityId));
    if (!locations.length || characters.length < 2) return;

    const defaultLocId = locations[0].entityId;
    const locationSet = new Set(locations.map((l) => l.entityId));
    const placements: Record<string, string> = {};
    for (const c of characters) {
      const requested = config.placements?.[c.entityId];
      placements[c.entityId] = requested && locationSet.has(requested) ? requested : defaultLocId;
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

    simRef.current = sim;
    setTick(0);
    setNarrative([]);
    setSnapshot(sim.world);
    setSelectedAgentId(characters[0]?.entityId || '');
    setSelectedLocationId(Object.keys(sim.world.locations || {})[0] || defaultLocId);
    setPhase('run');
  }, [allCharacters, allLocations]);

  const doStep = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    const record = sim.step();
    const names = nameMap(sim.world);
    const actions = record.trace.actionsApplied || [];

    const lines = actions.map((a: any) => describeAction(a, names, sim.world));

    const allEvents = [
      ...((record as any).trace?.eventsApplied || []),
      ...(sim.world.events || []),
    ];
    const seenSpeech = new Set<string>();
    for (const ev of allEvents) {
      if (!ev || String(ev.type) !== 'speech:v1') continue;
      const p = (ev as any).payload || ev;
      const from = String(p.actorId || '');
      const to = String(p.targetId || '');
      const dedup = `${from}:${to}:${record.trace.tickIndex}`;
      if (seenSpeech.has(dedup) || !from) continue;
      seenSpeech.add(dedup);

      const fromName = names[from] || from;
      const toName = to ? (names[to] || to) : '';
      const text = String(p.text || '');
      const act = String(p.act || 'inform');
      const topic = String(p.topic || '');
      const intent = (p as any).intent || '';

      const ACT_RU: Record<string, string> = {
        inform: 'сообщает', ask: 'спрашивает', promise: 'обещает',
        threaten: 'угрожает', negotiate: 'предлагает', order: 'приказывает',
        plead: 'просит', warn: 'предупреждает', confide: 'доверяет',
      };
      const actLabel = ACT_RU[act] || act;
      const topicLabel = topic && topic !== act ? ` [${topic}]` : '';
      const intentSuffix = intent === 'deceptive' ? ' ⚠️ ложь' : intent === 'selective' ? ' ◐ выборочно' : '';

      if (toName) {
        lines.push(`  💬 ${fromName} ${actLabel} ${toName}${topicLabel}: "${text}"${intentSuffix}`);
      } else {
        lines.push(`  💬 ${fromName} ${actLabel}${topicLabel}: "${text}"${intentSuffix}`);
      }
    }

    for (const ev of allEvents) {
      if (!ev) continue;
      const type = String((ev as any).type || '');
      if (type !== 'action:intent_complete') continue;
      const p = (ev as any).payload || ev;
      const actorName = names[String(p.actorId || '')] || String(p.actorId || '');
      const scriptId = String(p.scriptId || '');
      if (scriptId) {
        lines.push(`  ✓ ${actorName} завершил: ${scriptId.replace(/^dialog:/, '')}`);
      }
    }

    if (!lines.length) lines.push('(ничего не произошло)');

    const tickBeats = (sim as any).beats?.filter((b: any) => b.tick === record.trace.tickIndex) || [];
    const beatLines = tickBeats.map((b: any) => String(b.summary || b.kind || 'beat'));
    const highlight = tickBeats.length > 0 || actions.some((a: any) => (a.meta as any)?.decisionMode === 'reactive');

    setTick(sim.world.tickIndex);
    setSnapshot({ ...sim.world } as any);
    setNarrative((prev) => [...prev, { tick: record.trace.tickIndex, lines, highlight, beats: beatLines }]);
  }, []);

  const handleStep = useCallback(() => doStep(), [doStep]);
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
    setTick(0);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (!runRef.current) {
        clearInterval(id);
        return;
      }
      doStep();
    }, speed);
    return () => clearInterval(id);
  }, [running, speed, doStep]);

  const worldView = simRef.current?.world ?? null;
  const names = useMemo(() => (worldView ? nameMap(worldView) : {}), [worldView, tick]);
  const characters = useMemo(() => {
    if (!worldView) return [];
    return Object.values(worldView.characters || {}).sort((a: any, b: any) => a.id.localeCompare(b.id)) as SimCharacter[];
  }, [worldView, tick]);
  const tension = Number((simRef.current as any)?.tensionHistory?.slice?.(-1)?.[0] ?? 0);

  if (phase === 'setup') {
    return (
      <div style={{ background: '#020617', minHeight: '100vh', color: '#e2e8f0' }}>
        <SetupPanel characters={allCharacters} locations={allLocations} onStart={handleStart} />
      </div>
    );
  }

  return (
    <div style={{
      background: '#020617',
      height: '100vh',
      color: '#e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"JetBrains Mono", monospace',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <ControlsBar
          tick={tick}
          running={running}
          speed={speed}
          tension={tension}
          onStep={handleStep}
          onRun={handleRun}
          onPause={handlePause}
          onReset={handleReset}
          onSpeedChange={setSpeed}
        />
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 4, padding: '4px 6px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, minHeight: 200, maxHeight: 280 }}>
            {worldView && (
              <MacroMap
                world={worldView}
                selectedAgentId={selectedAgentId}
                selectedLocationId={selectedLocationId}
                onSelectAgent={setSelectedAgentId}
                onSelectLocation={setSelectedLocationId}
                onManualMove={(charId, locId) => {
                  simRef.current?.enqueueAction({
                    id: `act:move:${tick}:${charId}`,
                    kind: 'move',
                    actorId: charId,
                    targetId: locId,
                  } as any);
                }}
                height={240}
                width={380}
              />
            )}
            {worldView && selectedLocationId && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <LocationMapPanel
                  world={worldView}
                  locationId={selectedLocationId}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={setSelectedAgentId}
                  onMoveAgent={(agentId, x, y) => {
                    simRef.current?.enqueueAction({
                      id: `act:move_xy:${tick}:${agentId}`,
                      kind: 'move_xy',
                      actorId: agentId,
                      payload: { x, y, locationId: selectedLocationId },
                    } as any);
                  }}
                  height={240}
                />
              </div>
            )}
          </div>

          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, flexShrink: 0 }}>
            Таймлайн
          </div>
          <TimelineChart
            sim={simRef.current}
            selectedAgentId={selectedAgentId}
            names={names}
            height={100}
            width={700}
          />

          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, flexShrink: 0 }}>
            Нарратив
          </div>
          <NarrativeLog entries={narrative} />

          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, flexShrink: 0 }}>
            Диалоги
          </div>
          <div style={{ minHeight: 100, maxHeight: 160, border: '1px solid #1e293b', borderRadius: 6, background: '#020617', padding: 4, overflow: 'auto' }}>
            <DialoguePanel world={worldView as any} actorLabels={names} />
          </div>
        </div>

        <div style={{ width: 180, borderLeft: '1px solid #1e293b', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, padding: '6px 6px 3px' }}>
            Агенты ({characters.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
            {worldView && characters.map((c) => (
              <AgentListItem
                key={c.id}
                char={c}
                world={worldView}
                names={names}
                selected={c.id === selectedAgentId}
                onClick={() => setSelectedAgentId(c.id)}
              />
            ))}
          </div>
        </div>

        <div style={{ width: 320, flexShrink: 0, overflowY: 'auto', borderLeft: '1px solid #1e293b', padding: '4px 0' }}>
          {worldView && selectedAgentId ? (
            <AgentInspector world={worldView} agentId={selectedAgentId} names={names} />
          ) : (
            <div style={{ padding: 12, color: '#475569', fontSize: 11 }}>Выбери агента в списке или на карте</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveSimulator;
