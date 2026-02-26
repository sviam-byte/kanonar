/**
 * GoalLabShell v2 — full three-panel layout.
 *
 * LEFT   — Scene setup controls (cast, location, scenario, events)
 * CENTER — GoalLabResults (full internal TAB_REGISTRY)
 * RIGHT  — Causal chain inspector (pipeline -> atoms -> channels -> drivers -> goals -> decision)
 *
 * Notes:
 * - Shell owns layout only; heavy data rendering remains delegated to existing panels.
 * - All optional/partial data is guarded to keep UI crash-safe.
 */

import React, { Suspense, lazy, useMemo, useState, useEffect } from 'react';
import { useGoalLab } from '../../contexts/GoalLabContext';
import { allLocations } from '../../data/locations';
import { allScenarioDefs } from '../../data/scenarios/index';
import { eventRegistry } from '../../data/events-registry';
import { SCENE_PRESETS } from '../../lib/scene/presets';
import type { ContextAtom } from '../../lib/context/v2/types';
import { WorldModelPanel } from './WorldModelPanel';
import { DecisionAnatomyPanel } from './DecisionAnatomyPanel';
import { CurvesPanel } from './CurvesPanel';
import { GraphEnergyPanel } from './GraphEnergyPanel';
import { PomdpPanel } from './PomdpPanel';
import { OtherMindPanel } from './OtherMindPanel';
import { SceneMapPanel } from './SceneMapPanel';

// ---------------------------------------------------------------------------
// Lazy panels
// ---------------------------------------------------------------------------

const GoalLabResults = lazy(() =>
  import('../goal-lab/GoalLabResults').then(m => ({ default: m.GoalLabResults }))
);

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

const PanelLoader = () => (
  <div className="flex items-center justify-center h-full min-h-[80px]">
    <span className="text-[9px] text-slate-600 uppercase tracking-[0.2em] animate-pulse">…</span>
  </div>
);

// ---------------------------------------------------------------------------
// Compact scene setup (inline, no GoalLabControls dependency for MVP)
// ---------------------------------------------------------------------------

