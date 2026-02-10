import React from 'react';
import type { PipelineSnapshotDebug, DebugStageRecord } from '../../../lib/goal-lab/debugger/types';

/**
 * Lightweight debugger panel with two modes:
 * - story: user-facing narrative summary
 * - debug: stage-by-stage structured diagnostics
 */
export const GoalLabDebuggerPanel: React.FC<{ snapshot: PipelineSnapshotDebug }> = ({ snapshot }) => {
  const [mode, setMode] = React.useState<'story' | 'debug'>('story');
  const [activeStage, setActiveStage] = React.useState<DebugStageRecord['id']>('s0_intake');

  if (!snapshot) return null;

  return (
    <div className="h-full min-h-0 flex flex-col bg-canon-bg text-canon-text">
      <div className="p-3 border-b border-canon-border/30 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-canon-text-light">GoalLab debugger</div>
          <div className="text-sm font-semibold">Tick {snapshot.tick} • Agent {snapshot.agentId}</div>
        </div>
        <div className="flex gap-1 rounded border border-canon-border/50 overflow-hidden">
          <button
            className={`px-3 py-1 text-xs ${mode === 'story' ? 'bg-canon-accent/20 text-canon-accent' : 'text-canon-text-light'}`}
            onClick={() => setMode('story')}
          >
            Story
          </button>
          <button
            className={`px-3 py-1 text-xs ${mode === 'debug' ? 'bg-canon-accent/20 text-canon-accent' : 'text-canon-text-light'}`}
            onClick={() => setMode('debug')}
          >
            Debug
          </button>
        </div>
      </div>

      {mode === 'story' ? (
        <StoryMode snapshot={snapshot} />
      ) : (
        <DebugMode snapshot={snapshot} activeStage={activeStage} onSelectStage={setActiveStage} />
      )}
    </div>
  );
};

const StoryMode: React.FC<{ snapshot: PipelineSnapshotDebug }> = ({ snapshot }) => {
  const topGoals = Array.isArray(snapshot.stages.s4_competition.payload.active_goals)
    ? snapshot.stages.s4_competition.payload.active_goals.slice(0, 3)
    : [];
  const actions = Array.isArray(snapshot.decision.alternatives)
    ? snapshot.decision.alternatives.slice(0, 5)
    : [];

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <section className="border border-canon-border/30 rounded p-3 bg-canon-bg-light/30">
        <div className="text-xs uppercase tracking-wider text-canon-text-light mb-2">Что я вижу</div>
        <div className="text-sm text-canon-text-light">
          Активных каналов: {Array.isArray(snapshot.stages.s0_intake.payload.channels) ? snapshot.stages.s0_intake.payload.channels.length : 0}
        </div>
      </section>

      <section className="border border-canon-border/30 rounded p-3 bg-canon-bg-light/30">
        <div className="text-xs uppercase tracking-wider text-canon-text-light mb-2">Что я хочу</div>
        <div className="space-y-2">
          {topGoals.map((g: any) => (
            <div key={g.id} className="flex items-center justify-between text-sm">
              <div className="truncate mr-2">{g.name || g.id}</div>
              <div className="font-mono">{Math.round(Number(g.energy ?? 0) * 100)}%</div>
            </div>
          ))}
          {!topGoals.length ? <div className="text-xs text-canon-text-light/70">Нет данных целей.</div> : null}
        </div>
      </section>

      <section className="border border-canon-border/30 rounded p-3 bg-canon-bg-light/30">
        <div className="text-xs uppercase tracking-wider text-canon-text-light mb-2">Что я могу сделать</div>
        <div className="space-y-2">
          {actions.map(a => (
            <div key={a.action} className="flex items-center justify-between text-sm">
              <div className="truncate mr-2">{a.action}</div>
              <div className={`${snapshot.decision.chosenAction === a.action ? 'text-green-400' : 'text-canon-text'} font-mono`}>
                {Math.round(Number(a.score ?? 0) * 100)}%
              </div>
            </div>
          ))}
          {!actions.length ? <div className="text-xs text-canon-text-light/70">Нет данных действий.</div> : null}
        </div>
      </section>
    </div>
  );
};

const DebugMode: React.FC<{
  snapshot: PipelineSnapshotDebug;
  activeStage: DebugStageRecord['id'];
  onSelectStage: (id: DebugStageRecord['id']) => void;
}> = ({ snapshot, activeStage, onSelectStage }) => {
  const stage = snapshot.stages[activeStage];

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr]">
      <div className="border-r border-canon-border/30 overflow-y-auto">
        {snapshot.stageOrder.map(id => {
          const st = snapshot.stages[id];
          return (
            <button
              key={id}
              onClick={() => onSelectStage(id)}
              className={`w-full text-left p-3 border-b border-canon-border/20 ${id === activeStage ? 'bg-canon-accent/10' : 'hover:bg-canon-bg-light/20'}`}
            >
              <div className="text-xs font-mono">{st.title}</div>
              <div className="text-[11px] text-canon-text-light mt-1">{st.summary.text}</div>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 overflow-y-auto p-4 space-y-4">
        <section className="border border-canon-border/30 rounded p-3">
          <div className="text-xs uppercase tracking-wider text-canon-text-light mb-2">Stage summary</div>
          <div className="text-sm font-semibold">{stage.title}</div>
          <div className="text-xs mt-1 text-canon-text-light">{stage.summary.text}</div>
          {stage.summary.metrics ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(stage.summary.metrics).map(([k, v]) => (
                <div key={k} className="px-2 py-1 rounded bg-canon-bg-light/40 text-xs font-mono">
                  {k}: {String(v)}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="border border-canon-border/30 rounded p-3">
          <div className="text-xs uppercase tracking-wider text-canon-text-light mb-2">Energy graph (table)</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {(Array.isArray(snapshot.graph.nodes) ? snapshot.graph.nodes : []).slice(0, 20).map(node => (
              <div key={node.id} className="rounded border border-canon-border/20 p-2">
                <div className="font-mono truncate">{node.id}</div>
                <div className="text-canon-text-light">{node.type}</div>
                <div className="font-semibold">E={Number(node.energy).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-canon-border/30 rounded p-3">
          <div className="text-xs uppercase tracking-wider text-canon-text-light mb-2">Decision trace</div>
          <div className="text-sm">chosen: {snapshot.decision.chosenAction || 'none'}</div>
          <div className="text-xs text-canon-text-light mt-2">{snapshot.decision.reasoning || 'No reasoning in snapshot'}</div>
        </section>
      </div>
    </div>
  );
};
