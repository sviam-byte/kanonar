import React, { useMemo } from 'react';

import { SimulatorLab } from '../lib/goal-lab/labs/SimulatorLab';
import { defaultProducers } from '../lib/orchestrator/defaultProducers';
import { useSandbox } from '../contexts/SandboxContext';
import { useAccess } from '../contexts/AccessContext';
import { getEntitiesByType } from '../data';
import { EntityType } from '../enums';

export const SimKitLabPage: React.FC = () => {
  const { characters: sandboxCharacters } = useSandbox();
  const { activeModule } = useAccess();

  const catalogCharacters = useMemo(() => {
    const moduleChars = activeModule?.getCharacters?.() ?? [];
    const essentials = getEntitiesByType(EntityType.Essence) as any[];
    const base = [...moduleChars, ...sandboxCharacters, ...essentials];
    const map = new Map<string, any>();
    for (const ch of base) {
      if (!ch?.entityId) continue;
      map.set(String(ch.entityId), ch);
    }
    return Array.from(map.values());
  }, [activeModule, sandboxCharacters]);

  const catalogLocations = useMemo(
    () => getEntitiesByType(EntityType.Location) as any[],
    []
  );

  return (
    <div className="h-[calc(100vh-64px)] w-full overflow-hidden">
      <div className="h-full overflow-auto">
        <SimulatorLab
          orchestratorRegistry={defaultProducers}
          catalogCharacters={catalogCharacters}
          catalogLocations={catalogLocations}
        />
      </div>
    </div>
  );
};
