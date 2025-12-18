import { WorldState, AgentId, LocationId } from "../../types";
import { hydrateLocation } from "../../adapters/rich-location";
import { Location } from "../../location/types";
import {
  getAgentMapCell,
  estimateMapDistance,
  estimateCellHazard,
} from "../../world/agentPosition";

/**
 * Поправка к целям на основе ToM и относительной опасности других персонажей.
 * Это аналог ContextualGoalScore для локаций, но с фокусом на отношениях и угрозе.
 */
export interface TomGoalContextScore {
  goalId: string;
  baseWeight: number;
  contextDelta: number;
  finalWeight: number;
  sources: string[];
}

/**
 * Вытаскиваем ToM-взгляд агента на других.
 */
function getTomViewForAgent(world: WorldState, selfId: string): Record<string, any> | null {
  const tom = (world as any).tom;
  if (!tom) return null;
  // Direct access (TomState = Record<ObserverId, Record<TargetId, TomEntry>>)
  if (tom[selfId]) return tom[selfId];
  // Fallback for different structures if any (e.g. legacy views wrapper)
  if (tom.views && tom.views[selfId]) return tom.views[selfId];
  return null;
}

/**
 * Оценка относительной угрозы другого агента с учётом:
 * - расстояния (по локациям),
 * - опасности локации (riskIndex),
 * - ToM-поля threat/hostility/conflict.
 */
function computeRelativeThreat(
  world: WorldState,
  selfId: string,
  otherId: string,
  selfLocationId: string | null,
  otherLocationId: string | null,
  tomView: any
): { threat: number; proximity: number; locationRisk: number; mapHazard: number } {
  if (selfId === otherId) return { threat: 0, proximity: 0, locationRisk: 0, mapHazard: 0 };

  const entry = tomView ? tomView[otherId] : null;

  // 1. Базовая ToM-угроза
  let tomThreat = 0;
  if (entry) {
      if (entry.traits) {
          tomThreat = Math.max(tomThreat, entry.traits.conflict ?? 0);
          // Low trust implies potential threat if conflict exists
          if ((entry.traits.trust ?? 1) < 0.3) tomThreat += 0.2;
      }
      if (entry.affect) {
          // If I fear them, they are a threat
          tomThreat = Math.max(tomThreat, entry.affect.fear ?? 0);
      }
      // Legacy properties
      if (typeof entry.threat === 'number') tomThreat = entry.threat;
      if (typeof entry.hostility === 'number') tomThreat = entry.hostility;
  }

  // 2. Проксимити по карте (если есть)
  let proximity = 0;
  let mapHazard = 0.5;

  const selfCell = getAgentMapCell(world, selfId);
  const otherCell = getAgentMapCell(world, otherId);

  if (selfCell && otherCell) {
    const locA = (selfCell.location as any).entityId;
    const locB = (otherCell.location as any).entityId;
    const distNorm = estimateMapDistance(
      { locationId: locA, cell: selfCell.cell },
      { locationId: locB, cell: otherCell.cell }
    );
    proximity = 1 - distNorm; // близко = 1, далеко = 0

    // локальная опасность там, где другой
    mapHazard = estimateCellHazard(otherCell.cell);
  } else if (selfLocationId && otherLocationId) {
    // fallback по локациям
    proximity = selfLocationId === otherLocationId ? 1 : 0.4;
  }

  // 3. Опасность локации (riskIndex из rich Location)
  let locationRisk = 0.5;
  if (selfLocationId) {
    const entity = (world as any).locations?.find(
      (loc: any) => loc.entityId === selfLocationId
    );
    if (entity) {
      const loc: Location = hydrateLocation(entity);
      if (loc.riskReward && typeof loc.riskReward.riskIndex === "number") {
        locationRisk = loc.riskReward.riskIndex;
      }
    }
  }

  // 4. Итоговая относительная угроза
  // Risk amplifies perceived threat from others (paranoia/stress)
  const raw = tomThreat * proximity * locationRisk * mapHazard;
  const clamped = Math.max(0, Math.min(1, raw));

  return {
    threat: clamped,
    proximity,
    locationRisk,
    mapHazard,
  };
}

