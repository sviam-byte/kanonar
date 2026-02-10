import React, { useMemo } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import type { GoalLabSnapshotV1 } from '../../lib/goal-lab/snapshotTypes';

import { Tabs } from '../Tabs';
import { CastComparePanel } from '../goal-lab/CastComparePanel';
import { CastPerspectivePanel } from '../goal-lab/CastPerspectivePanel';
import { AgentPassportPanel } from '../goal-lab/AgentPassportPanel';
import { AtomBrowser } from '../goal-lab/AtomBrowser';
import { GoalLabResults } from '../goal-lab/GoalLabResults';
import { EmotionInspector } from '../goal-lab/EmotionInspector';
import { EmotionExplainPanel } from '../goal-lab/EmotionExplainPanel';
import { AcquaintancePanel } from '../goal-lab/AcquaintancePanel';
import { ToMPanel } from '../goal-lab/ToMPanel';
import { ContextMindPanel } from '../goal-lab/ContextMindPanel';
import { RelationsPanel } from '../goal-lab/RelationsPanel';
import { PipelinePanel } from '../goal-lab/PipelinePanel';
import { GoalEnergyHistoryPanel } from '../goal-lab/GoalEnergyHistoryPanel';
import { ValidatorPanel } from '../goal-lab/ValidatorPanel';
import { FrameDebugPanel } from '../GoalLab/FrameDebugPanel';
import { arr } from '../../lib/utils/arr';
import { buildRelGraphFromAtoms } from '../../lib/goal-lab/buildRelGraphFromAtoms';

function asArray<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

