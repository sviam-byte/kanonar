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
import { mergeEpistemicAtoms, mergeKeepingOverrides } from '../context/epistemic/mergeEpistemic';
import { generateRumorBeliefs } from '../context/epistemic/rumorGenerator';
import { buildBeliefToMBias } from '../tom/ctx/beliefBias';
import { applyRelationPriorsToDyads } from '../tom/base/applyRelationPriors';
import { buildTomPolicyLayer } from '../tom/policy/tomPolicy';
import { buildSelfAliases } from '../context/v2/aliases';
import { computeThreatStack } from '../threat/threatStack';
import { derivePossibilitiesRegistry } from '../possibilities/derive';
import { atomizePossibilities } from '../possibilities/atomize';
import { deriveAccess } from '../access/deriveAccess';
import { getLocationForAgent } from "../world/locations";
import { computeLocalMapMetrics } from '../world/mapMetrics';
import { decideAction } from '../decision/decide';
import { deriveActionPriors } from '../decision/actionPriors';
import { computeContextMindScoreboard } from '../contextMind/scoreboard';
import { atomizeContextMindMetrics } from '../contextMind/atomizeMind';
import { deriveSocialProximityAtoms } from '../context/stage1/socialProximity';
import { deriveHazardGeometryAtoms } from '../context/stage1/hazardGeometry';
import { applyCharacterLens } from '../context/lens/characterLens';
import { deriveAppraisalAtoms } from '../emotion/appraisals';
import { deriveEmotionAtoms } from '../emotion/emotions';
import { deriveDyadicEmotionAtoms } from '../emotion/dyadic';

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

