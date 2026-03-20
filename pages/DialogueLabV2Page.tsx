// pages/DialogueLabV2Page.tsx
// Dialogue Lab v2: step through a 2-agent conversation.
//
// One step = one full sim tick:
// decider/pipeline choose action -> speech routed/trust-gated -> dialogue log updated.

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { getEntitiesByType, getAllCharactersWithRuntime } from '../data';
import { EntityType } from '../enums';
import type { CharacterEntity, LocationEntity } from '../types';
import { SimKitSimulator } from '../lib/simkit/core/simulator';
import type { SimWorld } from '../lib/simkit/core/types';
import { makeSimWorldFromSelection } from '../lib/simkit/adapters/fromKanonarEntities';
import { makeGoalLabDeciderPlugin } from '../lib/simkit/plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../lib/simkit/plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../lib/simkit/plugins/perceptionMemoryPlugin';
import { getDialogueLog } from '../lib/simkit/dialogue/dialogueState';
import type { DialogueEntry } from '../lib/simkit/dialogue/types';
import { clamp01 } from '../lib/util/math';

const ACT_ICONS: Record<string, string> = {
  inform: '💬',
  ask: '❓',
  propose: '📋',
  accept: '✅',
  reject: '❌',
  counter: '↩',
  threaten: '⚠',
  promise: '🤝',
  command: '📢',
};

const INTENT_COLOR: Record<string, string> = {
  truthful: '#22c55e',
  selective: '#f59e0b',
  deceptive: '#ef4444',
};

type AgentState = {
  emotions: Record<string, number>;
  drivers: Record<string, number>;
  trust: number;
  stress: number;
};

function readAgentState(world: SimWorld, agentId: string, otherId: string): AgentState {
  const facts: any = world.facts || {};
  const trace = facts[`sim:trace:${agentId}`];
  const char = world.characters[agentId];

  return {
    emotions: trace?.emotions || {},
    drivers: trace?.drivers || {},
    trust: clamp01(Number(facts?.relations?.[agentId]?.[otherId]?.trust ?? 0.5)),
    stress: clamp01(Number(char?.stress ?? 0)),
  };
}

const MiniBar: React.FC<{ v: number; color: string; w?: number }> = ({ v, color, w = 50 }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
    <div style={{ width: w, height: 5, background: '#1e293b', borderRadius: 2 }}>
      <div style={{ width: clamp01(v) * w, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ fontSize: 8, color: '#64748b', width: 24 }}>{Math.round(v * 100)}%</span>
  </div>
);

const AgentPanel: React.FC<{ name: string; state: AgentState; color: string }> = ({ name, state, color }) => (
  <div style={{ flex: 1, padding: 8, background: '#0f172a', borderRadius: 6, border: `1px solid ${color}33`, fontSize: 10 }}>
    <div style={{ fontWeight: 700, color, marginBottom: 6 }}>{name}</div>
    <div style={{ marginBottom: 4 }}>
      <span style={{ color: '#475569' }}>trust:</span>{' '}
      <MiniBar v={state.trust} color={state.trust > 0.6 ? '#22c55e' : state.trust < 0.35 ? '#ef4444' : '#f59e0b'} />
    </div>
    <div style={{ marginBottom: 4 }}>
      <span style={{ color: '#475569' }}>stress:</span> <MiniBar v={state.stress} color="#a855f7" />
    </div>
    {Object.entries(state.emotions)
      .filter(([k]) => !['arousal', 'valence'].includes(k))
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, 3)
      .map(([k, v]) => (
        <div key={k}><span style={{ color: '#475569' }}>{k}:</span> <MiniBar v={Number(v)} color="#22d3ee" /></div>
      ))}
  </div>
);

