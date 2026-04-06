// components/sim/DialogueLab.tsx
// DialogueLab v3: Full multi-agent dialogue simulator.
//
// Composition of existing components with dialogue-centric proportions:
//   - SetupPanel (as-is) for character/location selection
//   - MacroMap (compact) for spatial context
//   - DialoguePanel (primary) for speech acts
//   - DyadPanel (NEW) for selected agent ↔ interlocutor comparison
//   - AgentInspector (sidebar) for full trace
//   - NarrativeLog (compact) for non-speech actions

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { EntityType } from '../../types';
import { getEntitiesByType, getAllCharactersWithRuntime } from '../../data';
import type { CharacterEntity, LocationEntity } from '../../types';
import { SimKitSimulator } from '../../lib/simkit/core/simulator';
import type { SimWorld, SimAction } from '../../lib/simkit/core/types';
import { makeSimWorldFromSelection } from '../../lib/simkit/adapters/fromKanonarEntities';
import { makeGoalLabDeciderPlugin } from '../../lib/simkit/plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../../lib/simkit/plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../../lib/simkit/plugins/perceptionMemoryPlugin';
import { getDialogueLog } from '../../lib/simkit/dialogue/dialogueState';
import type { DialogueEntry } from '../../lib/simkit/dialogue/types';

import { SetupPanel } from './SetupPanel';
import { MacroMap } from './MacroMap';
import { DialoguePanel } from './DialoguePanel';
import { AgentInspector } from './AgentInspector';
import { DyadPanel } from './DyadPanel';

// ─── Helpers ──────────────────────────────────────────────────────────

const ACTION_RU: Record<string, string> = {
  wait: 'ждёт', rest: 'отдыхает', hide: 'прячется', escape: 'убегает',
  observe: 'наблюдает', talk: 'говорит с', move: 'идёт в', move_cell: 'двигается',
  attack: 'атакует', negotiate: 'переговоры с', comfort: 'утешает',
  help: 'помогает', treat: 'лечит', guard: 'охраняет', avoid: 'избегает',
  confront: 'конфронтирует с', threaten: 'угрожает', respond: 'отвечает',
};

function nameMap(world: SimWorld): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of Object.values(world.characters || {})) m[c.id] = c.name || c.id;
  return m;
}

function describeAction(a: SimAction, names: Record<string, string>): string {
  const actor = names[a.actorId] || a.actorId;
  const verb = ACTION_RU[a.kind] || a.kind;
  const target = a.targetId ? (names[a.targetId] || a.targetId) : '';
  return `${actor} ${verb}${target ? ` ${target}` : ''}`;
}

/** Find the most recent interlocutor for a given agent from dialogue log. */
function inferInterlocutor(log: DialogueEntry[], selfId: string): string | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.speakerId === selfId && e.targetId) return e.targetId;
    if (e.targetId === selfId && e.speakerId) return e.speakerId;
    if (e.recipients?.some(r => r.agentId === selfId) && e.speakerId) return e.speakerId;
  }
  return null;
}

// ─── Narrative Entry ──────────────────────────────────────────────────

type NarrativeEntry = { tick: number; lines: string[]; highlight?: boolean; beats?: string[] };

const NarrativeLogCompact: React.FC<{ entries: NarrativeEntry[] }> = ({ entries }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div ref={ref} style={{
      flex: 1, minHeight: 80, maxHeight: 140, overflowY: 'auto', padding: 6,
      fontFamily: '"JetBrains Mono", monospace', fontSize: 10, lineHeight: 1.6,
      background: '#020617', border: '1px solid #1e293b', borderRadius: 6,
    }}>
      {!entries.length && <span style={{ color: '#334155', fontStyle: 'italic' }}>Нажми ▶ Step...</span>}
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: 2, borderLeft: e.highlight ? '2px solid #f59e0b' : '2px solid #1e293b', paddingLeft: 5 }}>
          <span style={{ color: '#475569', fontSize: 8 }}>t{e.tick}</span>
          {e.lines.map((line, j) => (
            <span key={j} style={{ color: e.highlight ? '#fbbf24' : '#64748b', marginLeft: 4 }}>{line}</span>
          ))}
          {e.beats?.map((b, j) => (
            <span key={`b${j}`} style={{ color: '#22d3ee', fontSize: 9, marginLeft: 6 }}>★ {b}</span>
          ))}
        </div>
      ))}
    </div>
  );
};

// ─── Controls ─────────────────────────────────────────────────────────

const btnStyle = (enabled: boolean): React.CSSProperties => ({
  padding: '4px 12px', borderRadius: 4, border: '1px solid #334155',
  fontSize: 11, cursor: enabled ? 'pointer' : 'not-allowed', fontWeight: 600,
  background: enabled ? '#1e293b' : '#0f172a', color: enabled ? '#e2e8f0' : '#475569',
  fontFamily: '"JetBrains Mono", monospace',
});

