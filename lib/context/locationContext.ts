
import { WorldState, LocationId, LocationEntity } from '../../types';
import type { Location } from '../location/types';
import { hydrateLocation } from '../adapters/rich-location';
import { validateLocation } from '../location/validate';

/**
 * Нормализованный контекст места "здесь и сейчас".
 * Считается из свойств локации и состава участников сцены.
 */
export interface LocationContext {
  location: LocationEntity; // Keep reference to original entity for compatibility
  actors: string[];    // участники сцены
  audience: string[];  // кто присутствует/наблюдает, но не является активным актором

  // Вычисленные параметры (0..1)
  socialVisibility: number;    // насколько это "на виду"
  normativePressure: number;   // давление норм/иерархий
  conflictRisk: number;        // риск конфликта/эскалации
  intimacyPotential: number;   // насколько здесь удобно говорить откровенно
  secrecyPotential: number;    // насколько легко скрыть действия
  escapeDifficulty: number;    // насколько трудно уйти/выйти
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function safeNum(x: unknown, fallback = 0): number {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  return fallback;
}

/**
 * Каноническая реализация: строим контекст из гидрированной Location.
 */
export function buildLocationContextFromLocation(
  world: WorldState,
  loc: Location,
  originalEntity: LocationEntity,
  actorIds: string[],
  audienceIds: string[]
): LocationContext {
  const nActors = actorIds.length;
  const nAudience = audienceIds.length;

  // Mapping from Rich Location fields to Context Metrics
  
  // 1. Visibility & Privacy
  const visibilityBase = clamp01(loc.observation.visibility);
  // privacy in Rich Location is 0..1 (0=public, 1=private)
  const privacy = clamp01(loc.observation.privacy); 
  
  // 2. Control & Noise
  // Use securityLevel as proxy for control if not explicit
  const controlLevel = clamp01(loc.ownership.securityLevel);
  const noise = clamp01(loc.state.noiseLevel);

  // 3. Crowd & Danger
  // LocationState has enemyActivity. Crowd might be in 'crowd' block?
  const baseCrowd = clamp01(loc.crowd.populationDensity);
  const dangerLevel = clamp01(loc.state.enemyActivity); // alert_level proxy

  // 4. Computed Metrics
  const socialVisibility = clamp01(
    visibilityBase +
    (nActors + nAudience) * 0.03 +
    (1 - privacy) * 0.4 -
    noise * 0.2
  );

  // Hierarchy tension could be derived from Conflict Dynamics
  const hierarchyTension = clamp01(loc.conflict.conflictThreshold > 0.5 ? 0.2 : 0.6); // Lower threshold = higher tension? Or inverse?

  const normativePressure = clamp01(
    controlLevel * 0.5 +
    hierarchyTension * 0.4 +
    socialVisibility * 0.3 +
    baseCrowd * 0.2
  );

  // Baseline trust from ToM modifier
  const baselineTrust = clamp01(0.5 + loc.tomModifier.authorityBias * 0.2);

  const intimacyPotential = clamp01(
    privacy * 0.7 +
    baselineTrust * 0.5 -
    socialVisibility * 0.4 -
    baseCrowd * 0.3 -
    dangerLevel * 0.2
  );

  const secrecyPotential = clamp01(
    privacy * 0.6 +
    (1 - socialVisibility) * 0.5 -
    baseCrowd * 0.3 -
    controlLevel * 0.3
  );
  
  // Escape difficulty from physics/state
  const escapeDifficulty = clamp01(
      (loc.physics.mobilityCost > 1.5 ? 0.3 : 0) + 
      (loc.state.structuralIntegrity < 0.5 ? 0.2 : 0) +
      (loc.physics.climbable ? -0.1 : 0.1)
  );

  const conflictRisk = clamp01(
    dangerLevel * 0.4 +
    normativePressure * 0.3 +
    baseCrowd * 0.2 +
    (1 - intimacyPotential) * 0.2
  );

  return {
    location: originalEntity,
    actors: actorIds,
    audience: audienceIds,
    socialVisibility,
    normativePressure,
    conflictRisk,
    intimacyPotential,
    secrecyPotential,
    escapeDifficulty,
  };
}

/**
 * Базовый билдер контекста по сущности локации.
 * Внутри гидрирует до богатого Location и использует общую реализацию.
 */
export function buildLocationContextFromEntity(
  world: WorldState,
  location: LocationEntity,
  actorIds: string[],
  audienceIds: string[]
): LocationContext {
  const loc = hydrateLocation(location);

  if (process.env.NODE_ENV !== "production") {
    const res = validateLocation(loc);
    if (!res.ok) {
      console.warn(
        "[location-context] Location failed validation:",
        loc.id,
        res.issues
      );
    }
  }

  return buildLocationContextFromLocation(world, loc, location, actorIds, audienceIds);
}

/**
 * Обёртка: найти локацию в мире и построить контекст, если возможно.
 * Это тот API, который нужно использовать снаружи.
 */
export function buildLocationContextIfPossible(
  world: WorldState,
  locationId: LocationId | undefined,
  actors: string[],
  audience: string[] = []
): LocationContext | null {
  if (!locationId) return null;
  // Use generic lookup
  const entity = (world as any).locations?.find(
    (loc: any) => loc.entityId === locationId
  );
  if (!entity) return null;

  return buildLocationContextFromEntity(world, entity, actors, audience);
}

// Deprecated export alias if needed
export const buildLocationContext = buildLocationContextFromEntity;