/**
 * Превращаем ToM-угрозы/отношения в поправки к целям:
 * - safety/escape — вверх при высокой угрозе;
 * - contain_threat — вверх при высокой угрозе и низком доверии;
 * - protect_other/aid_ally — вверх при низкой угрозе и высокой поддержке/доверии.
 */
export function computeTomGoalsForAgent(
  world: WorldState,
  agentId: string
): TomGoalContextScore[] {
  const agent = world.agents.find((c) => c.entityId === agentId);
  if (!agent) return [];

  const selfLocationId = (agent as any).locationId ?? null;
  const tomView = getTomViewForAgent(world, agentId);

  const scores: TomGoalContextScore[] = [];

  for (const other of world.agents) {
    if (other.entityId === agentId) continue;

    const otherLocationId = (other as any).locationId ?? null;
    const relThreat = computeRelativeThreat(
      world,
      agentId,
      other.entityId,
      selfLocationId,
      otherLocationId,
      tomView
    );
    const threat = relThreat.threat;

    const entry = tomView ? tomView[other.entityId] : null;
    
    // Skip if negligible impact
    if (threat <= 0.01 && (!entry || !entry.traits)) {
      continue;
    }

    let trust = 0.5;
    let align = 0.5;
    if (entry && entry.traits) {
        trust = entry.traits.trust ?? 0.5;
        align = entry.traits.align ?? 0.5;
    }

    // Базовые эффекты:
    const safetyDelta = threat; // чем выше угроза, тем сильнее хочется безопасности/избежать
    const attackDelta = threat * Math.max(0, 1 - trust); // сдерживать, если угроза и низкое доверие
    const supportDelta = Math.max(0, align) * (1 - threat) * 0.6; // поддержать союзника (если не опасен)
    const bondDelta = Math.max(0, trust * 0.6 + align * 0.4) * (1 - threat); // укрепить связь

    const sourceBase = `tom:${other.title || other.entityId}`;

    if (safetyDelta > 0.1) {
      scores.push({
        goalId: "protect_self",
        baseWeight: 0,
        contextDelta: safetyDelta,
        finalWeight: safetyDelta,
        sources: [
          sourceBase, 
          `threat:${threat.toFixed(2)}`, 
          `tom:proximity=${relThreat.proximity.toFixed(2)}`,
          `tom:mapHazard=${relThreat.mapHazard.toFixed(2)}`,
        ],
      });
      scores.push({
        goalId: "escape",
        baseWeight: 0,
        contextDelta: safetyDelta * 0.7,
        finalWeight: safetyDelta * 0.7,
        sources: [
          sourceBase, 
          "tom:danger"
        ],
      });
    }

    if (attackDelta > 0.2) {
      scores.push({
        goalId: "contain_threat",
        baseWeight: 0,
        contextDelta: attackDelta,
        finalWeight: attackDelta,
        sources: [sourceBase, `low_trust:${trust.toFixed(2)}`, "tom:hostility"],
      });
    }

    if (supportDelta > 0.1) {
      scores.push({
        goalId: "aid_ally",
        baseWeight: 0,
        contextDelta: supportDelta,
        finalWeight: supportDelta,
        sources: [sourceBase, "tom:ally"],
      });
      scores.push({
        goalId: "protect_other",
        baseWeight: 0,
        contextDelta: supportDelta * 0.8,
        finalWeight: supportDelta * 0.8,
        sources: [sourceBase, "tom:care"],
      });
    }

    if (bondDelta > 0.1) {
      scores.push({
        goalId: "maintain_bonds",
        baseWeight: 0,
        contextDelta: bondDelta,
        finalWeight: bondDelta,
        sources: [sourceBase, "tom:trust", "tom:proximity"],
      });
    }
  }

  return scores;
}
