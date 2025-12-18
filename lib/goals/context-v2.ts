
// lib/goals/context-v2.ts

import { LocalActorRef, ContextV2, GoalAxisId, AgentState, Action, SocialActionId, Sys1Analysis, WorldState, SceneMetrics } from '../../types';
import { LifeGoalVector, LifeGoalId } from '../life-goals/types-life';
import { getLocationForAgent, getAgentMapCell, getLocalMapMetrics } from "../world/locations";
import { hydrateLocation } from '../adapters/rich-location'; 
import { AgentContextFrame } from '../context/frame/types';

// --- 1.1. Compute Domain Vector from Nearby Actors ---
function initZeroDomains(): Record<GoalAxisId, number> {
    return {
        fix_world: 0, preserve_order: 0, free_flow: 0, control: 0, care: 0,
        power_status: 0, truth: 0, chaos_change: 0, efficiency: 0, escape_transcend: 0
    };
}

export function computeDomainFromNearbyActors(
  ctx: ContextV2,
): Record<GoalAxisId, number> {
  const d = initZeroDomains();

  let allies = 0;
  let enemies = 0;
  let woundedAllies = 0;
  let vipAllies = 0;
  let attackingEnemies = 0;

  for (const a of ctx.nearbyActors) {
    const distFactor = Math.max(0, 1 - a.distance / 100); 

    if (a.kind === 'ally') {
      allies += distFactor;
      if (a.role === 'wounded') woundedAllies += distFactor;
      if (a.role === 'leader' || a.role === 'vip') vipAllies += distFactor;
    }
    if (a.kind === 'enemy') {
      enemies += distFactor * (a.threatLevel ?? 0.7);
      if (a.isTargetOfEnemy) attackingEnemies += distFactor;
    }
  }

  const allyDensity = Math.min(allies / 5, 1);
  const enemyDensity = Math.min(enemies / 5, 1);
  const woundedDensity = Math.min(woundedAllies / 3, 1);
  const vipDensity = Math.min(vipAllies / 2, 1);
  const attackIntensity = Math.min(attackingEnemies / 3, 1);

  d.escape_transcend += enemyDensity * 0.8;
  d.control       += enemyDensity * 0.5;
  d.chaos_change  += enemyDensity * 0.4;
  d.care += woundedDensity * 0.8 + vipDensity * 0.9;
  d.care += attackIntensity * 0.7;

  return d;
}

// --- 3. Layered Desire Calculation ---

export function computeDesireRaw(
    baseScore: number,
    stress: number,     // 0..1
    distortions: any,   
    domain: GoalAxisId
): number {
    let score = baseScore;
    
    if (domain === 'escape_transcend') score += stress * 0.8;
    if (domain === 'control') score += stress * 0.5;
    if (domain === 'care') score -= stress * 0.3;
    
    if (distortions?.threatBias > 0.5 && domain === 'control') score += 0.4;
    if (distortions?.trustBias > 0.5 && domain === 'care') score -= 0.4;

    return score;
}

export function computeDesireTrue(
    lifeGoals: Record<LifeGoalId, number>,
    domain: GoalAxisId
): number {
    return 0.5; 
}

export function computeDesireReflective(
    baseScore: number,
    ctx: ContextV2,
    agent: AgentState,
    domain: GoalAxisId
): number {
    let score = baseScore;
    
    if (ctx.kingPresent && domain === 'care') score += 0.8;
    if (ctx.leaderPresent && domain === 'preserve_order') score += 0.6;

    if (ctx.authorityConflict > 0.5 && domain === 'preserve_order') score -= 0.3;
    
    return score;
}

export function buildContextV2FromFrame(
    frame: AgentContextFrame,
    world?: WorldState
): ContextV2 {
    const nearby: LocalActorRef[] = frame.what.nearbyAgents.map(a => {
        let kind: 'ally' | 'enemy' | 'neutral' = 'neutral';
        // Simple heuristic mapping
        // In a real system, frame.tom.relations would determine 'kind'
        const rel = frame.tom?.relations.find(r => r.targetId === a.id);
        if (rel) {
            if (rel.trust > 0.6) kind = 'ally';
            if (rel.threat > 0.4) kind = 'enemy';
        }
        
        return {
            id: a.id,
            label: a.name,
            kind,
            role: a.role,
            distance: a.distance,
            threatLevel: rel?.threat ?? 0,
            isTargetOfEnemy: false,
            needsProtection: a.isWounded || false
        };
    });
    
    const alliesCount = frame.social.allyCountNearby;
    const enemiesCount = frame.social.enemyCountNearby;
    const kingPresent = nearby.some(a => a.role === 'leader' || a.role === 'king');
    
    const ctx: ContextV2 = {
        locationType: frame.where.locationTags.includes('hall') ? 'hall' : 'corridor',
        visibility: frame.where.map.cover > 0.5 ? 0.4 : 0.9, // Inverse of cover roughly
        noise: (frame.what.sceneThreatRaw ?? 0) * 0.5,
        panic: (frame.what.sceneThreatRaw ?? 0) > 0.7 ? 0.8 : 0.1,
        nearbyActors: nearby,
        alliesCount,
        enemiesCount,
        leaderPresent: kingPresent,
        kingPresent,
        authorityConflict: (frame.derived?.threatIndex ?? 0) * 0.5, // Rough mapping
        timePressure: 0, // Not explicitly in frame usually, default 0
        scenarioKind: 'routine', // Could be inferred from meta.scenarioId
        cover: frame.where.map.cover,
        exitsNearby: frame.where.map.exits.length,
        obstacles: frame.where.map.hazard,
        groupDensity: nearby.length / 10,
        hierarchyPressure: kingPresent ? 0.8 : 0.2,
        structuralDamage: 0
    };
    
    (ctx as any).domains = computeDomainFromNearbyActors(ctx);
    
    return ctx;
}

