import React from 'react';
import type { GoalSandboxVM } from '../../GoalSandbox/GoalSandbox';
import { DebugShell } from '../../GoalSandbox/DebugShell';

/**
 * Compatibility mode that proxies VM fields into the legacy DebugShell.
 * Kept to avoid regressions while new console modes are being migrated.
 */
export const DebugLegacyMode: React.FC<{ vm: GoalSandboxVM }> = ({ vm }) => {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full overflow-hidden">
        <DebugShell
          snapshotV1={vm.snapshotV1 as any}
          pipelineV1={vm.pipelineV1 as any}
          pipelineFrame={vm.pipelineFrame as any}
          pipelineStageId={vm.pipelineStageId}
          onChangePipelineStageId={vm.onChangePipelineStageId}
          castRows={vm.castRows}
          perspectiveId={vm.perspectiveId}
          onSetPerspectiveId={vm.onSetPerspectiveId}
          passportAtoms={vm.passportAtoms}
          passportMeta={vm.passportMeta as any}
          contextualMind={vm.contextualMind as any}
          locationScores={vm.locationScores as any}
          tomScores={vm.tomScores as any}
          tom={vm.tom as any}
          atomDiff={vm.atomDiff as any}
          sceneDump={vm.sceneDump as any}
          onDownloadScene={vm.onDownloadScene}
          onImportScene={vm.onImportScene}
          manualAtoms={vm.manualAtoms}
          onChangeManualAtoms={vm.onChangeManualAtoms}
          onExportPipelineStage={vm.onExportPipelineStage}
          onExportPipelineAll={vm.onExportPipelineAll}
          onExportFullDebug={vm.onExportFullDebug}
        />
      </div>
    </div>
  );
};
