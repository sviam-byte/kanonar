import { WorldState, AgentState, ContextV2 } from '../../types';
import { ContextSnapshot, ContextAtom } from '../context/v2/types';
import { ContextBuildOptions, buildContextSnapshot } from '../context/v2/builder';
import { AgentContextFrame } from '../context/frame/types';
import { buildFullAgentContextFrame } from '../context/v4/build';
import { atomizeFrame } from '../context/v4/atomizeFrame';
import { buildContextV2FromFrame } from './context-v2';
import { getPlanningGoals } from './adapter';
import { computeGoalPriorities } from '../goal-planning';
import { SituationContext } from '../types-goals';
import { normalizeAtom } from '../context/v2/infer';
import { applyAtomOverrides, AtomOverrideLayer, applyAtomOverrides as extractApplied } from '../context/overrides/types';
import { validateAtoms } from '../context/validate/frameValidator';
import { buildSummaryAtoms } from '../context/summaries/buildSummaries';
import { computeCoverageReport } from '../goal-lab/coverage/computeCoverage';
import { normalizeAffectState } from '../affect/normalize';
import { atomizeAffect } from '../affect/atomize';
import { synthesizeAffectFromMind } from '../affect/synthesizeFromMind';
// New Imports for Pipeline
import { buildStage0Atoms } from '../context/pipeline/stage0';
import { deriveContextVectors } from '../context/axes/deriveAxes';
import { mergeEpistemicAtoms } from '../context/epistemic/mergeEpistemic';
import { generateRumorBeliefs } from '../context/epistemic/rumorGenerator';
import { buildBeliefToMBias } from '../tom/ctx/beliefBias';
import { applyRelationPriorsToDyads } from '../tom/base/applyRelationPriors';
import { buildSelfAliases } from '../context/v2/aliases';
import { computeThreatStack } from '../threat/threatStack';
import { derivePossibilitiesRegistry } from '../possibilities/derive';
import { atomizePossibilities } from '../possibilities/atomize';
import { deriveAccess } from '../access/deriveAccess';
import { getLocationForAgent } from "../world/locations";
import { decideAction } from '../decision/decide';
import { computeContextMindScoreboard } from '../contextMind/scoreboard';
import { atomizeContextMindMetrics } from '../contextMind/atomizeMind';
import { deriveSocialProximityAtoms } from '../context/stage1/socialProximity';
import { deriveHazardGeometryAtoms } from '../context/stage1/hazardGeometry';
import { deriveAppraisalAtoms } from '../emotion/appraisals';
import { deriveEmotionAtoms } from '../emotion/emotions';

// Scene Engine
import { SCENE_PRESETS } from '../scene/presets';
import { createSceneInstance, stepSceneInstance } from '../scene/engine';
import { applySceneAtoms } from '../scene/applyScene';

