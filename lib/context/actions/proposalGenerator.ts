import type { ActionIntent } from '../types';
import type { TickContext } from '../engineTypes';

/**
 * Генерирует все возможные намерения
 * НЕ решает, хорошие они или плохие — только "что в принципе можно попытаться сделать"
 */
export function defaultProposalGenerator(ctx: TickContext): ActionIntent[] {
  const intents: ActionIntent[] = [];
  const { actorId, actionCatalog, scenario, participants } = ctx;

  for (const [actionId, def] of Object.entries(actionCatalog)) {
    switch (def.target?.mode ?? 'none') {
      case 'none':
      case 'self': {
        intents.push({ actionId, actorId });
        break;
      }
      case 'agent': {
        for (const otherId of participants) {
          if (otherId === actorId) continue;
          intents.push({
            actionId,
            actorId,
            target: { kind: 'agent', id: otherId },
          });
        }
        break;
      }
      case 'location': {
        const from = ctx.locationOf[actorId];
        if (!from) break;
        const connections = scenario.map.connections.filter((conn) => conn.from === from);
        for (const conn of connections) {
          intents.push({
            actionId,
            actorId,
            target: { kind: 'location', id: conn.to },
          });
        }
        break;
      }
    }
  }

  return intents;
}
