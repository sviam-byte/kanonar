
import { WorldState, AgentContextFrame, NearbyAgentSummary, TomRelationView, ActiveOrder, ContextEventSummary, AgentState } from '../../../types';
import { getTomView } from '../../tom/api';
import { getLocationForAgent, indexLocationMapCells, getCellAt } from '../v3/mapIndex';
import { TomPhysicalSelf, TomPhysicalOther } from '../frame/types';
import { buildDyadReport, TomBuildInput } from '../../tom/v3/buildDyadReport';
import { toLegacyTomRelationView } from '../../tom/v3/adapterLegacy';
import { TomDyadReport } from '../../tom/v3/types';

import { computeThreatStack, ThreatInputs } from '../../threat/threatStack';
import { computeProximity, AgentLite } from '../../spatial/proximity';
import { computeProprioFromBody, updateAffect as updateAffectNew, Appraisal } from '../../affect/affectEngine';
import { listify } from '../../utils/listify';

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

function syncWorldTomFromDyadReport(world: WorldState, selfId: string, otherId: string, report: TomDyadReport) {
  const tom: any = (world as any).tom;
  if (!tom) return;

  if (!tom[selfId]) tom[selfId] = {};
  if (!tom[selfId][otherId]) {
    tom[selfId][otherId] = {
      goals: { goalIds: [], weights: [] },
      traits: {
        trust: 0.5,
        align: 0.5,
        bond: 0.1,
        competence: 0,
        dominance: 0.5,
        reliability: 0.5,
        obedience: 0.5,
        vulnerability: 0.5,
        conflict: 0.2,
        uncertainty: 1.0,
        respect: 0.5,
      },
      uncertainty: 1.0,
      lastUpdatedTick: world.tick,
      lastInteractionTick: world.tick,
    };
  }

  const entry = tom[selfId][otherId];
  if (!entry.traits) entry.traits = {};
  const t = entry.traits;

  t.trust = clamp01(report.state.trust);
  t.align = clamp01(report.state.alignment);
  t.bond = clamp01(report.state.attachment);
  t.dominance = clamp01(report.state.dominance);
  t.respect = clamp01(report.state.respect);

  // legacy: conflict == threat
  t.conflict = clamp01(report.state.threat);
  (t as any).threat = clamp01(report.state.threat);

  const da = report.dyadicAffect;
  entry.affect = {
    valence: 0,
    arousal: clamp01(0.6 * (report.domains?.danger ?? 0) + 0.4 * (report.norms?.publicExposure ?? 0)),
    fear: clamp01(da?.feltFear ?? report.state.threat),
    anger: clamp01(da?.feltAnger ?? 0),
    shame: clamp01(da?.feltShame ?? 0),
    trust: clamp01(report.state.trust),
  };

  entry.uncertainty = clamp01(1 - (report.confidence?.overall ?? 0.3));
  entry.lastUpdatedTick = world.tick;
  entry.lastInteractionTick = world.tick;
}

function computeNearestHazardDist(
  pos: { x?: number; y?: number } | undefined,
  cells: Map<string, any>
): number | null {
  if (!pos || pos.x == null || pos.y == null || !cells.size) return null;
  let min = Infinity;
  cells.forEach(cell => {
    if ((cell.danger ?? 0) <= 0.1) return;
    const d = Math.hypot(cell.x - pos.x!, cell.y - pos.y!);
    if (d < min) min = d;
  });
  return isFinite(min) ? Math.min(1, min / 15) : null;
}

function computeExits(
  pos: { x?: number; y?: number } | undefined,
  cells: Map<string, any>
): { x: number; y: number }[] {
  if (!pos || pos.x == null || pos.y == null) return [];
  const { x, y } = pos;

  // If the map has explicit exit markers, prefer them.
  // This is how custom maps can "force" exits for goal/context affordances.
  const explicit: { x: number; y: number }[] = [];
  for (const cell of cells.values()) {
    const tags = Array.isArray((cell as any)?.tags) ? (cell as any).tags : [];
    if (tags.includes('exit')) explicit.push({ x: cell.x, y: cell.y });
  }
  if (explicit.length) return explicit;

  const exits: { x: number; y: number }[] = [];
  const deltas = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
  for (const { dx, dy } of deltas) {
    const cell = getCellAt(cells, x + dx, y + dy);
    if (cell && cell.walkable) exits.push({ x: cell.x, y: cell.y });
  }
  return exits;
}

