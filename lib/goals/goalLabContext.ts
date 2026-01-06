import { WorldState, AgentState, ContextV2 } from '../../types';
import { ContextSnapshot, ContextAtom } from '../context/v2/types';
import { ContextBuildOptions, buildContextSnapshot } from '../context/v2/builder';
import { AgentContextFrame } from '../context/frame/types';
import { buildFullAgentContextFrame } from '../context/v4/build';
import { atomizeFrame } from '../context/v4/atomizeFrame';
import { buildContextV2FromFrame } from './context-v2';
import { SituationContext } from '../types-goals';
import { normalizeAtom } from '../context/v2/infer';
import {
  applyAtomOverrides,
  AtomOverrideLayer,
  applyAtomOverrides as extractApplied,
} from '../context/overrides/types';
import { validateAtoms } from '../context/validate/frameValidator';
import { buildSummaryAtoms } from '../context/summaries/buildSummaries';
import { computeCoverageReport } from '../goal-lab/coverage/computeCoverage';
import { normalizeAffectState } from '../affect/normalize';
import { atomizeAffect } from '../affect/atomize';
import { synthesizeAffectFromMind } from '../affect/synthesizeFromMind';

// New Imports for Pipeline
import { buildStage0Atoms } from '../context/pipeline/stage0';
import { deriveAxes, deriveContextVectors } from '../context/axes/deriveAxes';
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
import { getLocationForAgent } from '../world/locations';
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
import { deriveDriversAtoms } from '../drivers/deriveDrivers';
import { deriveGoalAtoms } from './goalAtoms';
import { derivePlanningGoalAtoms } from './planningGoalAtoms';
import { deriveGoalActionLinkAtoms } from './goalActionLinksAtoms';
import { deriveRelFinalAtoms } from '../relations/finalize';
import { deriveSummaryAtoms } from '../context/summary';
import { arr } from '../utils/arr';
import { validateAtomInvariants } from '../context/validate/atomInvariants';
import { deriveLensCtxAtoms } from '../context/v2/lens';
import { computeSnapshotSummary } from '../goal-lab/snapshotSummary';
import { adaptToWorldEvents } from '../events/adaptToWorldEvents';
import { updateRelationshipGraphFromEvents } from '../relations/updateFromEvents';

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
    debug: Record<string, any>;
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

