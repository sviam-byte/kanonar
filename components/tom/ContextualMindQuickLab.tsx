
import React, { useMemo, useState } from 'react';
import type { CharacterEntity } from '../../types';
import { createInitialWorld } from '../../lib/world/initializer';
import { allLocations } from '../../data/locations';
import { buildGoalLabContext } from '../../lib/goals/goalLabContext';
import { computeContextualMind } from '../../lib/tom/contextual/engine';
import { Slider } from '../Slider';
import { ContextualMindPanel } from './ContextualMindPanel';

export const ContextualMindQuickLab: React.FC<{ character: CharacterEntity; allCharacters: CharacterEntity[] }> = ({ character, allCharacters }) => {
  const others = useMemo(() => allCharacters.filter(c => c.entityId !== character.entityId), [allCharacters, character.entityId]);
  const [targetId, setTargetId] = useState<string>(() => others[0]?.entityId ?? '');
  const [threat, setThreat] = useState(35);
  const [intimacy, setIntimacy] = useState(15);
  const [hierarchy, setHierarchy] = useState(10);
  const [publicness, setPublicness] = useState(25);

  const report = useMemo(() => {
    const target = others.find(o => o.entityId === targetId) ?? others[0];
    if (!target) return null;

    const world = createInitialWorld(Date.now(), [character, target], 'cave_rescue', {}, {});
    if (!world) return null; // Safety check
    
    (world as any).scene = (world as any).scene || {};
    (world as any).scene.metrics = (world as any).scene.metrics || {};
    (world as any).scene.metrics.threat = threat;

    // Inject a simple “domain mix” proxy via location tags if possible.
    const obs = world.agents.find(a => a.entityId === character.entityId);
    const locId = (obs as any)?.locationId;
    const loc = (world as any).locations?.find((l: any) => l.entityId === locId);
    if (loc) {
      const tags = new Set<string>(loc.tags ?? []);
      if (intimacy > 50) tags.add('intimate');
      if (hierarchy > 50) tags.add('formal');
      if (publicness > 50) tags.add('public');
      loc.tags = Array.from(tags);
    }

    const gl = buildGoalLabContext(world, character.entityId, {
      snapshotOptions: { overrideLocation: loc ?? undefined },
      timeOverride: (world as any).tick ?? 0,
    });
    if (!gl) return null;

    const cm = computeContextualMind({
      world,
      agent: gl.agent,
      frame: gl.frame ?? null,
      goalPreview: gl.goalPreview?.goals ?? null,
      domainMix: {
        danger: threat / 100,
        intimacy: intimacy / 100,
        hierarchy: hierarchy / 100,
        publicness: publicness / 100,
        ...(gl.goalPreview?.debug?.d_mix ?? {}),
      },
    });
    return cm.report;
  }, [character, others, targetId, threat, intimacy, hierarchy, publicness]);

  return (
    <div className="space-y-4">
      <div className="bg-canon-bg-light/30 border border-canon-border/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-canon-accent uppercase">Context controls</div>
          <div className="text-[10px] text-canon-text-light">Observer: {character.title}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-canon-text-light">
            Target
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 w-full bg-canon-bg border border-canon-border rounded px-2 py-1 text-xs"
            >
              {others.map(o => (
                <option key={o.entityId} value={o.entityId}>{o.title}</option>
              ))}
            </select>
          </label>

          <div className="space-y-2">
            <Slider label="Threat" value={threat} min={0} max={100} setValue={setThreat} />
            <Slider label="Intimacy" value={intimacy} min={0} max={100} setValue={setIntimacy} />
            <Slider label="Hierarchy" value={hierarchy} min={0} max={100} setValue={setHierarchy} />
            <Slider label="Publicness" value={publicness} min={0} max={100} setValue={setPublicness} />
          </div>
        </div>
      </div>

      <ContextualMindPanel report={report} />
    </div>
  );
};
