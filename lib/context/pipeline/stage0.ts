
// lib/context/pipeline/stage0.ts
import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';
// Removed: import { atomizeObservations } from '../epistemic/atomizeObs';
import { extractObservationAtoms } from '../sources/observationAtoms';
import { mergeEpistemicAtoms, EpistemicLayer } from '../epistemic/mergeEpistemic';
import { WorldState, AgentState, LocationEntity } from '../../../types';
import { atomizeEventsForAgent } from '../../events/atomizeEvents';
import { extractCapabilitiesFromCharacter } from '../../capabilities/extractors';
import { atomizeCapabilities } from '../../capabilities/atomizeCapabilities';
import { getLocationForAgent, getAgentsInLocation } from '../../world/locations';
import { atomizeTraces } from '../atomize/atomizeTraces';
import { deriveAxes } from '../axes/deriveAxes';
import { buildLifeDomainWeights } from '../../life-domains';

// New RelationBase Logic
import { extractRelBaseFromCharacter, extractRelCtxFromCharacter } from '../../relations/extract';
import { atomizeRelBase, atomizeRelCtx } from '../../relations/atomize';
import { deriveRelCtxAtoms } from '../../relations/deriveCtx';
import { atomizeRelations } from '../../relations/atomizeRelations';

// New WorldFacts Logic
import { buildWorldFactsAtoms } from './worldFacts';
import { buildCharacterFeatures, buildLocationFeatures, buildSceneFeatures } from '../../features/registry';
import { atomizeFeatures } from '../../features/atomize';
import { extractLocationAtoms } from '../sources/locationAtoms';
import { extractTomDyadAtoms } from '../sources/tomDyadAtoms';
import { deriveRelStateAtoms } from '../../relations/deriveState';

export type Stage0Input = {
  world: WorldState;
  agent: AgentState;
  selfId: string;

  /**
   * Legacy convenience: stage0 historically produced ctx:* axes.
   * For a strict staged pipeline (S0 raw atoms -> S3 axes), disable this.
   */
  includeAxes?: boolean;

  // optional local map metrics (precomputed)
  mapMetrics?: any;

  // We don't need input.worldAtoms anymore if we build them here.
  // But for legacy compatibility or injections we keep 'extraWorldAtoms'
  extraWorldAtoms?: ContextAtom[];

  beliefAtoms?: ContextAtom[];   // agent beliefs (from memory/ToM)
  overrideAtoms?: ContextAtom[]; // GoalLab overrides (manual injection)

  // optional affect/arousal for perception quality
  arousal?: number;  // 0..1
  ctxCrowd?: number; // 0..1 if available
  ctxChaos?: number; // 0..1 if available
  
  // optional merged events log
  events?: any[]; // WorldEvent[]
  
  // Scene info if available
  sceneSnapshot?: any;
};

export type Stage0Output = {
  mergedAtoms: ContextAtom[];
  provenance: Map<string, EpistemicLayer>;
  obsAtoms: ContextAtom[];
};

function clamp01(x: number) {
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
}