// --- Context from real WorldState + Agent (Legacy / Fallback) ---

export function buildContextV2FromWorld(
    world: WorldState,
    agent: AgentState
): ContextV2 {
    const locationId = agent.locationId;
    const agentFaction = agent.factionId;

    const nearby: LocalActorRef[] = [];

    for (const other of world.agents) {
        if (other.entityId === agent.entityId) continue;

        const sameLocation = locationId && other.locationId === locationId;
        const hasLocation = !!other.locationId;

        const distance = sameLocation ? 5 : (hasLocation ? 30 : 50);

        let kind: 'ally' | 'enemy' | 'neutral' = 'neutral';
        if (agentFaction && other.factionId) {
            kind = agentFaction === other.factionId ? 'ally' : 'enemy';
        }

        let role: string | undefined = other.effectiveRole;
        if (!role && other.roles?.global?.length) {
            role = other.roles.global[0];
        } else if (other.entityId.includes('tegan')) {
            role = 'leader';
        }

        const needsProtection =
            kind === 'ally' &&
            !!((other as any).body?.acute?.wounds || (other.body?.acute?.stress ?? 0) > 60);

        const threatLevel =
            kind === 'enemy'
                ? 0.7 + ((other as any).body?.acute?.aggression ?? 0) / 200
                : 0.1;

        nearby.push({
            id: other.entityId,
            label: other.title || other.entityId,
            kind,
            role,
            distance,
            needsProtection,
            threatLevel,
            isTargetOfEnemy: false,
        });
    }

    const alliesCount = nearby.filter(a => a.kind === 'ally').length;
    const enemiesCount = nearby.filter(a => a.kind === 'enemy').length;
    const kingPresent =
        nearby.some(a => a.id === 'character-tegan-nots' || a.role === 'king' || a.role === 'leader');

    const sceneMetrics = (world.scene as any)?.metrics || {};
    const ctxMetrics = world.scenarioContext?.sceneMetrics || {};

    const locEntity = getLocationForAgent(world, agent.entityId);
    
    // FIX: Fixed getAgentMapCell call to match the single-argument version from world/locations.ts
    const agentCell = locEntity ? getAgentMapCell(agent) : undefined;
    const localMapMetrics = locEntity && agentCell
      // FIX: Changed x and y to cx and cy based on getAgentMapCell return type.
      ? getLocalMapMetrics(locEntity, agentCell.cx, agentCell.cy, 1)
      : { avgDanger: 0, avgCover: 0, obstacles: 0 };

    const rawThreat =
      (sceneMetrics.threat ?? ctxMetrics["threat"] ?? 0) as number;
    const threatNorm = rawThreat > 1 ? Math.min(rawThreat / 100, 1) : rawThreat;

    const panic =
      (ctxMetrics["panic"] as number | undefined) ??
      (sceneMetrics.panic as number | undefined) ??
      (threatNorm > 0.8 ? 0.7 : threatNorm * 0.6);

    const authorityConflict =
      (ctxMetrics["authority_conflict"] as number | undefined) ??
      (sceneMetrics.conflict as number | undefined) ??
      0;

    const timePressure =
      (ctxMetrics["time_pressure"] as number | undefined) ??
      ((sceneMetrics.timer != null)
          ? Math.max(0, 1 - (sceneMetrics.timer as number) / 200)
          : 0);

    const hierarchyPressure =
      (ctxMetrics["hierarchy_pressure"] as number | undefined) ??
      (kingPresent ? 0.8 : 0.3);

    const structuralDamage =
      (ctxMetrics["structural_damage"] as number | undefined) ??
      (sceneMetrics.structuralDamage as number | undefined) ??
      localMapMetrics.obstacles;

    const noise =
      (ctxMetrics["noise"] as number | undefined) ??
      (enemiesCount > 0 ? 0.7 : 0.3);

    const groupDensity = Math.min((alliesCount + enemiesCount) / 5, 1);

    let scenarioKind: string = "routine";
    const ctx = (world.context || '').toLowerCase();
    if (ctx.includes('combat') || ctx.includes('evac')) scenarioKind = 'combat';
    if (ctx.includes('council')) scenarioKind = 'council';

    if (!world.context && world.scene?.scenarioDef?.id) {
        const sid = world.scene.scenarioDef.id.toLowerCase();
        if (sid.includes('evac') || sid.includes('combat')) scenarioKind = 'combat';
        if (sid.includes('council')) scenarioKind = 'council';
    }
    
    const locationType =
      scenarioKind === 'council' ? 'hall' : 'corridor';

    const ctxBuilt: ContextV2 = {
        locationType,
        visibility: 0.9,
        noise,
        panic,
        nearbyActors: nearby,
        alliesCount,
        enemiesCount,
        leaderPresent: kingPresent,
        kingPresent,
        authorityConflict,
        timePressure,
        scenarioKind,
        cover: (ctxMetrics['cover'] as number | undefined) ?? localMapMetrics.avgCover,
        exitsNearby: 1,
        obstacles: (ctxMetrics['obstacles'] as number | undefined) ?? localMapMetrics.obstacles,
        groupDensity,
        hierarchyPressure,
        structuralDamage,
    };
    
    (ctxBuilt as any).domains = computeDomainFromNearbyActors(ctxBuilt);

    return ctxBuilt;
}
