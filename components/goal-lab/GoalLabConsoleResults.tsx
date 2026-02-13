import React, { useState } from 'react';
import { GoalLabResults } from './GoalLabResults';
import { PomdpConsolePanel } from './PomdpConsolePanel';
import type { PipelineRun } from '../../lib/goal-lab/pipeline/contracts';

// Console shell: keep a bounded height and a dedicated scrollable body.

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
  pipelineV1: any; // legacy deltas (for Debug tab)
  focusId: string;

  // POMDP console run (real staged pipeline from runGoalLabPipelineV1, adapted to contracts)
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

  // Legacy props mirrored from GoalLabResults for the Debug tab.
  goalScores: any;
  goalPreview: any;
  actorLabels: any;
  contextualMind: any;
  locationScores: any;
  tomScores: any;
  atomDiff: any;
};

type WorldTabProps = {
  run: PipelineRun | null;
  situation: any;
  sceneDump: any;
  onDownloadScene: () => void;
  onImportScene: () => void;
};

const ConsoleWorldTab: React.FC<WorldTabProps> = ({ run, situation, sceneDump, onDownloadScene, onImportScene }) => {
  const [view, setView] = useState<'truth' | 'observation' | 'belief' | 'both'>('both');

  const truth = findArtifact(run, 'S0', 'truth');
  const obs = findArtifact(run, 'S0', 'observation');
  const bel = findArtifact(run, 'S0', 'belief');

  const renderAtoms = (art: any, title: string) => {
    const atoms = Array.isArray(art?.data?.atoms) ? art.data.atoms : [];
    return (
      <div className="flex min-h-0 flex-col rounded border border-slate-800 bg-black/20 p-2">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">{title}</div>
          <div className="text-xs text-slate-500">n={atoms.length}</div>
        </div>
        <div className="mt-2 max-h-[520px] overflow-auto pr-1">
          {atoms.slice(0, 400).map((a: any) => (
            <div key={String(a?.id)} className="flex justify-between gap-2 border-b border-slate-900/40 py-1">
              <div className="truncate font-mono text-[11px] text-slate-200">{String(a?.id || '')}</div>
              <div className="font-mono text-[11px] text-cyan-300">{Number(a?.magnitude ?? 0).toFixed(3)}</div>
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
      <div className="flex min-h-0 flex-col rounded border border-slate-800 bg-black/20 p-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Observation snapshot</div>
        </div>
        <pre className="mt-2 max-h-[520px] overflow-auto text-[11px] text-slate-200">{pretty(snap?.data ?? null)}</pre>
      </div>
    );
  };

  const hasRun = !!run?.stages?.length;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">S0 views (Truth / Observation / Belief)</div>
        <div className="flex items-center gap-2">
          {(['both', 'truth', 'observation', 'belief'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={[
                'rounded border px-2 py-1 text-xs',
                view === v
                  ? 'border-slate-700 bg-slate-800/50 text-slate-100'
                  : 'border-slate-800 bg-black/10 text-slate-400 hover:border-slate-700 hover:text-slate-200',
              ].join(' ')}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!hasRun ? <div className="text-sm text-slate-400">No POMDP run</div> : null}

      <div className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-2">
        {view === 'both' || view === 'truth' ? renderAtoms(truth, 'Truth atoms') : null}
        {view === 'both' || view === 'observation' ? renderObsSnap() : null}
        {view === 'both' || view === 'belief' ? renderAtoms(bel, 'Belief atoms') : null}
        <div className="flex min-h-0 flex-col rounded border border-slate-800 bg-black/20 p-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Scene dump</div>
            <div className="flex gap-2">
              <button className="text-xs text-slate-300 hover:text-slate-100" onClick={onDownloadScene}>
                export
              </button>
              <button className="text-xs text-slate-300 hover:text-slate-100" onClick={onImportScene}>
                import
              </button>
            </div>
          </div>
          <pre className="mt-2 max-h-[520px] overflow-auto text-[11px] text-slate-200">{pretty(sceneDump)}</pre>
        </div>

        <div className="flex min-h-0 flex-col rounded border border-slate-800 bg-black/20 p-2 lg:col-span-2">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Situation (legacy)</div>
          <pre className="max-h-[320px] overflow-auto text-[11px] text-slate-200">{pretty(situation)}</pre>
        </div>
      </div>
    </div>
  );
};

/**
 * Console-first Goal Lab result panel with focused tabs:
 * - PIPELINE: POMDP-like contract view
 * - WORLD: situation + scene dump
 * - TOM: contextual mind and ToM scores
 * - DEBUG: fallback to legacy GoalLabResults panel
 */
export const GoalLabConsoleResults: React.FC<Props> = (props) => {
  const [tab, setTab] = useState<TabId>('pipeline');

  return (
    <div className="flex h-full min-h-0 w-full flex-col rounded border border-slate-800 bg-slate-950/40">
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