// Atomize stable profile signals (life goals / domain weights)
function buildLifeGoalAtoms(self: AgentState): ContextAtom[] {
  const selfId = self?.entityId;
  if (!selfId) return [];

  // LifeGoalEntry[] -> LifeGoalVector
  const vec: Record<string, number> = {};
  for (const e of (self.lifeGoals || [])) {
    const gid = String((e as any).id ?? '');
    if (!gid) continue;
    const w = Number((e as any).weight ?? 0);
    if (!Number.isFinite(w)) continue;
    vec[gid] = Math.max(0, Math.min(1, w));
  }

  const lifeGoalAtoms: ContextAtom[] = Object.entries(vec).map(([gid, w]) => normalizeAtom({
    id: `goal:life:${gid}:${selfId}`,
    ns: 'goal' as any,
    kind: 'life_goal' as any,
    origin: 'profile' as any,
    source: 'lifeGoals',
    target: selfId,
    magnitude: clamp01(w),
    confidence: 1,
    tags: ['goal', 'life', gid],
    label: `lifeGoal:${gid}=${clamp01(w).toFixed(3)}`,
    trace: { usedAtomIds: [], notes: ['from agent.lifeGoals'], parts: { gid, w: clamp01(w) } }
  } as any));

  // Domain weights from the life-goal vector (life-domains mapping)
  const domainWeights = buildLifeDomainWeights(vec as any);
  const domainAtoms: ContextAtom[] = Object.entries(domainWeights).map(([domain, w]) => normalizeAtom({
    id: `goal:lifeDomain:${domain}:${selfId}`,
    ns: 'goal' as any,
    kind: 'life_domain' as any,
    origin: 'profile' as any,
    source: 'lifeDomains',
    target: selfId,
    magnitude: clamp01(Number(w ?? 0)),
    confidence: 0.9,
    tags: ['goal', 'lifeDomain', domain],
    label: `lifeDomain:${domain}=${clamp01(Number(w ?? 0)).toFixed(3)}`,
    trace: { usedAtomIds: lifeGoalAtoms.map(a => String(a.id)), notes: ['mapped via LIFE_GOAL_DEFS'], parts: { domain, w: clamp01(Number(w ?? 0)) } }
  } as any));

  // Bridge to GoalLab simplified domains (goalAtoms.ts expects these)
  const get = (k: string) => clamp01(Number(domainWeights[k] ?? 0));
  const bridge: Record<string, { val: number; used: string[]; parts: any }> = {
    safety: { val: get('survival'), used: [`goal:lifeDomain:survival:${selfId}`], parts: { survival: get('survival') } },
    affiliation: {
      val: clamp01(0.5 * get('attachment_care') + 0.3 * get('personal_bond') + 0.2 * get('group_cohesion')),
      used: [`goal:lifeDomain:attachment_care:${selfId}`, `goal:lifeDomain:personal_bond:${selfId}`, `goal:lifeDomain:group_cohesion:${selfId}`],
      parts: { attachment_care: get('attachment_care'), personal_bond: get('personal_bond'), group_cohesion: get('group_cohesion') }
    },
    status: {
      val: clamp01(0.6 * get('status') + 0.25 * get('leader_legitimacy') + 0.15 * get('reputation')),
      used: [`goal:lifeDomain:status:${selfId}`, `goal:lifeDomain:leader_legitimacy:${selfId}`, `goal:lifeDomain:reputation:${selfId}`],
      parts: { status: get('status'), leader_legitimacy: get('leader_legitimacy'), reputation: get('reputation') }
    },
    exploration: {
      val: clamp01(0.7 * get('information') + 0.3 * get('exploration')),
      used: [`goal:lifeDomain:information:${selfId}`, `goal:lifeDomain:exploration:${selfId}`],
      parts: { information: get('information'), exploration: get('exploration') }
    },
    order: {
      val: clamp01(0.55 * get('control') + 0.30 * get('obedience') + 0.15 * get('order')),
      used: [`goal:lifeDomain:control:${selfId}`, `goal:lifeDomain:obedience:${selfId}`, `goal:lifeDomain:order:${selfId}`],
      parts: { control: get('control'), obedience: get('obedience'), order: get('order') }
    }
  };

  const bridgeAtoms: ContextAtom[] = Object.entries(bridge).map(([domain, b]) => normalizeAtom({
    id: `goal:lifeDomain:${domain}:${selfId}`,
    ns: 'goal' as any,
    kind: 'life_domain' as any,
    origin: 'profile' as any,
    source: 'lifeDomainBridge',
    target: selfId,
    magnitude: clamp01(b.val),
    confidence: 0.85,
    tags: ['goal', 'lifeDomain', 'bridge', domain],
    label: `lifeDomain:${domain}=${clamp01(b.val).toFixed(3)}`,
    trace: { usedAtomIds: b.used.filter(Boolean), notes: ['bridge for GoalLab simplified domains'], parts: b.parts }
  } as any));

  return [...lifeGoalAtoms, ...domainAtoms, ...bridgeAtoms];
}

// Atomize Location Access rules (static)
function atomizeLocationAccess(location: LocationEntity): ContextAtom[] {
    if (!location?.entityId) return [];
    const id = location.entityId;
    
    // heuristics from ownership/accessRights/properties/tags
    const tags: string[] = location.tags || [];
    const props = location.properties || {} as any;
    const ownership = location.ownership || {} as any;
    
    const isPublic = tags.includes('public') || (props.visibility > 0.6) || (props.privacy === 'public');
    const requiresKey = tags.includes('locked') || (location.state?.locked && !isPublic);
    const requiresSecKey = tags.includes('vault') || tags.includes('secure');
    const reqMid = tags.includes('restricted') || (ownership.securityLevel > 0.4);
    const reqHigh = tags.includes('top_secret') || (ownership.securityLevel > 0.7);

    const mk = (suffix: string, mag: number, label: string) => normalizeAtom({
        id: `loc:${id}:access:${suffix}`,
        kind: 'loc_access' as any,
        ns: 'loc' as any,
        origin: 'world',
        source: 'location',
        magnitude: clamp01(mag),
        confidence: 1,
        target: id,
        tags: ['loc', 'access', suffix],
        label,
        trace: { usedAtomIds: [], notes: ['from location entity'], parts: { isPublic, requiresKey, requiresSecKey, reqMid, reqHigh } }
    } as any);

    return [
        mk('public', isPublic ? 1 : 0, `public=${isPublic}`),
        mk('requires_key', requiresKey ? 1 : 0, `requiresKey=${requiresKey}`),
        mk('requires_sec_key', requiresSecKey ? 1 : 0, `requiresSecKey=${requiresSecKey}`),
        mk('requires_clearance_mid', reqMid ? 1 : 0, `requiresClearanceMid=${reqMid}`),
        mk('requires_clearance_high', reqHigh ? 1 : 0, `requiresClearanceHigh=${reqHigh}`)
    ];
}