export interface GoalLabContextResult {
  agent: AgentState;
  frame: AgentContextFrame | null;
  snapshot: ContextSnapshot;
  v4Atoms: ContextAtom[];
  ctxV2: ContextV2;
  situation: SituationContext;
  goalPreview: {
    goals: Array<{ id: string; label: string; priority: number; activation: number; base_ctx: number }>;
    debug: { temperature: number; d_mix: Record<string, number> };
  };
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function dedupeAtomsById(arr: ContextAtom[]): ContextAtom[] {
    const seen = new Set<string>();
    const out: ContextAtom[] = [];
    for (let i = arr.length - 1; i >= 0; i--) {
        const a = arr[i];
        if (!a || !a.id) continue;
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        out.unshift(a);
    }
    return out;
}

function buildSituationContextForLab(
  agent: AgentState,
  world: WorldState,
  frame: AgentContextFrame | null,
  snapshot: ContextSnapshot,
  v4Atoms: ContextAtom[],
  ctxV2: ContextV2,
): SituationContext {
  const tags = new Set<string>((frame?.where?.locationTags ?? []) as any);

  const isPrivate = tags.has('private');
  const isFormal = tags.has('formal') || ctxV2.scenarioKind === 'strategic_council';

  const threatLevel =
    (typeof (snapshot.domains as any)?.danger === 'number' ? (snapshot.domains as any).danger : undefined)
    ?? (typeof (frame?.derived as any)?.threatIndex === 'number' ? (frame?.derived as any).threatIndex : 0);

  const timePressure =
    (typeof (snapshot.summary as any)?.timePressure === 'number' ? (snapshot.summary as any).timePressure : undefined)
    ?? (v4Atoms.find(a => a.kind === 'time_pressure')?.magnitude ?? 0);

  const woundedPresent =
    v4Atoms.some(a => a.kind === 'care_need' || a.kind === 'wounded_scene' || a.kind === 'wounded');

  let scenarioKind: any = ctxV2.scenarioKind || 'other';
  if (!scenarioKind || scenarioKind === 'routine') {
    const sId = world.scenario?.id || '';
    if (sId.includes('council')) scenarioKind = 'strategic_council';
    else if (sId.includes('rescue') || sId.includes('evac')) scenarioKind = 'fight_escape';
    else if (sId.includes('training')) scenarioKind = 'patrol';
    else if (isPrivate) scenarioKind = 'domestic_scene';
  }

  const crowdSize = (frame?.what?.nearbyAgents?.length ?? 0) + 1;

  const leaderId = world.leadership?.currentLeaderId;
  const leaderPresent = !!leaderId && (
    leaderId === agent.entityId ||
    (frame?.what?.nearbyAgents ?? []).some(a => a?.id === leaderId)
  );

  return {
    scenarioKind,
    stage: world.scene?.currentPhaseId || 'default',
    threatLevel: Math.max(0, Math.min(1, threatLevel)),
    timePressure: Math.max(0, Math.min(1, timePressure)),
    woundedPresent: woundedPresent ? 1.0 : 0.0,
    leaderPresent,
    isFormal,
    isPrivate,
    crowdSize,
    roleId: agent.effectiveRole || 'any',
    z: {},
    affect: agent.affect
  } as any;
}

export function buildGoalLabContext(
  world: WorldState,
  agentId: string,
  opts: {
    snapshotOptions?: ContextBuildOptions & { atomOverridesLayer?: AtomOverrideLayer; overrideEvents?: any[]; sceneControl?: any; affectOverrides?: any };
    timeOverride?: number;
  } = {}
): GoalLabContextResult | null {
  let agent = world.agents.find(a => a.entityId === agentId);
  if (!agent) return null;

  // 1. Build Frame (Legacy / Visuals only)
  const frame = buildFullAgentContextFrame(world, agentId, undefined, { persistAffect: false });
  
  // Atomize frame for debug purposes (legacy logic) - DO NOT USE FOR TRUTH
  const t = opts.timeOverride ?? world.tick ?? 0;
  const legacyFrameAtoms = frame ? atomizeFrame(frame, t, world).map(normalizeAtom) : [];

  // 3. Prepare Override Atoms (GoalLab Manual)
  const overridesLayer = opts.snapshotOptions?.atomOverridesLayer;
  const manualAtomsRaw = (opts.snapshotOptions?.manualAtoms || []).map(normalizeAtom);
  const { atoms: appliedOverrides } = extractApplied(manualAtomsRaw, overridesLayer);

  // Apply affect overrides from UI knobs (must affect ALL downstream calculations).
  const affectOverrides = (opts.snapshotOptions as any)?.affectOverrides;
  if (affectOverrides && typeof affectOverrides === 'object') {
    const prev = (agent as any).affect || null;
    const merged = {
      ...(prev || {}),
      ...affectOverrides,
      e: { ...((prev as any)?.e || {}), ...((affectOverrides as any)?.e || {}) },
      regulation: { ...((prev as any)?.regulation || {}), ...((affectOverrides as any)?.regulation || {}) },
      moral: { ...((prev as any)?.moral || {}), ...((affectOverrides as any)?.moral || {}) },
    };
    agent = { ...(agent as any), affect: normalizeAffectState(merged) } as any;
  }
  
  // Belief Atoms
  const beliefAtoms = [
      ...((agent as any).memory?.beliefAtoms || []),
  ];
  
  // Events
  const tick = world?.tick ?? 0;
  const worldEvents = (world as any)?.eventLog?.events || [];
  const overrideEvents = opts.snapshotOptions?.overrideEvents || [];
  const eventsAll = [...overrideEvents, ...worldEvents];
  
  const selfId = agent.entityId;
  const arousal = agent.affect?.arousal ?? 0;
  // Crowd atom for stage 0 input (optional)
  const ctxCrowdAtom = legacyFrameAtoms.find(a => a.id === 'soc_crowd_density' || a.kind === 'crowding_pressure');
  const ctxCrowd = ctxCrowdAtom ? ctxCrowdAtom.magnitude : 0;

  // --- SCENE ENGINE INTEGRATION ---
  const sc = opts.snapshotOptions?.sceneControl;
  let sceneInst = null as any;

  if (sc?.presetId) {
    sceneInst = createSceneInstance({
      presetId: sc.presetId,
      sceneId: sc.sceneId || `scene_${sc.presetId}`,
      startedAtTick: tick,
      participants: (world?.agents || []).map((a: any) => a.entityId || a.id).filter(Boolean),
      locationId: (agent as any).locationId || getLocationForAgent(world, selfId)?.entityId,
      metricsOverride: sc.metrics || {},
      normsOverride: sc.norms || {}
    });

    if (Array.isArray(sc.manualInjections)) sceneInst.manualInjections = sc.manualInjections;

    if (sc.phaseId) {
      sceneInst.phaseId = sc.phaseId;
      sceneInst.phaseEnteredAtTick = tick;
    }
  } else {
    sceneInst = (world as any).sceneSnapshot;
  }

  // --- Location override (GoalLab UI) ---
  // Context v2 builder supports overrideLocation, but the stage0-based pipeline historically used agent.locationId/world.locations
  // and therefore ignored UI location overrides. We make the override canonical for the pipeline.
  const overrideLocation = opts.snapshotOptions?.overrideLocation as any;
  let worldForPipeline: any = world;
  let agentForPipeline: any = agent;
  if (overrideLocation) {
    const locIdOverride = typeof overrideLocation === 'string' ? overrideLocation : overrideLocation.entityId;
    if (locIdOverride) {
      agentForPipeline = { ...agentForPipeline, locationId: locIdOverride };

      // Ensure the overridden location exists in world.locations so stage0 can resolve features/observations.
      if (typeof overrideLocation === 'object' && overrideLocation.entityId) {
        const existing = (worldForPipeline.locations || []).find((l: any) => l.entityId === overrideLocation.entityId);
        const nextLocs = existing
          ? (worldForPipeline.locations || []).map((l: any) => (l.entityId === overrideLocation.entityId ? overrideLocation : l))
          : [...(worldForPipeline.locations || []), overrideLocation];
        worldForPipeline = { ...worldForPipeline, locations: nextLocs };
      }

      // Keep scene snapshot aligned (used by buildSceneFeatures etc.)
      if (sceneInst && typeof sceneInst === 'object') {
        sceneInst = { ...sceneInst, locationId: locIdOverride };
      }
    }
  }

  // --- Pipeline Execution Helper ---
  const runPipeline = (sceneAtoms: ContextAtom[], sceneSnapshotForStage0: any) => {
      // Canonical affect atoms (bridge for UI knobs -> threat/goals explanations)
      const affectAtoms = atomizeAffect(
        selfId,
        (agentForPipeline as any).affect,
        affectOverrides && typeof affectOverrides === 'object' && Object.keys(affectOverrides).length > 0 ? 'manual' : 'derived'
      );

      // 4. Stage 0 (World Facts)
      const stage0 = buildStage0Atoms({
        world: worldForPipeline,
        agent: agentForPipeline,
        selfId,
        extraWorldAtoms: [...sceneAtoms, ...affectAtoms],
        beliefAtoms,
        overrideAtoms: appliedOverrides,
        arousal,
        ctxCrowd,
        events: eventsAll,
        sceneSnapshot: sceneSnapshotForStage0
      });

      // Add compatibility aliases (ctx:danger -> ctx:danger:selfId, threat:final -> threat:final:selfId, ...)
      const aliasAtoms = buildSelfAliases(stage0.mergedAtoms, selfId);
      let atomsPreAxes = [...stage0.mergedAtoms, ...aliasAtoms];

      // Социальные proximity-атомы: дружба/вражда рядом из (obs + tom + rel)
      const socProx = deriveSocialProximityAtoms({ selfId, atoms: atomsPreAxes });
      atomsPreAxes = mergeEpistemicAtoms({
        world: atomsPreAxes,
        obs: [],
        belief: [],
        override: [],
        derived: socProx.atoms
      }).merged;

      // Геометрия опасности: расстояния до hazard-клеток и опасность между агентами
      const hazGeo = deriveHazardGeometryAtoms({
        world: worldForPipeline,
        selfId,
        atoms: atomsPreAxes
      });
      atomsPreAxes = mergeEpistemicAtoms({
        world: atomsPreAxes,
        obs: [],
        belief: [],
        override: [],
        derived: hazGeo.atoms
      }).merged;

      // 5. Derive Axes
      const axesRes = deriveContextVectors({
          selfId,
          atoms: atomsPreAxes,
          tuning: (frame?.what?.contextTuning || (world.scene as any)?.contextTuning)
      });
      // IMPORTANT: axes must be materialized into the atom stream, otherwise access/threat/goals won't see them.
      const atomsWithAxes = mergeEpistemicAtoms({
          world: atomsPreAxes,
          obs: [],
          belief: [],
          override: [],
          derived: axesRes.atoms
      }).merged;

      // 5.5 Constraints & Access
      const locId = (agentForPipeline as any).locationId || getLocationForAgent(worldForPipeline, selfId)?.entityId;
      const accessPack = deriveAccess(atomsWithAxes, selfId, locId);
      const atomsAfterAccess = mergeEpistemicAtoms({
          world: atomsWithAxes,
          obs: [],
          belief: [],
          override: [],
          derived: accessPack.atoms
      }).merged;

      // 6. Rumor Generation
      const seed = (world as any).sceneSnapshot?.seed ?? 12345;
      const rumorBeliefs = generateRumorBeliefs({
          atomsAfterAxes: atomsAfterAccess,
          selfId,
          tick,
          seed
      });
      const atomsAfterBeliefGen = [...atomsAfterAccess, ...rumorBeliefs];
      
      // 7. Apply Relation Priors
      const priorsApplied = applyRelationPriorsToDyads(atomsAfterBeliefGen, selfId);
      const atomsAfterPriors = mergeEpistemicAtoms({
          world: atomsAfterBeliefGen,
          obs: [],
          belief: [],
          override: [],
          derived: priorsApplied.atoms
      }).merged;

      // 8. ToM Context Bias
      const biasPack = buildBeliefToMBias(atomsAfterPriors, selfId);
      const bias = biasPack.bias;

      const tomCtxDyads: ContextAtom[] = [];
      const dyads = atomsAfterPriors.filter(a => a.id.startsWith(`tom:dyad:${selfId}:`));

      for (const a of dyads) {
          if (a.id.endsWith(':trust')) {
            const trust = clamp01(a.magnitude ?? 0);
            const t2 = clamp01(trust * (1 - 0.6 * bias));
            tomCtxDyads.push(normalizeAtom({
              id: a.id.replace(':trust', ':trust_ctx'),
              kind: 'tom_dyad_metric', 
              ns: 'tom',
              origin: 'derived',
              source: 'tom_ctx',
              magnitude: t2,
              confidence: 1,
              tags: ['tom', 'ctx'],
              subject: selfId,
              target: a.target,
              label: `trust_ctx:${Math.round(t2 * 100)}%`,
              trace: { usedAtomIds: [a.id, `tom:ctx:bias:${selfId}`], notes: ['trust adjusted by ctx bias'], parts: { trust, bias } }
            } as any));
          }
          if (a.id.endsWith(':threat')) {
            const thr = clamp01(a.magnitude ?? 0);
            const thr2 = clamp01(thr + 0.6 * bias * (1 - thr));
            tomCtxDyads.push(normalizeAtom({
              id: a.id.replace(':threat', ':threat_ctx'),
              kind: 'tom_dyad_metric',
              ns: 'tom',
              origin: 'derived',
              source: 'tom_ctx',
              magnitude: thr2,
              confidence: 1,
              tags: ['tom', 'ctx'],
              subject: selfId,
              target: a.target,
              label: `threat_ctx:${Math.round(thr2 * 100)}%`,
              trace: { usedAtomIds: [a.id, `tom:ctx:bias:${selfId}`], notes: ['threat adjusted by ctx bias'], parts: { thr, bias } }
            } as any));
          }
      }

      // 8.5 Effective ToM dyads (canonical layer)
      // Rule: use *_ctx if exists, else base.
      const baseDyads = dyads.filter(a => a.id.endsWith(':trust') || a.id.endsWith(':threat'));
      const ctxByBaseId = new Map<string, ContextAtom>();
      for (const a of tomCtxDyads) {
        // convert trust_ctx -> trust baseId, threat_ctx -> threat baseId
        const baseId = a.id.replace(':trust_ctx', ':trust').replace(':threat_ctx', ':threat');
        ctxByBaseId.set(baseId, a);
      }

      const effectiveDyads: ContextAtom[] = [];
      for (const b of baseDyads) {
        const chosen = ctxByBaseId.get(b.id) || b;
        const parts = b.id.split(':'); // tom:dyad:self:target:metric
        if (parts.length < 5) continue;
        const target = parts[3];
        const metric = parts[4] === 'trust' ? 'trust' : 'threat';
        const effId = `tom:effective:dyad:${selfId}:${target}:${metric}`;

        effectiveDyads.push(normalizeAtom({
          id: effId,
          ns: 'tom',
          kind: 'tom_dyad_metric',
          origin: 'derived',
          source: 'tom_effective',
          magnitude: clamp01((chosen as any).magnitude ?? 0),
          confidence: 1,
          subject: selfId,
          target,
          tags: ['tom', 'effective', metric],
          label: `${metric}_effective:${Math.round(clamp01((chosen as any).magnitude ?? 0) * 100)}%`,
          trace: {
            usedAtomIds: [b.id, ...(chosen.id !== b.id ? [chosen.id] : [])],
            notes: ['effective dyad = ctx if present else base'],
            parts: { chosen: chosen.id !== b.id ? 'ctx' : 'base' }
          }
        } as any));
      }

      // 9. Threat Stack
      const atomsForThreat = [...atomsAfterPriors, ...biasPack.atoms, ...tomCtxDyads, ...effectiveDyads];
      const threatInputs = {
          envDanger: 0, visibilityBad: 0, coverLack: 0, crowding: 0,
          nearbyCount: 0, nearbyTrustMean: 0.45, nearbyHostileMean: 0, hierarchyPressure: 0, surveillance: 0,
          timePressure: 0, woundedPressure: 0, goalBlock: 0,
          paranoia: (agent as any)?.traits?.paranoia ?? 0.35,
          trauma: (agent as any)?.traits?.trauma ?? 0,
          exhaustion: (agent as any)?.body?.fatigue ?? 0,
          dissociation: (agent as any)?.traits?.dissociation ?? 0,
          experience: (agent as any)?.traits?.experience ?? 0.5
      }; 
      const threatCalc = computeThreatStack(threatInputs, atomsForThreat);
      
      const threatAtoms: ContextAtom[] = [
        normalizeAtom({
          id: `threat:ch:env:${selfId}`,
          kind: 'threat_value' as any,
          ns: 'threat' as any,
          origin: 'derived',
          source: 'threat',
          magnitude: threatCalc.env,
          confidence: 1,
          tags: ['threat', 'channel', 'env'],
          label: `env threat:${Math.round(threatCalc.env * 100)}%`,
          trace: { usedAtomIds: threatCalc.usedAtomIds || [], notes: ['env channel'], parts: { env: threatCalc.env } }
        } as any),
        normalizeAtom({
          id: `threat:ch:social:${selfId}`,
          kind: 'threat_value' as any,
          ns: 'threat' as any,
          origin: 'derived',
          source: 'threat',
          magnitude: threatCalc.social,
          confidence: 1,
          tags: ['threat', 'channel', 'social'],
          label: `social threat:${Math.round(threatCalc.social * 100)}%`,
          trace: { usedAtomIds: threatCalc.usedAtomIds || [], notes: ['social channel'], parts: { social: threatCalc.social } }
        } as any),
        normalizeAtom({
          id: `threat:ch:scenario:${selfId}`,
          kind: 'threat_value' as any,
          ns: 'threat' as any,
          origin: 'derived',
          source: 'threat',
          magnitude: threatCalc.scenario,
          confidence: 1,
          tags: ['threat', 'channel', 'scenario'],
          label: `scenario threat:${Math.round(threatCalc.scenario * 100)}%`,
          trace: { usedAtomIds: threatCalc.usedAtomIds || [], notes: ['scenario channel'], parts: { scenario: threatCalc.scenario } }
        } as any),
        normalizeAtom({
          id: `threat:ch:personal:${selfId}`,
          kind: 'threat_value' as any,
          ns: 'threat' as any,
          origin: 'derived',
          source: 'threat',
          magnitude: threatCalc.personal,
          confidence: 1,
          tags: ['threat', 'channel', 'personal'],
          label: `personal bias:${Math.round(threatCalc.personal * 100)}%`,
          trace: { usedAtomIds: threatCalc.usedAtomIds || [], notes: ['personal bias channel'], parts: { personal: threatCalc.personal } }
        } as any)
      ];

      // Optional extra canonical channels expected by older UIs or scoreboard
      const authority = clamp01((threatCalc.inputs as any)?.hierarchyPressure ?? 0);
      const uncertainty = clamp01((() => {
        const u = atomsForThreat.find(a => a.id === `ctx:uncertainty:${selfId}`)?.magnitude;
        if (typeof u === 'number' && Number.isFinite(u)) return u;
        const ia = atomsForThreat.find(a => a.id === `obs:infoAdequacy:${selfId}`)?.magnitude;
        if (typeof ia === 'number' && Number.isFinite(ia)) return 1 - ia;
        return 0;
      })());
      const body = clamp01((threatCalc.inputs as any)?.woundedPressure ?? 0);
      
      threatAtoms.push(
        normalizeAtom({
            id: `threat:ch:authority:${selfId}`,
            kind: 'threat_value' as any,
            ns: 'threat' as any,
            origin: 'derived',
            source: 'threat',
            magnitude: authority,
            confidence: 1,
            tags: ['threat', 'channel', 'authority'],
            label: `authority pressure:${Math.round(authority * 100)}%`,
            trace: { usedAtomIds: threatCalc.usedAtomIds || [], notes: ['authority channel'], parts: { authority } }
        } as any),
        normalizeAtom({
            id: `threat:ch:uncertainty:${selfId}`,
            kind: 'threat_value' as any,
            ns: 'threat' as any,
            origin: 'derived',
            source: 'threat',
            magnitude: uncertainty,
            confidence: 1,
            tags: ['threat', 'channel', 'uncertainty'],
            label: `uncertainty pressure:${Math.round(uncertainty * 100)}%`,
            trace: { usedAtomIds: threatCalc.usedAtomIds || [], notes: ['uncertainty channel'], parts: { uncertainty } }
        } as any),
        normalizeAtom({
            id: `threat:ch:body:${selfId}`,
            kind: 'threat_value' as any,
            ns: 'threat' as any,
            origin: 'derived',
            source: 'threat',
            magnitude: body,
            confidence: 1,
            tags: ['threat', 'channel', 'body'],
            label: `body pressure:${Math.round(body * 100)}%`,
            trace: { usedAtomIds: threatCalc.usedAtomIds || [], notes: ['body channel'], parts: { body } }
        } as any)
      );

      const threatAtom = normalizeAtom({
          id: `threat:final:${selfId}`,
          kind: 'threat_value' as any,
          ns: 'threat' as any,
          origin: 'derived',
          source: 'threat',
          magnitude: threatCalc.total,
          confidence: 1,
          tags: ['threat', 'final'],
          label: `Threat: ${Math.round(threatCalc.total * 100)}%`,
          trace: { usedAtomIds: threatCalc.usedAtomIds || [], notes: threatCalc.why?.slice(0, 6) || ['threat stack'], parts: { ...threatCalc } }
      } as any);

      // 10. Emotions: appraisals -> emotions
      const atomsAfterThreat = mergeEpistemicAtoms({
        world: atomsForThreat,
        obs: [],
        belief: [],
        override: [],
        derived: [...threatAtoms, threatAtom]
      }).merged;

      const appraisals = deriveAppraisalAtoms(selfId, atomsAfterThreat);
      const atomsAfterAppraisals = mergeEpistemicAtoms({
        world: atomsAfterThreat,
        obs: [],
        belief: [],
        override: [],
        derived: appraisals
      }).merged;

      const emotions = deriveEmotionAtoms(selfId, atomsAfterAppraisals);
      const atomsAfterEmotions = mergeEpistemicAtoms({
        world: atomsAfterAppraisals,
        obs: [],
        belief: [],
        override: [],
        derived: emotions
      }).merged;

      // 11. Possibility Graph (Registry-based)
      const possibilities = derivePossibilitiesRegistry({ selfId, atoms: atomsAfterEmotions });
      const possAtoms = atomizePossibilities(possibilities);

      const atomsAfterPoss = mergeEpistemicAtoms({
        world: atomsAfterEmotions,
        obs: [],
        belief: [],
        override: [],
        derived: possAtoms
      }).merged;

      return {
          atoms: atomsAfterPoss,
          possibilities,
          accessPack,
          provenance: stage0.provenance,
          rumorBeliefs,
          axesRes 
      };
  };

  // --- Two-Pass Scene Logic ---
  const sceneAtomsA = sceneInst ? applySceneAtoms({ scene: sceneInst, preset: SCENE_PRESETS[sceneInst.presetId], worldTick: tick, selfId }) : [];
  let result = runPipeline(sceneAtomsA, sceneInst);

  if (sceneInst && sc?.presetId) {
      const stepped = stepSceneInstance({ scene: sceneInst, nowTick: tick, atomsForConditions: result.atoms });
      if (stepped.phaseId !== sceneInst.phaseId) {
          sceneInst = stepped;
          const sceneAtomsB = applySceneAtoms({ scene: sceneInst, preset: SCENE_PRESETS[sceneInst.presetId], worldTick: tick, selfId });
          result = runPipeline(sceneAtomsB, sceneInst);
      }
  }

  const finalAtoms = dedupeAtomsById(result.atoms);
  const validation = validateAtoms(finalAtoms, { autofix: true });
  const atomsValidated = validation.fixedAtoms ?? finalAtoms;
  
  const summaries = buildSummaryAtoms(atomsValidated, { selfId });
  const atomsWithSummaries = dedupeAtomsById([...atomsValidated, ...summaries.atoms]).map(normalizeAtom);

  // Compute scoreboard (mind) BEFORE deciding, and materialize it into atoms.
  const contextMind = computeContextMindScoreboard({
    selfId,
    atoms: atomsWithSummaries
  });

  const mindAtoms = atomizeContextMindMetrics(selfId, contextMind);
  const atomsWithMind = dedupeAtomsById([...atomsWithSummaries, ...mindAtoms]).map(normalizeAtom);

  // Decide AFTER mind metrics exist in the atom stream
  const decision = decideAction({
    selfId,
    atoms: atomsWithMind,
    possibilities: result.possibilities,
    topK: 12
  });

  const snapshot = buildContextSnapshot(world, agent, {
      ...opts.snapshotOptions,
      manualAtoms: atomsWithMind
  });
  
  snapshot.coverage = computeCoverageReport(atomsWithMind as any);
  // Drop legacy scene:* atoms in favor of canonical ctx:src:scene:* inputs.
  snapshot.atoms = (atomsWithMind || []).filter(a => !String(a?.id || '').startsWith('scene:'));
  snapshot.validation = validation;
  snapshot.decision = decision; 

  // Synthesize affect from appraisal/emotion mindstate to keep affect axes alive.
  try {
    const fallback = (agentForPipeline as any)?.affect ?? null;
    const synthesized = synthesizeAffectFromMind(contextMind, fallback);
    (agentForPipeline as any).affect = synthesized;
    (snapshot as any).contextMindAffect = synthesized;
    if (contextMind && typeof contextMind === 'object') (contextMind as any).affect = synthesized;
  } catch {}

  snapshot.contextMind = contextMind;
  
  (snapshot as any).debug = {
      legacyAtoms: legacyFrameAtoms,
      axes: result.axesRes,
  };
  (snapshot as any).access = result.accessPack.decisions;
  (snapshot as any).possibilities = result.possibilities;
  (snapshot as any).scene = sceneInst;
  (snapshot as any).epistemic = { provenance: [...Array.from(result.provenance.entries())] };
  (snapshot as any).epistemicGenerated = {
      rumorBeliefs: result.rumorBeliefs.map(a => ({ id: a.id, magnitude: a.magnitude, confidence: a.confidence, source: a.source, label: a.label }))
  };

  const ctxV2 = frame 
      ? buildContextV2FromFrame(frame, world) 
      : { locationType: 'unknown', visibility: 1, noise: 0, panic: 0, nearbyActors: [], alliesCount: 0, enemiesCount: 0, leaderPresent: false, kingPresent: false, authorityConflict: 0, timePressure: 0, scenarioKind: 'routine', cover: 0, exitsNearby: 0, obstacles: 0, groupDensity: 0, hierarchyPressure: 0, structuralDamage: 0 };

  const situation = buildSituationContextForLab(agent, world, frame, snapshot, atomsWithSummaries, ctxV2);

  const planningGoals = getPlanningGoals();
  const plan = computeGoalPriorities(agent, planningGoals, world, { skipBioShift: true }, situation);
  
  const goalPreview = {
    goals: planningGoals
      .map((g, i) => ({
        id: g.id,
        label: g.label,
        priority: plan.priorities[i] ?? 0,
        activation: plan.activations[i] ?? 0,
        base_ctx: plan.debug.b_ctx[i] ?? 0,
      }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 12),
    debug: { temperature: plan.debug.temperature, d_mix: plan.debug.d_mix as any },
  };

  return {
    agent,
    frame,
    snapshot,
    v4Atoms: atomsWithSummaries,
    ctxV2,
    situation,
    goalPreview,
  };
}
