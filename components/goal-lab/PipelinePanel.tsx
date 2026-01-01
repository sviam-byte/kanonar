import React from 'react';
import { AtomBrowser } from './AtomBrowser';
import { materializeStageAtoms } from './materializePipeline';
import { arr } from '../../lib/utils/arr';

type Stage = {
  id: string;
  label: string;
  atomCount: number;
  baseId?: string;
  full?: any[];
  added?: any[];
  changed?: any[];
  removedIds?: string[];
  notes?: string[];
  artifacts?: any;
};

export const PipelinePanel: React.FC<{
  stages: Stage[];
  selectedId: string;
  onSelect: (id: string) => void;
  onExportStage?: (stageId: string) => void;
}> = ({ stages, selectedId, onSelect, onExportStage }) => {
  const stage = stages.find(s => s.id === selectedId) || stages[stages.length - 1] || null;
  const atoms = materializeStageAtoms(stages as any, stage?.id || '');

  const overriddenIds: string[] = Array.isArray((stage as any)?.artifacts?.overriddenIds)
    ? (stage as any).artifacts.overriddenIds.map((x: any) => String(x)).filter(Boolean)
    : [];

  const moduleAddsRaw = (stage as any)?.artifacts?.moduleAdds;
  const moduleAddsCount = Array.isArray(moduleAddsRaw)
    ? moduleAddsRaw.length
    : moduleAddsRaw && typeof moduleAddsRaw === 'object'
      ? Object.keys(moduleAddsRaw).length
      : 0;

  const handleCopyArtifacts = async () => {
    try {
      if (!stage) return;
      const payload = {
        stageId: stage.id,
        label: stage.label,
        artifacts: (stage as any).artifacts ?? null,
        notes: stage.notes ?? [],
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      // ignore (clipboard may be denied)
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="p-3 border-b border-canon-border/30 bg-canon-bg/40 shrink-0 flex items-start justify-between gap-2">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">Pipeline stages</div>
          <div className="flex flex-wrap gap-1">
            {arr(stages).map(s => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                  s.id === selectedId
                    ? 'border-canon-accent text-canon-accent bg-black/20'
                    : 'border-canon-border/50 text-canon-text-light hover:text-white hover:bg-white/5'
                }`}
                title={s.label}
              >
                {s.id}
              </button>
            ))}
          </div>

          {stage ? (
            <div className="text-[11px] text-canon-text-light truncate" title={stage.label}>
              {stage.label}
            </div>
          ) : null}

          {stage?.notes?.length ? (
            <div className="text-[10px] text-canon-text-light/70">
              {stage.notes.join(' • ')}
            </div>
          ) : null}

          {stage?.added || stage?.changed || stage?.removedIds ? (
            <div className="text-[10px] text-canon-text-light/70 flex flex-wrap gap-2">
              <span className="font-mono">+{stage?.added?.length ?? 0}</span>
              <span className="font-mono">~{stage?.changed?.length ?? 0}</span>
              <span className="font-mono">-{stage?.removedIds?.length ?? 0}</span>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-col gap-2 items-end">
          <div className="text-[10px] font-mono text-canon-text-light/70">
            atoms: {stage?.atomCount ?? 0}
          </div>

          {(overriddenIds.length || moduleAddsCount) ? (
            <div className="text-[10px] text-canon-text-light/70 text-right max-w-[260px]">
              {overriddenIds.length ? <div className="font-mono">overrides: {overriddenIds.length}</div> : null}
              {moduleAddsCount ? <div className="font-mono">moduleAdds: {moduleAddsCount}</div> : null}
            </div>
          ) : null}

          {stage?.artifacts ? (
            <button
              onClick={handleCopyArtifacts}
              className="px-3 py-1 text-[11px] font-semibold border border-canon-border/60 rounded bg-canon-bg-light hover:bg-canon-bg-light/70 transition-colors"
              title="Скопировать artifacts+notes в буфер обмена"
            >
              Copy stage artifacts
            </button>
          ) : null}
          {onExportStage && stage ? (
            <button
              onClick={() => onExportStage(stage.id)}
              className="px-3 py-1 text-[11px] font-semibold border border-canon-border/60 rounded bg-canon-bg-light hover:bg-canon-bg-light/70 transition-colors"
            >
              Экспорт текущей стадии (JSON)
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <AtomBrowser atoms={arr(atoms)} className="h-full min-h-0 flex flex-col" />
      </div>
    </div>
  );
};
