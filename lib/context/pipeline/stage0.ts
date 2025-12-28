
// lib/context/pipeline/stage0.ts
import { ContextAtom } from '../v2/types';
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

// New RelationBase Logic
import { extractRelBaseFromCharacter } from '../../relations/extract';
import { atomizeRelBase } from '../../relations/atomize';

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

  // 2. Relationship Layer (RelationBase)
  const relBase = extractRelBaseFromCharacter({ selfId: input.selfId, character: input.agent, tick });
  (input.agent as any).rel_base = relBase; 
  
  const relAtoms = atomizeRelBase(input.selfId, relBase);

  const nearbyIds = obsAtoms
    .filter(a => typeof a.id === 'string' && a.id.startsWith(`obs:nearby:${input.selfId}:`))
    .map(a => String((a.id as string).split(':')[3] ?? ''))
    .filter(id => id && id !== input.selfId);

  const sceneIds = Array.isArray((sceneSnapshot as any)?.participants)
    ? (sceneSnapshot as any).participants.map((x: any) => String(x?.entityId ?? x?.id ?? x)).filter(Boolean)
    : [];

  const otherAgentIds = Array.from(new Set([...nearbyIds, ...sceneIds])).filter(id => id !== input.selfId);

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
  const relStateAtoms = deriveRelStateAtoms({
    selfId: input.selfId,
    otherIds: otherAgentIds,
    atoms: [
      ...worldFacts,
      ...locationAtoms,
      ...selfFeatAtoms,
      ...locFeatAtoms,
      ...scFeatAtoms,
      ...(input.extraWorldAtoms || []),
      ...relAtoms,
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
    ...(input.extraWorldAtoms || []),
    ...relAtoms,
    ...relStateAtoms,
    ...eventAtoms,
    ...capAtoms,
    ...locAccessAtoms,
    ...traceAtoms,
    ...obsAtoms
  ];

  // 8. Derive Context Axes Atoms (Strictly from canonical atoms)
  const ctxAtoms = deriveAxes({
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
      ...(input.extraWorldAtoms || []),
      ...relAtoms,
      ...relStateAtoms,
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