const DialogueEntryView: React.FC<{ entry: DialogueEntry; names: Record<string, string> }> = ({ entry, names }) => (
  <div style={{
    padding: '6px 8px',
    marginBottom: 4,
    borderRadius: 4,
    background: '#0c1929',
    borderLeft: `3px solid ${INTENT_COLOR[entry.intent] || '#475569'}`,
    fontSize: 11,
  }}>
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
      <span style={{ color: '#475569', fontSize: 9 }}>t{entry.tick}</span>
      <span>{ACT_ICONS[entry.act] || '💬'}</span>
      <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{names[entry.speakerId] || entry.speakerId}</span>
      <span style={{ color: '#475569' }}>→</span>
      <span style={{ color: '#94a3b8' }}>{names[entry.targetId] || entry.targetId}</span>
      <span style={{ fontSize: 8, color: INTENT_COLOR[entry.intent] || '#475569', fontWeight: 700 }}>
        {entry.intent !== 'truthful' ? entry.intent.toUpperCase() : ''}
      </span>
    </div>

    <div style={{ color: '#94a3b8', paddingLeft: 16 }}>«{entry.text}»</div>

    {entry.atoms?.length > 0 && (
      <div style={{ paddingLeft: 16, display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>
        {entry.atoms.slice(0, 5).map((a: any, i: number) => (
          <span key={i} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: '#1e293b', color: '#64748b' }}>
            {String(a.id || '').split(':').slice(-2).join(':')}={Math.round(Number(a.magnitude ?? 0) * 100)}%
          </span>
        ))}
      </div>
    )}

    {entry.recipients?.length > 0 && (
      <div style={{ paddingLeft: 16, marginTop: 2, display: 'flex', gap: 3 }}>
        {entry.recipients.map((r: any, i: number) => (
          <span
            key={i}
            style={{
              fontSize: 8,
              padding: '1px 3px',
              borderRadius: 2,
              background: r.accepted ? '#064e3b' : '#7f1d1d',
              color: r.accepted ? '#6ee7b7' : '#fca5a5',
            }}
          >
            {names[r.agentId] || r.agentId}: {r.accepted ? '✓' : '✗'} {Math.round(Number(r.confidence ?? 0) * 100)}%
          </span>
        ))}
      </div>
    )}
  </div>
);