const ControlsBar: React.FC<{
  tick: number; running: boolean; speed: number; tension?: number;
  onStep: () => void; onRun: () => void; onPause: () => void; onReset: () => void;
  onSpeedChange: (s: number) => void;
}> = ({ tick, running, speed, tension, onStep, onRun, onPause, onReset, onSpeedChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
    <button onClick={onStep} disabled={running} style={btnStyle(!running)}>▶ Step</button>
    {running
      ? <button onClick={onPause} style={btnStyle(true)}>⏸ Pause</button>
      : <button onClick={onRun} style={btnStyle(true)}>▶▶ Run</button>
    }
    <button onClick={onReset} style={btnStyle(true)}>↺ Reset</button>
    <span style={{ color: '#64748b', fontSize: 10 }}>t={tick}</span>
    {tension !== undefined && tension > 0 && (
      <span style={{ color: tension > 0.6 ? '#ef4444' : tension > 0.3 ? '#f59e0b' : '#22c55e', fontSize: 10 }}>
        ◆ {Math.round(tension * 100)}%
      </span>
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
      <span style={{ color: '#475569', fontSize: 9 }}>Speed</span>
      <input type="range" min={50} max={1500} step={50} value={speed}
        onChange={(e) => onSpeedChange(Number(e.target.value))} style={{ width: 80, accentColor: '#3b82f6' }} />
      <span style={{ color: '#475569', fontSize: 9, width: 40 }}>{speed}ms</span>
    </div>
  </div>
);

// ─── Agent list (compact) ─────────────────────────────────────────────

const AgentListItem: React.FC<{
  charId: string; world: SimWorld; selected: boolean; names: Record<string, string>; onClick: () => void;
}> = ({ charId, world, selected, names, onClick }) => {
  const char = world.characters?.[charId];
  const trace = (world.facts as any)?.[`sim:trace:${charId}`];
  const best = trace?.best;
  const modeIcon = trace?.decisionMode === 'reactive' ? '⚡' : trace?.decisionMode === 'degraded' ? '⚠' : '';

  if (!char) return null;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '4px 6px', marginBottom: 2, borderRadius: 4, cursor: 'pointer',
        background: selected ? '#1e3a5f' : '#0f172a',
        border: selected ? '1px solid #3b82f6' : '1px solid transparent',
        fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
        display: 'flex', alignItems: 'center', gap: 4,
      }}
    >
      {modeIcon && <span style={{ fontSize: 9 }}>{modeIcon}</span>}
      <span style={{ color: selected ? '#e2e8f0' : '#94a3b8', fontWeight: selected ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {names[charId] || charId}
      </span>
      {best && (
        <span style={{ color: '#64748b', fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>
          {ACTION_RU[trace?.uiAction?.semanticKind || best.kind] || trace?.uiAction?.semanticKind || best.kind}
        </span>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

export const DialogueLab: React.FC = () => {
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
  const runRef = useRef(false);

  // ─── Start ───
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
      seed, locations, characters, placements,
    } as any);

    const sim = new SimKitSimulator({
      scenarioId: 'dialogue-lab-v3',
      seed,
      initialWorld: world,
      plugins: [
        makeGoalLabDeciderPlugin({ storePipeline: true }),
        makeGoalLabPipelinePlugin(),
        makePerceptionMemoryPlugin(),
      ],
      maxRecords: 200,
    });

    simRef.current = sim;
    setTick(0);
    setNarrative([]);
    setSnapshot(sim.world);
    setSelectedAgentId(characters[0]?.entityId || '');
    setPhase('run');
  }, [allCharacters, allLocations]);

  // ─── Step ───
  const doStep = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    const record = sim.step();
    const names = nameMap(sim.world);
    const actions = record.trace.actionsApplied || [];

    // Filter out speech actions for narrative (speech goes to DialoguePanel)
    const nonSpeechActions = actions.filter(a => a.kind !== 'talk' && a.kind !== 'respond');
    const lines = nonSpeechActions.map((a) => describeAction(a, names));

    const tickBeats = (sim as any).beats?.filter((b: any) => b.tick === record.trace.tickIndex) || [];
    const beatLines = tickBeats.map((b: any) => String(b.summary || b.kind || 'beat'));
    const highlight = tickBeats.length > 0 || actions.some((a) => (a.meta as any)?.decisionMode === 'reactive');

    if (lines.length || beatLines.length) {
      setNarrative((prev) => [...prev, { tick: record.trace.tickIndex, lines, highlight, beats: beatLines }]);
    }

    setTick(sim.world.tickIndex);
    setSnapshot({ ...sim.world } as any);
  }, []);

  const handleStep = useCallback(() => doStep(), [doStep]);
  const handleRun = useCallback(() => { runRef.current = true; setRunning(true); }, []);
  const handlePause = useCallback(() => { runRef.current = false; setRunning(false); }, []);
  const handleReset = useCallback(() => {
    runRef.current = false; setRunning(false); setPhase('setup');
    simRef.current = null; setNarrative([]); setSnapshot(null); setTick(0);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (!runRef.current) { clearInterval(id); return; }
      doStep();
    }, speed);
    return () => clearInterval(id);
  }, [running, speed, doStep]);

  // ─── Derived ───
  const worldView = simRef.current?.world ?? snapshot ?? null;
  const names = useMemo(() => (worldView ? nameMap(worldView) : {}), [worldView, tick]);
  const characterIds = useMemo(() => {
    if (!worldView) return [];
    return Object.keys(worldView.characters || {}).sort();
  }, [worldView, tick]);
  const tension = Number((simRef.current as any)?.tensionHistory?.slice?.(-1)?.[0] ?? 0);

  const dialogueLog = useMemo<DialogueEntry[]>(() => {
    if (!worldView) return [];
    return getDialogueLog(worldView);
  }, [worldView, tick]);

  // Infer interlocutor for DyadPanel
  const interlocutorId = useMemo(() => {
    if (!selectedAgentId || !dialogueLog.length) return '';
    return inferInterlocutor(dialogueLog, selectedAgentId) || '';
  }, [dialogueLog, selectedAgentId]);

  // ─── Setup phase ───
  if (phase === 'setup') {
    return (
      <div style={{ background: '#020617', minHeight: '100vh', color: '#e2e8f0' }}>
        <SetupPanel characters={allCharacters} locations={allLocations} onStart={handleStart} />
      </div>
    );
  }

  // ─── Run phase ───
  return (
    <div style={{
      background: '#020617', height: '100vh', color: '#e2e8f0',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"JetBrains Mono", monospace', overflow: 'hidden',
    }}>
      {/* Controls */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <ControlsBar
          tick={tick} running={running} speed={speed} tension={tension}
          onStep={handleStep} onRun={handleRun} onPause={handlePause}
          onReset={handleReset} onSpeedChange={setSpeed}
        />
      </div>

      {/* Main area */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* LEFT COLUMN: Map + Agent List + Inspector */}
        <div style={{
          width: 240, flexShrink: 0, borderRight: '1px solid #1e293b',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* MacroMap (compact) */}
          {worldView && (
            <div style={{ flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
              <MacroMap
                world={worldView}
                selectedAgentId={selectedAgentId}
                onSelectAgent={setSelectedAgentId}
                onSelectLocation={() => {}}
                onManualMove={(charId, locId) => {
                  simRef.current?.enqueueAction({
                    id: `act:move:${tick}:${charId}`, kind: 'move', actorId: charId, targetId: locId,
                  } as any);
                }}
                height={200} width={240}
              />
            </div>
          )}

          {/* Agent list */}
          <div style={{ flexShrink: 0, borderBottom: '1px solid #1e293b', maxHeight: 120, overflowY: 'auto', padding: '4px 4px' }}>
            <div style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, padding: '2px 4px' }}>
              Агенты ({characterIds.length})
            </div>
            {worldView && characterIds.map((id) => (
              <AgentListItem
                key={id} charId={id} world={worldView} names={names}
                selected={id === selectedAgentId}
                onClick={() => setSelectedAgentId(id)}
              />
            ))}
          </div>

          {/* Agent Inspector (scrollable) */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {worldView && selectedAgentId ? (
              <AgentInspector world={worldView} agentId={selectedAgentId} names={names} />
            ) : (
              <div style={{ padding: 12, color: '#475569', fontSize: 11 }}>Выбери агента</div>
            )}
          </div>
        </div>

        {/* RIGHT AREA: Dialogue (primary) + Dyad + Narrative */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          minWidth: 0, gap: 4, padding: '4px 6px', overflow: 'hidden',
        }}>
          {/* DialoguePanel — PRIMARY */}
          <div style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, flexShrink: 0 }}>
            Диалог
          </div>
          <div style={{
            flex: 3, minHeight: 200, border: '1px solid #1e293b', borderRadius: 6,
            background: '#020617', overflow: 'auto',
          }}>
            <DialoguePanel world={worldView as any} actorLabels={names} maxEntries={100} />
          </div>

          {/* DyadPanel — NEW */}
          {selectedAgentId && interlocutorId && (
            <>
              <div style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, flexShrink: 0 }}>
                Диада: {names[selectedAgentId] || selectedAgentId} ↔ {names[interlocutorId] || interlocutorId}
              </div>
              <DyadPanel
                world={worldView}
                agentA={selectedAgentId}
                agentB={interlocutorId}
                names={names}
              />
            </>
          )}

          {/* Narrative log (compact, non-speech only) */}
          <div style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, flexShrink: 0 }}>
            Действия
          </div>
          <NarrativeLogCompact entries={narrative} />
        </div>
      </div>
    </div>
  );
};

export default DialogueLab;
