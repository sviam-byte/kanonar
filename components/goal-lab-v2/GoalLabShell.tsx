/**
 * GoalLabShell — clean layout for GoalLab.
 *
 * Replaces GoalSandbox.tsx (3325 lines) with a thin layout shell (~200 lines).
 * All state lives in GoalLabContext. All computation in hooks.
 * This component only does: layout + tab routing + lazy panel loading.
 */

import React, { Suspense, lazy, useMemo } from 'react';
import { useGoalLab } from '../../contexts/GoalLabContext';
import type { UiMode, FrontTab } from '../../contexts/GoalLabContext';
import { allLocations } from '../../data/locations';

// ---------------------------------------------------------------------------
// Lazy panels — code-split so inactive tabs don't load
// ---------------------------------------------------------------------------

const GoalLabResults = lazy(() =>
  import('../goal-lab/GoalLabResults').then(m => ({ default: m.GoalLabResults }))
);
const GoalLabConsoleResults = lazy(() =>
  import('../goal-lab/GoalLabConsoleResults').then(m => ({ default: m.GoalLabConsoleResults }))
);
const GoalLabControls = lazy(() =>
  import('../goal-lab/GoalLabControls').then(m => ({ default: m.GoalLabControls }))
);
const DoNowCard = lazy(() =>
  import('../goal-lab/DoNowCard').then(m => ({ default: m.DoNowCard }))
);
const EasyModePanel = lazy(() =>
  import('../goal-lab/EasyModePanel').then(m => ({ default: m.EasyModePanel }))
);
const PomdpConsolePanel = lazy(() =>
  import('../goal-lab/PomdpConsolePanel').then(m => ({ default: m.PomdpConsolePanel }))
);
const ToMPanel = lazy(() =>
  import('../goal-lab/ToMPanel').then(m => ({ default: m.ToMPanel }))
);
const CastComparePanel = lazy(() =>
  import('../goal-lab/CastComparePanel').then(m => ({ default: m.CastComparePanel }))
);
const CurveStudio = lazy(() =>
  import('../goal-lab/CurveStudio').then(m => ({ default: m.CurveStudio }))
);
const PipelinePanel = lazy(() =>
  import('../goal-lab/PipelinePanel').then(m => ({ default: m.PipelinePanel }))
);
const CurvesPanel = lazy(() =>
  import('../goal-lab/CurvesPanel').then(m => ({ default: m.CurvesPanel }))
);

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------

const PanelLoader: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[120px]">
    <div className="text-[10px] text-slate-500 uppercase tracking-widest animate-pulse">Loading…</div>
  </div>
);

// ---------------------------------------------------------------------------
// Mode switcher
// ---------------------------------------------------------------------------

