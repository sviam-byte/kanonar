

import {
  WorldState,
  ScenarioContextState,
  ActionRequest,
  ConsequenceBundle,
  NormGateInput,
  NormGateResult,
  DomainEvent,
  LocationEntity,
} from '../../types';
import { evaluateNormGate } from '../context/normGate';
import { getLocationForAgent, getLocationMapCell } from "../world/locations";

function getLocationById(
  world: WorldState,
  locationId?: string
): LocationEntity | undefined {
  if (!locationId) return undefined;
  // Use generic location access
  return (world as any).locations?.find((l: any) => l.entityId === locationId);
}

function getLocationTags(
  world: WorldState,
  locationId?: string
): string[] {
  const loc = getLocationById(world, locationId);
  if (!loc) return [];
  return loc.properties?.tags ?? [];
}

function getActionMultiplier(
  ctx: ScenarioContextState,
  actionId: string
): number {
  const phase = ctx.activePhase;
  if (!phase || !phase.actionMultipliers) return 1;
  const m = phase.actionMultipliers[actionId];
  if (typeof m !== 'number') return 1;
  return m;
}

/**
 * Проверка действия через NormGate + affordances локации.
 * Возвращает решение и модификатор utility.
 */
export function checkActionByNormsAndLocation(
  world: WorldState,
  ctx: ScenarioContextState,
  action: ActionRequest
): { norm: NormGateResult; utilityMultiplier: number } {
  const loc = getLocationById(world, action.locationId);
  const locationTags = getLocationTags(world, action.locationId);

  const phaseNorms = ctx.activePhase?.normOverrides ?? [];
  const allNorms = [...ctx.norms, ...phaseNorms];

  const input: NormGateInput = {
    actorId: action.actorId,
    actionId: action.actionId,
    actionTags: action.tags,
    locationId: action.locationId,
    locationTags,
    roleIds: action.actorRoleIds ?? [],
    phaseId: ctx.activePhase?.id,
    atoms: ctx.atoms,
    norms: allNorms,
  };

  const normRes = evaluateNormGate(input);

  let utilityMultiplier = getActionMultiplier(ctx, action.actionId);

  // простейшие штрафы/бонусы к utility за нормы
  utilityMultiplier *= 1 / (1 + normRes.sanctionScore);
  utilityMultiplier *= 1 + normRes.rewardScore;

  // проверка affordances локации: если явно запрещено — приравниваем к forbid (soft)
  if (loc && loc.affordances) {
    const allowed = loc.affordances.allowedActions as (string[] | undefined);
    const forbidden = loc.affordances.forbiddenActions as (string[] | undefined);

    if (allowed && allowed.length > 0) {
      const ok =
        allowed.includes(action.actionId) ||
        action.tags.some((t) => allowed.includes(t));
      if (!ok) {
        // не жёсткий запрет, но сильный штраф
        utilityMultiplier *= 0.1;
      }
    }

    if (forbidden && forbidden.length > 0) {
      const bad =
        forbidden.includes(action.actionId) ||
        action.tags.some((t) => forbidden.includes(t));
      if (bad) {
        utilityMultiplier *= 0.05;
      }
    }
  }

  return { norm: normRes, utilityMultiplier };
}

/**
 * Каркас Consequence Engine для одного действия.
 * Сейчас создаёт только простой DomainEvent, дальше можно расширять.
 */
export function computeActionConsequences(
  world: WorldState,
  ctx: ScenarioContextState,
  action: ActionRequest,
  norm: NormGateResult
): ConsequenceBundle {
  const domainEvents: DomainEvent[] = [];

  // Если действие запрещено "жёстко" — можно вообще не создавать события
  if (norm.decision === 'forbid' && norm.hard) {
    return {
      domainEvents,
      notes: [
        `action ${action.actionId} by ${action.actorId} blocked by hard norms`,
      ],
    };
  }

  // Базовый доменный event "actor совершил действие actionId"
  const ev: DomainEvent = {
    id: `act:${action.id}`,
    t: action.t,
    locationId: action.locationId,
    actorId: action.actorId,
    targetId: action.targetId,
    tags: ["action", ...(action.tags ?? [])],
    domain: `action/${action.actionId}`,
    polarity: 0,
    intensity: 1,
    meta: {
      normDecision: norm.decision,
      sanctionScore: norm.sanctionScore,
      rewardScore: norm.rewardScore,
    },
  } as any;

  domainEvents.push(ev);

  // Если действие — "move" и есть карта, смотрим опасность клетки
  if (action.actionId === "move" && action.targetLocationCell) {
    const loc = getLocationForAgent(world, action.actorId);
    const cell = loc && getLocationMapCell(loc, action.targetLocationCell.x, action.targetLocationCell.y);

    if (cell) {
      if (!cell.walkable) {
        // попытка войти в стену → отдельное событие
        domainEvents.push({
          id: `blocked:${action.id}`,
          t: action.t,
          locationId: action.locationId,
          actorId: action.actorId,
          tags: ["movement_blocked", "obstacle"],
          domain: "movement",
          polarity: -1,
          intensity: 0.5,
        } as any);
      } else {
        // успешное перемещение, учитываем danger
        if ((cell.danger ?? 0) > 0.3) {
          domainEvents.push({
            id: `danger:${action.id}`,
            t: action.t,
            locationId: action.locationId,
            actorId: action.actorId,
            tags: ["enter_danger_zone", "threat"],
            domain: "environment",
            polarity: +1,
            intensity: cell.danger,
          } as any);
        }
      }
    }
  }

  // Социальная поддержка
  if (action.tags?.includes("support") && action.targetId) {
    domainEvents.push({
      id: `rel:${action.id}`,
      t: action.t,
      locationId: action.locationId,
      actorId: action.actorId,
      targetId: action.targetId,
      tags: ["relation", "support"],
      domain: "social",
      polarity: +0.5,
      intensity: 0.7,
    } as any);
  }

  // Физический риск / травма
  if (action.tags?.includes("risky") && action.actorId) {
    domainEvents.push({
      id: `injury:${action.id}`,
      t: action.t,
      locationId: action.locationId,
      actorId: action.actorId,
      tags: ["physical", "injury"],
      domain: "health",
      polarity: -1,
      intensity: 0.5,
    } as any);
  }

  // Нарушения норм
  if (norm.decision === "forbid" || norm.decision === "require_authorization") {
    domainEvents.push({
      id: `norm:${action.id}`,
      t: action.t,
      locationId: action.locationId,
      actorId: action.actorId,
      tags: ["norm_violation"],
      domain: "norms",
      polarity: -1,
      intensity: 1,
    } as any);
  }

  return {
    domainEvents,
    notes: [],
  };
}

/**
 * Разрешить один запрос действия:
 * - проверяем norms+location
 * - считаем последствия (ConsequenceBundle)
 */
export function resolveActionRequest(
  world: WorldState,
  ctx: ScenarioContextState,
  action: ActionRequest
): { bundle: ConsequenceBundle; norm: NormGateResult } {
  const { norm, utilityMultiplier } =
    checkActionByNormsAndLocation(world, ctx, action);

  // Если utilityMultiplier практически нулевой и есть запреты — можно считать, что герой "отказался" от действия
  if (utilityMultiplier < 0.05 && norm.decision !== 'allow') {
    return {
      bundle: { domainEvents: [], notes: ['action skipped by low utility'] },
      norm,
    };
  }

  const bundle = computeActionConsequences(world, ctx, action, norm);
  return { bundle, norm };
}