export const DebugShell: React.FC<{
  snapshotV1: GoalLabSnapshotV1 | null;
  pipelineV1?: any;
  pipelineFrame?: any;
  pipelineStageId: string;
  onChangePipelineStageId: (id: string) => void;

  castRows: any[];
  perspectiveId: string | null;
  onSetPerspectiveId: (id: string) => void;

  passportAtoms: ContextAtom[];
  passportMeta?: { stageId?: string; source?: string; warnings?: string[] };
  contextualMind?: any;
  locationScores?: any;
  tomScores?: any;
  tom?: any;
  atomDiff?: any;

  sceneDump?: any;
  onDownloadScene?: () => void;
  onImportScene?: () => void;

  manualAtoms?: ContextAtom[];
  onChangeManualAtoms?: (atoms: ContextAtom[]) => void;

  onExportPipelineStage?: (stageId: string) => void;
  onExportPipelineAll?: () => void;

  onExportFullDebug?: () => void;
}> = (p) => {
  const atoms = useMemo(() => asArray<any>(p.snapshotV1?.atoms), [p.snapshotV1]);
  const manualAtoms = useMemo(() => asArray<ContextAtom>(p.manualAtoms), [p.manualAtoms]);
  const onChangeManualAtoms = p.onChangeManualAtoms ?? (() => {});

  // Normalize raw pipeline stages for PipelinePanel contract.
  const pipelineStages = useMemo(() => {
    const raw = (p.pipelineV1 as any)?.stages;
    if (!Array.isArray(raw)) return [];
    return raw.map((s: any, idx: number) => {
      const id = String(s?.stage || s?.id || s?.stageId || `S${idx}`);
      const label = String(s?.title || s?.label || s?.name || id);
      const atomCount = Number.isFinite(Number(s?.stats?.atomCount))
        ? Number(s.stats.atomCount)
        : Array.isArray(s?.atoms)
          ? s.atoms.length
          : 0;
      return { ...s, id, label, atomCount };
    });
  }, [p.pipelineV1]);

  const tabs = useMemo(() => {
    return [
      {
        label: 'Compare',
        content: (
          <div className="p-3 space-y-3">
            <div className="text-xs opacity-70">
              Compare = сравнение A vs B (перспективы агентов), не “по времени”.
            </div>
            <CastPerspectivePanel rows={p.castRows} focusId={p.perspectiveId} onFocus={p.onSetPerspectiveId} />
            <CastComparePanel rows={p.castRows} focusId={p.perspectiveId || undefined} />
          </div>
        )
      },
      {
        label: 'Passport + Atoms',
        content: (
          <div className="p-3 space-y-3">
            <div className="text-[11px] font-mono rounded border border-white/10 bg-black/20 px-2 py-1 flex flex-wrap gap-x-3 gap-y-1">
              <span>stage={String(p.passportMeta?.stageId ?? 'unknown')}</span>
              <span>source={String(p.passportMeta?.source ?? 'unknown')}</span>
              <span>atoms={arr(p.passportAtoms).length}</span>
              <span>
                warnings=
                {arr(p.passportMeta?.warnings).length
                  ? arr(p.passportMeta?.warnings).join(', ')
                  : 'none'}
              </span>
            </div>

            <AgentPassportPanel
              atoms={arr(p.passportAtoms)}
              selfId={p.perspectiveId || ''}
              title="How the agent sees the situation"
            />

            <div className="h-[520px] min-h-0 rounded border border-white/10 bg-black/10 overflow-hidden">
              <AtomBrowser atoms={arr(p.passportAtoms)} className="h-full min-h-0 flex flex-col" />
            </div>
          </div>
        )
      },
      {
        label: 'Pipeline (all stages)',
        content: (
          <div className="p-3 space-y-3">
            <div className="flex gap-2">
              <button
                className="px-2 py-1 text-[11px] rounded border border-white/10 bg-white/5 hover:bg-white/10"
                onClick={() => p.onExportPipelineAll?.()}
              >
                Export pipeline
              </button>
              <button
                className="px-2 py-1 text-[11px] rounded border border-white/10 bg-white/5 hover:bg-white/10"
                onClick={() => p.onExportFullDebug?.()}
              >
                Export FULL debug JSON
              </button>
            </div>

            <PipelinePanel
              stages={pipelineStages as any}
              selectedId={p.pipelineStageId}
              onSelect={p.onChangePipelineStageId as any}
              onExportStage={p.onExportPipelineStage as any}
            />

            <div className="rounded border border-white/10 bg-black/10">
              <GoalLabResults
                context={p.snapshotV1 as any}
                contextualMind={p.contextualMind}
                locationScores={p.locationScores}
                tomScores={p.tomScores}
                tom={p.tom}
                atomDiff={p.atomDiff}
                snapshotV1={p.snapshotV1 as any}
                pipelineV1={p.pipelineV1 as any}
                pipelineStageId={p.pipelineStageId}
                onChangePipelineStageId={p.onChangePipelineStageId}
                onExportPipelineStage={p.onExportPipelineStage as any}
                onExportPipelineAll={p.onExportPipelineAll as any}
                sceneDump={p.sceneDump}
                onDownloadScene={p.onDownloadScene}
                onImportScene={p.onImportScene}
                manualAtoms={p.manualAtoms as any}
                onChangeManualAtoms={p.onChangeManualAtoms as any}
              />
            </div>
          </div>
        )
      },
      {
        label: 'Propagation',
        content: (
          <div className="p-3 space-y-3">
            <div className="text-xs opacity-70">
              S7: итеративная диффузия энергии целей (artifacts.goalDebug → energyRefine.goalEnergyHistory).
            </div>
            <div className="rounded border border-white/10 bg-black/10 p-3">
              <GoalEnergyHistoryPanel pipelineV1={p.pipelineV1 as any} stageId="S7" />
            </div>
          </div>
        )
      },
      {
        label: 'ToM',
        content: (
          <div className="p-3 space-y-3">
            <div className="text-xs opacity-70">Dyad + contextual ToM, без “шума”.</div>
            <ToMPanel atoms={atoms} />
            <ContextMindPanel atoms={atoms} />
            <div className="h-[420px] min-h-0 rounded border border-white/10 bg-black/10 overflow-hidden">
              <AcquaintancePanel
                atoms={atoms}
                className="h-full min-h-0"
                onSelectTargetId={id => p.onSetPerspectiveId?.(id)}
              />
            </div>
            <div className="h-[520px] min-h-0 rounded border border-white/10 bg-black/10 overflow-hidden">
              <RelationsPanel
                selfId={p.perspectiveId || ''}
                graph={buildRelGraphFromAtoms(atoms)}
                className="h-full min-h-0"
                onSelectTargetId={id => p.onSetPerspectiveId?.(id)}
              />
            </div>
          </div>
        )
      },
      {
        label: 'Emotions + formulas',
        content: (
          <div className="p-3 space-y-3">
            <EmotionInspector
              selfId={p.perspectiveId || ''}
              atoms={atoms}
              manualAtoms={manualAtoms}
              onChangeManualAtoms={onChangeManualAtoms}
            />
            <EmotionExplainPanel
              atoms={atoms}
              selfId={p.perspectiveId || ''}
              manualAtoms={manualAtoms}
              onChangeManualAtoms={onChangeManualAtoms}
            />
          </div>
        )
      },
      {
        label: 'Frame',
        content: (
          <div className="p-3">
            {p.pipelineFrame ? (
              <FrameDebugPanel frame={p.pipelineFrame} />
            ) : (
              <div className="text-xs italic opacity-70">No pipeline frame available.</div>
            )}
          </div>
        )
      },
      {
        label: 'Validate',
        content: (
          <div className="p-3">
            <ValidatorPanel atoms={atoms} />
          </div>
        )
      },
      {
        label: 'Raw',
        content: (
          <div className="p-3">
            <pre className="text-[10px] font-mono whitespace-pre-wrap break-words opacity-90">
              {JSON.stringify(p.snapshotV1, null, 2)}
            </pre>
          </div>
        )
      },
    ];
  }, [atoms, p]);

  return (
    <div className="h-full min-h-0 flex flex-col border border-canon-border rounded bg-canon-bg overflow-hidden">
      <div className="px-3 py-2 border-b border-canon-border bg-canon-bg-light/10 flex items-center justify-between">
        <div className="text-sm font-semibold">Debug</div>
        <div className="text-[11px] opacity-70 font-mono">
          tick={p.snapshotV1?.tick ?? 0} self={p.perspectiveId || ''}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Tabs tabs={tabs} syncKey="debugTab" />
      </div>
    </div>
  );
};
