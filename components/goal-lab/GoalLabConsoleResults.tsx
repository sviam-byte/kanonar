import React, { useMemo, useState } from 'react';
import { GoalLabResults } from './GoalLabResults';
import { PomdpConsolePanel } from './PomdpConsolePanel';
import { adaptPipelineV1ToContract } from '../../lib/goal-lab/pipeline/adaptV1ToContract';

function pretty(x: any): string {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

type TabId = 'world' | 'pipeline' | 'debug' | 'tom';

type Props = {
  snapshot: any;
  frame: any;
  situation: any;

  snapshotV1: any;
  pipelineV1: any;
  focusId: string;

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

/**
 * Console-first Goal Lab result panel with focused tabs:
 * - PIPELINE: POMDP-like contract view
 * - WORLD: situation + scene dump
 * - TOM: contextual mind and ToM scores
 * - DEBUG: fallback to legacy GoalLabResults panel
 */
export const GoalLabConsoleResults: React.FC<Props> = (props) => {
  const [tab, setTab] = useState<TabId>('pipeline');

  const pomdp = useMemo(() => {
    try {
      if (props.pipelineV1 && Array.isArray(props.pipelineV1?.stages)) {
        return adaptPipelineV1ToContract(props.pipelineV1);
      }
      return null;
    } catch (e) {
      console.error('[GoalLabConsoleResults] adaptPipelineV1ToContract failed', e);
      return null;
    }
  }, [props.pipelineV1]);

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40">
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

      <div className="p-3">
        {tab === 'pipeline' ? (
          pomdp ? (
            <PomdpConsolePanel pipeline={pomdp as any} />
          ) : (
            <div className="text-sm text-slate-400">No pipeline contract available.</div>
          )
        ) : null}

        {tab === 'world' ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded border border-slate-800 bg-black/20 p-2">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Situation</div>
              <pre className="max-h-[520px] overflow-auto text-[11px] text-slate-200">{pretty(props.situation)}</pre>
            </div>
            <div className="rounded border border-slate-800 bg-black/20 p-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">Scene dump</div>
                <div className="flex gap-2">
                  <button className="text-xs text-slate-300 hover:text-slate-100" onClick={props.onDownloadScene}>
                    export
                  </button>
                  <button className="text-xs text-slate-300 hover:text-slate-100" onClick={props.onImportScene}>
                    import
                  </button>
                </div>
              </div>
              <pre className="mt-2 max-h-[520px] overflow-auto text-[11px] text-slate-200">{pretty(props.sceneDump)}</pre>
            </div>
          </div>
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
  );
};
