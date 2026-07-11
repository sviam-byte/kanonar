import type { ObservationEnvelopeV1, ObservationResolutionV1, ResolvedSceneInputV1 } from '../observation/types';

export type ConflictSceneProjectionV1 = {
  schemaVersion: 1;
  sceneId: string;
  protocolId: 'trust_exchange';
  players: readonly [string, string];
  roles: Readonly<Record<string, 'participant'>>;
  observationsByPlayerId: Readonly<Record<string, readonly ObservationEnvelopeV1[]>>;
  relationSignalsByPlayerId: Readonly<Record<string, readonly ObservationEnvelopeV1[]>>;
};

export function adaptResolvedSceneToConflictV1(scene: ResolvedSceneInputV1, resolution: ObservationResolutionV1): ConflictSceneProjectionV1 {
  if (scene.sceneId !== resolution.sceneId || scene.tick !== resolution.tick) throw new Error('conflict_scene_resolution_mismatch');
  if (scene.cast.length !== 2) throw new Error('conflict_trust_exchange_requires_two_players');
  const ids = scene.cast.map(member => member.agentId).sort();
  const players = [ids[0], ids[1]] as const;
  const observationsByPlayerId: Record<string, readonly ObservationEnvelopeV1[]> = {};
  const relationSignalsByPlayerId: Record<string, readonly ObservationEnvelopeV1[]> = {};
  for (const playerId of players) {
    const observations = resolution.observationsByCharacterId[playerId];
    if (!observations) throw new Error(`conflict_missing_observer:${playerId}`);
    observationsByPlayerId[playerId] = observations;
    relationSignalsByPlayerId[playerId] = observations.filter(item => item.kind === 'relation_signal' && (item.targetId === players[0] || item.targetId === players[1]));
  }
  return {
    schemaVersion: 1, sceneId: scene.sceneId, protocolId: 'trust_exchange', players,
    roles: { [players[0]]: 'participant', [players[1]]: 'participant' },
    observationsByPlayerId, relationSignalsByPlayerId,
  };
}