export const DialogueLabV2Page: React.FC = () => {
  const allChars = useMemo(() => getAllCharactersWithRuntime() as CharacterEntity[], []);
  const allLocs = useMemo(() => getEntitiesByType(EntityType.Location) as LocationEntity[], []);

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of allChars) m[c.entityId] = c.title || c.entityId;
    return m;
  }, [allChars]);

  const [speakerId, setSpeakerId] = useState('');
  const [listenerId, setListenerId] = useState('');
  const [locId, setLocId] = useState('');
  const [seed, setSeed] = useState(42);
  const [started, setStarted] = useState(false);
  const [tick, setTick] = useState(0);

  const simRef = useRef<SimKitSimulator | null>(null);
  const [world, setWorld] = useState<SimWorld | null>(null);
  const [dialogueLog, setDialogueLog] = useState<DialogueEntry[]>([]);

  const handleStart = useCallback(() => {
    if (!speakerId || !listenerId || !locId || speakerId === listenerId) return;

    const location = allLocs.filter((l) => l.entityId === locId);
    const chars = allChars.filter((c) => c.entityId === speakerId || c.entityId === listenerId);
    if (location.length === 0 || chars.length < 2) return;

    const initialWorld = makeSimWorldFromSelection({
      seed,
      locations: location,
      characters: chars,
      placements: { [speakerId]: locId, [listenerId]: locId },
    } as any);

    const sim = new SimKitSimulator({
      scenarioId: 'dialogue-lab-v2',
      seed,
      initialWorld,
      plugins: [makeGoalLabDeciderPlugin({ storePipeline: true }), makeGoalLabPipelinePlugin(), makePerceptionMemoryPlugin()],
      maxRecords: 100,
    });

    simRef.current = sim;
    setWorld(sim.world);
    setTick(0);
    setDialogueLog([]);
    setStarted(true);
  }, [allChars, allLocs, listenerId, locId, seed, speakerId]);

  const handleStep = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;

    sim.step();
    setTick(sim.world.tickIndex);
    setWorld({ ...sim.world } as any);
    setDialogueLog(getDialogueLog(sim.world));
  }, []);

  const handleReset = useCallback(() => {
    simRef.current = null;
    setWorld(null);
    setTick(0);
    setDialogueLog([]);
    setStarted(false);
  }, []);

  const stateA = useMemo(() => (world ? readAgentState(world, speakerId, listenerId) : null), [listenerId, speakerId, world]);
  const stateB = useMemo(() => (world ? readAgentState(world, listenerId, speakerId) : null), [listenerId, speakerId, world]);

  if (!started) {
    return (
      <div style={{ background: '#020617', minHeight: '100vh', color: '#e2e8f0', padding: 24, fontFamily: '"JetBrains Mono", monospace' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Dialogue Lab v2</h1>
        <p style={{ fontSize: 11, color: '#64748b', marginBottom: 16 }}>Пошаговый диалог двух персонажей. Step = pipeline → speech → trust gating → belief update.</p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <select value={speakerId} onChange={(e) => setSpeakerId(e.target.value)} style={{ flex: 1, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, padding: 6, fontSize: 11 }}>
            <option value="">— Speaker —</option>
            {allChars.map((c) => <option key={c.entityId} value={c.entityId}>{c.title || c.entityId}</option>)}
          </select>

          <select value={listenerId} onChange={(e) => setListenerId(e.target.value)} style={{ flex: 1, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, padding: 6, fontSize: 11 }}>
            <option value="">— Listener —</option>
            {allChars.map((c) => <option key={c.entityId} value={c.entityId}>{c.title || c.entityId}</option>)}
          </select>

          <select value={locId} onChange={(e) => setLocId(e.target.value)} style={{ flex: 1, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, padding: 6, fontSize: 11 }}>
            <option value="">— Location —</option>
            {allLocs.map((l) => <option key={l.entityId} value={l.entityId}>{l.title || l.entityId}</option>)}
          </select>

          <label style={{ fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            Seed
            <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 42)} style={{ width: 70, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 3, padding: '4px 6px', fontSize: 10 }} />
          </label>
        </div>

        <button
          onClick={handleStart}
          disabled={!speakerId || !listenerId || !locId || speakerId === listenerId}
          style={{
            padding: '8px 24px',
            borderRadius: 6,
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            background: speakerId && listenerId && locId && speakerId !== listenerId ? '#3b82f6' : '#1e293b',
            color: speakerId && listenerId && locId && speakerId !== listenerId ? '#fff' : '#475569',
            cursor: 'pointer',
          }}
        >
          ▶ Начать диалог
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: '#020617', minHeight: '100vh', color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={handleStep} style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>▶ Step (t={tick})</button>
        <button onClick={handleReset} style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 11, cursor: 'pointer' }}>↺ Reset</button>
        <span style={{ fontSize: 10, color: '#64748b' }}>{names[speakerId]} ↔ {names[listenerId]}</span>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ width: 300, borderRight: '1px solid #1e293b', padding: 8, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          {stateA && <AgentPanel name={names[speakerId] || speakerId} state={stateA} color="#3b82f6" />}
          {stateB && <AgentPanel name={names[listenerId] || listenerId} state={stateB} color="#f97316" />}
        </div>

        <div style={{ flex: 1, padding: 8, overflowY: 'auto' }}>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Разговор</div>
          {dialogueLog.length === 0 && <div style={{ color: '#334155', fontSize: 11, fontStyle: 'italic' }}>Нажми Step чтобы начать...</div>}
          {dialogueLog.map((entry, i) => <DialogueEntryView key={`${entry.tick}-${entry.speakerId}-${i}`} entry={entry} names={names} />)}
        </div>
      </div>
    </div>
  );
};