const ModeSwitcher: React.FC<{ current: UiMode; onChange: (m: UiMode) => void }> = ({ current, onChange }) => {
  const modes: UiMode[] = ['easy', 'front', 'debug', 'console'];
  return (
    <div className="flex gap-1.5">
      {modes.map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-3 py-1 text-[10px] rounded uppercase tracking-wider transition-all ${
            current === m
              ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/40'
              : 'bg-slate-800/60 text-slate-400 border border-slate-700/40 hover:text-slate-200 hover:border-slate-600'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Front-mode tab bar
// ---------------------------------------------------------------------------

const FRONT_TABS: Array<{ key: FrontTab; label: string }> = [
  { key: 'graph', label: 'Graph' },
  { key: 'situation', label: 'Situation' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'affects', label: 'Affects' },
  { key: 'curves', label: 'Curves' },
  { key: 'tests', label: 'Tests' },
  { key: 'report', label: 'Report' },
  { key: 'debug', label: 'Debug' },
];

const FrontTabBar: React.FC<{ current: FrontTab; onChange: (t: FrontTab) => void }> = ({ current, onChange }) => (
  <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
    {FRONT_TABS.map(({ key, label }) => (
      <button
        key={key}
        onClick={() => onChange(key)}
        className={`px-3 py-1 text-[10px] rounded uppercase border transition-all ${
          current === key
            ? 'bg-cyan-600/25 text-cyan-200 border-cyan-500/40'
            : 'bg-black/10 text-slate-300 border-slate-700/60 hover:border-slate-500'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export const GoalLabShell: React.FC = () => {
  const ctx = useGoalLab();
  const {
    world, engine, uiMode, setUiMode, frontTab, setFrontTab,
    bottomTab, setBottomTab, actorLabels,
  } = ctx;

  const focusId = world.perspectiveId || world.selectedAgentId;
  const focusLabel = actorLabels[focusId] || focusId;

  // Shared props for GoalLabResults (used in both front and debug modes)
  const resultsProps = {
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
    pipelineV1: engine.pipelineV1,
    perspectiveAgentId: focusId,
    manualAtoms: ctx.manualAtoms,
    onChangeManualAtoms: ctx.setManualAtoms,
    pipelineStageId: engine.pipelineStageId,
    onChangePipelineStageId: engine.setPipelineStageId,
  } as const;

  // --- Error banner ---
  const errorMsg = world.fatalError || engine.error;

  return (
    <div className="flex h-full min-h-0 bg-[#020617] text-slate-300 overflow-hidden font-mono">

      {/* === HEADER BAR === */}
      <div className="absolute top-0 left-0 right-0 z-10 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <div className="px-4 py-2 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest">GoalLab</div>
            <div className="text-[11px] text-slate-400 truncate">
              {focusLabel && <>Perspective: <span className="text-cyan-300 font-semibold">{focusLabel}</span></>}
            </div>
          </div>
          <ModeSwitcher current={uiMode} onChange={setUiMode} />
        </div>
        {uiMode === 'front' && <FrontTabBar current={frontTab} onChange={setFrontTab} />}
      </div>

      {/* === ERROR BANNER === */}
      {errorMsg && (
        <div className="absolute top-14 left-0 right-0 z-20 bg-red-900/80 border-b border-red-700 px-4 py-2 text-[11px] text-red-200">
          {errorMsg}
        </div>
      )}

      {/* === MAIN CONTENT === */}
      <div className={`flex-1 flex min-h-0 ${uiMode === 'front' ? 'pt-[72px]' : 'pt-10'} ${errorMsg ? 'mt-8' : ''}`}>

        {/* CENTER */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <Suspense fallback={<PanelLoader />}>
            {uiMode === 'easy' && (
              <EasyModePanel
                pipelineV1={engine.pomdpPipelineV1}
                agentLabel={focusLabel}
                onSwitchToDebug={() => setUiMode('debug')}
                onSwitchToConsole={() => setUiMode('console')}
              />
            )}

            {uiMode === 'front' && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                {/* Front tab content is rendered by GoalLabResults internally via TAB_REGISTRY */}
                <GoalLabResults {...resultsProps} />
              </div>
            )}

            {uiMode === 'console' && (
              <div className="flex-1 min-h-0 overflow-hidden p-3">
                <GoalLabConsoleResults
                  snapshot={engine.snapshot}
                  frame={engine.pipelineFrame}
                  situation={engine.situation}
                  snapshotV1={engine.snapshotV1}
                  pipelineV1={engine.pipelineV1}
                  focusId={focusId}
                  pomdpRun={engine.pomdpRun}
                  pomdpRawV1={engine.pomdpPipelineV1}
                  observeLiteParams={ctx.observeLiteParams}
                  onObserveLiteParamsChange={ctx.setObserveLiteParams}
                  sceneDump={engine.sceneDump}
                  onDownloadScene={engine.downloadScene}
                  onImportScene={() => {}}
                  activeScenarioId={world.activeScenarioId}
                  onSetActiveScenarioId={world.setActiveScenarioId}
                  runSeed={Number(world.simSettings.runSeed) || 0}
                  onSetRunSeed={(n) => world.setSimSettings({ runSeed: String(n) })}
                  onApplySimSettings={world.applySimSettings}
                  sceneParticipants={Array.from(world.sceneParticipants)}
                  onSetSceneParticipants={(ids) => world.setSceneParticipants(new Set(ids))}
                  sceneControl={ctx.sceneControl}
                  onSetSceneControl={ctx.setSceneControl}
                  onUpdateAgentVitals={world.updateAgentVitals}
                  manualAtoms={ctx.manualAtoms}
                  onChangeManualAtoms={ctx.setManualAtoms}
                  pipelineStageId={engine.pipelineStageId}
                  onChangePipelineStageId={engine.setPipelineStageId}
                  onExportPipelineStage={() => {}}
                  onExportPipelineAll={() => {}}
                  goalScores={engine.goals}
                  goalPreview={engine.goalPreview}
                  actorLabels={actorLabels}
                  contextualMind={engine.contextualMind}
                  locationScores={engine.locationScores}
                  tomScores={engine.tomScores}
                  atomDiff={engine.atomDiff}
                  characters={ctx.allCharacters}
                  locations={allLocations as any}
                  selectedAgentId={world.selectedAgentId}
                  onSelectAgentId={world.setSelectedAgentId}
                  locationMode={world.locationMode}
                  onSetLocationMode={world.setLocationMode}
                  selectedLocationId={world.selectedLocationId}
                  onSelectLocationId={world.setSelectedLocationId}
                  agents={world.worldState?.agents}
                  onSetAgentLocation={world.setAgentLocation}
                  onSetAgentPosition={world.setAgentPosition}
                  onMoveAllToLocation={world.moveAllToLocation}
                  onRebuildWorld={world.forceRebuild}
                />
              </div>
            )}

            {uiMode === 'debug' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Top half: results */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                  <GoalLabResults {...resultsProps} />
                </div>
                {/* Bottom panel */}
                <div className="h-[260px] shrink-0 border-t border-slate-800 bg-slate-950 flex flex-col">
                  <nav className="flex border-b border-slate-800 bg-slate-900/20">
                    {(['pipeline', 'pomdp', 'tom', 'compare', 'curves'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setBottomTab(t)}
                        className={`px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest border-r border-slate-800 transition ${
                          bottomTab === t
                            ? 'bg-cyan-500/10 text-cyan-400 shadow-[inset_0_-2px_0_#06b6d4]'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </nav>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                    <Suspense fallback={<PanelLoader />}>
                      {bottomTab === 'pipeline' && <PipelinePanel stages={[]} selectedId={engine.pipelineStageId} onSelect={engine.setPipelineStageId} />}
                      {bottomTab === 'pomdp' && <PomdpConsolePanel run={engine.pomdpRun} rawV1={engine.pomdpPipelineV1} observeLiteParams={ctx.observeLiteParams} onObserveLiteParamsChange={ctx.setObserveLiteParams} />}
                      {bottomTab === 'tom' && <ToMPanel atoms={engine.passportAtoms} />}
                      {bottomTab === 'compare' && <CastComparePanel rows={engine.castRows} focusId={focusId} />}
                      {bottomTab === 'curves' && <CurveStudio selfId={focusId} atoms={engine.passportAtoms as any} preset={world.simSettings.decisionCurvePreset as any} />}
                    </Suspense>
                  </div>
                </div>
              </div>
            )}
          </Suspense>
        </main>

        {/* RIGHT SIDEBAR: DoNow + passport */}
        {(uiMode === 'front' || uiMode === 'debug') && (
          <aside className="w-[380px] border-l border-slate-800 bg-slate-950/50 flex flex-col shrink-0 min-h-0">
            <div className="p-3 border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Passport + Atoms
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
              <Suspense fallback={<PanelLoader />}>
                <DoNowCard decision={(engine.snapshotV1 as any)?.decision ?? null} />
              </Suspense>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