/** Stable non-crypto hash -> 32-bit positive int. */
function stableHashInt32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
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
    // IMPORTANT: participants define the closed ToM/affect "scene graph".
    // If GoalLab UI selects a subset of participants, we MUST respect it here,
    // otherwise Stage0 will compute ToM only for a different set and the
    // "everything influences everything" loops will appear broken.
    const participantIds = Array.isArray((opts.snapshotOptions as any)?.participantIds)
      ? (opts.snapshotOptions as any).participantIds
      : (world?.agents || []).map((a: any) => a.entityId || a.id).filter(Boolean);

    sceneInst = createSceneInstance({
      presetId: sc.presetId,
      sceneId: sc.sceneId || `scene_${sc.presetId}`,
      startedAtTick: tick,
      participants: participantIds,
      locationId: (agent as any).locationId || getLocationForAgent(world, selfId)?.entityId,
      metricsOverride: sc.metrics || {},
      normsOverride: sc.norms || {},
      seed: Number.isFinite(sc.seed) ? Number(sc.seed) : undefined
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
      // --- Pipeline stage tracing (S0..Sn) ---
      type PipelineAtomStub = {
        id: string;
        magnitude?: number;
        confidence?: number;
        origin?: any;
        ns?: any;
        kind?: any;
        source?: any;
        label?: any;
        code?: any;
        trace?: { usedAtomIds?: string[]; parts?: any };
      };

      type PipelineStageDelta = {
        id: string;
        label: string;
        baseId?: string;
        atomCount: number;
        full?: PipelineAtomStub[];
        added?: PipelineAtomStub[];
        changed?: PipelineAtomStub[];
        removedIds?: string[];
        notes?: string[];
      };

      const pipelineStages: PipelineStageDelta[] = [];

      const compactAtom = (a: ContextAtom): PipelineAtomStub => {
        const id = String((a as any).id ?? '');
        const stub: PipelineAtomStub = {
          id,
          magnitude: Number((a as any).magnitude ?? 0),
          confidence: Number((a as any).confidence ?? 1),
          origin: (a as any).origin ?? undefined,
          ns: (a as any).ns ?? undefined,
          kind: (a as any).kind ?? undefined,
          source: (a as any).source ?? undefined,
          label: (a as any).label ?? undefined,
          code: (a as any).code ?? undefined,
        };

        const tr = (a as any).trace;
        if (tr) {
          const used = Array.isArray(tr.usedAtomIds) ? tr.usedAtomIds.map(String) : undefined;

          const keepParts =
            stub.ns === 'ctx' || stub.ns === 'lens' || stub.ns === 'tom' ||
            stub.ns === 'emo' || stub.ns === 'app' || stub.ns === 'goal' ||
            stub.ns === 'drv' || stub.ns === 'action';

          stub.trace = {
            usedAtomIds: used,
            parts: keepParts ? tr.parts : undefined,
          };
        }

        return stub;
      };

      const atomSig = (a: ContextAtom) => {
        const tr = (a as any).trace;
        const used = Array.isArray(tr?.usedAtomIds) ? tr.usedAtomIds.length : 0;
        return [
          (a as any).id,
          (a as any).magnitude ?? 0,
          (a as any).confidence ?? 1,
          (a as any).origin ?? '',
          (a as any).ns ?? '',
          (a as any).kind ?? '',
          (a as any).source ?? '',
          used,
        ].join('|');
      };

      let prevStageId: string | undefined = undefined;
      let prevAtoms: ContextAtom[] | null = null;
      let prevMap: Map<string, string> | null = null;

      const pushStage = (
        id: string,
        label: string,
        atoms: ContextAtom[],
        opts?: { notes?: string[] }
      ) => {
        const next = dedupeAtomsById(atoms).map(normalizeAtom);
        const atomCount = next.length;

        if (!prevAtoms || !prevMap) {
          pipelineStages.push({
            id,
            label,
            atomCount,
            full: next.map(compactAtom),
            notes: opts?.notes,
          });
          prevAtoms = next;
          prevMap = new Map(next.map(a => [String((a as any).id), atomSig(a)]));
          prevStageId = id;
          return;
        }

        const curMap = new Map(next.map(a => [String((a as any).id), atomSig(a)]));
        const prevIds = new Set(prevMap.keys());
        const curIds = new Set(curMap.keys());

        const addedIds: string[] = [];
        const removedIds: string[] = [];
        const changedIds: string[] = [];

        for (const id0 of curIds) {
          if (!prevIds.has(id0)) addedIds.push(id0);
          else if (prevMap.get(id0) !== curMap.get(id0)) changedIds.push(id0);
        }
        for (const id0 of prevIds) {
          if (!curIds.has(id0)) removedIds.push(id0);
        }

        const byId = new Map(next.map(a => [String((a as any).id), a]));

        pipelineStages.push({
          id,
          label,
          baseId: prevStageId,
          atomCount,
          added: addedIds.map(id0 => compactAtom(byId.get(id0)!)),
          changed: changedIds.map(id0 => compactAtom(byId.get(id0)!)),
          removedIds,
          notes: opts?.notes,
        });

        prevAtoms = next;
        prevMap = curMap;
        prevStageId = id;
      };

      // Canonical affect atoms (bridge for UI knobs -> threat/goals explanations)
      const affectAtoms = atomizeAffect(
        selfId,
        (agentForPipeline as any).affect,
        affectOverrides && typeof affectOverrides === 'object' && Object.keys(affectOverrides).length > 0 ? 'manual' : 'derived'
      );

      // Map metrics from GoalLab grid (local cell neighborhood).
      // Без этого world:map:* падают в дефолты 0/0.5, и контекст выглядит "не меняется".
      const gridMap = (opts.snapshotOptions as any)?.gridMap || null;
      const pos = (agentForPipeline as any)?.position || (agentForPipeline as any)?.pos || null;
      const mapMetrics = gridMap ? computeLocalMapMetrics(gridMap, pos, 1) : null;

      // 4. Stage 0 (World Facts)
      const stage0 = buildStage0Atoms({
        world: worldForPipeline,
        agent: agentForPipeline,
        selfId,
        mapMetrics: mapMetrics || undefined,
        extraWorldAtoms: [...sceneAtoms, ...affectAtoms],
        beliefAtoms,
        overrideAtoms: appliedOverrides,
        arousal,
        ctxCrowd,
        events: eventsAll,
        sceneSnapshot: sceneSnapshotForStage0
      });
      pushStage('S0', 'S0 • stage0.mergedAtoms (world facts + overrides + events)', stage0.mergedAtoms);

      // Add compatibility aliases (ctx:danger -> ctx:danger:selfId, threat:final -> threat:final:selfId, ...)
      const aliasAtoms = buildSelfAliases(stage0.mergedAtoms, selfId);
      let atomsPreAxes = [...stage0.mergedAtoms, ...aliasAtoms];

      // Социальные proximity-атомы: дружба/вражда рядом из (obs + tom + rel)
      const socProx = deriveSocialProximityAtoms({ selfId, atoms: atomsPreAxes });
      atomsPreAxes = mergeKeepingOverrides(atomsPreAxes, socProx.atoms).merged;

      // Геометрия опасности: расстояния до hazard-клеток и опасность между агентами
      const hazGeo = deriveHazardGeometryAtoms({
        world: worldForPipeline,
        selfId,
        atoms: atomsPreAxes
      });
      atomsPreAxes = mergeKeepingOverrides(atomsPreAxes, hazGeo.atoms).merged;
      pushStage(
        'S0a',
        'S0a • stage0 + aliases + socProx + hazardGeometry (pre-axes)',
        atomsPreAxes
      );

      // 5. Derive Axes
      const axesRes = deriveContextVectors({
          selfId,
          atoms: atomsPreAxes,
          tuning: (frame?.what?.contextTuning || (world.scene as any)?.contextTuning)
      });
      // IMPORTANT: axes must be materialized into the atom stream, otherwise access/threat/goals won't see them.
      const atomsWithAxes = mergeKeepingOverrides(atomsPreAxes, axesRes.atoms).merged;
      pushStage('S1', 'S1 • axes materialized (ctx vectors)', atomsWithAxes);

      // 5.5 Constraints & Access
      const locId = (agentForPipeline as any).locationId || getLocationForAgent(worldForPipeline, selfId)?.entityId;
      const accessPack = deriveAccess(atomsWithAxes, selfId, locId);
      const atomsAfterAccess = mergeKeepingOverrides(atomsWithAxes, accessPack.atoms).merged;
      pushStage('S1a', 'S1a • access constraints', atomsAfterAccess);

      // 6. Rumor Generation
      const seed =
        Number.isFinite((sceneInst as any)?.seed) ? Number((sceneInst as any).seed) :
        Number.isFinite((sceneSnapshotForStage0 as any)?.seed) ? Number((sceneSnapshotForStage0 as any).seed) :
        Number.isFinite((world as any).sceneSnapshot?.seed) ? Number((world as any).sceneSnapshot.seed) :
        stableHashInt32(String((sceneInst as any)?.sceneId ?? (world as any)?.scenarioId ?? 'goal-lab') + '::' + String(selfId));
      const rumorBeliefs = generateRumorBeliefs({
          atomsAfterAxes: atomsAfterAccess,
          selfId,
          tick,
          seed
      });
      const atomsAfterBeliefGen = [...atomsAfterAccess, ...rumorBeliefs];
      pushStage('S1b', 'S1b • rumor beliefs injected', atomsAfterBeliefGen);
      
      // 7. Apply Relation Priors
      const priorsApplied = applyRelationPriorsToDyads(atomsAfterBeliefGen, selfId);
      const atomsAfterPriors = mergeKeepingOverrides(atomsAfterBeliefGen, priorsApplied.atoms).merged;
      pushStage('S2', 'S2 • relation priors applied', atomsAfterPriors);

      // --- Character lens (subjective interpretation) ---
      const lensRes = applyCharacterLens({ selfId, atoms: atomsAfterPriors, agent: agentForPipeline });
      const atomsAfterLens = mergeKeepingOverrides(atomsAfterPriors, lensRes.atoms).merged;
      pushStage(
        'S2a',
        'S2a • character lens (subjective interpretation)',
        atomsAfterLens,
        {
          notes: [
            `lensAdded=${lensRes.atoms?.length ?? 0}`,
            'Delta shows what lens injected/removed vs priors.'
          ]
        }
      );

      // 8. ToM Context Bias
      const biasPack = buildBeliefToMBias(atomsAfterLens, selfId);
      const atomsAfterBias = mergeKeepingOverrides(atomsAfterLens, biasPack.atoms).merged;
      const bias = biasPack.bias;

      const tomCtxDyads: ContextAtom[] = [];
      const dyads = atomsAfterBias.filter(a => a.id.startsWith(`tom:dyad:${selfId}:`));

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
      const atomsAfterCtx = mergeKeepingOverrides(atomsAfterBias, tomCtxDyads).merged;
      const baseDyads = atomsAfterCtx.filter(a => a.id.startsWith(`tom:dyad:${selfId}:`));
      const effectiveDyads: ContextAtom[] = [];
      const getMag = (atoms: ContextAtom[], id: string, fb = 0) => {
        const a = atoms.find(x => x.id === id);
        const m = (a as any)?.magnitude;
        return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
      };

      for (const b of baseDyads) {
        const parts = String(b.id).split(':'); // tom:dyad:self:target:metric
        const target = b.target || parts[3];
        const metric = parts[4];
        if (!target || !metric) continue;

        const base = clamp01(b.magnitude ?? 0);
        let eff = base;
        const usedIds: string[] = [b.id];

        if (metric === 'trust' || metric === 'threat') {
          const ctxId = `tom:dyad:${selfId}:${target}:${metric}_ctx`;
          const ctx = atomsAfterCtx.find(a => a.id === ctxId);
          if (ctx) {
            eff = clamp01(ctx.magnitude ?? base);
            usedIds.push(ctxId);
          }
        }

        if (metric === 'support') {
          const baseThreat = getMag(atomsAfterCtx, `tom:dyad:${selfId}:${target}:threat`, 0);
          const effThreat = getMag(atomsAfterCtx, `tom:dyad:${selfId}:${target}:threat_ctx`, baseThreat);
          const denom = Math.max(1e-6, 1 - clamp01(baseThreat));
          const factor = clamp01((1 - clamp01(effThreat)) / denom);
          eff = clamp01(base * factor);
          usedIds.push(`tom:dyad:${selfId}:${target}:threat`, `tom:dyad:${selfId}:${target}:threat_ctx`);
        }

        effectiveDyads.push(normalizeAtom({
          id: `tom:effective:dyad:${selfId}:${target}:${metric}`,
          ns: 'tom',
          kind: 'tom_dyad_metric',
          origin: 'derived',
          source: 'tom_effective',
          magnitude: eff,
          confidence: 1,
          subject: selfId,
          target,
          tags: ['tom', 'effective', 'dyad', metric],
          label: `${metric}_eff:${Math.round(eff * 100)}%`,
          trace: {
            usedAtomIds: Array.from(new Set(usedIds.filter(Boolean))),
            notes: ['effective dyad metric'],
            parts: { base, eff }
          }
        } as any));
      }

      // 8.x ToM Policy layer (mode + predictions + attitude + help + affordances)
      const tomPolicyPack = buildTomPolicyLayer(
        [...atomsAfterCtx, ...effectiveDyads],
        selfId
      );

      // 8.y Action priors (base probabilities), reusable outside GoalLab UI
      const otherIdsForPriors = Array.from(new Set(
        atomsAfterBias
          .filter(a => String(a.id).startsWith(`tom:dyad:${selfId}:`))
          .map(a => String(a.id).split(':')[3] || a.target)
          .filter(Boolean)
      )) as string[];

      const actionPriorAtoms = deriveActionPriors({ selfId, otherIds: otherIdsForPriors, atoms: [
        ...atomsAfterBias,
        ...tomCtxDyads,
        ...effectiveDyads,
        ...tomPolicyPack.atoms
      ]});

      // 9. Threat Stack
      const atomsForThreat = [
        ...atomsAfterBias,
        ...tomCtxDyads,
        ...effectiveDyads,
        ...tomPolicyPack.atoms,
        ...actionPriorAtoms
      ];
      const getMagThreat = (id: string, fb = 0) => {
        const a = atomsForThreat.find(x => x.id === id);
        const m = (a as any)?.magnitude;
        return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
      };
      const firstByPrefix = (prefix: string) =>
        atomsForThreat.find(a => String((a as any)?.id || '').startsWith(prefix))?.id || null;

        const ctxDanger = getMagThreat(`ctx:danger:${selfId}`, 0);
        const coverId = firstByPrefix(`world:map:cover:${selfId}`) || firstByPrefix(`ctx:cover:${selfId}`) || null;

        const cover = coverId ? getMagThreat(coverId, 0.5) : 0.5;

      const crowd =
        getMagThreat(`ctx:crowd:${selfId}`, 0) ||
        getMagThreat(`world:loc:crowd:${selfId}`, 0);

      const hierarchy =
        getMagThreat(`ctx:hierarchy:${selfId}`, 0) ||
        getMagThreat(`world:loc:control:${selfId}`, 0);

      const surveillance =
        getMagThreat(`ctx:surveillance:${selfId}`, 0);

      const timePressure =
        getMagThreat(`ctx:timePressure:${selfId}`, 0);

      const scarcity =
        getMagThreat(`ctx:scarcity:${selfId}`, 0);

      const woundedPressure =
        getMagThreat(`ctx:wounded:${selfId}`, 0) ||
        getMagThreat(`ctx:careNeed:${selfId}`, 0);

      // ToM proximity summary (cheap proxy): top effective dyads
      const effTrust = atomsForThreat
        .filter(a => String(a.id).startsWith(`tom:effective:dyad:${selfId}:`) && String(a.id).endsWith(`:trust`))
        .map(a => Number((a as any).magnitude ?? 0))
        .sort((a, b) => b - a)
        .slice(0, 5);

      const effThreat = atomsForThreat
        .filter(a => String(a.id).startsWith(`tom:effective:dyad:${selfId}:`) && String(a.id).endsWith(`:threat`))
        .map(a => Number((a as any).magnitude ?? 0))
        .sort((a, b) => b - a)
        .slice(0, 5);

      const nearbyTrustMean = effTrust.length ? effTrust.reduce((s, v) => s + v, 0) / effTrust.length : 0.45;
      const nearbyHostileMean = effThreat.length ? effThreat.reduce((s, v) => s + v, 0) / effThreat.length : 0;

      const nearbyCount = Math.max(0, (worldForPipeline?.agents?.length ?? 1) - 1);

      const threatInputs = {
        envDanger: ctxDanger,
        visibilityBad: 0,
        coverLack: Math.max(0, 1 - cover),
        crowding: crowd,

        nearbyCount,
        nearbyTrustMean,
        nearbyHostileMean,

        hierarchyPressure: hierarchy,
        surveillance,

        timePressure,
        woundedPressure,
        goalBlock: Math.max(timePressure, scarcity),

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

      const atomsAfterThreat = mergeKeepingOverrides(atomsForThreat, [...threatAtoms, threatAtom]).merged;

      // --- CLOSE THE LOOP: social proximity must see final ToM/rel/effective layers ---
      // We derive proximity again *after* ToM effective metrics + policy + priors have been materialized,
      // so that appraisal/emotion react to "trusted ally nearby" / "threatening other nearby" in a
      // character-specific way.
      const socProxPostTom = deriveSocialProximityAtoms({ selfId, atoms: atomsAfterThreat });
      const atomsAfterSocialLoop = mergeKeepingOverrides(atomsAfterThreat, socProxPostTom.atoms).merged;
      pushStage(
        'S2b',
        'S2b • ToM ctx/effective/policy + threat + social loop closed',
        atomsAfterSocialLoop
      );

      // appraisal -> emotions -> dyadic emotions
      const appRes = deriveAppraisalAtoms({ selfId, atoms: atomsAfterSocialLoop, agent: agentForPipeline });
      const atomsAfterApp = mergeKeepingOverrides(atomsAfterSocialLoop, appRes.atoms).merged;
      const emoRes = deriveEmotionAtoms({ selfId, atoms: atomsAfterApp });
      const atomsAfterEmo = mergeKeepingOverrides(atomsAfterApp, emoRes.atoms).merged;
      const dyadEmo = deriveDyadicEmotionAtoms({ selfId, atoms: atomsAfterEmo });
      const atomsAfterDyadEmo = mergeKeepingOverrides(atomsAfterEmo, dyadEmo.atoms).merged;
      pushStage('S3', 'S3 • appraisal + emotions + dyadic emotions', atomsAfterDyadEmo);

      // 10. Possibility Graph (Registry-based)
      const atomsForPossibilities = atomsAfterDyadEmo;
      const possibilities = derivePossibilitiesRegistry({ selfId, atoms: atomsForPossibilities });
      const possAtoms = atomizePossibilities(possibilities);

      const atomsAfterPoss = mergeKeepingOverrides(atomsForPossibilities, possAtoms).merged;
      pushStage('S3a', 'S3a • possibilities materialized', atomsAfterPoss);

      return {
          atoms: atomsAfterPoss,
          possibilities,
          accessPack,
          provenance: stage0.provenance,
          rumorBeliefs,
          axesRes,
          pipelineStages
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

  const postOverrides = (appliedOverrides || []).filter(a => {
    const id = String((a as any)?.id || '');
    return id.startsWith('emo:') || id.startsWith('app:');
  });

  const atomsForMind = dedupeAtomsById([...atomsWithSummaries, ...postOverrides]).map(normalizeAtom);

  // Compute scoreboard (mind) BEFORE deciding, and materialize it into atoms.
  const contextMind = computeContextMindScoreboard({
    selfId,
    atoms: atomsForMind
  });

  const mindAtoms = atomizeContextMindMetrics(selfId, contextMind);
  const atomsWithMind = dedupeAtomsById([...atomsForMind, ...mindAtoms]).map(normalizeAtom);

  type PipelineAtomStub = {
    id: string;
    magnitude?: number;
    confidence?: number;
    origin?: any;
    ns?: any;
    kind?: any;
    source?: any;
    label?: any;
    code?: any;
    trace?: { usedAtomIds?: string[]; parts?: any };
  };

  type PipelineStageDelta = {
    id: string;
    label: string;
    baseId?: string;
    atomCount: number;
    full?: PipelineAtomStub[];
    added?: PipelineAtomStub[];
    changed?: PipelineAtomStub[];
    removedIds?: string[];
    notes?: string[];
  };

  const compactPipelineAtom = (a: ContextAtom): PipelineAtomStub => {
    const id = String((a as any).id ?? '');
    const stub: PipelineAtomStub = {
      id,
      magnitude: Number((a as any).magnitude ?? 0),
      confidence: Number((a as any).confidence ?? 1),
      origin: (a as any).origin ?? undefined,
      ns: (a as any).ns ?? undefined,
      kind: (a as any).kind ?? undefined,
      source: (a as any).source ?? undefined,
      label: (a as any).label ?? undefined,
      code: (a as any).code ?? undefined,
    };

    const tr = (a as any).trace;
    if (tr) {
      const used = Array.isArray(tr.usedAtomIds) ? tr.usedAtomIds.map(String) : undefined;
      const keepParts =
        stub.ns === 'ctx' || stub.ns === 'lens' || stub.ns === 'tom' ||
        stub.ns === 'emo' || stub.ns === 'app' || stub.ns === 'goal' ||
        stub.ns === 'drv' || stub.ns === 'action';

      stub.trace = {
        usedAtomIds: used,
        parts: keepParts ? tr.parts : undefined,
      };
    }

    return stub;
  };

  const pipelineAtomSig = (a: ContextAtom) => {
    const tr = (a as any).trace;
    const used = Array.isArray(tr?.usedAtomIds) ? tr.usedAtomIds.length : 0;
    return [
      (a as any).id,
      (a as any).magnitude ?? 0,
      (a as any).confidence ?? 1,
      (a as any).origin ?? '',
      (a as any).ns ?? '',
      (a as any).kind ?? '',
      (a as any).source ?? '',
      used,
    ].join('|');
  };

  const buildDeltaStage = (
    id: string,
    label: string,
    atoms: ContextAtom[],
    prevAtoms: ContextAtom[],
    prevStageId?: string,
    opts?: { notes?: string[] }
  ): PipelineStageDelta => {
    const next = dedupeAtomsById(atoms).map(normalizeAtom);
    const atomCount = next.length;
    const prevMap = new Map(dedupeAtomsById(prevAtoms).map(a => [String((a as any).id), pipelineAtomSig(a)]));
    const curMap = new Map(next.map(a => [String((a as any).id), pipelineAtomSig(a)]));
    const prevIds = new Set(prevMap.keys());
    const curIds = new Set(curMap.keys());

    const addedIds: string[] = [];
    const removedIds: string[] = [];
    const changedIds: string[] = [];

    for (const id0 of curIds) {
      if (!prevIds.has(id0)) addedIds.push(id0);
      else if (prevMap.get(id0) !== curMap.get(id0)) changedIds.push(id0);
    }
    for (const id0 of prevIds) {
      if (!curIds.has(id0)) removedIds.push(id0);
    }

    const byId = new Map(next.map(a => [String((a as any).id), a]));

    return {
      id,
      label,
      baseId: prevStageId,
      atomCount,
      added: addedIds.map(id0 => compactPipelineAtom(byId.get(id0)!)),
      changed: changedIds.map(id0 => compactPipelineAtom(byId.get(id0)!)),
      removedIds,
      notes: opts?.notes,
    };
  };

  const tracedPipeline = Array.isArray((result as any).pipelineStages) ? (result as any).pipelineStages : [];
  const pipelineAll = [...tracedPipeline];

  const s4Stage = buildDeltaStage(
    'S4',
    'S4 • contextMind metrics materialized',
    atomsWithMind,
    result.atoms,
    pipelineAll[pipelineAll.length - 1]?.id
  );
  pipelineAll.push(s4Stage);

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

    // IMPORTANT: materialize synthesized affect back into atoms so export/import sees non-zero affect.
    const synthesizedAffectAtoms = atomizeAffect(selfId, synthesized, 'derived');
    if (Array.isArray(synthesizedAffectAtoms) && synthesizedAffectAtoms.length) {
      // remove stale affect:* (usually coming from agent.affect==0) and replace with synthesized
      const withoutAffect = (snapshot.atoms || []).filter(
        (a: any) => !String(a?.id || '').startsWith('affect:')
      );
      snapshot.atoms = dedupeAtomsById([...withoutAffect, ...synthesizedAffectAtoms])
        .map(normalizeAtom)
        .filter((a: any) => !String(a?.id || '').startsWith('scene:'));
      snapshot.coverage = computeCoverageReport(snapshot.atoms as any);
    }
  } catch {}

  snapshot.contextMind = contextMind;

  pipelineAll.push(buildDeltaStage(
    'S5',
    'S5 • final snapshot.atoms (export truth)',
    snapshot.atoms || [],
    atomsWithMind,
    s4Stage.id
  ));

  (snapshot as any).meta = {
    ...((snapshot as any).meta || {}),
    pipelineDeltas: pipelineAll,
  };
  
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
