
import React, { useEffect, useMemo, useState } from "react";
import { makeWorldDebugSnapshot } from "../../lib/diagnostics/snapshots";
import { WorldDashboard } from "./WorldDashboard";
import { CharacterCard } from "./CharacterCard";
import { TimelineScrubber } from "./TimelineScrubber";
import type { WorldState } from "../../types";

interface Props {
  worldHistory: WorldState[];
}

export const SimulationInspector: React.FC<Props> = ({ worldHistory }) => {
  const maxTick = worldHistory.length > 0 ? worldHistory.length - 1 : 0;
  const [currentTick, setCurrentTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  // Auto-select first character if none selected
  useEffect(() => {
      if (!selectedCharacterId && worldHistory[0]?.agents.length > 0) {
          setSelectedCharacterId(worldHistory[0].agents[0].entityId);
      }
      // Reset tick on new history
      setCurrentTick(0);
      setPlaying(false);
  }, [worldHistory]);

  // Playback loop
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setCurrentTick((prev) => {
        if (prev >= maxTick) {
            setPlaying(false);
            return prev;
        }
        return prev + 1;
      });
    }, 150); // 150ms per tick
    return () => clearInterval(interval);
  }, [playing, maxTick]);

  const worldSnapshot = useMemo(() => {
    const world = worldHistory[currentTick];
    return world ? makeWorldDebugSnapshot(world) : null;
  }, [worldHistory, currentTick]);

  const selectedCharacter = useMemo(() => {
    if (!worldSnapshot || !selectedCharacterId) return null;
    return worldSnapshot.characters.find((c) => c.id === selectedCharacterId) ?? null;
  }, [worldSnapshot, selectedCharacterId]);

  if (!worldSnapshot) return null;

  return (
    <div className="flex h-full flex-col gap-4">
      <TimelineScrubber
        currentTick={currentTick}
        maxTick={maxTick}
        onChange={(t) => {
          setCurrentTick(t);
          setPlaying(false);
        }}
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
      />

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <WorldDashboard
            world={worldSnapshot}
            onSelectCharacter={(id) => setSelectedCharacterId(id)}
            selectedCharacterId={selectedCharacterId}
          />
        </div>
        <div className="w-[380px] shrink-0 overflow-hidden flex flex-col">
          {selectedCharacter ? (
            <CharacterCard character={selectedCharacter} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-canon-border bg-canon-bg-light/50 text-sm text-canon-text-light p-8 text-center">
              Выберите персонажа для инспекции
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
