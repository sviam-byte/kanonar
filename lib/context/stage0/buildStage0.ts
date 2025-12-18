import { AtomBag } from '../../atoms/atomBag';
import { atomizeWorldLocation } from './worldAtoms';
import { atomizeObservation } from './obsAtoms';
import { atomizeInfoAdequacy } from './obsInfoAdequacy';

export function buildStage0Atoms(scene: any) {
  const bag = new AtomBag();

  const agent = scene.agent;
  const loc = scene.location;
  const others = scene.otherAgents || [];

  bag.addMany(
    atomizeWorldLocation(
      agent.id,
      loc,
      scene.mapMetrics || { cover: 0.5, danger: 0, escape: 0.5 },
    ),
  );

  const socialSamples: { los: number; aud: number }[] = [];

  for (const b of others) {
    const obs = atomizeObservation(
      agent,
      b,
      {
        visibility: loc.visibility ?? 0.7,
        crowd: loc.crowd ?? 0.3,
        noise: loc.noise ?? 0.2,
      },
    );
    bag.addMany(obs);
    
    const los = obs.find(x => x.id.startsWith('obs:los:'))?.m ?? 0;
    const aud = obs.find(x => x.id.startsWith('obs:audio:'))?.m ?? 0;
    socialSamples.push({ los, aud });
  }

  bag.add(
    atomizeInfoAdequacy(agent.id, {
      visibility: loc.visibility ?? 0.7,
      crowd: loc.crowd ?? 0.3,
      noise: loc.noise ?? 0.2,
    }, socialSamples),
  );

  if (scene.overrides) {
      bag.addMany(scene.overrides);
  }

  return bag;
}
