




import { WorldState, AnyEntity, CharacterEntity, SystemEpisode } from '../../types';

export interface ObservationContext {
  tick: number;
  sceneId?: string;
  actionsThisTick?: { actorId: string; actionId: string }[];
  outcomeId?: string;
}

function asCharacters(entities: AnyEntity[]): CharacterEntity[] {
  return entities.filter((e): e is CharacterEntity => e.type === 'character');
}

export function recordEpisode(
  world: WorldState,
  entities: AnyEntity[],
  ctx: ObservationContext,
  maxEpisodes: number = 1000
): WorldState {
  const chars = asCharacters(entities);

  // Try to read calculated metrics if available on entity objects (from simulation context)
  // Fallback to basic params if not
  let totalStress = 0;
  let totalDark = 0;
  let totalRisk = 0;
  let count = 0;

  for (const c of chars) {
      const calc = c as any;
      let stress = (c.body?.acute?.stress ?? 0) / 100;
      let dark = (c.state?.dark_exposure ?? 0) / 100;
      let risk = c.vector_base?.B_exploration_rate ?? 0.5; // Proxy

      if (calc.v42metrics) {
          // Use calculated metrics if present
          // This assumes entities passed in are the active state objects
      }
      if (calc.latents) {
          risk = calc.latents.RP ?? risk;
      }
      
      totalStress += stress;
      totalDark += dark;
      totalRisk += risk;
      count++;
  }

  const avgStress = count > 0 ? totalStress / count : 0;
  const avgDark = count > 0 ? totalDark / count : 0;
  const avgRisk = count > 0 ? totalRisk / count : 0;

  const actors = ctx.actionsThisTick?.map(a => a.actorId) ?? [];

  const episode: SystemEpisode = {
    tick: ctx.tick,
    sceneId: ctx.sceneId,
    actors,
    actionId: ctx.actionsThisTick && ctx.actionsThisTick[0]?.actionId,
    outcome: ctx.outcomeId,
    metrics_snapshot: {
      avgStress,
      avgDark,
      avgRisk,
    },
  };

  // Use type assertion or optional chaining on input, but since we return a new object 
  // matching the interface that includes systemEpisodes (per types.ts update), it's safer.
  // We need to ensure the property exists on the input type if we read it.
  const episodes = (world.systemEpisodes ?? []).concat(episode);
  const trimmed =
    episodes.length > maxEpisodes
      ? episodes.slice(episodes.length - maxEpisodes)
      : episodes;

  return {
    ...world,
    systemEpisodes: trimmed,
  };
}
