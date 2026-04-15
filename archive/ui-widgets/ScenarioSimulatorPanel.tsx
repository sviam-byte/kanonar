
import React, { useState } from "react";
import { WorldState, ScenarioId, DomainEvent } from "../../types";
import { runScenarioTick } from "../../lib/scenario/engine";
import { getInitialWorldForScenario } from "../../lib/scenario/registry";
import { allScenarioDefs } from "../../data/scenarios/index";

interface ScenarioSimulatorPanelProps {
  defaultScenarioId: ScenarioId;
}

export const ScenarioSimulatorPanel: React.FC<ScenarioSimulatorPanelProps> = ({
  defaultScenarioId,
}) => {
  const [scenarioId, setScenarioId] = useState<ScenarioId>(defaultScenarioId);
  const [world, setWorld] = useState<WorldState | null>(null);
  const [tick, setTick] = useState<number>(0);
  const [events, setEvents] = useState<DomainEvent[]>([]);

  const handleInit = () => {
      try {
        const w = getInitialWorldForScenario(scenarioId);
        setWorld(w);
        setTick(0);
        setEvents([]);
      } catch (e) {
          alert(`Error initializing scenario: ${e}`);
      }
  };

  const handleNextTick = () => {
    if (!world) return;
    const { world: nextWorld, events: newEvents } = runScenarioTick(
      world,
      scenarioId
    );
    setWorld(nextWorld);
    setTick(nextWorld.tick);
    setEvents((prev) => [...newEvents, ...prev]); // Prepend new events
  };

  return (
    <div className="flex flex-col gap-4 bg-canon-bg-light border border-canon-border rounded-lg p-4">
      <div className="flex items-center gap-4">
        <div>
            <label className="text-xs font-bold text-canon-text-light block mb-1">SCENARIO</label>
            <select
            className="bg-canon-bg border border-canon-border rounded px-2 py-1 text-sm text-canon-text focus:outline-none focus:border-canon-accent"
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value as ScenarioId)}
            >
                {Object.keys(allScenarioDefs).map(id => (
                    <option key={id} value={id}>{allScenarioDefs[id].title}</option>
                ))}
            </select>
        </div>
        <div className="flex items-end gap-2">
            <button
            className="px-4 py-1.5 text-xs font-bold uppercase rounded bg-canon-bg border border-canon-border hover:bg-canon-blue hover:text-canon-bg transition-colors"
            onClick={handleInit}
            >
            Initialize / Reset
            </button>
            <button
            className="px-4 py-1.5 text-xs font-bold uppercase rounded bg-canon-accent text-canon-bg hover:bg-opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleNextTick}
            disabled={!world}
            >
            Next Tick
            </button>
        </div>
        
        {world && (
             <div className="ml-auto flex flex-col items-end">
                <span className="text-[10px] text-canon-text-light uppercase">Simulation Time</span>
                <span className="font-mono font-bold text-lg text-canon-text">TICK {tick}</span>
            </div>
        )}
      </div>

      <div className="border border-canon-border/50 rounded-lg bg-canon-bg overflow-hidden flex flex-col h-64">
        <div className="bg-canon-bg-light border-b border-canon-border/30 px-3 py-2 text-xs font-bold text-canon-text-light uppercase">
            Domain Event Log
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {events.length === 0 ? (
            <div className="text-canon-text-light italic text-xs text-center mt-10">No events generated yet.</div>
            ) : (
            events.map((ev, idx) => (
                <div key={idx} className="text-xs border-b border-canon-border/20 last:border-0 pb-1 mb-1">
                    <div className="flex justify-between text-canon-text-light mb-0.5">
                        <span className="font-mono text-[10px]">[{ev.t}]</span>
                        <span className="uppercase text-[9px] border border-canon-border px-1 rounded">{ev.domain}</span>
                    </div>
                    <div className="text-canon-text font-medium">
                        <span className="text-canon-accent">{ev.actorId}</span>: {ev.actionId}
                        {ev.targetId && <span className="opacity-70"> → {ev.targetId}</span>}
                    </div>
                </div>
            ))
            )}
        </div>
      </div>
    </div>
  );
};
