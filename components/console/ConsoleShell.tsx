import React, { useMemo, useState } from 'react';
import { TopNav, type ConsoleMode } from './TopNav';
import type { GoalSandboxVM } from '../GoalSandbox/GoalSandbox';
import { DebugLegacyMode } from './modes/DebugLegacyMode';
import { WorldTruthMode } from './modes/WorldTruthMode';
import { PipelineMode } from './modes/PipelineMode';
import { ToMDyadMode } from './modes/ToMDyadMode';

const STORAGE_KEY = 'console.mode.v1';

function loadMode(): ConsoleMode {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'world' || raw === 'pipeline' || raw === 'debug' || raw === 'tom') return raw;
  return 'world';
}

export const ConsoleShell: React.FC<{ vm: GoalSandboxVM }> = ({ vm }) => {
  const [mode, setMode] = useState<ConsoleMode>(() => loadMode());

  const setModeSafe = (m: ConsoleMode) => {
    setMode(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch {}
  };

  const content = useMemo(() => {
    switch (mode) {
      case 'world': return <WorldTruthMode vm={vm} />;
      case 'pipeline': return <PipelineMode vm={vm} />;
      case 'debug': return <DebugLegacyMode vm={vm} />;
      case 'tom': return <ToMDyadMode vm={vm} />;
      default: return <WorldTruthMode vm={vm} />;
    }
  }, [mode, vm]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden text-slate-200">
      <TopNav mode={mode} onChangeMode={setModeSafe} />
      <div className="flex-1 min-h-0 overflow-hidden">
        {content}
      </div>
    </div>
  );
};
