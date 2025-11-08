import { CharacterEntity, Counterparty, Mission, EnvoyResult } from '../../types';
import { simulateNegotiation } from './simulate';

export function rankEnvoys(candidates: CharacterEntity[], cp: Counterparty, mission: Mission): EnvoyResult[] {
  return candidates
    .map(c => {
      const charParams = Object.fromEntries(c.parameters.map(p => [p.key, p.defaultValue]));
      const m = simulateNegotiation(charParams, cp, mission, 256);
      
      const score = m.expectedDealValue - 0.7 * m.cvar10 + 0.5 * m.postDelta.S30;
      
      return { id: c.entityId, entity: c, score, metrics: m };
    })
    .sort((a, b) => b.score - a.score);
}