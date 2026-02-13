import React, { useState } from 'react';
import { GoalLabResults } from './GoalLabResults';
import { PomdpConsolePanel } from './PomdpConsolePanel';
import type { PipelineRun } from '../../lib/goal-lab/pipeline/contracts';

function arr<T>(x: any): T[] { return Array.isArray(x) ? x : []; }

function pretty(x: any): string {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function findStage(run: any, stageId: string): any | null {
  const ss = Array.isArray(run?.stages) ? run.stages : [];
  return ss.find((s: any) => String(s?.id) === stageId) || null;
}

function findArtifact(run: any, stageId: string, kind: string): any | null {
  const st = findStage(run, stageId);
  if (!st) return null;
  const aa = Array.isArray(st?.artifacts) ? st.artifacts : [];
  return aa.find((a: any) => String(a?.kind) === kind) || null;
}

type TabId = 'world' | 'pipeline' | 'debug' | 'tom';

type Props = {
  snapshot: any;
  frame: any;
  situation: any;

  snapshotV1: any;
  pipelineV1: any;
  focusId: string;

  pomdpRun: PipelineRun | null;
  pomdpRawV1?: any;
  observeLiteParams?: { radius: number; maxAgents: number; noiseSigma: number; seed: number };
  onObserveLiteParamsChange?: (p: { radius: number; maxAgents: number; noiseSigma: number; seed: number }) => void;
  onForceAction?: (actionId: string | null) => void;

  sceneDump: any;
  onDownloadScene: () => void;
  onImportScene: () => void;

  manualAtoms: any;
  onChangeManualAtoms: (atoms: any) => void;

  pipelineStageId: string;
  onChangePipelineStageId: (id: string) => void;
  onExportPipelineStage: () => void;
  onExportPipelineAll: () => void;

  goalScores: any;
  goalPreview: any;
  actorLabels: any;
  contextualMind: any;
  locationScores: any;
  tomScores: any;
  atomDiff: any;

  // World editor state (from GoalSandbox)
  characters: Array<{ entityId: string; title?: string }>;
  locations: Array<{ entityId: string; title?: string }>;
  selectedAgentId: string;
  onSelectAgentId: (id: string) => void;
  locationMode: 'preset' | 'custom';
  onSetLocationMode: (m: 'preset' | 'custom') => void;
  selectedLocationId: string;
  onSelectLocationId: (id: string) => void;
  agents: any[];
  onSetAgentLocation: (agentId: string, locationId: string) => void;
  onSetAgentPosition: (agentId: string, pos: { x: number; y: number }) => void;
  onMoveAllToLocation: (locationId: string) => void;
  onRebuildWorld: () => void;
};

type WorldTabProps = {
  run: PipelineRun | null;
  situation: any;
  sceneDump: any;
  onDownloadScene: () => void;
  onImportScene: () => void;

  // World editor (console)
  characters: Array<{ entityId: string; title?: string }>;
  locations: Array<{ entityId: string; title?: string }>;
  selectedAgentId: string;
  onSelectAgentId: (id: string) => void;
  locationMode: 'preset' | 'custom';
  onSetLocationMode: (m: 'preset' | 'custom') => void;
  selectedLocationId: string;
  onSelectLocationId: (id: string) => void;
  agents: any[];
  onSetAgentLocation: (agentId: string, locationId: string) => void;
  onSetAgentPosition: (agentId: string, pos: { x: number; y: number }) => void;
  onMoveAllToLocation: (locationId: string) => void;
  onRebuildWorld: () => void;
};

const ConsoleWorldTab: React.FC<WorldTabProps> = ({
  run,
  situation,
  sceneDump,
  onDownloadScene,
  onImportScene,
  characters,
  locations,
  selectedAgentId,
  onSelectAgentId,
  locationMode,
  onSetLocationMode,
  selectedLocationId,
  onSelectLocationId,
  onMoveAllToLocation,
  agents,
  onSetAgentLocation,
  onSetAgentPosition,
  onRebuildWorld,
}) => {
  const [view, setView] = useState<'truth' | 'observation' | 'belief' | 'both'>('both');

  const truth = findArtifact(run, 'S0', 'truth');
  const obs = findArtifact(run, 'S0', 'observation');
  const bel = findArtifact(run, 'S0', 'belief');

  const renderAtoms = (art: any, title: string) => {
    const atoms = Array.isArray(art?.data?.atoms) ? art.data.atoms : [];
    return (
      <div className="rounded border border-slate-800 bg-black/20 p-2 min-h-0 flex flex-col">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">{title}</div>
          <div className="text-xs text-slate-500">n={atoms.length}</div>
        </div>
        <div className="mt-2 overflow-auto max-h-[520px] pr-1">
          {atoms.slice(0, 400).map((a: any) => (
            <div key={String(a?.id)} className="flex justify-between gap-2 py-1 border-b border-slate-900/40">
              <div className="text-[11px] text-slate-200 font-mono truncate">{String(a?.id || '')}</div>
              <div className="text-[11px] text-cyan-300 font-mono">{Number(a?.magnitude ?? 0).toFixed(3)}</div>
            </div>
          ))}
          {!atoms.length ? <div className="text-xs text-slate-500">No atoms</div> : null}
        </div>
      </div>
    );
  };

  const renderObsSnap = () => {
    // Find the most informative observation artifact (either observation_snapshot or observation_summary)
    const st = findStage(run, 'S0');
    const aa = Array.isArray(st?.artifacts) ? st.artifacts : [];
    const snap =
      aa.find((a: any) => String(a?.id || '').includes('observation_snapshot')) ||
      aa.find((a: any) => String(a?.id || '').includes('observation_summary')) ||
      obs;
    return (
      <div className="rounded border border-slate-800 bg-black/20 p-2 min-h-0 flex flex-col">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Observation snapshot</div>
        </div>
        <pre className="mt-2 text-[11px] text-slate-200 overflow-auto max-h-[520px]">{pretty(snap?.data ?? null)}</pre>
      </div>
    );
  };

  const hasRun = !!run?.stages?.length;

  const labelForChar = (id: string) => {
    const c = characters.find((x) => x.entityId === id);
    return c?.title ? `${c.title} (${id})` : id;
  };
  const labelForLoc = (id: string) => {
    const l = locations.find((x) => x.entityId === id);
    return l?.title ? `${l.title} (${id})` : id;
  };

  // Tiny, high-signal metric overlay derived from atoms (best-effort; does NOT pretend to be full truth).
  const getMetric = (art: any, keys: string[]): number | null => {
    const atoms = Array.isArray(art?.data?.atoms) ? art.data.atoms : [];
    for (const k of keys) {
      const hit = atoms.find((a: any) => String(a?.id || '').toLowerCase().includes(k));
      if (hit) {
        const v = Number(hit?.magnitude);
        if (Number.isFinite(v)) return v;
      }
    }
    return null;
  };
  const overlay = [
    { label: 'THREAT', keys: ['threat', 'угроза'] },
    { label: 'PRESSURE', keys: ['pressure', 'давление'] },
    { label: 'SUPPORT', keys: ['support', 'поддерж'] },
    { label: 'CROWD', keys: ['crowd', 'толпа'] },
  ].map((m) => {
    const tv = getMetric(truth, m.keys);
    const bv = getMetric(bel, m.keys);
    const dv = tv != null && bv != null ? bv - tv : null;
    return { ...m, truth: tv, belief: bv, delta: dv };
  });

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="rounded border border-slate-800 bg-black/20 p-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Character (perspective)</div>
              <select
                className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                value={selectedAgentId || ''}
                onChange={(e) => onSelectAgentId(e.target.value)}
              >
                {characters.map((c) => (
                  <option key={c.entityId} value={c.entityId}>
                    {labelForChar(c.entityId)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Location mode</div>
              <select
                className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                value={locationMode}
                onChange={(e) => onSetLocationMode(e.target.value as any)}
              >
                <option value="preset">preset</option>
                <option value="custom">custom</option>
              </select>
            </div>

            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Location (preset)</div>
              <select
                className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                value={selectedLocationId || ''}
                onChange={(e) => onSelectLocationId(e.target.value)}
                disabled={locationMode !== 'preset'}
              >
                <option value="">(auto)</option>
                {locations.map((l) => (
                  <option key={l.entityId} value={l.entityId}>
                    {labelForLoc(l.entityId)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            className="px-3 py-1 rounded text-xs border bg-slate-800/30 border-slate-700 text-slate-100 hover:bg-slate-800/50"
            onClick={onRebuildWorld}
            title="Rebuild world so agents/location ids are consistent"
          >
            REBUILD WORLD
          </button>
        </div>

        {/* Locations & positions editor (console) */}
        <div className="mt-3 rounded border border-slate-800 bg-black/10 p-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Agents: location & position</div>
              <div className="text-xs text-slate-400">Редактирование best-effort: обновляет worldState (derived/imported) и трассировку</div>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Move all to</div>
                <select
                  className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                  value={selectedLocationId || ''}
                  onChange={(e) => onMoveAllToLocation(e.target.value)}
                  disabled={!locations.length}
                >
                  <option value="">(choose)</option>
                  {locations.map((l) => (
                    <option key={l.entityId} value={l.entityId}>{labelForLoc(l.entityId)}</option>
                  ))}
                </select>
              </div>
              <button
                className="px-2 py-1 rounded text-xs border bg-black/10 border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700"
                onClick={onRebuildWorld}
              >
                SYNC
              </button>
            </div>
          </div>

          <div className="mt-2 max-h-[260px] overflow-auto pr-1">
            {arr(participantIds).map((id) => {
              const a = arr(agents).find((x: any) => String(x?.entityId) === String(id)) || null;
              const locId = String((a as any)?.locationId || '');
              const pos = (a as any)?.position || (a as any)?.pos || { x: 0, y: 0 };
              const x = Number((pos as any)?.x ?? 0);
              const y = Number((pos as any)?.y ?? 0);
              return (
                <div key={String(id)} className="grid grid-cols-12 gap-2 items-center py-1 border-b border-slate-900/40">
                  <div className="col-span-5 min-w-0">
                    <div className="text-[11px] text-slate-200 truncate">{labelForChar(String(id))}</div>
                  </div>
                  <div className="col-span-4">
                    <select
                      className="w-full bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                      value={locId}
                      onChange={(e) => onSetAgentLocation(String(id), e.target.value)}
                    >
                      <option value="">(none)</option>
                      {locations.map((l) => (
                        <option key={l.entityId} value={l.entityId}>{l.title ? l.title : l.entityId}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <input
                      className="w-12 bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                      type="number"
                      value={Number.isFinite(x) ? x : 0}
                      onChange={(e) => onSetAgentPosition(String(id), { x: Number(e.target.value), y })}
                    />
                    <input
                      className="w-12 bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                      type="number"
                      value={Number.isFinite(y) ? y : 0}
                      onChange={(e) => onSetAgentPosition(String(id), { x, y: Number(e.target.value) })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {overlay.map((o) => (
            <div key={o.label} className="rounded border border-slate-800 bg-black/10 px-2 py-1">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">{o.label}</div>
              <div className="text-xs text-slate-200 font-mono">
                t={o.truth == null ? '—' : o.truth.toFixed(3)} · b={o.belief == null ? '—' : o.belief.toFixed(3)} · Δ={o.delta == null ? '—' : o.delta.toFixed(3)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">S0 views (Truth / Observation / Belief)</div>
        <div className="flex items-center gap-2">
          {(['both', 'truth', 'observation', 'belief'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={[
                'px-2 py-1 rounded text-xs border',
                view === v
                  ? 'bg-slate-800/50 border-slate-700 text-slate-100'
                  : 'bg-black/10 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700',
              ].join(' ')}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!hasRun ? <div className="text-slate-400 text-sm">No POMDP run</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0">
        {view === 'both' || view === 'truth' ? renderAtoms(truth, 'Truth atoms') : null}
        {view === 'both' || view === 'observation' ? renderObsSnap() : null}
        {view === 'both' || view === 'belief' ? renderAtoms(bel, 'Belief atoms') : null}
        <div className="rounded border border-slate-800 bg-black/20 p-2 min-h-0 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Scene dump</div>
            <div className="flex gap-2">
              <button className="text-xs text-slate-300 hover:text-slate-100" onClick={onDownloadScene}>export</button>
              <button className="text-xs text-slate-300 hover:text-slate-100" onClick={onImportScene}>import</button>
            </div>
          </div>
          <pre className="mt-2 text-[11px] text-slate-200 overflow-auto max-h-[520px]">{pretty(sceneDump)}</pre>
        </div>

        <div className="rounded border border-slate-800 bg-black/20 p-2 min-h-0 flex flex-col lg:col-span-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Situation (legacy)</div>
          <pre className="text-[11px] text-slate-200 overflow-auto max-h-[320px]">{pretty(situation)}</pre>
        </div>
      </div>
    </div>
  );
};

export const GoalLabConsoleResults: React.FC<Props> = (props) => {
  const [tab, setTab] = useState<TabId>('pipeline');

  return (
    <div className="h-full min-h-0 w-full rounded border border-slate-800 bg-slate-950/40 flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <div className="text-xs text-slate-400">Console</div>
          <div className="font-mono text-sm font-semibold text-slate-200">{props.focusId}</div>
          <div className="text-xs text-slate-500">tick={Number(props.snapshotV1?.tick ?? props.snapshot?.tick ?? 0)}</div>
        </div>

        <div className="flex items-center gap-2">
          {(['world', 'pipeline', 'debug', 'tom'] as TabId[]).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={[
                'rounded border px-3 py-1 text-xs transition-colors',
                tab === id
                  ? 'border-slate-700 bg-slate-800/50 text-slate-100'
                  : 'border-slate-800 bg-black/10 text-slate-400 hover:border-slate-700 hover:text-slate-200',
              ].join(' ')}
            >
              {id.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* IMPORTANT: bounded scroll container to prevent infinite panel growth. */}
      <div className="flex-1 min-h-0 overflow-hidden p-3">
        <div className="h-full min-h-0 overflow-auto">
          {tab === 'pipeline' ? (
            <PomdpConsolePanel
              run={props.pomdpRun}
              rawV1={props.pomdpRawV1}
              observeLiteParams={props.observeLiteParams}
              onObserveLiteParamsChange={props.onObserveLiteParamsChange}
              onForceAction={props.onForceAction}
            />
          ) : null}

          {tab === 'world' ? (
            <ConsoleWorldTab
              run={props.pomdpRun}
              situation={props.situation}
              sceneDump={props.sceneDump}
              onDownloadScene={props.onDownloadScene}
              onImportScene={props.onImportScene}
              characters={props.characters}
              locations={props.locations}
              selectedAgentId={props.selectedAgentId}
              onSelectAgentId={props.onSelectAgentId}
              locationMode={props.locationMode}
              onSetLocationMode={props.onSetLocationMode}
              selectedLocationId={props.selectedLocationId}
              onSelectLocationId={props.onSelectLocationId}
              agents={props.agents}
              onSetAgentLocation={props.onSetAgentLocation}
              onSetAgentPosition={props.onSetAgentPosition}
              onMoveAllToLocation={props.onMoveAllToLocation}
              onRebuildWorld={props.onRebuildWorld}
            />
          ) : null}

          {tab === 'tom' ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded border border-slate-800 bg-black/20 p-2">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">ToM scores</div>
                <pre className="max-h-[520px] overflow-auto text-[11px] text-slate-200">{pretty(props.tomScores)}</pre>
              </div>
              <div className="rounded border border-slate-800 bg-black/20 p-2">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Contextual mind</div>
                <pre className="max-h-[520px] overflow-auto text-[11px] text-slate-200">{pretty(props.contextualMind)}</pre>
              </div>
            </div>
          ) : null}

          {tab === 'debug' ? (
            <GoalLabResults
              context={props.snapshot as any}
              frame={props.frame as any}
              goalScores={props.goalScores as any}
              situation={props.situation as any}
              goalPreview={props.goalPreview as any}
              actorLabels={props.actorLabels as any}
              contextualMind={props.contextualMind as any}
              locationScores={props.locationScores as any}
              tomScores={props.tomScores as any}
              atomDiff={props.atomDiff as any}
              snapshotV1={props.snapshotV1 as any}
              pipelineV1={props.pipelineV1 as any}
              perspectiveAgentId={props.focusId as any}
              sceneDump={props.sceneDump as any}
              onDownloadScene={props.onDownloadScene as any}
              onImportScene={props.onImportScene as any}
              manualAtoms={props.manualAtoms as any}
              onChangeManualAtoms={props.onChangeManualAtoms as any}
              pipelineStageId={props.pipelineStageId as any}
              onChangePipelineStageId={props.onChangePipelineStageId as any}
              onExportPipelineStage={props.onExportPipelineStage as any}
              onExportPipelineAll={props.onExportPipelineAll as any}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