function inferTimeOfDay(storyTime?: number): 'night' | 'morning' | 'day' | 'evening' {
  if (storyTime == null) return 'day';
  const t = storyTime % 24;
  if (t < 6) return 'night';
  if (t < 11) return 'morning';
  if (t < 18) return 'day';
  return 'evening';
}

function buildTomPhysicalSelf(agent: AgentState): TomPhysicalSelf {
  const hpNorm = clamp01(agent.hp / 100);
  const staminaNorm = agent.body?.reserves?.energy_store_kJ ? (agent.body.reserves.energy_store_kJ / 2000) : 1; 
  const pain = clamp01((agent.body?.acute?.pain_now ?? 0) / 100);
  const mobility = agent.body?.acute?.fatigue && agent.body.acute.fatigue > 80 ? 0.5 : 1.0;

  const isSevere = hpNorm < 0.4 || pain > 0.7;
  const isCombatCapable = hpNorm > 0.3;

  const confidence = 0.9; // Self-knowledge is high

  return {
    hpEstimate: hpNorm,
    staminaEstimate: staminaNorm,
    painEstimate: pain,
    mobilityEstimate: mobility,
    isSeverelyWounded: isSevere,
    isCombatCapable,
    confidence,
  };
}

function buildTomPhysicalOthers(nearby: NearbyAgentSummary[], world: WorldState): TomPhysicalOther[] {
  const result: TomPhysicalOther[] = [];
  const agents = listify<any>((world as any).agents);
  for (const nb of nearby) {
      const other = agents.find(a => a.entityId === nb.id);
      const trueHp = other?.hp ?? 100;
      const hpNorm = clamp01(trueHp / 100);
      const pain = clamp01((other?.body?.acute?.pain_now ?? 0) / 100);
      const mobility = nb.isWounded ? 0.5 : 0.9;
      
      const isSevere = hpNorm < 0.4 || pain > 0.7;
      const isCombatCapable = hpNorm > 0.3 && mobility > 0.4;
      
      const dist = nb.distance || 1;
      const visibility = 1 - clamp01(dist / 20);
      const confidence = clamp01(0.3 + 0.7 * visibility);

      result.push({
          targetId: nb.id,
          name: nb.name,
          hpEstimate: hpNorm,
          painEstimate: pain,
          mobilityEstimate: mobility,
          isSeverelyWounded: isSevere,
          isCombatCapable,
          confidence
      });
  }
  return result;
}

