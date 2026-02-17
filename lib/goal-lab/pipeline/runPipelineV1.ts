import type { WorldState, AgentState } from '../../../types';
import type { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';
import { mergeAtomsPreferNewer } from '../../context/v2/atomMerge';

import { buildStage0Atoms } from '../../context/pipeline/stage0';
import { deriveSocialProximityAtoms } from '../../context/stage1/socialProximity';
import { deriveHazardGeometryAtoms } from '../../context/stage1/hazardGeometry';
import { deriveAxes } from '../../context/axes/deriveAxes';
import { applyCharacterLens } from '../../context/lens/characterLens';

import { applyRelationPriorsToDyads } from '../../tom/base/applyRelationPriors';
import { deriveNonContextDyadAtoms } from '../../tom/base/deriveNonContextDyads';
import { buildBeliefToMBias } from '../../tom/ctx/beliefBias';
import { buildTomPolicyLayer } from '../../tom/policy/tomPolicy';

import { deriveAppraisalAtoms } from '../../emotion/appraisals';
import { deriveEmotionAtoms } from '../../emotion/emotions';
import { deriveDyadicEmotionAtoms } from '../../emotion/dyadic';

import { atomizeContextMindMetrics } from '../../contextMind/atomizeMind';
import { computeContextMindScoreboard } from '../../contextMind/scoreboard';

import { deriveDriversAtoms } from '../../drivers/deriveDrivers';
import { deriveGoalAtoms } from '../../goals/goalAtoms';
import { derivePlanningGoalAtoms } from '../../goals/planningGoalAtoms';
import { deriveGoalActionLinkAtoms } from '../../goals/goalActionLinksAtoms';

import { derivePossibilitiesRegistry } from '../../possibilities/derive';
import { atomizePossibilities } from '../../possibilities/atomize';
import { deriveAccess } from '../../access/deriveAccess';
import { deriveActionPriors } from '../../decision/actionPriors';
import { decideAction } from '../../decision/decide';
import { scoreAction } from '../../decision/scoreAction';
import { buildActionCandidates } from '../../decision/actionCandidateUtils';
import { arr } from '../../utils/arr';
import { buildIntentPreview } from './intentPreview';
import { makeSimStep, type SimStep } from '../../core/simStep';
import { observeLite, type ObserveLiteParams } from './observeLite';
import { buildBeliefUpdateLiteSnapshot } from './beliefUpdateLite';
import { buildTransitionSnapshot } from './lookahead';

export type GoalLabStageId = 'S0'|'S1'|'S2'|'S3'|'S4'|'S5'|'S6'|'S7'|'S8'|'S9';

export type GoalLabStageFrame = {
  stage: GoalLabStageId;
  title: string;
  atoms: ContextAtom[];
  atomsAddedIds: string[];
  warnings: string[];
  stats: {
    atomCount: number;
    addedCount: number;
    missingCodeCount: number;
    missingTraceDerivedCount: number;
  };
  artifacts?: Record<string, any>;
};

export type GoalLabPipelineV1 = {
  schemaVersion: 1;
  selfId: string;
  tick: number;
  /** Explicit step record (tick + seed + events). */
  step: SimStep;
  participantIds: string[];
  stages: GoalLabStageFrame[];
};

function uniqStrings(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function computeAdded(prev: ContextAtom[], next: ContextAtom[]): string[] {
  const p = indexById(prev);
  const out: string[] = [];
  for (const a of next) {
    const id = (a as any)?.id;
    if (typeof id !== 'string') continue;
    if (!p.has(id)) out.push(id);
  }
  return out;
}

function indexById(atoms: ContextAtom[]): Set<string> {
  const s = new Set<string>();
  for (const a of atoms) if (a && typeof (a as any).id === 'string') s.add((a as any).id);
  return s;
}

function stageStats(atoms: ContextAtom[]) {
  let missingCodeCount = 0;
  let missingTraceDerivedCount = 0;
  for (const a of atoms) {
    if (!(a as any)?.code) missingCodeCount += 1;
    if ((a as any)?.origin === 'derived') {
      const tr = (a as any)?.trace;
      const used = Array.isArray(tr?.usedAtomIds) ? tr.usedAtomIds : [];
      const parts = tr?.parts;
      if (!used.length && (parts == null || (typeof parts === 'object' && Object.keys(parts).length === 0))) {
        missingTraceDerivedCount += 1;
      }
    }
  }
  return { missingCodeCount, missingTraceDerivedCount };
}

function cloneAsBaseCtxAtoms(ctxAtoms: ContextAtom[], selfId: string): ContextAtom[] {
  // debug-only: сохраняем "ctx до линзы" отдельными id вида ctx:base:*
  return ctxAtoms
    .filter(a => typeof (a as any)?.id === 'string' && String((a as any).id).startsWith('ctx:'))
    .map(a => {
      const id = String((a as any).id);
      const used = arr((a as any)?.trace?.usedAtomIds).filter((x: any) => typeof x === 'string');
      return normalizeAtom({
        ...(a as any),
        id: `ctx:base:${id.slice('ctx:'.length)}`,
        origin: 'derived',
        source: 'pipeline:S3.baseCopy',
        label: (a as any)?.label ? `[base] ${(a as any).label}` : `[base] ${id}`,
        trace: { usedAtomIds: used.length ? used : [id], notes: ['debug-only base copy'], parts: { selfId, originalId: id } }
      } as any);
    });
}

function computeQuarks(atoms: ContextAtom[]) {
  // минимальный quark-frame: ключ = atom.code
  const quarks: Record<string, { v: number; c: number; atomId: string }[]> = {};
  for (const a of atoms) {
    const code = (a as any)?.code;
    const id = (a as any)?.id;
    if (!code || typeof id !== 'string') continue;
    const v = Number((a as any)?.magnitude ?? 0);
    const c = Number((a as any)?.confidence ?? 1);
    (quarks[code] ||= []).push({ v, c, atomId: id });
  }
  return quarks;
}

function safeLogit01(p01: number): number {
  const p = Math.max(1e-6, Math.min(1 - 1e-6, Number(p01)));
  return Math.log(p / (1 - p));
}

function buildGoalLayerSnapshot(selfId: string, atomsAfterS7: ContextAtom[], goalRes: any, planRes: any) {
  const domainAtoms = atomsAfterS7.filter((a: any) => a?.ns === 'goal' && typeof a?.id === 'string' && a.id.startsWith(`goal:domain:`) && a.id.endsWith(`:${selfId}`));
  const activeDomainAtoms = atomsAfterS7.filter((a: any) => a?.ns === 'goal' && typeof a?.id === 'string' && a.id.startsWith(`goal:active:`) && a.id.endsWith(`:${selfId}`));
  const modeAtom = atomsAfterS7.find((a: any) => a?.ns === 'goal' && typeof a?.id === 'string' && a.id === `goal:mode:${selfId}`) as any;

  const domains = domainAtoms
    .map((a: any) => {
      const id: string = String(a.id);
      const domain = id.split(':')[2] || id;
      const score01 = Number(a.magnitude ?? 0);
      const parts = a?.trace?.parts ?? null;
      return {
        id,
        domain,
        score01,
        logit: safeLogit01(score01),
        label: a?.label ?? null,
        parts,
        usedAtomIds: arr(a?.trace?.usedAtomIds).slice(0, 50),
      };
    })
    .sort((x: any, y: any) => (y.score01 ?? 0) - (x.score01 ?? 0));

  const activeDomains = activeDomainAtoms
    .map((a: any) => {
      const id: string = String(a.id);
      const domain = id.split(':')[2] || id;
      return { id, domain, score01: Number(a.magnitude ?? 0), usedAtomIds: arr(a?.trace?.usedAtomIds).slice(0, 50) };
    })
    .sort((x: any, y: any) => (y.score01 ?? 0) - (x.score01 ?? 0));

  const planningTop = arr(planRes?.top).map((x: any) => ({ goalId: String(x?.goalId || ''), v: Number(x?.v ?? 0) })).filter((x: any) => x.goalId);
  const goalDebug = goalRes?.debug ?? null;

  const mode = modeAtom ? {
    id: String(modeAtom.id),
    magnitude: Number(modeAtom.magnitude ?? 0),
    label: modeAtom.label ?? null,
    parts: modeAtom?.trace?.parts ?? null,
    usedAtomIds: arr(modeAtom?.trace?.usedAtomIds).slice(0, 50),
  } : null;

  return {
    selfId,
    domains,
    activeDomains,
    mode,
    planningTop,
    // Keep the raw goalDebug for deep inspection in legacy/dev mode.
    goalDebug,
  };
}

export function runGoalLabPipelineV1(input: {
  world: WorldState;
  agentId: string;
  participantIds: string[];
  manualAtoms?: any[];
  injectedEvents?: any[];
  sceneControl?: any;
  affectOverrides?: any;
  mapMetrics?: any;
  tickOverride?: number;
  observeLiteParams?: ObserveLiteParams;
}): GoalLabPipelineV1 | null {
  const { world, agentId, participantIds } = input;
  const tick = Number(input.tickOverride ?? (world as any)?.tick ?? 0);
  const agent = arr((world as any)?.agents).find((a: any) => a?.entityId === agentId) as AgentState | undefined;
  if (!agent) return null;
  const selfId = agent.entityId;

  const step = makeSimStep({
    t: tick,
    seed: (world as any)?.rngSeed ?? (world as any)?.rng_seed ?? (world as any)?.seed ?? 0,
    events: [
      ...arr(input.injectedEvents),
      ...arr((world as any)?.eventLog?.events),
    ],
  });

  const stages: GoalLabStageFrame[] = [];
  let atoms: ContextAtom[] = [];

  // S0: canonical atoms (строго без ctx)
  const s0 = buildStage0Atoms({
    world,
    agent,
    selfId,
    mapMetrics: input.mapMetrics,
    beliefAtoms: arr((agent as any)?.memory?.beliefAtoms),
    overrideAtoms: arr(input.manualAtoms).map(normalizeAtom),
    events: step.events,
    sceneSnapshot: (world as any).sceneSnapshot,
    includeAxes: false
  });
  atoms = arr((s0 as any)?.mergedAtoms).map(normalizeAtom);
  // Observation snapshot (lite): best-effort visibility model for GoalLab console.
  // IMPORTANT: this does not replace the existing obs-atoms pipeline.
  const observationLite = observeLite({
    world,
    agent,
    selfId,
    tick,
    params: {
      // Defaults are conservative; GoalLab console can override via input.observeLiteParams.
      radius: Number(input.observeLiteParams?.radius ?? 10),
      maxAgents: Number(input.observeLiteParams?.maxAgents ?? 12),
      noiseSigma: Number(input.observeLiteParams?.noiseSigma ?? 0),
      seed: Number(input.observeLiteParams?.seed ?? (world as any)?.rngSeed ?? 0),
    },
  });

  const s0ObsAtomIds = arr((s0 as any)?.obsAtoms)
    .map((a: any) => String(a?.id || ''))
    .filter(Boolean);
  const s0RawObservations = arr((world as any)?.observations?.[selfId]).slice(0, 50);

  const beliefAtomIds = arr((agent as any)?.memory?.beliefAtoms)
    .map((a: any) => (typeof a?.id === 'string' ? a.id : null))
    .filter(Boolean) as string[];

  const overrideAtomIds = arr(input.manualAtoms)
    .map((a: any) => (typeof a?.id === 'string' ? a.id : null))
    .filter(Boolean) as string[];

  stages.push({
    stage: 'S0',
    title: 'S0 Canonicalization (world/obs/mem/override)',
    atoms,
    atomsAddedIds: atoms.map(a => String((a as any).id)).filter(Boolean),
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: atoms.length, ...stageStats(atoms) },
    artifacts: {
      obsAtomsCount: arr((s0 as any)?.obsAtoms).length,
      provenanceSize: ((s0 as any)?.provenance as any)?.size ?? 0,
      // Level 3.1: explicit observation snapshot (lite).
      observationSnapshot: {
        agentId: selfId,
        tick,
        rawObservations: s0RawObservations,
        obsAtomIds: s0ObsAtomIds.slice(0, 800),
        observationLite,
        note: 'Lite snapshot: world.observations[agentId] + obsAtomIds from Stage0 (extractObservationAtoms).',
      },
      // Belief update (lite): strict snapshot for the "prior belief injection" step in S0.
      // This is the first brick of the future U(b,a,o) protocol.
      beliefUpdateSnapshot: buildBeliefUpdateLiteSnapshot({
        world,
        agent,
        selfId,
        tick,
        mergedAtomsS0: atoms,
        obsAtomIds: s0ObsAtomIds,
        priorBeliefAtomIds: beliefAtomIds,
        overrideAtomIds,
        eventsCount: arr(step.events).length,
        params: { maxIds: 800 },
      }),
    }
  });

  // S1: Normalize -> Quarks (минимально)
  const quarks = computeQuarks(atoms);
  stages.push({
    stage: 'S1',
    title: 'S1 Normalize → Quarks',
    atoms,
    atomsAddedIds: [],
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: 0, ...stageStats(atoms) },
    artifacts: { quarks }
  });

  // S2: контекстные сигналы + базовые ctx оси
  // IMPORTANT: stage-1 enrichers must be computed from the canonical world.
  // If hazardGeometry doesn't see world (map + positions), it silently produces 0 atoms
  // and the downstream context becomes "одинаковым" even when hazards exist.
  const s2Warnings: string[] = [];
  const sp = deriveSocialProximityAtoms({ selfId, atoms });
  const hz = deriveHazardGeometryAtoms({ world, selfId, atoms } as any);

  const spAtoms = arr((sp as any)?.atoms).map(normalizeAtom);
  const hzAtoms = arr((hz as any)?.atoms).map(normalizeAtom);

  // Guardrails: detect "input present but module produced nothing".
  const hasNearby = atoms.some(a => typeof (a as any)?.id === 'string' && String((a as any).id).startsWith(`obs:nearby:${selfId}:`));
  const hasAnyHazard = atoms.some(a => {
    const id = String((a as any)?.id || '');
    return id.includes('hazard') || id.startsWith('world:env:') || id.startsWith('world:map:');
  });
  if (hasNearby && spAtoms.length === 0) {
    s2Warnings.push('S2: obs:nearby:* present, but socialProximity produced 0 atoms (check obs magnitudes + dyad tags/priors).');
  }
  if (hasAnyHazard && hzAtoms.length === 0) {
    s2Warnings.push('S2: hazard-ish signals present, but hazardGeometry produced 0 atoms (check world.locations[].map + agent positions).');
  }

  const mS2a = mergeAtomsPreferNewer(atoms, [...spAtoms, ...hzAtoms]);
  const atomsS2in = mS2a.atoms;

  const ctx = deriveAxes({ selfId, atoms: atomsS2in });
  const ctxAtoms = arr((ctx as any)?.atoms).map(normalizeAtom);
  const ctxBaseCopies = cloneAsBaseCtxAtoms(ctxAtoms, selfId);
  const mS2b = mergeAtomsPreferNewer(atomsS2in, [...ctxAtoms, ...ctxBaseCopies]);
  const atomsS2 = mS2b.atoms;
  const s2Added = uniqStrings([...mS2a.newIds, ...mS2b.newIds]);
  const s2Overridden = uniqStrings([...mS2a.overriddenIds, ...mS2b.overriddenIds]);
  atoms = atomsS2;
  stages.push({
    stage: 'S2',
    title: 'S2 Context axes (base ctx:*)',
    atoms,
    atomsAddedIds: s2Added,
    warnings: s2Warnings,
    stats: { atomCount: atoms.length, addedCount: s2Added.length, ...stageStats(atoms) },
    artifacts: {
      socialProximity: sp,
      hazardGeometry: hz,
      ctxAxisCount: ctxAtoms.length,
      overriddenIds: s2Overridden,
      moduleAdds: {
        // keep these bounded so export stays sane
        socialProximityIds: spAtoms.map(a => String((a as any).id)).slice(0, 200),
        hazardGeometryIds: hzAtoms.map(a => String((a as any).id)).slice(0, 200),
      }
    }
  });

  // S3: lens (субъективные поправки)
  const lens = applyCharacterLens({ selfId, atoms, agent });
  const mS3 = mergeAtomsPreferNewer(atoms, arr((lens as any)?.atoms));
  const atomsS3 = mS3.atoms;
  const s3Added = mS3.newIds;
  const s3Overridden = mS3.overriddenIds;
  atoms = atomsS3;
  stages.push({
    stage: 'S3',
    title: 'S3 Lens (subjective ctx/tom overrides)',
    atoms,
    atomsAddedIds: s3Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s3Added.length, ...stageStats(atoms) },
    artifacts: { lens: (lens as any)?.lens, overriddenIds: s3Overridden }
  });

  // S4: appraisal -> emotions
  const app = deriveAppraisalAtoms({ selfId, atoms });
  const appAtoms = arr((app as any)?.atoms).map(normalizeAtom);
  const mS4a = mergeAtomsPreferNewer(atoms, appAtoms);

  const emo = deriveEmotionAtoms({ selfId, atoms: mS4a.atoms });
  const emoAtoms = arr((emo as any)?.atoms).map(normalizeAtom);
  const mS4b = mergeAtomsPreferNewer(mS4a.atoms, emoAtoms);

  const dy = deriveDyadicEmotionAtoms({ selfId, atoms: mS4b.atoms });
  const dyAtoms = arr((dy as any)?.atoms).map(normalizeAtom);
  const mS4c = mergeAtomsPreferNewer(mS4b.atoms, dyAtoms);

  const atomsS4 = mS4c.atoms;
  const s4Added = uniqStrings([...mS4a.newIds, ...mS4b.newIds, ...mS4c.newIds]);
  const s4Overridden = uniqStrings([...mS4a.overriddenIds, ...mS4b.overriddenIds, ...mS4c.overriddenIds]);
  atoms = atomsS4;
  stages.push({
    stage: 'S4',
    title: 'S4 Appraisal → Emotions',
    atoms,
    atomsAddedIds: s4Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s4Added.length, ...stageStats(atoms) },
    artifacts: {
      appCount: appAtoms.length,
      emoCount: emoAtoms.length,
      dyEmoCount: dyAtoms.length,
      overriddenIds: s4Overridden,
    }
  });

  // S5: ToM (priors/ctx/final + policy)
  const enableToM = (input.sceneControl as any)?.enableToM !== false;
  if (enableToM) {
    const relPriors = applyRelationPriorsToDyads({ selfId, atoms });
    const relAtoms = arr((relPriors as any)?.atoms).map(normalizeAtom);
    const mS5a = mergeAtomsPreferNewer(atoms, relAtoms);

    const othersForTom = participantIds.filter(id => id && id !== selfId);
    const nonCtx = deriveNonContextDyadAtoms({ selfId, otherIds: othersForTom, atoms: mS5a.atoms });
    const nonCtxAtoms = arr((nonCtx as any)?.atoms).map(normalizeAtom);
    const mS5x = mergeAtomsPreferNewer(mS5a.atoms, nonCtxAtoms);

    const beliefBias = buildBeliefToMBias({ selfId, atoms: mS5x.atoms });
    const beliefAtoms = arr((beliefBias as any)?.atoms).map(normalizeAtom);
    const mS5b = mergeAtomsPreferNewer(mS5x.atoms, beliefAtoms);

    const policy = buildTomPolicyLayer({ selfId, atoms: mS5b.atoms });
    const policyAtoms = arr((policy as any)?.atoms).map(normalizeAtom);
    const mS5c = mergeAtomsPreferNewer(mS5b.atoms, policyAtoms);

    const atomsS5 = mS5c.atoms;
    const s5Added = uniqStrings([...mS5a.newIds, ...mS5x.newIds, ...mS5b.newIds, ...mS5c.newIds]);
    const s5Overridden = uniqStrings([...mS5a.overriddenIds, ...mS5x.overriddenIds, ...mS5b.overriddenIds, ...mS5c.overriddenIds]);
    atoms = atomsS5;
    stages.push({
      stage: 'S5',
      title: 'S5 ToM (priors/ctx/final + policy)',
      atoms,
      atomsAddedIds: s5Added,
      warnings: [],
      stats: { atomCount: atoms.length, addedCount: s5Added.length, ...stageStats(atoms) },
      artifacts: {
        tomEnabled: true,
        relPriorsCount: relAtoms.length,
        nonContextDyadCount: nonCtxAtoms.length,
        beliefBiasCount: beliefAtoms.length,
        policyCount: policyAtoms.length,
        overriddenIds: s5Overridden,
      }
    });
  } else {
    stages.push({
      stage: 'S5',
      title: 'S5 ToM (disabled)',
      atoms,
      atomsAddedIds: [],
      warnings: ['ToM disabled'],
      stats: { atomCount: atoms.length, addedCount: 0, ...stageStats(atoms) },
      artifacts: { tomEnabled: false },
    });
  }

  // S6: drivers bridge (canonical drv:* atoms)
  const scoreboard = computeContextMindScoreboard({ selfId, atoms });
  const mindAtoms = arr(atomizeContextMindMetrics({ selfId, metrics: scoreboard as any, atoms })).map(normalizeAtom);
  const mS6a = mergeAtomsPreferNewer(atoms, mindAtoms);

  const drv = deriveDriversAtoms({ selfId, atoms: mS6a.atoms });
  const drvAtoms = arr((drv as any)?.atoms).map(normalizeAtom);
  const mS6b = mergeAtomsPreferNewer(mS6a.atoms, drvAtoms);

  const atomsS6 = mS6b.atoms;
  const s6Added = uniqStrings([...mS6a.newIds, ...mS6b.newIds]);
  const s6Overridden = uniqStrings([...mS6a.overriddenIds, ...mS6b.overriddenIds]);
  atoms = atomsS6;
  stages.push({
    stage: 'S6',
    title: 'S6 Drivers (drv:*) / ContextMind',
    atoms,
    atomsAddedIds: s6Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s6Added.length, ...stageStats(atoms) },
    artifacts: { contextMind: scoreboard, drvCount: drvAtoms.length, overriddenIds: s6Overridden }
  });

  // S7: goals (ecology + active) + planning-goals
  // Safe: uses only existing atoms; if drv/life are missing it falls back to ctx.
  const goalRes = deriveGoalAtoms(selfId, atoms as any, { topN: 3 });
  const goalAtoms = arr((goalRes as any)?.atoms).map(normalizeAtom);

  const planRes = derivePlanningGoalAtoms(selfId, mergeAtomsPreferNewer(atoms, goalAtoms).atoms as any, { topN: 5 });
  const planAtoms = arr((planRes as any)?.atoms).map(normalizeAtom);

  const linkRes = deriveGoalActionLinkAtoms(selfId);
  const linkAtoms = arr((linkRes as any)?.atoms).map(normalizeAtom);

  const mS7a = mergeAtomsPreferNewer(atoms, goalAtoms);
  const mS7b = mergeAtomsPreferNewer(mS7a.atoms, planAtoms);
  const mS7c = mergeAtomsPreferNewer(mS7b.atoms, linkAtoms);
  // Project Goal-layer atoms to Action-visible utility atoms (one-way dependency: Goal -> Util -> Action).
  // Decision layer must read `ns === 'util'`, not `ns === 'goal'`.
  const utilAtoms = mS7c.atoms
    .filter(a => (a as any)?.ns === 'goal' && typeof (a as any)?.id === 'string' && (a as any).id.startsWith('goal:'))
    .map(a => ({
      ...a,
      ns: 'util' as const,
      id: (a as any).id.replace(/^goal:/, 'util:'),
      origin: (a as any).origin ?? 'derived',
      trace: {
        ...(a as any).trace,
        usedAtomIds: uniqStrings([...(a as any)?.trace?.usedAtomIds || [], (a as any).id]),
        notes: uniqStrings([...(a as any)?.trace?.notes || [], 'goal->util projection'])
      }
    }));

  const mS7d = mergeAtomsPreferNewer(mS7c.atoms, utilAtoms as any);
  const atomsS7 = mS7d.atoms;
  const s7Added = uniqStrings([...mS7a.newIds, ...mS7b.newIds, ...mS7c.newIds, ...mS7d.newIds]);
  const s7Overridden = uniqStrings([...mS7a.overriddenIds, ...mS7b.overriddenIds, ...mS7c.overriddenIds, ...mS7d.overriddenIds]);
  atoms = atomsS7;

  // Level 4.0b (F/G): explicit goal layer snapshot (domains/logits/goals/modes).
  const goalLayerSnapshot = buildGoalLayerSnapshot(selfId, atomsS7, goalRes as any, planRes as any);
  stages.push({
    stage: 'S7',
    title: 'S7 Goals (ecology + planning)',
    atoms,
    atomsAddedIds: s7Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s7Added.length, ...stageStats(atoms) },
    artifacts: {
      goalAtomsCount: goalAtoms.length,
      goalDebug: (goalRes as any)?.debug ?? null,
      goalLayerSnapshot,
      planGoalAtomsCount: planAtoms.length,
      goalActionLinksCount: linkAtoms.length,
      utilAtomsCount: utilAtoms.length,
      topPlanGoals: (planRes as any)?.top || [],
      overriddenIds: s7Overridden
    }
  });

  // S8: actions
  // IMPORTANT: keep this stage strictly typed + non-throwing.
  // A pipeline crash should never take down the UI.
  try {
    const possList = derivePossibilitiesRegistry({ selfId, atoms });
    const possAtoms = arr(atomizePossibilities(possList)).map(normalizeAtom);
    const mS8a = mergeAtomsPreferNewer(atoms, possAtoms);

    const locationId = (agent as any)?.locationId;
    const accessPack = deriveAccess(mS8a.atoms, selfId, locationId);
    const accessAtoms = arr((accessPack as any)?.atoms).map(normalizeAtom);
    const mS8b = mergeAtomsPreferNewer(mS8a.atoms, accessAtoms);

    const otherIds = participantIds.filter(id => id && id !== selfId);
    const priorsAtoms = arr(deriveActionPriors({
      selfId,
      otherIds,
      atoms: mS8b.atoms,
    })).map(normalizeAtom);
    const mS8c = mergeAtomsPreferNewer(mS8b.atoms, priorsAtoms);

    const { actions, goalEnergy } = buildActionCandidates({
      selfId,
      atoms: mS8c.atoms,
      possibilities: possList,
    });

    const rng = (agent as any)?.rngChannels?.decide;
    const temperature =
      (world as any)?.decisionTemperature ??
      (agent as any)?.behavioralParams?.T0 ??
      (agent as any)?.temperature ??
      1.0;

    const enablePredict = (input.sceneControl as any)?.enablePredict === true;
    const useLookaheadForChoice = (input.sceneControl as any)?.useLookaheadForChoice === true;
    const lookaheadGamma = Number((input.sceneControl as any)?.lookaheadGamma ?? 0.7);
    const lookaheadRisk = Number((input.sceneControl as any)?.lookaheadRiskAversion ?? (input.sceneControl as any)?.riskAversion ?? 0);

    // Build deterministic baseline ranking for lookahead (does not consume RNG channel).
    const rankedBaseline = actions
      .map((action: any) => ({
        ...(action || {}),
        q: Number(scoreAction(action, goalEnergy) ?? 0),
      }))
      .sort((a: any, b: any) => Number(b?.q ?? 0) - Number(a?.q ?? 0));

    // Optional console override: if a force_action event is injected for this agent,
    // promote that action as "best" in artifacts (without stepping world dynamics).
    const forcedActionId = (() => {
      const evs = arr(input.injectedEvents);
      let last: any = null;
      for (const e of evs) {
        const t = String((e as any)?.type || (e as any)?.kind || '');
        if (t !== 'force_action') continue;
        const a = String((e as any)?.agentId || (e as any)?.selfId || '');
        if (a && a !== selfId) continue;
        last = e;
      }
      const id = String((last as any)?.actionId || (last as any)?.action || '');
      return id && id !== 'undefined' && id !== 'null' ? id : '';
    })();

    const rankedForLookahead = (() => {
      if (!forcedActionId) return rankedBaseline;
      const rest = rankedBaseline.filter((a: any) => String(a?.id || a?.actionId || a?.name || '') !== forcedActionId);
      const forced = rankedBaseline.find((a: any) => String(a?.id || a?.actionId || a?.name || '') === forcedActionId) || { id: forcedActionId, q: (rest[0]?.q ?? 0) + 1e-6 };
      return [forced, ...rest];
    })();

    const transitionSnapshot = enablePredict
      ? buildTransitionSnapshot({
          selfId,
          tick,
          seed: Number(input.observeLiteParams?.seed ?? (step as any)?.seed ?? 0),
          gamma: lookaheadGamma,
          riskAversion: lookaheadRisk,
          atoms: mS8c.atoms,
          actions: rankedForLookahead.slice(0, 10).map((a: any) => ({
            id: String(a?.id || a?.actionId || a?.name || ''),
            kind: String(a?.kind || ''),
            qNow: Number(a?.q ?? 0),
          })),
          goalEnergy,
        })
      : null;

    // Optional: steer stochastic choice by lookahead Q while preserving ranked q reporting.
    const qSamplingOverrides = (useLookaheadForChoice && transitionSnapshot)
      ? (() => {
          const out: Record<string, number> = {};
          for (const ev of transitionSnapshot.perAction || []) {
            const id = String((ev as any)?.actionId || '');
            if (!id) continue;
            out[id] = Number((ev as any)?.qLookahead ?? 0);
          }
          return out;
        })()
      : undefined;

    const decision = decideAction({
      actions,
      goalEnergy,
      topK: 10,
      rng: rng && typeof rng.next === 'function' ? () => rng.next() : () => 0.5,
      temperature,
      qSamplingOverrides,
    });

    const decisionAtoms = arr((decision as any)?.atoms).map(normalizeAtom);
    const mS8d = mergeAtomsPreferNewer(mS8c.atoms, decisionAtoms);
    const atomsS8 = mS8d.atoms;
    const s8Added = uniqStrings([...mS8a.newIds, ...mS8b.newIds, ...mS8c.newIds, ...mS8d.newIds]);
    const s8Overridden = uniqStrings([...mS8a.overriddenIds, ...mS8b.overriddenIds, ...mS8c.overriddenIds, ...mS8d.overriddenIds]);
    atoms = atomsS8;

    // Invariant (C2/C8): Action layer must not read Goal atoms directly.
    // The decision layer is expected to read util:* projections instead.
    const actionReadsGoalViolations = (() => {
      const actionAtoms = atomsS8.filter(a => a.ns === 'action');
      const bad: string[] = [];
      for (const a of actionAtoms) {
        const used = arr((a as any)?.trace?.usedAtomIds).map(String);
        const hits = used.filter(id => id.startsWith('goal:'));
        if (hits.length) bad.push(`${a.id} <- ${hits.join(', ')}`);
      }
      return bad;
    })();

    const rankedActions = arr((decision as any)?.ranked).map((r: any) => ({
      ...(r?.action || {}),
      q: Number(r?.q ?? 0),
    }));

    // Level 4.0b (J): decision breakdown per action (goal contributions + cost/confidence).
    const buildDecisionBreakdown = (actionObj: any, q: number) => {
      const deltaGoals = actionObj?.deltaGoals && typeof actionObj.deltaGoals === 'object' ? actionObj.deltaGoals : {};
      const contribByGoal: Record<string, number> = {};
      let sum = 0;
      for (const [g, delta] of Object.entries(deltaGoals)) {
        const w = Number((goalEnergy as any)?.[g] ?? 0);
        const d = Number(delta ?? 0);
        const c = w * d;
        contribByGoal[String(g)] = c;
        sum += c;
      }
      const cost = Number(actionObj?.cost ?? 0);
      const conf = Number(actionObj?.confidence ?? 1);

      const id = String(actionObj?.id || actionObj?.actionId || actionObj?.name || '');
      const look = id ? (lookByActionId.get(id) || null) : null;

      return {
        id,
        kind: String(actionObj?.kind || ''),
        targetId: actionObj?.targetId ?? null,
        q: Number(q ?? 0),
        cost,
        confidence: conf,
        deltaGoals,
        contribByGoal,
        rawBeforeConfidence: sum - cost,
        // Lookahead (optional): Q_lookahead = Q_now + gamma * V(z_hat).
        qLookahead: look ? Number(look.qLookahead ?? 0) : null,
        deltaLookahead: look ? Number(look.delta ?? 0) : null,
        v1: look ? Number(look.v1 ?? 0) : null,
      };
    };

    const bestRaw = (decision as any)?.best || null;
    const bestOverridden = forcedActionId
      ? (rankedActions.find((a: any) => String(a?.id || a?.actionId || a?.name || '') === forcedActionId) || { id: forcedActionId })
      : bestRaw;

    const rankedOverridden = (() => {
      if (!forcedActionId) return rankedActions;
      const rest = rankedActions.filter((a: any) => String(a?.id || a?.actionId || a?.name || '') !== forcedActionId);
      const forced = rankedActions.find((a: any) => String(a?.id || a?.actionId || a?.name || '') === forcedActionId) || { id: forcedActionId, q: (rest[0]?.q ?? 0) + 1e-6 };
      return [forced, ...rest];
    })();

    const lookByActionId = new Map<string, any>();
    if (transitionSnapshot) {
      for (const ev of transitionSnapshot.perAction || []) {
        const id = String((ev as any)?.actionId || '');
        if (id) lookByActionId.set(id, ev);
      }
    }

    const decisionWarnings = arr<string>((decision as any)?.warnings);

    // Level 4.5: explicit mode/stabilizer snapshots for console observability.
    const modesSnapshot = {
      fastMode: !!(input.sceneControl as any)?.fastMode,
      source: (input as any)?.worldSource || 'derived',
      consoleMode: true,
      observe: {
        radius: input.observeLiteParams?.radius ?? null,
        noise: input.observeLiteParams?.noiseSigma ?? null,
        seed: input.observeLiteParams?.seed ?? null,
      },
      forcedActionId: forcedActionId || null,
      enableToM: (input.sceneControl as any)?.enableToM !== false,
      enablePredict: enablePredict,
      useLookaheadForChoice: useLookaheadForChoice,
      lookahead: enablePredict ? { gamma: lookaheadGamma, riskAversion: lookaheadRisk } : null,
    };

    const stabilizersSnapshot = {
      temperature,
      forced: forcedActionId || null,
      emptyGoalEnergy: !goalEnergy || Object.keys(goalEnergy).length === 0,
      useLookaheadForChoice: useLookaheadForChoice,
      warnings: decisionWarnings || [],
    };

    stages.push({
      stage: 'S8',
      title: 'S8 Decision / actions',
      atoms,
      atomsAddedIds: s8Added,
      warnings: actionReadsGoalViolations.map(v => `INVARIANT: action reads goal:* (${v})`),
      stats: { atomCount: atoms.length, addedCount: s8Added.length, ...stageStats(atoms) },
      artifacts: {
        // Keep artifacts light: export is dominated by atoms; store only top scoring + access decisions.
        accessDecisions: (accessPack as any)?.decisions || [],
        ranked: rankedOverridden.slice(0, 10),
        best: bestOverridden,
        decisionSnapshot: {
          selfId,
          temperature,
          goalEnergy,
          digest: (() => {
            const entries = Object.entries(goalEnergy || {})
              .map(([id, energy]) => ({ id: String(id), energy: Number(energy) }))
              .filter((x) => x.id && Number.isFinite(x.energy));
            entries.sort((a, b) => Math.abs(b.energy) - Math.abs(a.energy));
            const leadingGoal = entries.length ? entries[0] : null;

            const linearBest = rankedBaseline && rankedBaseline.length
              ? (() => {
                  const top: any = rankedBaseline[0];
                  const a: any = top?.action;
                  return {
                    actionId: String(a?.id || ''),
                    kind: String(a?.kind || ''),
                    targetId: a?.targetId ? String(a.targetId) : undefined,
                    qNow: Number(top?.q ?? 0),
                  };
                })()
              : null;

            const pomdpBest = transitionSnapshot && (transitionSnapshot.perAction || []).length
              ? (() => {
                  const x: any = (transitionSnapshot.perAction || [])[0];
                  return {
                    actionId: String(x?.actionId || ''),
                    kind: String(x?.kind || ''),
                    qNow: Number(x?.qNow ?? 0),
                    qLookahead: Number(x?.qLookahead ?? 0),
                    delta: Number(x?.delta ?? 0),
                  };
                })()
              : null;

            const chosen = bestOverridden
              ? {
                  actionId: String((bestOverridden as any)?.id || ''),
                  kind: String((bestOverridden as any)?.kind || ''),
                  targetId: (bestOverridden as any)?.targetId ? String((bestOverridden as any).targetId) : undefined,
                  forcedActionId: forcedActionId || null,
                }
              : null;

            return {
              leadingGoal: leadingGoal ? { id: leadingGoal.id, energy: leadingGoal.energy } : null,
              linearBest,
              pomdpBest,
              chosen,
            };
          })(),
          ranked: arr((decision as any)?.ranked).slice(0, 10).map((r: any) => buildDecisionBreakdown(r?.action || {}, r?.q)),
          rankedOverridden: rankedOverridden.slice(0, 10).map((a: any) => buildDecisionBreakdown(a, a?.q)),
          best: bestOverridden ? buildDecisionBreakdown(bestOverridden as any, (bestOverridden as any)?.q ?? 0) : null,
          forcedActionId: forcedActionId || null,
          note: 'Decision breakdown: Q(a)=Σ_g goalEnergy[g]*Δg(a) - cost(a), then *confidence(a). contribByGoal are pre-confidence.',
          lookahead: transitionSnapshot ? {
            enabled: true,
            gamma: transitionSnapshot.gamma,
            riskAversion: transitionSnapshot.riskAversion,
            v0: transitionSnapshot.valueFn?.v0 ?? null,
            ranked: (transitionSnapshot.perAction || []).slice(0, 10).map((x: any) => ({
              actionId: String(x?.actionId || ''),
              qLookahead: Number(x?.qLookahead ?? 0),
              delta: Number(x?.delta ?? 0),
              v1: Number(x?.v1 ?? 0),
            })),
          } : { enabled: false },
          noteLookahead: 'Q_lookahead = Q_now + gamma * V*(z_hat, goalEnergy); z_hat = z + Δz_passive + Δz_action + noise; V* uses goal-weighted projections over features (fallbacks to legacy V if goalEnergy empty).',
          featureVector: transitionSnapshot ? transitionSnapshot.z0 : null,
          linearApprox: transitionSnapshot ? {
            perAction: (transitionSnapshot.perAction || []).slice(0, 10).map((x: any, i: number) => ({
              rank: i + 1,
              actionId: String(x?.actionId || ''),
              kind: String(x?.kind || ''),
              qNow: Number(x?.qNow ?? 0),
              qLookahead: Number(x?.qLookahead ?? 0),
              deltaLookahead: Number(x?.delta ?? 0),
              v1: Number(x?.v1 ?? 0),
              topDeltas: Object.entries(x?.deltas || {})
                .map(([k, v]: any) => ({ k, v: Number(v ?? 0) }))
                .sort((a: any, b: any) => Math.abs(b.v) - Math.abs(a.v))
                .slice(0, 4),
              v1PerGoal: x?.v1PerGoal || null,
            })),
            sensitivity: transitionSnapshot.sensitivity || null,
            sensitivityZ0: transitionSnapshot.sensitivityZ0 || null,
            flipCandidates: transitionSnapshot.flipCandidates || null,
          } : null

        },
        forcedActionId: forcedActionId || null,
        modesSnapshot,
        stabilizersSnapshot,
        intentPreview: buildIntentPreview({
          selfId,
          atoms: atomsS8,
          s8Artifacts: { best: bestOverridden, ranked: rankedOverridden },
          horizonSteps: 5,
        }),
        overriddenIds: s8Overridden,
        priorsAtomIds: (priorsAtoms || []).map(a => String((a as any)?.id || '')),
        decisionAtomIds: decisionAtoms.map(a => String((a as any)?.id || '')),
      }
    });


    if (transitionSnapshot) {
      stages.push({
        stage: 'S9',
        title: 'S9 Predict tick (linear lookahead)',
        atoms,
        atomsAddedIds: [],
        warnings: (transitionSnapshot.warnings || []).slice(),
        stats: { atomCount: atoms.length, addedCount: 0, ...stageStats(atoms) },
        artifacts: {
          transitionSnapshot,
        }
      });
    }
  } catch (e: any) {
    stages.push({
      stage: 'S8',
      title: 'S8 Decision / actions (FAILED)',
      atoms,
      atomsAddedIds: [],
      warnings: [String(e?.message || e)],
      stats: { atomCount: atoms.length, addedCount: 0, ...stageStats(atoms) },
      artifacts: {
        error: {
          name: String(e?.name || ''),
          message: String(e?.message || e),
          stack: String(e?.stack || ''),
        }
      }
    });
  }

  return { schemaVersion: 1, selfId, tick, step, participantIds: participantIds.slice(), stages };
}