const SceneSetup: React.FC = () => {
  const ctx = useGoalLab();
  const { world, allCharacters, sceneControl, setSceneControl, selectedEventIds, toggleEvent } = ctx;
  const [collapsed, setCollapsed] = useState({ chars: false, loc: false, scene: false, events: true });

  const toggle = (k: keyof typeof collapsed) => setCollapsed(prev => ({ ...prev, [k]: !prev[k] }));

  const scenarioKeys = Object.keys(allScenarioDefs || {});
  const scenePresetKeys = Object.keys(SCENE_PRESETS || {});
  const events = eventRegistry.getAll() || [];
  const participants = Array.from(world.sceneParticipants || []);

  return (
    <div className="space-y-0.5 text-[10px]">
      {/* Characters */}
      <Section title="Characters" open={!collapsed.chars} toggle={() => toggle('chars')}>
        <div className="space-y-1">
          {(allCharacters || []).map((ch: any) => {
            const isIn = participants.includes(ch.entityId);
            const isPerspective = world.perspectiveId === ch.entityId;
            return (
              <div key={ch.entityId} className="flex items-center gap-1.5 group">
                <button
                  onClick={() => (isIn ? world.removeParticipant(ch.entityId) : world.addParticipant(ch.entityId))}
                  className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition ${
                    isIn
                      ? 'bg-cyan-600/40 border-cyan-500/60 text-cyan-200'
                      : 'border-slate-700 text-transparent hover:border-slate-500'
                  }`}
                >
                  {isIn && <span className="text-[7px]">✓</span>}
                </button>
                <button
                  onClick={() => world.setPerspectiveAgentId(ch.entityId)}
                  className={`flex-1 text-left truncate transition ${
                    isPerspective ? 'text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={isPerspective ? 'Current perspective' : 'Set as perspective'}
                >
                  {isPerspective && <span className="text-cyan-500 mr-1">◉</span>}
                  {ch.title || ch.entityId}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 text-[9px] text-slate-600">Click name → perspective · Checkbox → in scene</div>
      </Section>

      {/* Location */}
      <Section title="Location" open={!collapsed.loc} toggle={() => toggle('loc')}>
        <select
          value={world.selectedLocationId}
          onChange={e => {
            world.setSelectedLocationId(e.target.value);
            world.setLocationMode('preset');
          }}
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300"
        >
          <option value="">— none —</option>
          {(allLocations || []).map((loc: any) => (
            <option key={loc.entityId} value={loc.entityId}>
              {loc.title}
            </option>
          ))}
        </select>
      </Section>

      {/* Scenario */}
      <Section title="Scenario" open={!collapsed.scene} toggle={() => toggle('scene')}>
        <select
          value={world.activeScenarioId}
          onChange={e => world.setActiveScenarioId(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 mb-1.5"
        >
          {scenarioKeys.map(k => (
            <option key={k} value={k}>
              {allScenarioDefs[k]?.title || k}
            </option>
          ))}
        </select>

        <div className="text-[9px] text-slate-500 mt-1">Scene preset</div>
        <select
          value={sceneControl?.presetId || 'safe_hub'}
          onChange={e => setSceneControl({ ...sceneControl, presetId: e.target.value })}
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300"
        >
          {scenePresetKeys.map(k => (
            <option key={k} value={k}>
              {SCENE_PRESETS[k]?.title || k}
            </option>
          ))}
        </select>

        <button
          onClick={world.forceRebuild}
          className="mt-2 w-full py-1 bg-cyan-700/30 border border-cyan-600/40 rounded text-cyan-300 hover:bg-cyan-700/50 transition text-[9px] uppercase tracking-wider"
        >
          Rebuild World
        </button>
      </Section>

      {/* Events */}
      <Section title={`Events (${selectedEventIds.size})`} open={!collapsed.events} toggle={() => toggle('events')}>
        {events.length === 0 ? (
          <div className="text-slate-600 italic">No events registered</div>
        ) : (
          <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar">
            {events.map((ev: any) => (
              <label key={ev.id} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEventIds.has(ev.id)}
                  onChange={() => toggleEvent(ev.id)}
                  className="w-3 h-3 rounded accent-cyan-500"
                />
                <span className="truncate text-slate-400">{ev.title || ev.id}</span>
              </label>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Causal Chain Inspector (RIGHT panel)
// ---------------------------------------------------------------------------

const CausalChain: React.FC = () => {
  const { engine } = useGoalLab();

  const stages = useMemo(() => {
    // Use snapshotV1.meta.pipelineDeltas — the canonical delta format with full/added/changed.
    const raw = (engine.snapshotV1 as any)?.meta?.pipelineDeltas;
    if (!Array.isArray(raw)) return [];

    return raw.map((s: any, i: number) => ({
      id: s?.id || `S${i}`,
      label: s?.label || s?.id || `S${i}`,
      atomCount: s?.atomCount || (Array.isArray(s?.full) ? s.full.length : 0),
      addedCount: Array.isArray(s?.added) ? s.added.length : 0,
      changedCount: Array.isArray(s?.changed) ? s.changed.length : 0,
    }));
  }, [engine.snapshotV1]);

  const atomCategories = useMemo(() => {
    const atoms: ContextAtom[] = engine.passportAtoms || [];
    const cats: Record<string, { count: number; topMag: number; examples: string[] }> = {};

    for (const atom of atoms) {
      const id = String((atom as any).id || '');
      const ns = id.split(':')[0] || 'unknown';
      if (!cats[ns]) cats[ns] = { count: 0, topMag: 0, examples: [] };

      cats[ns].count += 1;
      const mag = Number((atom as any).magnitude ?? 0);
      if (mag > cats[ns].topMag) cats[ns].topMag = mag;
      if (cats[ns].examples.length < 2) cats[ns].examples.push(id);
    }

    return Object.entries(cats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15);
  }, [engine.passportAtoms]);

  const energyChannels = useMemo(() => {
    const atoms: any[] = engine.passportAtoms || [];
    const channels: Array<{ name: string; raw: number; felt: number }> = [];
    const prefixes = ['threat', 'norm', 'attachment', 'curiosity', 'status', 'autonomy'];

    for (const channelName of prefixes) {
      const rawAtom = atoms.find(a => String(a?.id).startsWith(`ener:raw:${channelName}:`));
      const feltAtom = atoms.find(a => String(a?.id).startsWith(`ener:felt:${channelName}:`));
      if (rawAtom || feltAtom) {
        channels.push({
          name: channelName,
          raw: Number(rawAtom?.magnitude ?? 0),
          felt: Number(feltAtom?.magnitude ?? 0),
        });
      }
    }

    return channels;
  }, [engine.passportAtoms]);

  const drivers = useMemo(() => {
    const atoms: any[] = engine.passportAtoms || [];
    return atoms
      .filter(a => String(a?.id).startsWith('drv:'))
      .map(a => ({ id: String(a.id), mag: Number(a.magnitude ?? 0), label: String(a.label || a.id) }))
      .sort((a, b) => b.mag - a.mag)
      .slice(0, 8);
  }, [engine.passportAtoms]);

  const decision = useMemo(() => {
    const d = (engine.snapshotV1 as any)?.decision;
    if (!d) return null;
    const ranked = Array.isArray(d.ranked) ? d.ranked : Array.isArray(d) ? d : [];

    return ranked.slice(0, 5).map((r: any) => ({
      label: r?.action?.label || r?.action?.id || r?.label || '?',
      q: Number(r?.q ?? r?.score ?? 0),
    }));
  }, [engine.snapshotV1]);

  const topGoals = useMemo(() => {
    return (engine.goals || []).slice(0, 6).map((g: any) => ({
      id: g.goalId || g.id || '?',
      label: g.label || g.goalId || g.id,
      prob: Number(g.probability ?? 0),
    }));
  }, [engine.goals]);

  return (
    <div className="space-y-2 text-[10px]">
      <ChainSection title="Pipeline Stages" count={stages.length}>
        <div className="space-y-px">
          {stages.map(s => {
            const isActive = engine.pipelineStageId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => engine.setPipelineStageId(s.id)}
                className={`w-full text-left px-1.5 py-0.5 rounded flex items-center gap-1.5 transition ${
                  isActive
                    ? 'bg-cyan-900/40 text-cyan-300'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <span className="font-mono text-[8px] w-8 shrink-0 text-right opacity-60">{s.id}</span>
                <span className="flex-1 truncate">{s.label}</span>
                <span className="text-[8px] opacity-50">{s.atomCount}a</span>
                {s.addedCount > 0 && <span className="text-green-500 text-[8px]">+{s.addedCount}</span>}
                {s.changedCount > 0 && <span className="text-amber-500 text-[8px]">~{s.changedCount}</span>}
              </button>
            );
          })}
        </div>
      </ChainSection>

      <Arrow />

      <ChainSection title="Atoms by Namespace" count={atomCategories.reduce((sum, [, v]) => sum + v.count, 0)}>
        <div className="space-y-0.5">
          {atomCategories.map(([ns, data]) => (
            <div key={ns} className="flex items-center gap-1.5">
              <span className="font-mono w-12 text-right text-cyan-600 shrink-0">{ns}</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-600/60 rounded-full" style={{ width: `${Math.min(100, data.count / 2)}%` }} />
              </div>
              <span className="text-slate-500 w-6 text-right">{data.count}</span>
            </div>
          ))}
        </div>
      </ChainSection>

      <Arrow />

      <ChainSection title="Energy Channels" count={energyChannels.length}>
        {energyChannels.length === 0 ? (
          <div className="text-slate-600 italic">No energy atoms yet</div>
        ) : (
          <div className="space-y-1">
            {energyChannels.map(ch => (
              <div key={ch.name} className="flex items-center gap-1.5">
                <span className="w-16 text-right text-slate-400 shrink-0">{ch.name}</span>
                <div className="flex-1 flex gap-0.5">
                  <Bar value={ch.raw} color="bg-amber-600/60" label="raw" />
                  <Bar value={ch.felt} color="bg-rose-500/60" label="felt" />
                </div>
              </div>
            ))}
          </div>
        )}
      </ChainSection>

      <Arrow />

      <ChainSection title="Drivers" count={drivers.length}>
        {drivers.map(d => (
          <div key={d.id} className="flex items-center gap-1.5">
            <span className="flex-1 truncate text-slate-400">{d.label}</span>
            <MagBadge value={d.mag} />
          </div>
        ))}
      </ChainSection>

      <Arrow />

      <ChainSection title="Active Goals" count={topGoals.length}>
        {topGoals.map(g => (
          <div key={g.id} className="flex items-center gap-1.5">
            <span className="flex-1 truncate text-slate-300">{g.label}</span>
            <span className="text-[9px] font-mono text-amber-400">{(g.prob * 100).toFixed(0)}%</span>
          </div>
        ))}
      </ChainSection>

      <Arrow />

      <ChainSection title="Decision (ranked actions)">
        {decision ? (
          <div className="space-y-0.5">
            {decision.map((d: any, i: number) => (
              <div
                key={`${d.label}-${i}`}
                className={`flex items-center gap-1.5 ${i === 0 ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}
              >
                <span className="w-3 text-right text-[8px] opacity-50">{i + 1}</span>
                <span className="flex-1 truncate">{d.label}</span>
                <span className="text-[9px] font-mono">{d.q.toFixed(2)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-600 italic">No decision yet</div>
        )}
      </ChainSection>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Micro-components
// ---------------------------------------------------------------------------

const Section: React.FC<{ title: string; open: boolean; toggle: () => void; children: React.ReactNode }> = ({
  title,
  open,
  toggle,
  children,
}) => (
  <div className="border border-slate-800/60 rounded bg-slate-900/30">
    <button
      onClick={toggle}
      className="w-full px-2 py-1.5 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition"
    >
      <span>{title}</span>
      <span className="text-[8px] opacity-50">{open ? '▼' : '▶'}</span>
    </button>
    {open && <div className="px-2 pb-2">{children}</div>}
  </div>
);

const ChainSection: React.FC<{ title: string; count?: number; children: React.ReactNode }> = ({
  title,
  count,
  children,
}) => (
  <div className="border border-slate-800/50 rounded bg-slate-950/60 px-2 py-1.5">
    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
      <span>{title}</span>
      {count !== undefined && <span className="text-cyan-600 font-mono">{count}</span>}
    </div>
    {children}
  </div>
);

const Arrow = () => (
  <div className="flex justify-center py-0.5">
    <div className="w-px h-3 bg-gradient-to-b from-cyan-600/40 to-cyan-600/10" />
    <div className="absolute mt-2 w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-cyan-600/30" />
  </div>
);

const Bar: React.FC<{ value: number; color: string; label: string }> = ({ value, color, label }) => (
  <div
    className="flex-1 relative h-3 bg-slate-800/80 rounded-sm overflow-hidden group"
    title={`${label}: ${value.toFixed(2)}`}
  >
    <div className={`h-full ${color} rounded-sm`} style={{ width: `${Math.min(100, value * 100)}%` }} />
    <span className="absolute inset-0 flex items-center justify-center text-[7px] text-white/40 opacity-0 group-hover:opacity-100 transition">
      {value.toFixed(2)}
    </span>
  </div>
);

const MagBadge: React.FC<{ value: number }> = ({ value }) => {
  const color = value > 0.6 ? 'text-rose-400' : value > 0.3 ? 'text-amber-400' : 'text-slate-500';
  return <span className={`text-[9px] font-mono ${color}`}>{value.toFixed(2)}</span>;
};

// ---------------------------------------------------------------------------
// Center pane: Results | Map tabs
// ---------------------------------------------------------------------------

const CenterPane: React.FC<{ resultsProps: any }> = ({ resultsProps }) => {
  const [view, setView] = useState<'results' | 'map'>('results');
  return (
    <>
      <div className="shrink-0 flex border-b border-slate-800/60 bg-slate-900/40">
        {(['results', 'map'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider transition ${
              view === v ? 'text-cyan-400 border-b-2 border-cyan-500 bg-cyan-900/10' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {v === 'results' ? 'Results' : 'Map & Placement'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden min-h-0">
        {view === 'results' ? (
          <Suspense fallback={<PanelLoader />}>
            <div className="h-full overflow-y-auto custom-scrollbar">
              <GoalLabResults {...resultsProps} />
            </div>
          </Suspense>
        ) : (
          <SceneMapPanel />
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Right panel with tabs
// ---------------------------------------------------------------------------

type RightTab = 'chain' | 'world' | 'decision' | 'curves' | 'graph' | 'pomdp' | 'other';
const RIGHT_TABS: Array<{ key: RightTab; label: string }> = [
  { key: 'chain', label: 'Chain' },
  { key: 'world', label: 'World' },
  { key: 'decision', label: 'Action' },
  { key: 'curves', label: 'Curves' },
  { key: 'graph', label: 'Graph' },
  { key: 'pomdp', label: 'POMDP' },
  { key: 'other', label: 'Other' },
];

const RightPanel: React.FC = () => {
  const ctx = useGoalLab();
  const { world, engine, actorLabels } = ctx;
  const [tab, setTab] = useState<RightTab>('chain');
  const [rightPanelFullscreen, setRightPanelFullscreen] = useState(false);
  const focusId = world.perspectiveId || world.selectedAgentId;

  // Ensure engine data required by diagnostics tabs is present.
  // Keep deps narrow to avoid re-firing effect on unrelated context object changes.
  useEffect(() => {
    if ((tab === 'other' || tab === 'graph') && ctx.uiMode !== 'console' && ctx.uiMode !== 'debug') {
      ctx.setUiMode('console');
      return;
    }
    if (tab === 'pomdp' && ctx.uiMode !== 'console' && ctx.uiMode !== 'easy') {
      ctx.setUiMode('console');
    }
  }, [tab, ctx.uiMode, ctx.setUiMode]);

  const currentAtoms: ContextAtom[] = useMemo(() => {
    const a = (engine.snapshotV1 as any)?.atoms;
    return Array.isArray(a) ? a : [];
  }, [engine.snapshotV1]);

  const decision = (engine.snapshotV1 as any)?.decision;

  // Extract FULL transitionSnapshot from pipelineV1 (S8/S9 artifacts).
  // The old decision?.transitionSnapshot path may contain only lite summary fields.
  const fullTransitionSnapshot = useMemo(() => {
    const stages = (engine.pipelineV1 as any)?.stages;
    if (Array.isArray(stages)) {
      for (let i = stages.length - 1; i >= 0; i--) {
        const ts = stages[i]?.artifacts?.transitionSnapshot;
        if (ts?.perAction?.length) return ts;
      }
      for (let i = stages.length - 1; i >= 0; i--) {
        const ds = stages[i]?.artifacts?.decisionSnapshot;
        if (ds?.featureVector && ds?.lookahead?.ranked?.length) {
          return {
            enabled: true,
            gamma: ds.lookahead.gamma ?? 0,
            riskAversion: ds.lookahead.riskAversion ?? 0,
            z0: ds.featureVector,
            valueFn: { v0: ds.lookahead.v0 ?? 0, note: '' },
            perAction: (ds.lookahead.ranked || []).map((r: any) => ({
              actionId: r.actionId,
              kind: r.kind || '',
              qNow: r.qNow ?? 0,
              qLookahead: r.qLookahead ?? 0,
              delta: r.delta ?? 0,
              v1: r.v1 ?? 0,
              z1: {},
              deltas: {},
            })),
            warnings: [],
            flipCandidates: ds.linearApprox?.flipCandidates || [],
            sensitivity: ds.linearApprox?.sensitivity || null,
            sensitivityZ0: ds.linearApprox?.sensitivityZ0 || null,
          };
        }
      }
    }

    const pomdpStages = (engine.pomdpPipelineV1 as any)?.stages;
    if (Array.isArray(pomdpStages)) {
      for (let i = pomdpStages.length - 1; i >= 0; i--) {
        const ts = pomdpStages[i]?.artifacts?.transitionSnapshot;
        if (ts?.perAction?.length) return ts;
      }
    }
    return decision?.transitionSnapshot;
  }, [engine.pipelineV1, engine.pomdpPipelineV1, decision]);

  // Extract decision snapshot with full per-action breakdown from pipeline artifacts.
  const pipelineDecision = useMemo(() => {
    const stages = (engine.pipelineV1 as any)?.stages;
    if (!Array.isArray(stages)) return decision;
    for (let i = stages.length - 1; i >= 0; i--) {
      const art = stages[i]?.artifacts;
      if (art?.ranked?.length || art?.decisionSnapshot?.ranked?.length) {
        return {
          ...decision,
          ranked: art.ranked || art.decisionSnapshot?.ranked || decision?.ranked || [],
          transitionSnapshot: fullTransitionSnapshot,
          _pipelineSource: true,
        };
      }
    }
    return decision;
  }, [engine.pipelineV1, decision, fullTransitionSnapshot]);

  return (
    <aside className={rightPanelFullscreen
      ? 'fixed inset-0 z-[9999] bg-slate-950 flex flex-col overflow-hidden'
      : 'w-[280px] shrink-0 border-l border-slate-800 bg-slate-950/50 flex flex-col min-h-0'
    }>
      <div className="flex flex-wrap border-b border-slate-800/60">
        <button
          onClick={() => setRightPanelFullscreen(v => !v)}
          className="px-1.5 py-1.5 text-[8px] font-bold uppercase tracking-wider transition text-amber-500 hover:text-amber-300"
          title={rightPanelFullscreen ? 'Свернуть' : 'На весь экран'}
        >
          {rightPanelFullscreen ? '⊟' : '⊞'}
        </button>
        {RIGHT_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-1.5 py-1.5 text-[8px] font-bold uppercase tracking-wider transition ${
              tab === t.key
                ? 'text-cyan-400 bg-cyan-900/10 border-b-2 border-cyan-500'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {tab === 'chain' && <CausalChain />}
        {tab === 'world' && <WorldModelPanel atoms={currentAtoms} selfId={focusId} actorLabels={actorLabels} participantIds={world.participantIds} decision={pipelineDecision} />}
        {tab === 'decision' && <DecisionAnatomyPanel decision={pipelineDecision} atoms={currentAtoms} selfId={focusId} actorLabels={actorLabels} />}
        {tab === 'curves' && <CurvesPanel atoms={currentAtoms} selfId={focusId} world={world.worldState} />}
        {tab === 'graph' && <GraphEnergyPanel goalPreview={engine.goalPreview} atoms={currentAtoms} selfId={focusId} />}
        {tab === 'pomdp' && <PomdpPanel transitionSnapshot={fullTransitionSnapshot} decision={pipelineDecision} actorLabels={actorLabels} atoms={currentAtoms} selfId={focusId} />}
        {tab === 'other' && <OtherMindPanel castRows={engine.castRows} selfId={focusId} actorLabels={actorLabels} />}
      </div>
    </aside>
  );
};

const PanelToggle: React.FC<{ label: string; open: boolean; onClick: () => void }> = ({ label, open, onClick }) => (
  <button
    onClick={onClick}
    className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wider border transition ${
      open
        ? 'bg-cyan-900/20 text-cyan-400 border-cyan-700/40'
        : 'bg-slate-800/40 text-slate-500 border-slate-700/40 hover:text-slate-300'
    }`}
  >
    {label}
  </button>
);

// ---------------------------------------------------------------------------
// Main Shell
// ---------------------------------------------------------------------------

export const GoalLabShell: React.FC = () => {
  const ctx = useGoalLab();
  const { world, engine, actorLabels } = ctx;

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const focusId = world.perspectiveId || world.selectedAgentId;
  const focusLabel = actorLabels[focusId] || focusId;

  const resultsProps = useMemo(
    () => ({
      context: engine.snapshot,
      frame: engine.pipelineFrame,
      goalScores: engine.goals,
      situation: engine.situation,
      goalPreview: engine.goalPreview,
      actorLabels,
      contextualMind: engine.contextualMind,
      locationScores: engine.locationScores,
      tomScores: engine.tomScores,
      atomDiff: engine.atomDiff,
      snapshotV1: engine.snapshotV1,
      // pipelineV1 uses delta format (full/added/changed/removedIds).
      // GoalLabResults now detects this and uses materializeStageAtoms path.
      // Still passed for Propagation + PipelineFlow tabs.
      pipelineV1: engine.pipelineV1,
      perspectiveAgentId: focusId,
      manualAtoms: ctx.manualAtoms,
      onChangeManualAtoms: ctx.setManualAtoms,
      pipelineStageId: engine.pipelineStageId,
      onChangePipelineStageId: engine.setPipelineStageId,
      sceneDump: engine.sceneDump,
      onDownloadScene: engine.downloadScene,
      castRows: engine.castRows,
      worldState: world.worldState,
    }),
    [engine, actorLabels, focusId, ctx.manualAtoms, ctx.setManualAtoms, world.worldState]
  );

  const errorMsg = world.fatalError || engine.error;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#020617] text-slate-300 overflow-hidden font-mono">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm px-3 py-1.5 flex items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest shrink-0">GoalLab</span>
          {focusLabel && (
            <span className="text-[10px] text-slate-500 truncate">
              ◉ <span className="text-cyan-300 font-semibold">{focusLabel}</span>
              <span className="ml-2 text-slate-600">{world.participantIds.length} in scene</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <PanelToggle label="Setup" open={leftOpen} onClick={() => setLeftOpen(prev => !prev)} />
          <PanelToggle label="Inspector" open={rightOpen} onClick={() => setRightOpen(prev => !prev)} />
        </div>
      </header>

      {errorMsg && (
        <div className="shrink-0 bg-red-900/80 border-b border-red-700 px-3 py-1.5 text-[10px] text-red-200">{errorMsg}</div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {leftOpen && (
          <aside className="w-[240px] shrink-0 border-r border-slate-800 bg-slate-950/50 flex flex-col min-h-0">
            <div className="px-2 py-1.5 border-b border-slate-800/60 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              Scene Setup
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              <SceneSetup />
            </div>
          </aside>
        )}

        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Center pane tabs: Results | Map */}
          <CenterPane resultsProps={resultsProps} />
        </main>

        {rightOpen && <RightPanel />}
      </div>
    </div>
  );
};
