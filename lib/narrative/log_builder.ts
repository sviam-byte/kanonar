
// lib/narrative/log_builder.ts
import { SimulationEvent, NarrativeLogLine, DevLogLine, ActionAppliedEvent, BaseEvent, LeaderChangedEvent, ActionChosenEvent, SceneMetricsUpdatedEvent, TomUpdatedEvent, RelationshipSnapshotEvent, RoleAssignedEvent, RoleClaimedEvent, RoleProposedEvent, RoleResponseEvent } from '../../types';
import { formatLeaderChangedNarrative, formatActionNarrative, formatActionEffectNarrative, formatSceneMetricsUpdate, formatRoleEventNarrative } from './formatters';

export function buildLogs(events: SimulationEvent[]): {
  narrative: NarrativeLogLine[];
  dev: DevLogLine[];
} {
  const narrative: NarrativeLogLine[] = [];
  const dev: DevLogLine[] = [];

  const tickStartEvent = events.find(e => e.kind === 'TickStart');
  if (tickStartEvent) {
    narrative.push({ tick: tickStartEvent.tick, text: `--- ТИК ${tickStartEvent.tick} ---` });
    dev.push({ tick: tickStartEvent.tick, category: 'tick', meta: { tick: tickStartEvent.tick } });
  }

  for (const e of events) {
    let category: DevLogLine['category'] | null = null;
    let meta: any; 

    switch (e.kind) {
      case "LeaderChanged":
        narrative.push(formatLeaderChangedNarrative(e as LeaderChangedEvent));
        category = 'leader';
        meta = { ...e };
        break;
      case "ActionChosen":
        const actionEvent = e as ActionChosenEvent;
        narrative.push(formatActionNarrative(actionEvent));
        category = 'action';
        // Flatten the score breakdown into the meta object for easier logging, as requested
        meta = {
            actorId: actionEvent.actorId,
            actionId: actionEvent.actionId,
            targetId: actionEvent.targetId,
            topGoalId: actionEvent.topGoalId,
            probability: actionEvent.probability,
            qTotal: actionEvent.scoreBreakdown.total,
            qFromGoals: actionEvent.scoreBreakdown.fromGoals,
            qFromScenario: actionEvent.scoreBreakdown.fromScenario,
            qFromRelations: actionEvent.scoreBreakdown.fromRelations,
            qFromProcedure: actionEvent.scoreBreakdown.fromProcedure,
            qFromFaction: actionEvent.scoreBreakdown.fromFaction,
            qFromRole: actionEvent.scoreBreakdown.weighted?.role,
            qCost: actionEvent.scoreBreakdown.cost,
            repetitionPenalty: actionEvent.scoreBreakdown.repetitionPenalty,
            stagnationPenalty: actionEvent.scoreBreakdown.stagnationPenalty,
        };
        break;
      case "ActionApplied":
        // Log the outcome details (success, orders, etc.)
        narrative.push(formatActionEffectNarrative(e as ActionAppliedEvent));
        // We can add dev log here if needed, but ActionChosen covers the "Why".
        break;
      case "SceneMetricsUpdated":
        narrative.push(formatSceneMetricsUpdate(e as SceneMetricsUpdatedEvent));
        break;
      case "TomUpdated":
        category = 'tom';
        meta = { ...e };
        break;
      case "RoleAssigned":
      case "RoleClaimed":
      case "RoleProposed":
      case "RoleResponse":
        narrative.push(formatRoleEventNarrative(e as any));
        category = 'role';
        meta = { ...e };
        break;
      default:
        // Ignore other events for narrative
        break;
    }

    if (category && meta) {
      dev.push({ tick: e.tick, category, meta });
    }
  }
  
  return { narrative, dev };
}