export function buildStage0Atoms(input: Stage0Input): Stage0Output {
  const tick = input.world?.tick ?? 0;

  // 0. World Facts (Canonical)
  const locId = (input.agent as any).locationId || input.world.agents.find(a => a.entityId === input.selfId)?.locationId;
  const loc = input.world.locations.find(l => l.entityId === locId);
  const sceneSnapshot = input.sceneSnapshot || (input.world as any).sceneSnapshot || input.world.scene;

  const worldFacts = buildWorldFactsAtoms({
      world: input.world,
      tick,
      selfId: input.selfId,
      self: input.agent,
      mapMetrics: input.mapMetrics,
      location: loc,
      locationId: locId,
      sceneSnapshot
  });

  // 0b. Features Atoms
  const selfFeatures = buildCharacterFeatures(input.world, input.selfId, input.agent);
  const selfFeatAtoms = atomizeFeatures(selfFeatures, 'feat:char');

  const locFeatures = (locId && loc) ? buildLocationFeatures(input.world, String(locId), loc) : null;
  const locFeatAtoms = locFeatures ? atomizeFeatures(locFeatures, 'feat:loc') : [];

  const scId = String(sceneSnapshot?.presetId || sceneSnapshot?.sceneId || 'scene');
  const scFeatures = sceneSnapshot ? buildSceneFeatures(input.world, scId, sceneSnapshot) : null;
  const scFeatAtoms = scFeatures ? atomizeFeatures(scFeatures, 'feat:scene') : [];

  // Stable profile atoms (life goals / life domains)
  const lifeAtoms = buildLifeGoalAtoms(input.agent);

  // 1. Generate Observation Atoms (Perception Layer) using canonical extractor
  const othersInLoc = locId 
    ? getAgentsInLocation(input.world, String(locId)).map(a => a.entityId)
    : [];

  const obsAtoms = extractObservationAtoms({
      world: input.world,
      selfId: input.selfId,
      location: loc,
      otherAgentIds: othersInLoc
  });

  // Full location-derived facts: world:loc:* + world:map:* + world:env:hazard:* + world:map:escape:*
  const locationAtoms = loc ? extractLocationAtoms({ selfId: input.selfId, location: loc }) : [];

  // Build dyad set early (needed for closed rel_base + ToM coverage)
  const nearbyIds = obsAtoms
    .filter(a => typeof a.id === 'string' && a.id.startsWith(`obs:nearby:${input.selfId}:`))
    .map(a => String((a.id as string).split(':')[3] ?? ''))
    .filter(id => id && id !== input.selfId);

  const sceneIds = Array.isArray((sceneSnapshot as any)?.participants)
    ? (sceneSnapshot as any).participants.map((x: any) => String(x?.entityId ?? x?.id ?? x)).filter(Boolean)
    : [];

  const otherAgentIds = Array.from(new Set([...nearbyIds, ...sceneIds])).filter(id => id !== input.selfId);

  // 2. Relationship Layer (RelationBase) — seed atoms for ALL dyads
  const relBase = extractRelBaseFromCharacter({ selfId: input.selfId, character: input.agent, tick });
  (input.agent as any).rel_base = relBase;
  const relAtoms = atomizeRelBase(input.selfId, relBase, otherAgentIds);

  // 2.1 Relationship Context Memory (inheritable) — rel:ctx from character storage
  const relCtxMem = extractRelCtxFromCharacter({ selfId: input.selfId, character: input.agent, tick });
  (input.agent as any).rel_ctx = relCtxMem;
  const relCtxAtomsFromMem = atomizeRelCtx(input.selfId, relCtxMem, otherAgentIds);

  const relGraphRaw =
    (input.agent as any)?.relations?.graph ||
    (input.agent as any)?.rel_graph ||
    (input.agent as any)?.relationships?.graph ||
    null;
  const relGraphAtoms = relGraphRaw ? atomizeRelations(relGraphRaw as any, input.selfId) : [];

  const { dyadAtoms: tomDyadAtoms, relHintAtoms: tomRelHints } = extractTomDyadAtoms({
    world: input.world,
    agent: input.agent,
    selfId: input.selfId,
    otherAgentIds
  });

  // 3. Event Layer (Evidence)
  const worldEvents = input.events ?? ((input.world as any)?.eventLog?.events || []);
  const eventAtoms = atomizeEventsForAgent({
    selfId: input.selfId,
    events: worldEvents,
    nowTick: tick,
    maxLookbackTicks: 60
  });

  // 4. Capabilities Layer
  const capProf = extractCapabilitiesFromCharacter(input.agent);
  const capAtoms = atomizeCapabilities(input.selfId, capProf);
  
  // 5. Location Access Layer
  const locAccessAtoms = loc ? atomizeLocationAccess(loc) : [];
  
  // 6. Trace Layer (Slow state feedback)
  const traceAtoms = atomizeTraces(input.selfId, input.agent);

  // 2.5 Relationship CURRENT state (derived from rel:base + events + tom + ctx)
  // Важно: rel:state — это не ToM. Это “текущее отношение”, которое ToM будет учитывать как prior.
  // 2.45 Relationship CONTEXT state (derived from inherited ctx + this scene signals)
  const relCtxAtoms = deriveRelCtxAtoms({
    selfId: input.selfId,
    otherIds: otherAgentIds,
    atoms: [
      ...worldFacts,
      ...locationAtoms,
      ...selfFeatAtoms,
      ...locFeatAtoms,
      ...scFeatAtoms,
      ...lifeAtoms,
      ...(input.extraWorldAtoms || []),
      ...relAtoms,
      ...relCtxAtomsFromMem,
      ...relGraphAtoms,
      ...eventAtoms,
      ...capAtoms,
      ...locAccessAtoms,
      ...traceAtoms,
      ...obsAtoms,
      ...(input.beliefAtoms || []),
      ...tomDyadAtoms,
      ...tomRelHints
    ]
  });

  const relStateAtoms = deriveRelStateAtoms({
    selfId: input.selfId,
    otherIds: otherAgentIds,
    atoms: [
      ...worldFacts,
      ...locationAtoms,
      ...selfFeatAtoms,
      ...locFeatAtoms,
      ...scFeatAtoms,
      ...lifeAtoms,
      ...(input.extraWorldAtoms || []),
      ...relAtoms,
      ...relCtxAtoms,
      ...relGraphAtoms,
      ...eventAtoms,
      ...capAtoms,
      ...locAccessAtoms,
      ...traceAtoms,
      ...obsAtoms,
      ...(input.beliefAtoms || []),
      ...tomDyadAtoms,
      ...tomRelHints
    ]
  });

  // 7. Epistemic Merge
  const atomsForAxes = [
    ...worldFacts,
    ...locationAtoms,
    ...selfFeatAtoms,
    ...locFeatAtoms,
    ...scFeatAtoms,
    ...lifeAtoms,
    ...(input.extraWorldAtoms || []),
    ...relAtoms,
    ...relCtxAtoms,
    ...relStateAtoms,
    ...relGraphAtoms,
    ...eventAtoms,
    ...capAtoms,
    ...locAccessAtoms,
    ...traceAtoms,
    ...obsAtoms
  ];

  // 8. Derive Context Axes Atoms (Strictly from canonical atoms)
  // NOTE: stage0 historically included ctx axes.
  // For strict staged pipelines, disable via input.includeAxes=false and compute axes at Stage 2/3.
  const ctxAtoms = input.includeAxes === false
    ? []
    : deriveAxes({
        selfId: input.selfId,
        atoms: atomsForAxes // Pass the accumulated atoms to derive axes
      }).atoms;

  // World layer: only facts (plus extras). Obs goes into obs layer. Ctx goes into derived layer.
  const worldAtomsPlus = [
      ...worldFacts,
      ...locationAtoms,
      ...selfFeatAtoms,
      ...locFeatAtoms,
      ...scFeatAtoms,
      ...lifeAtoms,
      ...(input.extraWorldAtoms || []),
      ...relAtoms,
      ...relCtxAtoms,
      ...relStateAtoms,
      ...relGraphAtoms,
      ...eventAtoms,
      ...capAtoms,
      ...locAccessAtoms,
      ...traceAtoms
  ];

  const merged = mergeEpistemicAtoms({
    world: worldAtomsPlus,
    obs: obsAtoms,
    belief: [...(input.beliefAtoms || []), ...tomDyadAtoms, ...tomRelHints],
    override: input.overrideAtoms || [],
    derived: ctxAtoms
  });

  return { 
      mergedAtoms: merged.merged, 
      provenance: merged.provenance, 
      obsAtoms: obsAtoms 
  };
}