function dedupeAtomsById(arr0: ContextAtom[]): ContextAtom[] {
  const seen = new Set<string>();
  const out: ContextAtom[] = [];
  for (let i = arr0.length - 1; i >= 0; i--) {
    const a = arr0[i];
    if (!a || !(a as any).id) continue;
    const id = String((a as any).id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.unshift(a);
  }
  return out;
}

function sortAtomsDeterministic(atoms: ContextAtom[]): ContextAtom[] {
  // Deterministic ordering is critical for debugs/exports/diffs.
  // Keep it stable across runs and independent from merge insertion order.
  const rank: Record<string, number> = {
    world: 1,
    obs: 2,
    belief: 3,
    derived: 4,
    override: 5,
  };
  return [...(atoms || [])].sort((a: any, b: any) => {
    const ra = rank[String(a?.origin || '')] ?? 9;
    const rb = rank[String(b?.origin || '')] ?? 9;
    if (ra !== rb) return ra - rb;
    const nsa = String(a?.ns || '');
    const nsb = String(b?.ns || '');
    if (nsa !== nsb) return nsa.localeCompare(nsb);
    const ka = String(a?.kind || '');
    const kb = String(b?.kind || '');
    if (ka !== kb) return ka.localeCompare(kb);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function buildSituationContextForLab(
  agent: AgentState,
  world: WorldState,
  frame: AgentContextFrame | null,
  snapshot: ContextSnapshot,
  v4Atoms: ContextAtom[],
  ctxV2: ContextV2
): SituationContext {
  const tags = new Set<string>((frame?.where?.locationTags ?? []) as any);

  const isPrivate = tags.has('private');
  const isFormal = tags.has('formal') || (ctxV2 as any).scenarioKind === 'strategic_council';

  const threatLevel =
    (typeof (snapshot.domains as any)?.danger === 'number' ? (snapshot.domains as any).danger : undefined) ??
    (typeof (frame?.derived as any)?.threatIndex === 'number' ? (frame?.derived as any).threatIndex : 0);

  const timePressure =
    (typeof (snapshot.summary as any)?.timePressure === 'number' ? (snapshot.summary as any).timePressure : undefined) ??
    (v4Atoms.find(a => (a as any).kind === 'time_pressure')?.magnitude ?? 0);

  const woundedPresent = v4Atoms.some(
    a => (a as any).kind === 'care_need' || (a as any).kind === 'wounded_scene' || (a as any).kind === 'wounded'
  );

  let scenarioKind: any = (ctxV2 as any).scenarioKind || 'other';
  if (!scenarioKind || scenarioKind === 'routine') {
    const sId = (world as any).scenario?.id || '';
    if (sId.includes('council')) scenarioKind = 'strategic_council';
    else if (sId.includes('rescue') || sId.includes('evac')) scenarioKind = 'fight_escape';
    else if (sId.includes('training')) scenarioKind = 'patrol';
    else if (isPrivate) scenarioKind = 'domestic_scene';
  }

  const crowdSize = (frame?.what?.nearbyAgents?.length ?? 0) + 1;

  const leaderId = (world as any).leadership?.currentLeaderId;
  const leaderPresent =
    !!leaderId &&
    (leaderId === (agent as any).entityId || (frame?.what?.nearbyAgents ?? []).some(a => (a as any)?.id === leaderId));

  return {
    scenarioKind,
    stage: (world as any).scene?.currentPhaseId || 'default',
    threatLevel: Math.max(0, Math.min(1, threatLevel)),
    timePressure: Math.max(0, Math.min(1, timePressure)),
    woundedPresent: woundedPresent ? 1.0 : 0.0,
    leaderPresent,
    isFormal,
    isPrivate,
    crowdSize,
    roleId: (agent as any).effectiveRole || 'any',
    z: {},
    affect: (agent as any).affect,
  } as any;
}

export function buildGoalLabContext(
  world: WorldState,
  agentId: string,
  opts: {
    snapshotOptions?: ContextBuildOptions & {
      atomOverridesLayer?: AtomOverrideLayer;
      overrideEvents?: any[];
      sceneControl?: any;
      affectOverrides?: any;
    };
    timeOverride?: number;
    devValidateAtoms?: boolean;
  } = {}
): GoalLabContextResult | null {
  let agent = (world as any).agents.find((a: any) => a.entityId === agentId);
  if (!agent) return null;

  // 1. Build Frame (Legacy / Visuals only)
  const frame = buildFullAgentContextFrame(world, agentId, undefined, { persistAffect: false });

  // Atomize frame for debug purposes (legacy logic) - DO NOT USE FOR TRUTH
  const t = opts.timeOverride ?? (world as any).tick ?? 0;
  const legacyFrameAtoms = frame ? atomizeFrame(frame, t, world).map(normalizeAtom) : [];

  // --- Merge selected legacy atoms into snapshot atoms for UI/debug panels ---
  // Reason: legacyFrameAtoms include soc_acq_* (recognition) + rel:* labels, but snapshot.atoms previously omitted them.
  const legacyUiAtoms = (legacyFrameAtoms || []).filter(a => {
    const id = String((a as any)?.id || '');
    const ns = String((a as any)?.ns || '');
    const kind = String((a as any)?.kind || '');

    // Recognition / identification atoms.
    if (ns === 'soc' && (kind.startsWith('soc_acq_') || kind === 'soc_identify_as')) return true;

    // Relation label atoms (and similar).
    if (id.startsWith('rel:')) return true;

    return false;
  });

  // 3. Prepare Override Atoms (GoalLab Manual)
  const overridesLayer = opts.snapshotOptions?.atomOverridesLayer;
  const manualAtomsRaw = arr((opts.snapshotOptions as any)?.manualAtoms).map(normalizeAtom);
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
  const beliefAtoms = [...(((agent as any).memory?.beliefAtoms as any[]) || [])];

  // Events
  const tick = (world as any)?.tick ?? 0;
  const worldEvents = (world as any)?.eventLog?.events || [];
  const overrideEvents = (opts.snapshotOptions as any)?.overrideEvents || [];
  const eventsAllRaw = [...overrideEvents, ...worldEvents];
  const eventsAll = adaptToWorldEvents({ events: eventsAllRaw, fallbackTick: tick });

  const selfId = (agent as any).entityId;
  const arousal = (agent as any).affect?.arousal ?? 0;

  // Crowd atom for stage 0 input (optional)
  const ctxCrowdAtom = legacyFrameAtoms.find(a => (a as any).id === 'soc_crowd_density' || (a as any).kind === 'crowding_pressure');
  const ctxCrowd = ctxCrowdAtom ? (ctxCrowdAtom as any).magnitude : 0;

  // --- SCENE ENGINE INTEGRATION ---
  const sc = (opts.snapshotOptions as any)?.sceneControl;
  let sceneInst: any = null;

  if (sc?.presetId) {
    // participants define the closed ToM/affect "scene graph"
    const participantIds = Array.isArray((opts.snapshotOptions as any)?.participantIds)
      ? (opts.snapshotOptions as any).participantIds
      : arr((world as any)?.agents).map((a: any) => a.entityId || a.id).filter(Boolean);

    sceneInst = createSceneInstance({
      presetId: sc.presetId,
      sceneId: sc.sceneId || `scene_${sc.presetId}`,
      startedAtTick: tick,
      participants: participantIds,
      locationId: (agent as any).locationId || getLocationForAgent(world, selfId)?.entityId,
      metricsOverride: sc.metrics || {},
      normsOverride: sc.norms || {},
      seed: Number.isFinite(sc.seed) ? Number(sc.seed) : undefined,
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
  const overrideLocation = (opts.snapshotOptions as any)?.overrideLocation as any;
  let worldForPipeline: any = world;
  let agentForPipeline: any = agent;

  // Ensure relation graph reflects the same event stream that Stage0 sees.
  try {
    const selfId2 = String((agentForPipeline as any)?.entityId ?? agentId);
    const baseGraph =
      (agentForPipeline as any)?.relations?.graph ||
      (agentForPipeline as any)?.rel_graph ||
      { schemaVersion: 1, edges: [] };
    const updated = updateRelationshipGraphFromEvents({
      graph: baseGraph,
      selfId: selfId2,
      events: eventsAll as any,
      nowTick: tick,
    });
    agentForPipeline = {
      ...(agentForPipeline as any),
      relations: { ...((agentForPipeline as any).relations || {}), graph: updated.graph },
      rel_graph: updated.graph,
    };
  } catch (e) {
    // Non-fatal; keep the base graph if normalization or update fails.
  }

  if (overrideLocation) {
    const locIdOverride = typeof overrideLocation === 'string' ? overrideLocation : overrideLocation.entityId;
    if (locIdOverride) {
      agentForPipeline = { ...agentForPipeline, locationId: locIdOverride };

      if (typeof overrideLocation === 'object' && overrideLocation.entityId) {
        const existing = arr(worldForPipeline.locations).find((l: any) => l.entityId === overrideLocation.entityId);
        const nextLocs = existing
          ? arr(worldForPipeline.locations).map((l: any) => (l.entityId === overrideLocation.entityId ? overrideLocation : l))
          : [...arr(worldForPipeline.locations), overrideLocation];
        worldForPipeline = { ...worldForPipeline, locations: nextLocs };
      }

      if (sceneInst && typeof sceneInst === 'object') {
        sceneInst = { ...sceneInst, locationId: locIdOverride };
      }
    }
  }

  // --- Pipeline Execution Helper ---
  const runPipeline = (sceneAtoms: ContextAtom[], sceneSnapshotForStage0: any) => {
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
      meta?: any;
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
          stub.ns === 'ctx' ||
          stub.ns === 'lens' ||
          stub.ns === 'tom' ||
          stub.ns === 'emo' ||
          stub.ns === 'app' ||
          stub.ns === 'goal' ||
          stub.ns === 'drv' ||
          stub.ns === 'action';

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

    const pushStage = (id: string, label: string, atoms: ContextAtom[], o?: { notes?: string[]; meta?: any }) => {
      const next = dedupeAtomsById(atoms).map(normalizeAtom);

      if (!prevAtoms || !prevMap) {
        pipelineStages.push({
          id,
          label,
          atomCount: next.length,
          full: next.map(compactAtom),
          notes: o?.notes,
          meta: o?.meta,
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
        atomCount: next.length,
        added: addedIds.map(id0 => compactAtom(byId.get(id0)!)),
        changed: changedIds.map(id0 => compactAtom(byId.get(id0)!)),
        removedIds,
        notes: o?.notes,
        meta: o?.meta,
      });

      prevAtoms = next;
      prevMap = curMap;
      prevStageId = id;
    };

    // Canonical affect atoms
    const affectAtoms = atomizeAffect(
      selfId,
      (agentForPipeline as any).affect,
      affectOverrides && typeof affectOverrides === 'object' && Object.keys(affectOverrides).length > 0 ? 'manual' : 'derived'
    );

    // Map metrics from GoalLab grid
    const gridMap = (opts.snapshotOptions as any)?.gridMap || null;
    const pos = (agentForPipeline as any)?.position || (agentForPipeline as any)?.pos || null;
    const mapMetrics = gridMap ? computeLocalMapMetrics(gridMap, pos, 1) : null;
    const participantIdsAll = Array.from(
      new Set(
        arr(
          (sceneSnapshotForStage0 as any)?.participants ||
            (sceneInst as any)?.participants ||
            (opts.snapshotOptions as any)?.participantIds ||
            arr((worldForPipeline as any)?.agents).map((a: any) => a.entityId || a.id)
        ).filter(Boolean)
      )
    );

    // Stage 0 (World Facts)
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
      sceneSnapshot: sceneSnapshotForStage0,
      includeAxes: false,
    });
    pushStage('S0', 'S0 • stage0.mergedAtoms (world facts + overrides + events)', stage0.mergedAtoms);

    // Aliases
    const aliasAtoms = buildSelfAliases(stage0.mergedAtoms, selfId);
    let atomsPreAxes = [...stage0.mergedAtoms, ...aliasAtoms];

    // Social proximity pre
    const socProx = deriveSocialProximityAtoms({ selfId, atoms: atomsPreAxes });
    atomsPreAxes = mergeKeepingOverrides(atomsPreAxes, socProx.atoms).merged;

    // Hazard geometry
    const hazGeo = deriveHazardGeometryAtoms({ world: worldForPipeline, selfId, atoms: atomsPreAxes });
    atomsPreAxes = mergeKeepingOverrides(atomsPreAxes, hazGeo.atoms).merged;
    pushStage('S0a', 'S0a • stage0 + aliases + socProx + hazardGeometry (pre-axes)', atomsPreAxes);

    // Axes (strict staging): derive base ctx axes from canonical atoms, then apply optional tuning overlays.
    const tuning = (frame?.what as any)?.contextTuning || (world as any).scene?.contextTuning;

    const axesBase = deriveAxes({ selfId, atoms: atomsPreAxes, tuning });
    const atomsWithAxesBase = mergeKeepingOverrides(atomsPreAxes, axesBase.atoms).merged;
    pushStage('S1', 'S1 • axes derived (ctx:* base)', atomsWithAxesBase, {
      meta: { derivedAxes: axesBase.atoms.length },
    });

    const axesRes = deriveContextVectors({ selfId, atoms: atomsWithAxesBase, tuning });
    const atomsWithAxes = mergeKeepingOverrides(atomsWithAxesBase, axesRes.atoms).merged;
    pushStage('S1t', 'S1t • axes tuning overlays (ctx vectors)', atomsWithAxes, {
      meta: (axesRes as any).meta,
    });

    // Access constraints
    const locId = (agentForPipeline as any).locationId || getLocationForAgent(worldForPipeline, selfId)?.entityId;
    const accessPack = deriveAccess(atomsWithAxes, selfId, locId);
    const atomsAfterAccess = mergeKeepingOverrides(atomsWithAxes, accessPack.atoms).merged;
    pushStage('S1a', 'S1a • access constraints', atomsAfterAccess);

    // Rumors
    const seed =
      Number.isFinite((sceneInst as any)?.seed) ? Number((sceneInst as any).seed) :
      Number.isFinite((sceneSnapshotForStage0 as any)?.seed) ? Number((sceneSnapshotForStage0 as any).seed) :
      Number.isFinite((world as any).sceneSnapshot?.seed) ? Number((world as any).sceneSnapshot.seed) :
      stableHashInt32(String((sceneInst as any)?.sceneId ?? (world as any)?.scenarioId ?? 'goal-lab') + '::' + String(selfId));

    const rumorBeliefs = generateRumorBeliefs({ atomsAfterAxes: atomsAfterAccess, selfId, tick, seed });
    const atomsAfterBeliefGen = [...atomsAfterAccess, ...rumorBeliefs];
    pushStage('S1b', 'S1b • rumor beliefs injected', atomsAfterBeliefGen);

    // Relation priors
    const priorsApplied = applyRelationPriorsToDyads(atomsAfterBeliefGen, selfId);
    const atomsAfterPriors = mergeKeepingOverrides(atomsAfterBeliefGen, priorsApplied.atoms).merged;
    pushStage('S2', 'S2 • relation priors applied', atomsAfterPriors);

    // Canonical relations: rel:final:* (single source for decision/UI)
    const relFinal = deriveRelFinalAtoms({
      selfId,
      atoms: atomsAfterPriors,
      participantIds: participantIdsAll,
      wState: 0.55,
      wTom: 0.45,
    });
    const atomsAfterRelFinal = mergeKeepingOverrides(atomsAfterPriors, relFinal.atoms).merged;
    pushStage('S2f', 'S2f • rel:final materialized (mix rel:state + tom:effective)', atomsAfterRelFinal);

    // Character lens
    const lensRes = applyCharacterLens({ selfId, atoms: atomsAfterRelFinal, agent: agentForPipeline });
    const atomsAfterLens = mergeKeepingOverrides(atomsAfterRelFinal, lensRes.atoms).merged;
    pushStage('S2a', 'S2a • character lens (subjective interpretation)', atomsAfterLens, {
      notes: [`lensAdded=${lensRes.atoms?.length ?? 0}`, 'Delta shows what lens injected/removed vs priors.'],
    });

    if (opts?.devValidateAtoms) {
      const violations = validateAtomInvariants(atomsAfterLens);
      const errors = violations.filter(v => (v as any).level === 'error');
      pushStage('VALIDATE', 'VALIDATE • atom invariants', atomsAfterLens, {
        notes: [`violations=${violations.length}`, errors.length ? `errors=${errors.length}` : 'errors=0'],
        meta: { violations },
      });
      if (errors.length) throw new Error(`Atom invariant violations: ${(errors[0] as any).msg}`);
    }

    // ToM ctx bias
    const biasPack = buildBeliefToMBias(atomsAfterLens, selfId);
    const atomsAfterBias = mergeKeepingOverrides(atomsAfterLens, biasPack.atoms).merged;
    const bias = (biasPack as any).bias;

    const tomCtxDyads: ContextAtom[] = [];

    const dyadEntries = (() => {
      const entries = atomsAfterBias.filter(a => String((a as any).id).startsWith('tom:dyad:'));
      const map = new Map<string, ContextAtom>(); // key = target|metric ; value = chosen atom
      for (const a of entries) {
        const id = String((a as any).id);
        const parts = id.split(':');

        let isFinal = false;
        let s = '';
        let t2 = '';
        let m = '';

        if (parts[2] === 'final') {
          isFinal = true;
          s = parts[3] || '';
          t2 = parts[4] || '';
          m = parts[5] || '';
        } else {
          s = parts[2] || '';
          t2 = parts[3] || '';
          m = parts[4] || '';
        }
        if (s !== selfId || !t2 || !m) continue;

        const key = `${t2}::${m}`;
        const prev = map.get(key);
        if (!prev) map.set(key, a);
        else {
          const prevIsFinal = String((prev as any).id).split(':')[2] === 'final';
          if (isFinal && !prevIsFinal) map.set(key, a);
        }
      }

      const out: Array<{ target: string; metric: string; atom: ContextAtom }> = [];
      for (const [key, atom] of map.entries()) {
        const [t3, m2] = key.split('::');
        out.push({ target: t3, metric: m2, atom });
      }
      return out;
    })();

    for (const e of dyadEntries) {
      const a = e.atom;
      const target = e.target;

      if (e.metric === 'trust') {
        const trust = clamp01((a as any).magnitude ?? 0);
        const trust2 = clamp01(trust * (1 - 0.6 * bias));
        tomCtxDyads.push(
          normalizeAtom({
            id: `tom:dyad:${selfId}:${target}:trust_ctx`,
            kind: 'tom_dyad_metric',
            ns: 'tom',
            origin: 'derived',
            source: 'tom_ctx',
            magnitude: trust2,
            confidence: 1,
            tags: ['tom', 'ctx'],
            subject: selfId,
            target,
            label: `trust_ctx:${Math.round(trust2 * 100)}%`,
            trace: {
              usedAtomIds: [String((a as any).id), `tom:ctx:bias:${selfId}`],
              notes: ['trust adjusted by ctx bias'],
              parts: { trust, bias, baseId: String((a as any).id) },
            },
          } as any)
        );
      }

      if (e.metric === 'threat') {
        const thr = clamp01((a as any).magnitude ?? 0);
        const thr2 = clamp01(thr + 0.6 * bias * (1 - thr));
        tomCtxDyads.push(
          normalizeAtom({
            id: `tom:dyad:${selfId}:${target}:threat_ctx`,
            kind: 'tom_dyad_metric',
            ns: 'tom',
            origin: 'derived',
            source: 'tom_ctx',
            magnitude: thr2,
            confidence: 1,
            tags: ['tom', 'ctx'],
            subject: selfId,
            target,
            label: `threat_ctx:${Math.round(thr2 * 100)}%`,
            trace: {
              usedAtomIds: [String((a as any).id), `tom:ctx:bias:${selfId}`],
              notes: ['threat adjusted by ctx bias'],
              parts: { thr, bias, baseId: String((a as any).id) },
            },
          } as any)
        );
      }
    }

    // Effective dyads
    const atomsAfterCtx = mergeKeepingOverrides(atomsAfterBias, tomCtxDyads).merged;
    const effectiveDyads: ContextAtom[] = [];

    const getMag = (atoms: ContextAtom[], id: string, fb = 0) => {
      const a = atoms.find(x => String((x as any).id) === id);
      const m = (a as any)?.magnitude;
      return typeof m === 'number' && Number.isFinite(m) ? m : fb;
    };

    for (const e of dyadEntries) {
      const target = e.target;
      const metric = e.metric;
      const baseAtom = e.atom;

      const base = clamp01((baseAtom as any).magnitude ?? 0);
      let eff = base;
      const usedIds: string[] = [String((baseAtom as any).id)];

      if (metric === 'trust' || metric === 'threat') {
        const ctxId = `tom:dyad:${selfId}:${target}:${metric}_ctx`;
        const ctx = atomsAfterCtx.find(a => String((a as any).id) === ctxId);
        if (ctx) {
          eff = clamp01((ctx as any).magnitude ?? base);
          usedIds.push(ctxId);
        }
      }

      if (metric === 'support') {
        const baseThreatId = (() => {
          const fin = `tom:dyad:final:${selfId}:${target}:threat`;
          const baseId = `tom:dyad:${selfId}:${target}:threat`;
          return atomsAfterCtx.some(a => String((a as any).id) === fin) ? fin : baseId;
        })();

        const baseThreat = getMag(atomsAfterCtx, baseThreatId, 0);
        const effThreat = getMag(atomsAfterCtx, `tom:dyad:${selfId}:${target}:threat_ctx`, baseThreat);

        const denom = Math.max(1e-6, 1 - clamp01(baseThreat));
        const factor = clamp01((1 - clamp01(effThreat)) / denom);
        eff = clamp01(base * factor);
        usedIds.push(baseThreatId, `tom:dyad:${selfId}:${target}:threat_ctx`);
      }

      effectiveDyads.push(
        normalizeAtom({
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
            notes: ['effective dyad metric (final→base aware)'],
            parts: { base, eff, baseId: String((baseAtom as any).id) },
          },
        } as any)
      );
    }

    // ToM policy layer
    const tomPolicyPack = buildTomPolicyLayer([...atomsAfterCtx, ...effectiveDyads], selfId);

    // Action priors
    const otherIdsForPriors = Array.from(
      new Set(
        atomsAfterBias
          .filter(a => String((a as any).id).startsWith(`tom:dyad:${selfId}:`))
          .map(a => String((a as any).id).split(':')[3] || (a as any).target)
          .filter(Boolean)
      )
    ) as string[];

    const actionPriorAtoms = deriveActionPriors({
      selfId,
      otherIds: otherIdsForPriors,
      atoms: [...atomsAfterBias, ...tomCtxDyads, ...effectiveDyads, ...(tomPolicyPack as any).atoms],
    });

    // Threat stack
    const atomsForThreat = [...atomsAfterBias, ...tomCtxDyads, ...effectiveDyads, ...(tomPolicyPack as any).atoms, ...actionPriorAtoms];

    const getMagThreat = (id: string, fb = 0) => {
      const a = atomsForThreat.find(x => String((x as any).id) === id);
      const m = (a as any)?.magnitude;
      return typeof m === 'number' && Number.isFinite(m) ? m : fb;
    };
    const firstByPrefix = (prefix: string) =>
      atomsForThreat.find(a => String((a as any)?.id || '').startsWith(prefix))?.id || null;

    const ctxDanger = getMagThreat(`ctx:danger:${selfId}`, 0);
    const coverId = firstByPrefix(`world:map:cover:${selfId}`) || firstByPrefix(`ctx:cover:${selfId}`) || null;
    const cover = coverId ? getMagThreat(coverId, 0.5) : 0.5;

    const crowd = getMagThreat(`ctx:crowd:${selfId}`, 0) || getMagThreat(`world:loc:crowd:${selfId}`, 0);
    const hierarchy = getMagThreat(`ctx:hierarchy:${selfId}`, 0) || getMagThreat(`world:loc:control:${selfId}`, 0);
    const surveillance = getMagThreat(`ctx:surveillance:${selfId}`, 0);
    const timePressure = getMagThreat(`ctx:timePressure:${selfId}`, 0);
    const scarcity = getMagThreat(`ctx:scarcity:${selfId}`, 0);
    const woundedPressure = getMagThreat(`ctx:wounded:${selfId}`, 0) || getMagThreat(`ctx:careNeed:${selfId}`, 0);

    const effTrust = atomsForThreat
      .filter(a => String((a as any).id).startsWith(`tom:effective:dyad:${selfId}:`) && String((a as any).id).endsWith(`:trust`))
      .map(a => Number((a as any).magnitude ?? 0))
      .sort((a, b) => b - a)
      .slice(0, 5);

    const effThreat = atomsForThreat
      .filter(a => String((a as any).id).startsWith(`tom:effective:dyad:${selfId}:`) && String((a as any).id).endsWith(`:threat`))
      .map(a => Number((a as any).magnitude ?? 0))
      .sort((a, b) => b - a)
      .slice(0, 5);

    const nearbyTrustMean = effTrust.length ? effTrust.reduce((s, v) => s + v, 0) / effTrust.length : 0.45;
    const nearbyHostileMean = effThreat.length ? effThreat.reduce((s, v) => s + v, 0) / effThreat.length : 0;

    const nearbyCount = Math.max(0, ((worldForPipeline as any)?.agents?.length ?? 1) - 1);

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
      experience: (agent as any)?.traits?.experience ?? 0.5,
    };

    const threatCalc = computeThreatStack(threatInputs as any, atomsForThreat as any);

    const threatAtoms: ContextAtom[] = [
      normalizeAtom({
        id: `threat:ch:env:${selfId}`,
        kind: 'threat_value' as any,
        ns: 'threat' as any,
        origin: 'derived',
        source: 'threat',
        magnitude: (threatCalc as any).env,
        confidence: 1,
        tags: ['threat', 'channel', 'env'],
        label: `env threat:${Math.round((threatCalc as any).env * 100)}%`,
        trace: { usedAtomIds: (threatCalc as any).usedAtomIds || [], notes: ['env channel'], parts: { env: (threatCalc as any).env } },
      } as any),
      normalizeAtom({
        id: `threat:ch:social:${selfId}`,
        kind: 'threat_value' as any,
        ns: 'threat' as any,
        origin: 'derived',
        source: 'threat',
        magnitude: (threatCalc as any).social,
        confidence: 1,
        tags: ['threat', 'channel', 'social'],
        label: `social threat:${Math.round((threatCalc as any).social * 100)}%`,
        trace: { usedAtomIds: (threatCalc as any).usedAtomIds || [], notes: ['social channel'], parts: { social: (threatCalc as any).social } },
      } as any),
      normalizeAtom({
        id: `threat:ch:scenario:${selfId}`,
        kind: 'threat_value' as any,
        ns: 'threat' as any,
        origin: 'derived',
        source: 'threat',
        magnitude: (threatCalc as any).scenario,
        confidence: 1,
        tags: ['threat', 'channel', 'scenario'],
        label: `scenario threat:${Math.round((threatCalc as any).scenario * 100)}%`,
        trace: { usedAtomIds: (threatCalc as any).usedAtomIds || [], notes: ['scenario channel'], parts: { scenario: (threatCalc as any).scenario } },
      } as any),
      normalizeAtom({
        id: `threat:ch:personal:${selfId}`,
        kind: 'threat_value' as any,
        ns: 'threat' as any,
        origin: 'derived',
        source: 'threat',
        magnitude: (threatCalc as any).personal,
        confidence: 1,
        tags: ['threat', 'channel', 'personal'],
        label: `personal bias:${Math.round((threatCalc as any).personal * 100)}%`,
        trace: { usedAtomIds: (threatCalc as any).usedAtomIds || [], notes: ['personal bias channel'], parts: { personal: (threatCalc as any).personal } },
      } as any),
    ];

    const authority = clamp01(((threatCalc as any).inputs as any)?.hierarchyPressure ?? 0);
    const uncertainty = clamp01(
      (() => {
        const u = atomsForThreat.find(a => (a as any).id === `ctx:uncertainty:${selfId}`)?.magnitude;
        if (typeof u === 'number' && Number.isFinite(u)) return u;
        const ia = atomsForThreat.find(a => (a as any).id === `obs:infoAdequacy:${selfId}`)?.magnitude;
        if (typeof ia === 'number' && Number.isFinite(ia)) return 1 - ia;
        return 0;
      })()
    );
    const body = clamp01(((threatCalc as any).inputs as any)?.woundedPressure ?? 0);

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
        trace: { usedAtomIds: (threatCalc as any).usedAtomIds || [], notes: ['authority channel'], parts: { authority } },
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
        trace: { usedAtomIds: (threatCalc as any).usedAtomIds || [], notes: ['uncertainty channel'], parts: { uncertainty } },
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
        trace: { usedAtomIds: (threatCalc as any).usedAtomIds || [], notes: ['body channel'], parts: { body } },
      } as any)
    );

    const threatAtom = normalizeAtom({
      id: `threat:final:${selfId}`,
      kind: 'threat_value' as any,
      ns: 'threat' as any,
      origin: 'derived',
      source: 'threat',
      magnitude: (threatCalc as any).total,
      confidence: 1,
      tags: ['threat', 'final'],
      label: `Threat: ${Math.round((threatCalc as any).total * 100)}%`,
      trace: {
        usedAtomIds: (threatCalc as any).usedAtomIds || [],
        notes: (threatCalc as any).why?.slice(0, 6) || ['threat stack'],
        parts: { ...(threatCalc as any) },
      },
    } as any);

    const atomsAfterThreat = mergeKeepingOverrides(atomsForThreat, [...threatAtoms, threatAtom]).merged;

    // Social loop closed
    const socProxPostTom = deriveSocialProximityAtoms({ selfId, atoms: atomsAfterThreat });
    const atomsAfterSocialLoop = mergeKeepingOverrides(atomsAfterThreat, socProxPostTom.atoms).merged;
    pushStage('S2b', 'S2b • ToM ctx/effective/policy + threat + social loop closed', atomsAfterSocialLoop);

    // Lens ctx
    const lensCtxRes = deriveLensCtxAtoms({ selfId, atoms: atomsAfterSocialLoop, agent: agentForPipeline });
    const atomsAfterLensCtx = mergeKeepingOverrides(atomsAfterSocialLoop, lensCtxRes.atoms).merged;
    pushStage('S2c', 'S2c • lens applied: ctx:final:* + lens:*', atomsAfterLensCtx);

    // Appraisal -> emotions -> dyadic emotions
    const appRes = deriveAppraisalAtoms({ selfId, atoms: atomsAfterLensCtx, agent: agentForPipeline });
    const atomsAfterApp = mergeKeepingOverrides(atomsAfterLensCtx, appRes.atoms).merged;

    const emoRes = deriveEmotionAtoms({ selfId, atoms: atomsAfterApp });
    const atomsAfterEmo = mergeKeepingOverrides(atomsAfterApp, emoRes.atoms).merged;

    const dyadEmo = deriveDyadicEmotionAtoms({ selfId, atoms: atomsAfterEmo });
    const atomsAfterDyadEmo = mergeKeepingOverrides(atomsAfterEmo, dyadEmo.atoms).merged;

    pushStage('S3', 'S3 • appraisal + emotions + dyadic emotions', atomsAfterDyadEmo);

    // Drivers -> goal ecology -> planning goals (goal layer)
    const drvRes = deriveDriversAtoms({ selfId, atoms: atomsAfterDyadEmo, agent: agentForPipeline });
    const atomsAfterDrv = mergeKeepingOverrides(atomsAfterDyadEmo, drvRes.atoms).merged;
    pushStage('S3d', 'S3d • drivers derived (drv:*)', atomsAfterDrv, {
      meta: { drivers: drvRes.atoms.length },
    });

    const goalRes = deriveGoalAtoms(selfId, atomsAfterDrv, { topN: 3 });
    const atomsAfterGoals = mergeKeepingOverrides(atomsAfterDrv, goalRes.atoms).merged;
    pushStage('S3e', 'S3e • goal domains + active goals', atomsAfterGoals, {
      meta: { goalAtoms: goalRes.atoms.length },
    });

    const planRes = derivePlanningGoalAtoms(selfId, atomsAfterGoals, { topN: 5 });
    const goalLinks = deriveGoalActionLinkAtoms(selfId);
    const atomsAfterPlans = mergeKeepingOverrides(atomsAfterGoals, [...planRes.atoms, ...goalLinks.atoms]).merged;
    pushStage('S3f', 'S3f • planning goals + goal-action links', atomsAfterPlans, {
      meta: { planAtoms: planRes.atoms.length, goalLinks: goalLinks.atoms.length },
    });

    // Possibilities
    const possibilities = derivePossibilitiesRegistry({ selfId, atoms: atomsAfterPlans });
    const possAtoms = atomizePossibilities(possibilities);

    const atomsAfterPoss = mergeKeepingOverrides(atomsAfterPlans, possAtoms).merged;
    pushStage('S3a', 'S3a • possibilities materialized', atomsAfterPoss);

    return {
      atoms: atomsAfterPoss,
      possibilities,
      accessPack,
      provenance: (stage0 as any).provenance,
      rumorBeliefs,
      axesRes,
      pipelineStages,
    };
  };

  // --- Two-Pass Scene Logic ---
  const sceneAtomsA = sceneInst
    ? applySceneAtoms({ scene: sceneInst, preset: (SCENE_PRESETS as any)[sceneInst.presetId], worldTick: tick, selfId })
    : [];

  let result = runPipeline(sceneAtomsA, sceneInst);

  if (sceneInst && sc?.presetId) {
    const stepped = stepSceneInstance({ scene: sceneInst, nowTick: tick, atomsForConditions: (result as any).atoms });
    if ((stepped as any).phaseId !== (sceneInst as any).phaseId) {
      sceneInst = stepped;
      const sceneAtomsB = applySceneAtoms({
        scene: sceneInst,
        preset: (SCENE_PRESETS as any)[sceneInst.presetId],
        worldTick: tick,
        selfId,
      });
      result = runPipeline(sceneAtomsB, sceneInst);
    }
  }

  const finalAtoms = dedupeAtomsById((result as any).atoms);
  const validation = validateAtoms(finalAtoms, { autofix: true });
  const atomsValidated = (validation as any).fixedAtoms ?? finalAtoms;

  const summaries = buildSummaryAtoms(atomsValidated, { selfId });
  const atomsWithSummaries = dedupeAtomsById([...atomsValidated, ...(summaries as any).atoms]).map(normalizeAtom);

  // UI summary metrics BEFORE mind (rename to avoid redeclare)
  const summaryMetrics0 = deriveSummaryAtoms({ atoms: atomsWithSummaries, selfId });
  const atomsWithSummaryMetrics0 = dedupeAtomsById([...atomsWithSummaries, ...summaryMetrics0]).map(normalizeAtom);

  const postOverrides = (appliedOverrides || []).filter(a => {
    const id = String((a as any)?.id || '');
    return id.startsWith('emo:') || id.startsWith('app:');
  });

  const atomsForMind = dedupeAtomsById([...atomsWithSummaryMetrics0, ...postOverrides]).map(normalizeAtom);

  // Compute scoreboard (mind) BEFORE deciding, and materialize it into atoms.
  const contextMind = computeContextMindScoreboard({ selfId, atoms: atomsForMind });

  const mindAtoms = atomizeContextMindMetrics(selfId, contextMind);
  const atomsWithMind = dedupeAtomsById([...atomsForMind, ...mindAtoms]).map(normalizeAtom);

  // UI summary metrics AFTER mind (keep names as canonical for the rest)
  const summaryMetrics = deriveSummaryAtoms({ atoms: atomsWithMind, selfId });
  const atomsWithSummaryMetrics = dedupeAtomsById([...atomsWithMind, ...summaryMetrics]).map(normalizeAtom);

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
    meta?: any;
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
        stub.ns === 'ctx' ||
        stub.ns === 'lens' ||
        stub.ns === 'tom' ||
        stub.ns === 'emo' ||
        stub.ns === 'app' ||
        stub.ns === 'goal' ||
        stub.ns === 'drv' ||
        stub.ns === 'action';

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
    o?: { notes?: string[]; meta?: any }
  ): PipelineStageDelta => {
    const next = dedupeAtomsById(atoms).map(normalizeAtom);
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
      atomCount: next.length,
      added: addedIds.map(id0 => compactPipelineAtom(byId.get(id0)!)),
      changed: changedIds.map(id0 => compactPipelineAtom(byId.get(id0)!)),
      removedIds,
      notes: o?.notes,
      meta: o?.meta,
    };
  };

  const tracedPipeline = Array.isArray((result as any).pipelineStages) ? (result as any).pipelineStages : [];
  const pipelineAll: PipelineStageDelta[] = [...tracedPipeline];

  const s3bStage = buildDeltaStage(
    'S3b',
    'S3b • summary metrics (UI)',
    atomsWithSummaryMetrics0,
    atomsWithSummaries,
    pipelineAll[pipelineAll.length - 1]?.id
  );
  pipelineAll.push(s3bStage);

  const s4Stage = buildDeltaStage(
    'S4',
    'S4 • contextMind metrics materialized',
    atomsWithMind,
    atomsForMind,
    pipelineAll[pipelineAll.length - 1]?.id
  );
  pipelineAll.push(s4Stage);

  const s4_5Stage = buildDeltaStage(
    'S4.5',
    'S4.5 • summary metrics (UI)',
    atomsWithSummaryMetrics,
    atomsWithMind,
    s4Stage.id
  );
  pipelineAll.push(s4_5Stage);

  // Decide AFTER mind metrics exist in the atom stream
  const decision = decideAction({
    selfId,
    atoms: atomsWithMind,
    possibilities: (result as any).possibilities,
    topK: 12,
  });

  const decisionAtoms = arr((decision as any)?.atoms).map(normalizeAtom);
  const atomsWithDecision = dedupeAtomsById([
    ...atomsWithSummaryMetrics,
    ...decisionAtoms,
    ...legacyUiAtoms,
  ]).map(normalizeAtom);

  const snapshot = buildContextSnapshot(world, agent, {
    ...(opts.snapshotOptions as any),
    manualAtoms: atomsWithDecision,
  });

  (snapshot as any).coverage = computeCoverageReport(atomsWithDecision as any);

  // Drop legacy scene:* atoms in favor of canonical ctx:src:scene:* inputs.
  (snapshot as any).atoms = sortAtomsDeterministic(
    (atomsWithDecision || []).filter(a => !String((a as any)?.id || '').startsWith('scene:'))
  );
  (snapshot as any).validation = validation;
  (snapshot as any).decision = decision;

  // Synthesize affect from appraisal/emotion mindstate
  try {
    const fallback = (agentForPipeline as any)?.affect ?? null;
    const synthesized = synthesizeAffectFromMind(contextMind as any, fallback);
    (agentForPipeline as any).affect = synthesized;
    (snapshot as any).contextMindAffect = synthesized;
    if (contextMind && typeof contextMind === 'object') (contextMind as any).affect = synthesized;

    const synthesizedAffectAtoms = atomizeAffect(selfId, synthesized, 'derived');
    if (Array.isArray(synthesizedAffectAtoms) && synthesizedAffectAtoms.length) {
      const withoutAffect = ((snapshot as any).atoms || []).filter((a: any) => !String(a?.id || '').startsWith('affect:'));
      (snapshot as any).atoms = sortAtomsDeterministic(
        dedupeAtomsById([...withoutAffect, ...synthesizedAffectAtoms])
          .map(normalizeAtom)
          .filter((a: any) => !String(a?.id || '').startsWith('scene:'))
      );
      (snapshot as any).coverage = computeCoverageReport((snapshot as any).atoms as any);
    }
  } catch {}

  // Fill snapshot.summary for UI/compare panels.
  (snapshot as any).summary = computeSnapshotSummary((snapshot as any).atoms as any, selfId);
  (snapshot as any).contextMind = contextMind;

  pipelineAll.push(
    buildDeltaStage(
      'S5',
      'S5 • final snapshot.atoms (export truth)',
      (snapshot as any).atoms || [],
      atomsWithSummaryMetrics,
      s4_5Stage.id
    )
  );

  const pipelineAllSafe = pipelineAll.map(s => ({
    ...s,
    // Hardening: UI expects arrays in these fields.
    full: Array.isArray((s as any).full) ? (s as any).full : undefined,
    added: arr((s as any).added),
    changed: arr((s as any).changed),
    removedIds: arr((s as any).removedIds),
    notes: arr((s as any).notes),
  }));

  (snapshot as any).meta = {
    ...((snapshot as any).meta || {}),
    pipelineDeltas: pipelineAllSafe,
  };

  (snapshot as any).debug = {
    legacyAtoms: legacyFrameAtoms,
    axes: (result as any).axesRes,
  };

  (snapshot as any).access = (result as any).accessPack?.decisions;
  (snapshot as any).possibilities = (result as any).possibilities;
  (snapshot as any).scene = sceneInst;
  (snapshot as any).epistemic = { provenance: [...Array.from((result as any).provenance.entries())] };
  (snapshot as any).epistemicGenerated = {
    rumorBeliefs: arr((result as any).rumorBeliefs).map((a: any) => ({
      id: a.id,
      magnitude: a.magnitude,
      confidence: a.confidence,
      source: a.source,
      label: a.label,
    })),
  };

  const ctxV2 = frame
    ? buildContextV2FromFrame(frame, world)
    : ({
        locationType: 'unknown',
        visibility: 1,
        noise: 0,
        panic: 0,
        nearbyActors: [],
        alliesCount: 0,
        enemiesCount: 0,
        leaderPresent: false,
        kingPresent: false,
        authorityConflict: 0,
        timePressure: 0,
        scenarioKind: 'routine',
        cover: 0,
        exitsNearby: 0,
        obstacles: 0,
        groupDensity: 0,
        hierarchyPressure: 0,
        structuralDamage: 0,
      } as any);

  const situation = buildSituationContextForLab(agent, world, frame, snapshot as any, atomsWithSummaryMetrics, ctxV2 as any);

  // Goal preview: single source of truth = goal atoms in the final atom stream.
  const goalPreview = (() => {
    const atoms = (atomsWithSummaryMetrics as any) || [];
    const plans = atoms.filter((a: any) => String(a?.id || '').startsWith('goal:plan:'));
    const actives = atoms.filter((a: any) => String(a?.id || '').startsWith('goal:active:'));

    const activeByGoalId = new Map<string, any>();
    for (const a of actives) {
      const parts = (a as any)?.trace?.parts || {};
      const gid = String(parts.goalId || '').trim() || String((a as any).id).split(':')[2] || '';
      if (!gid) continue;
      activeByGoalId.set(gid, a);
    }

    const rows = plans
      .map((a: any) => {
        const parts = (a as any)?.trace?.parts || {};
        const gid = String(parts.goalId || '').trim() || String((a as any).id).split(':')[2] || '';
        const activeA = gid ? activeByGoalId.get(gid) : undefined;
        const activation = Number((activeA as any)?.magnitude ?? parts.activeGoalScore ?? 0);
        const base_ctx = Number(parts.baseMag ?? 0);
        return {
          id: String(gid || (a as any).id),
          label: String((a as any)?.label || gid || (a as any).id),
          priority: Number((a as any)?.magnitude ?? 0),
          activation,
          base_ctx,
        };
      })
      .filter((r: any) => r.id)
      .sort((a: any, b: any) => b.priority - a.priority)
      .slice(0, 12);

    return {
      goals: rows,
      debug: { source: 'atoms' as const },
    };
  })();

  return {
    agent,
    frame,
    snapshot: snapshot as any,
    v4Atoms: atomsWithSummaryMetrics,
    ctxV2: ctxV2 as any,
    situation,
    goalPreview,
  };
}