export function buildFullAgentContextFrame(
    world: WorldState, 
    agentId: string,
    prev?: AgentContextFrame | null,
    opts?: {
      /**
       * When false, do not mutate agent.affect (GoalLab/Sandbox needs pure evaluation).
       */
      persistAffect?: boolean;
    }
): AgentContextFrame | null {
    const agents = listify<any>((world as any).agents);
    const orders = listify<any>((world as any).orders);
    const agent = agents.find(a => a.entityId === agentId);
    if (!agent) return null;

    const loc = getLocationForAgent(world, agent);
    const locCells = loc ? indexLocationMapCells(loc) : new Map();
    const pos = (agent as any).position || { x: 0, y: 0 };
    const myCell = getCellAt(locCells, pos.x, pos.y);

    const timeOfDay = (world as any).timeOfDay || inferTimeOfDay((world as any).storyTime);
    
    const locationId = (loc as any)?.entityId || loc?.id || null;

    // --- Build Active Orders including Oaths and Group Goals ---
    const activeOrders: ActiveOrder[] = orders
        .filter(o => o.toId === agentId && o.status === 'pending')
        .map(o => ({
            id: o.id,
            kind: o.kind,
            issuerId: o.fromId,
            targetAgentId: o.toId,
            priority: o.priority,
            summary: o.summary
        }));

    if (world.groupGoalId) {
        activeOrders.push({
            id: `scenario:${world.groupGoalId}`,
            kind: 'mission',
            priority: 0.7,
            summary: `Mission: ${world.groupGoalId}`
        });
    }

    if (agent.identity?.oaths) {
        agent.identity.oaths.forEach((o: any) => {
             activeOrders.push({
                id: `oath:${o.key}`,
                kind: 'oath',
                targetAgentId: o.targetId,
                priority: (o.level === 'unbreakable' ? 1.0 : 0.8),
                summary: o.description || `Oath: ${o.key}`
            });
        });
    }

    const frame: AgentContextFrame = {
        tick: world.tick,
        meta: { scenarioId: world.scenario?.id || 'default', sceneId: world.scene?.currentPhaseId },
        who: {
            agentId: agent.entityId,
            entityId: agent.entityId,
            name: agent.title,
            archetypes: [agent.identity.arch_true_dominant_id || 'unknown'],
            roles: agent.roles?.global || [],
            factions: agent.factionId ? [agent.factionId] : []
        },
        where: {
            locationId: locationId,
            locationName: loc?.title || loc?.name || null,
            locationTags: loc?.tags || [],
            regionId: world.scenario?.id || 'world',
            map: {
                hasMap: !!loc?.map,
                cell: pos,
                hazard: myCell?.danger || 0,
                cover: myCell?.cover || 0,
                cellTags: Array.isArray((myCell as any)?.tags) ? (myCell as any).tags : [],
                isSafeCell: Array.isArray((myCell as any)?.tags) ? (myCell as any).tags.includes('safe') : false,
                nearestHazardDist: computeNearestHazardDist(pos, locCells),
                exits: computeExits(pos, locCells)
            }
        },
        when: {
            timeOfDay: timeOfDay,
            phase: world.scene?.currentPhaseId || 'routine'
        },
        what: {
            nearbyAgents: [], // populated below
            recentEvents: [],
            localWoundedCount: 0,
            sceneWoundedCount: 0,
            localThreatRaw: 0,
            sceneThreatRaw: (world.scene?.metrics?.threat || 0) / 100
        },
        how: {
            physical: {
                hp: agent.hp,
                stamina: agent.body?.reserves?.energy_store_kJ ? (agent.body.reserves.energy_store_kJ / 2000 * 100) : 100,
                isWounded: agent.hp < 70,
                canMove: agent.body?.acute?.fatigue ? agent.body.acute.fatigue < 90 : true,
                isArmed: true
            },
            affect: {
                arousal: agent.affect?.arousal || 0,
                valence: agent.affect?.valence || 0,
                fear: agent.affect?.fear || 0,
                anger: agent.affect?.anger || 0,
                shame: agent.affect?.shame || 0,
                pride: 0
            },
            resources: {
                ammo: agent.resources?.inventory?.ammo ?? 0,
                medkits: agent.resources?.inventory?.medkits ?? 0,
            }
        },
        why: {
            activeOrders: activeOrders,
            longTermGoals: listify<any>(agent.goalEcology?.execute).map(g => g?.id),
            narrativeFlags: []
        },
        social: {
            allyCountNearby: 0,
            enemyCountNearby: 0,
            maxAllyCloseness: null,
            maxEnemyCloseness: null,
            isAlone: true
        }
    };

    const locTags = frame.where.locationTags;
    const isPublic = locTags.includes('public') || locTags.includes('open');
    const isPrivate = locTags.includes('private') || locTags.includes('safe_hub') || locTags.includes('module_only');
    const isSafeSpace = isPrivate;
    const controlLevel = loc?.state?.alert_level ?? 0.2; 
    
    const nearby: NearbyAgentSummary[] = [];
    const relations: TomRelationView[] = [];
    const reports: Record<string, TomDyadReport> = {};
    let maxLocalThreat = 0;
    
    const selfLocationId = (agent as any).locationId ?? null;
    const MAX_NEARBY_DIST = 20;

    const roleRels: { other_id: string; role: string }[] = agent.roles?.relations ?? [];

    for (const other of agents) {
        if (other.entityId === agentId) continue;

        const otherLocationId = (other as any).locationId ?? null;
        const isSameLocation = selfLocationId != null && otherLocationId === selfLocationId;
        if (selfLocationId != null && !isSameLocation) continue;
        
        const otherPos = (other as any).position || { x: 0, y: 0 };
        const dx = otherPos.x - pos.x;
        const dy = otherPos.y - pos.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const distanceNorm = clamp01(dist / MAX_NEARBY_DIST);
        const isWounded = other.hp < 70;
        
        nearby.push({
            id: other.entityId,
            name: other.title,
            distance: dist,
            role: other.effectiveRole || 'none',
            isWounded,
            distanceNorm,
            isSameLocation
        });

        // --- ToM V3 Integration ---
        // 1. Get legacy view/prior
        const legacyView = getTomView(world, agentId, other.entityId);
        const roleRel = roleRels.find(r => r.other_id === other.entityId);

        // IMPORTANT:
        // legacyView.emotions.fear is SELF affect, not dyadic threat prior.
        // Using it here inflates dyad threat even for allies and cascades into threatIndex.
        const relThreatPrior =
          (typeof (legacyView as any)?.threat === 'number')
            ? (legacyView as any).threat
            : (roleRel?.role === 'enemy')
              ? 0.55
              : (roleRel?.role === 'ward_of')
                ? 0.08
                : (roleRel?.role === 'friend')
                  ? 0.10
                  : 0.18;

        const prior = {
            trust: legacyView?.trust ?? (roleRel?.role === 'enemy' ? 0.2 : 0.5),
            threat: relThreatPrior,
            support: legacyView?.trust ?? (roleRel?.role === 'enemy' ? 0.1 : 0.5),
            attachment: legacyView?.bond ?? (
                roleRel?.role === 'ward_of' ? 0.75 :
                roleRel?.role === 'friend' ? 0.55 :
                0.10
            ),
            respect: legacyView?.respect ?? (roleRel?.role === 'ward_of' ? 0.8 : 0.5),
            dominance: legacyView?.dominance ?? (roleRel?.role === 'ward_of' ? 0.6 : 0.3),
            predictability: 0.5,
            alignment: (legacyView?.alignment !== undefined) ? (legacyView.alignment + 1)/2 : (roleRel?.role === 'enemy' ? 0.2 : 0.6),
        };
        
        // Minimal, relationship-aware evidence so ToM is not "empty".
        const evidence: Array<{ key: string; val: number }> = [];
        if (roleRel?.role === 'ward_of' || roleRel?.role === 'friend') {
          evidence.push({ key: 'oath_kept', val: 0.9 });
          evidence.push({ key: 'care', val: isWounded ? 0.7 : 0.3 });
          evidence.push({ key: 'aggression', val: 0.05 });
        } else if (roleRel?.role === 'enemy') {
          evidence.push({ key: 'oath_kept', val: 0.05 });
          evidence.push({ key: 'care', val: 0.05 });
          evidence.push({ key: 'aggression', val: 0.85 });
        } else {
          // Unknown/neutral: weak priors
          evidence.push({ key: 'oath_kept', val: 0.25 });
          evidence.push({ key: 'care', val: isWounded ? 0.35 : 0.15 });
          evidence.push({ key: 'aggression', val: 0.15 });
        }
        
        // 2. Build Input
        const tomInput: TomBuildInput = {
            selfId: agentId,
            otherId: other.entityId,
            timestamp: world.tick,
            domains: {
                // Use local + scene threat, but soften it for trusted roles.
                danger: clamp01(frame.what.sceneThreatRaw * (roleRel?.role === 'friend' || roleRel?.role === 'ward_of' ? 0.55 : 1.0)),
                hierarchy: activeOrders.length > 0 ? 0.7 : 0.3,
                intimacy: isPrivate ? (roleRel?.role === 'friend' || roleRel?.role === 'ward_of' ? 0.85 : 0.6) : 0.1
            },
            norms: {
                publicExposure: isPublic ? 0.8 : 0.2,
                normPressure: controlLevel,
                surveillance: controlLevel,
                privacy: isPrivate ? 0.9 : 0.1
            },
            selfAffect: frame.how.affect,
            evidence,
            prior
        };
        
        // 3. Generate Report
        const report = buildDyadReport(tomInput);
        reports[other.entityId] = report;
        
        // Sync back to world legacy storage
        syncWorldTomFromDyadReport(world, agentId, other.entityId, report);
        
        // 4. Adapt back to legacy view for compatibility
        const relView = toLegacyTomRelationView(report);
        
         if (roleRel) {
              relView.roleTag = roleRel.role;
              if (roleRel.role === 'ward_of') {
                 relView.label = 'My Lord / Master';
                 relView.attachment = Math.max(relView.attachment!, 1.0);
                 relView.closeness = 1.0;
              } else if (roleRel.role === 'friend') {
                 relView.label = 'My Friend';
                 relView.attachment = Math.max(relView.attachment!, 0.8);
                 relView.closeness = 0.8;
              } else if (roleRel.role === 'enemy') {
                 relView.label = 'Enemy';
                 relView.closeness = 0.6;
              } else if (roleRel.role === 'mentor_of') {
                  relView.label = 'Protege';
                  relView.attachment = Math.max(relView.attachment!, 0.7);
              }
         }
         
         const safeRelView = {
             ...relView,
             affection: relView.affection ?? 0 
         };

         relations.push(safeRelView);
         maxLocalThreat = Math.max(maxLocalThreat, relView.threat ?? 0);
    }

    frame.what.nearbyAgents = nearby;
    frame.what.localThreatRaw = maxLocalThreat;
    
    const nearbyAllies = relations.filter(r => r.trust > 0.6);
    const nearbyEnemies = relations.filter(r => r.threat > 0.4);
    
    frame.social.allyCountNearby = nearbyAllies.length;
    frame.social.enemyCountNearby = nearbyEnemies.length;
    frame.social.isAlone = nearby.length === 0;

    if (nearbyAllies.length > 0) {
        const allyIds = new Set(nearbyAllies.map(r => r.targetId));
        const allySummaries = nearby.filter(n => allyIds.has(n.id));
        if (allySummaries.length > 0) {
             frame.social.maxAllyCloseness = Math.max(...allySummaries.map(a => 1 - (a.distanceNorm ?? 1)));
        }
    }
    
    if (nearbyEnemies.length > 0) {
        const enemyIds = new Set(nearbyEnemies.map(r => r.targetId));
        const enemySummaries = nearby.filter(n => enemyIds.has(n.id));
        if (enemySummaries.length > 0) {
             frame.social.maxEnemyCloseness = Math.max(...enemySummaries.map(a => 1 - (a.distanceNorm ?? 1)));
        }
    }
    
    const physicalSelf = buildTomPhysicalSelf(agent);
    const physicalOthers = buildTomPhysicalOthers(nearby, world);
    
    frame.tom = { 
        relations,
        physicalSelf,
        physicalOthers,
        reports 
    };
    
    if (isSafeSpace && frame.where.map.hazard < 0.2) {
        frame.what.localWoundedCount = 0;
    } else {
        frame.what.localWoundedCount = nearby.filter(n => n.isWounded).length;
    }
    
    const sceneMetrics = world.scene?.metrics;
    let sceneWounded = sceneMetrics 
        ? (sceneMetrics.wounded_total || 0) - (sceneMetrics.wounded_evacuated || 0) - (sceneMetrics.wounded_dead || 0)
        : frame.what.localWoundedCount;

    if (isSafeSpace && frame.what.localWoundedCount === 0) {
        sceneWounded = 0;
    }
    frame.what.sceneWoundedCount = sceneWounded;
    
    if (isSafeSpace) {
      frame.what.sceneThreatRaw = frame.what.sceneThreatRaw * 0.2;
    }

    const recentEvents = listify<any>(agent.narrativeState?.episodes)
        .slice(-5)
        .map(ep => ({
            id: ep?.id,
            kind: listify(ep?.tags)[0] || 'generic',
            tick: ep?.ticks?.start,
            tags: listify(ep?.tags),
            actors: listify(ep?.mainActors),
            intensity: ep?.intensity
        }));
    frame.what.recentEvents = recentEvents;

    // --- NEW: Unified Threat & Affect ---

    // 1. Proximity
    const agentLites: AgentLite[] = agents.map(a => ({
        id: a.entityId,
        pos: (a as any).position || {x:0, y:0},
        // We can pull trust/hostile from ToM if available, simplified here
        trustToMe: (world.tom?.[agentId]?.[a.entityId]?.traits?.trust),
        hostileToMe: (world.tom?.[agentId]?.[a.entityId]?.traits?.threat)
    }));

    const prox = computeProximity(agentId, agentLites, 4, 6);

    // 2. Threat Stack
    const threatInputs: ThreatInputs = {
        envDanger: clamp01(frame.where.map.hazard ?? 0),
        visibilityBad: clamp01(1 - (loc?.properties?.visibility ?? 0.8)), // simple inverse
        coverLack: clamp01(1 - (myCell?.cover ?? 0)),
        crowding: prox.crowding,

        nearbyCount: prox.nearbyCountNorm,
        nearbyTrustMean: prox.nearbyTrustMean,
        nearbyHostileMean: prox.nearbyHostileMean,
        hierarchyPressure: activeOrders.length > 0 ? 0.6 : 0.1, // simplified
        surveillance: (loc?.properties?.control_level ?? 0),

        timePressure: clamp01((world.scene?.metrics?.timer !== undefined ? (100 - world.scene.metrics.timer)/100 : 0)),
        woundedPressure: clamp01((world.scene?.metrics?.wounded_unsorted ?? 0) / 5),
        goalBlock: 0, // dynamic goal blocking not fully calculated here yet

        paranoia: (agent as any).traits?.paranoia ?? 0.5,
        trauma: (agent.body?.acute?.moral_injury ?? 0)/100,
        exhaustion: (agent.body?.acute?.fatigue ?? 0)/100,
        dissociation: (agent.affect?.dissociation ?? 0),
        experience: (agent.competencies?.resilience ?? 50)/100
    };

    const threatCalc = computeThreatStack(threatInputs);

    // 3. Affect
    const proprio = computeProprioFromBody(agent);
    const appraisal: Appraisal = {
        threat: threatCalc.total,
        uncertainty: 1 - (agent.tom?.uncertainty ?? 0.5), // proxy
        goalBlock: threatInputs.goalBlock,
        socialSupport: prox.nearbyTrustMean, // proxy
        controllability: agent.state?.will ? agent.state.will / 100 : 0.5,
        intimacy: isPrivate ? 0.9 : 0.1
    };

    // Use previous affect from agent state (ensure it matches type)
    const prevAffect = agent.affect ? { ...agent.affect, why: [] } : null; // Adapter if needed
    const newAffect = updateAffectNew(prevAffect as any, appraisal, proprio, world.tick);

    // Apply to frame
    frame.how.affect = {
        arousal: newAffect.arousal,
        valence: newAffect.valence,
        fear: newAffect.fear,
        anger: newAffect.anger,
        shame: newAffect.shame,
        pride: 0 // Not in new affect model yet
    };

    // ... Apply to agent if persist
    if (opts?.persistAffect !== false) {
        agent.affect = newAffect as any; // Cast to match types.ts
    }

    // ... Store derived
    (frame.derived as any) = {
        threatIndex: threatCalc.total,
        safetyIndex: clamp01(1 - threatCalc.total),
        supportIndex: clamp01(frame.social.allyCountNearby / 3),
        lonelinessIndex: frame.social.isAlone ? 1 : 0,
        threatWhy: threatCalc
    };
    
    // Also satisfy strict type check
    frame.derived = {
        threatIndex: clamp01(threatCalc.total),
        safetyIndex: clamp01(1 - threatCalc.total),
        supportIndex: clamp01(frame.social.allyCountNearby / 3),
        lonelinessIndex: frame.social.isAlone ? 1 : 0
    };
    
    const tick = world.tick;
    // Map to EmotionAppraisal and EmotionAtom for frame consistency
    const emotionAppraisal = {
        threat: appraisal.threat,
        loss: 0,
        goalBlock: appraisal.goalBlock,
        goalProgress: 0,
        socialSupport: appraisal.socialSupport,
        statusDelta: 0,
        normViolation: 0,
        intimacy: appraisal.intimacy,
        uncertainty: appraisal.uncertainty,
        responsibility: 0,
        controllability: appraisal.controllability,
        publicExposure: 0,
        reparability: 0
    };
    
    const emotionAtoms = [
       { kind: 'emotion', emotion: 'fear', intensity: newAffect.fear, why: newAffect.why },
       { kind: 'emotion', emotion: 'anger', intensity: newAffect.anger, why: newAffect.why },
       { kind: 'emotion', emotion: 'shame', intensity: newAffect.shame, why: newAffect.why }
    ].filter(a => a.intensity > 0.1);

    (frame.derived as any).emotionAppraisal = emotionAppraisal;
    (frame.derived as any).emotionAtoms = emotionAtoms;


    if (prev) {
        const prevThreat = prev.derived?.threatIndex ?? 0;
        const nowThreat = frame.derived?.threatIndex ?? 0;
    
        const prevWounded = prev.what?.localWoundedCount ?? 0;
        const nowWounded = frame.what?.localWoundedCount ?? 0;
    
        (frame.derived as any).history = {
          threatDelta: nowThreat - prevThreat,
          woundedDelta: nowWounded - prevWounded,
        };
    }

    return frame;
}
