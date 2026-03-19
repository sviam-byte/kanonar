// lib/simkit/core/moveScoring.ts
// Goal-directed movement scoring: estimate goal improvement for each move destination.

import type { SimWorld, ActionOffer } from './types';
import { clamp01 } from '../../util/math';

type GoalDelta = Record<string, number>;

/**
 * Estimate how moving to target location changes goal-relevant signals for actor.
 * Returned deltas are attached to offer.meta.deltaGoals for downstream scoring.
 */
function estimateMoveDelta(
  world: SimWorld,
  actorId: string,
  currentLocId: string,
  targetLocId: string,
): GoalDelta {
  const facts: any = world.facts || {};
  const targetLoc = world.locations[targetLocId];
  const currentLoc = world.locations[currentLocId];
  if (!targetLoc || !currentLoc) return {};

  const delta: GoalDelta = {};

  // Safety: moving away from danger is positive.
  const currentDanger = clamp01(Number(facts[`ctx:danger:${actorId}`] ?? 0));
  const targetDanger = estimateLocationDanger(world, targetLocId);
  delta.safety = clamp01(currentDanger - targetDanger) * 0.4;
  if (targetDanger > currentDanger) delta.safety = -(targetDanger - currentDanger) * 0.3;

  // Exploration: reward less-visited destinations.
  const visited = Number(facts[`visited:${actorId}:${targetLocId}`] ?? 0);
  delta.exploration = visited < 1 ? 0.25 : 0.02;

  // Affiliation: reward moving toward trusted peers.
  const alliesInTarget = countAlliesInLocation(world, actorId, targetLocId);
  const alliesInCurrent = countAlliesInLocation(world, actorId, currentLocId);
  if (alliesInTarget > alliesInCurrent) delta.affiliation = 0.15 * Math.min(alliesInTarget, 3);
  if (alliesInTarget < alliesInCurrent) delta.affiliation = -0.1;

  // Rest: reward rest/medical-enabled locations.
  const hasRest = (targetLoc.features || []).some((f) =>
    f.kind === 'rest' || f.kind === 'medical' || (f.tags || []).includes('rest'));
  if (hasRest) delta.rest = 0.15;

  // Control/wealth: strategic exits and resource density.
  const hasExit = (targetLoc.tags || []).includes('exit') || (targetLoc.features || []).some((f) => f.kind === 'exit');
  if (hasExit) delta.control = 0.2;
  delta.wealth = estimateResourceValue(world, targetLocId) * 0.1;

  return delta;
}

function estimateLocationDanger(world: SimWorld, locId: string): number {
  const loc = world.locations[locId];
  if (!loc) return 0;

  let d = 0;
  const hazards = loc.hazards || {};
  for (const v of Object.values(hazards)) d = Math.max(d, clamp01(Number(v)));

  const facts: any = world.facts || {};
  for (const c of Object.values(world.characters)) {
    if ((c as any).locId !== locId) continue;
    const threat = clamp01(Number(facts[`rel:threat:self:${c.id}`] ?? 0));
    d = Math.max(d, threat * 0.5);
  }

  return clamp01(d);
}

function countAlliesInLocation(world: SimWorld, selfId: string, locId: string): number {
  const facts: any = world.facts || {};
  let count = 0;

  for (const c of Object.values(world.characters)) {
    if (c.id === selfId || (c as any).locId !== locId) continue;
    const trust = clamp01(Number(
      facts[`rel:trust:${selfId}:${c.id}`]
      ?? facts?.relations?.[selfId]?.[c.id]?.trust
      ?? 0.5,
    ));
    if (trust > 0.55) count += 1;
  }

  return count;
}

function estimateResourceValue(world: SimWorld, locId: string): number {
  const loc = world.locations[locId];
  if (!loc) return 0;

  let value = 0;
  for (const f of loc.features || []) {
    if (f.kind === 'resource' || f.kind === 'supply' || (f.tags || []).includes('resource')) {
      value += clamp01(Number(f.strength ?? 0.5));
    }
  }

  return clamp01(value);
}

/**
 * Estimate movement cost. Inter-location moves are costlier than local node moves.
 */
function estimateMoveCost(world: SimWorld, actorId: string, isInterLocation: boolean): number {
  const char = world.characters[actorId];
  if (!char) return 0.05;

  const baseCost = isInterLocation ? 0.04 : 0.01;
  const stressPenalty = clamp01(Number(char.stress ?? 0)) * 0.02;
  return baseCost + stressPenalty;
}

/**
 * Enriches move offers with delta goals + adjusted score.
 */
export function scoreMovementOffers(world: SimWorld, actorId: string, offers: ActionOffer[]): ActionOffer[] {
  const char = world.characters[actorId];
  if (!char) return offers;

  const currentLocId = (char as any).locId || '';

  return offers.map((offer) => {
    if (offer.kind !== 'move') return offer;

    const targetLocId = String(offer.targetId ?? '');
    const isInterLocation = !!targetLocId && targetLocId !== currentLocId;

    const delta: GoalDelta = isInterLocation
      ? estimateMoveDelta(world, actorId, currentLocId, targetLocId)
      : { exploration: 0.03 };

    const cost = estimateMoveCost(world, actorId, isInterLocation);
    const totalDelta = Object.values(delta).reduce((sum, value) => sum + value, 0);
    const score = Math.max(0.05, totalDelta - cost);

    return {
      ...offer,
      score,
      meta: {
        ...(offer.meta || {}),
        deltaGoals: delta,
        moveCost: cost,
        isInterLocation,
        scored: true,
      },
    };
  });
}
