import type { WorldState, AgentState } from '../../../types';
import type { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';

import { buildStage0Atoms } from '../../context/pipeline/stage0';
import { deriveSocialProximityAtoms } from '../../context/stage1/socialProximity';
import { deriveHazardGeometryAtoms } from '../../context/stage1/hazardGeometry';
import { deriveAxes } from '../../context/axes/deriveAxes';
import { applyCharacterLens } from '../../context/lens/characterLens';

import { applyRelationPriorsToDyads } from '../../tom/base/applyRelationPriors';
import { buildBeliefToMBias } from '../../tom/ctx/beliefBias';
import { buildTomPolicyLayer } from '../../tom/policy/tomPolicy';

import { deriveAppraisalAtoms } from '../../emotion/appraisals';
import { deriveEmotionAtoms } from '../../emotion/emotions';
import { deriveDyadicEmotionAtoms } from '../../emotion/dyadic';

import { atomizeContextMindMetrics } from '../../contextMind/atomizeMind';
import { computeContextMindScoreboard } from '../../contextMind/scoreboard';

import { deriveDriversAtoms } from '../../drivers/deriveDrivers';

import { derivePossibilitiesRegistry } from '../../possibilities/derive';
import { atomizePossibilities } from '../../possibilities/atomize';
import { deriveAccess } from '../../access/deriveAccess';
import { deriveActionPriors } from '../../decision/actionPriors';
import { decideAction } from '../../decision/decide';
import { arr } from '../../utils/arr';

export type GoalLabStageId = 'S0'|'S1'|'S2'|'S3'|'S4'|'S5'|'S6'|'S7'|'S8';

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
  participantIds: string[];
  stages: GoalLabStageFrame[];
};

function indexById(atoms: ContextAtom[]): Set<string> {
  const s = new Set<string>();
  for (const a of atoms) if (a && typeof (a as any).id === 'string') s.add((a as any).id);
  return s;
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
      return normalizeAtom({
        ...(a as any),
        id: `ctx:base:${id.slice('ctx:'.length)}`,
        origin: 'derived',
        source: 'pipeline:S3.baseCopy',
        label: (a as any)?.label ? `[base] ${(a as any).label}` : `[base] ${id}`,
        trace: { usedAtomIds: [id], notes: ['debug-only base copy'], parts: { selfId } }
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

import { arr } from '../../utils/arr';

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
}): GoalLabPipelineV1 | null {
  const { world, agentId, participantIds } = input;
  const tick = Number(input.tickOverride ?? (world as any)?.tick ?? 0);
  const agent = arr((world as any)?.agents).find((a: any) => a?.entityId === agentId) as AgentState | undefined;
  if (!agent) return null;
  const selfId = agent.entityId;

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
    events: [
      ...arr(input.injectedEvents),
      ...arr((world as any)?.eventLog?.events),
    ],
    sceneSnapshot: (world as any).sceneSnapshot,
    includeAxes: false
  });
  atoms = arr((s0 as any)?.mergedAtoms).map(normalizeAtom);
  stages.push({
    stage: 'S0',
    title: 'S0 Canonicalization (world/obs/mem/override)',
    atoms,
    atomsAddedIds: atoms.map(a => String((a as any).id)).filter(Boolean),
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: atoms.length, ...stageStats(atoms) },
    artifacts: { obsAtomsCount: arr((s0 as any)?.obsAtoms).length, provenanceSize: ((s0 as any)?.provenance as any)?.size ?? 0 }
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
  const sp = deriveSocialProximityAtoms({ selfId, atoms });
  const hz = deriveHazardGeometryAtoms({ selfId, atoms });
  const atomsS2in = [...atoms, ...arr((sp as any)?.atoms), ...arr((hz as any)?.atoms)].map(normalizeAtom);
  const ctx = deriveAxes({ selfId, atoms: atomsS2in });
  const ctxAtoms = arr((ctx as any)?.atoms).map(normalizeAtom);
  const ctxBaseCopies = cloneAsBaseCtxAtoms(ctxAtoms, selfId);
  const atomsS2 = [...atomsS2in, ...ctxAtoms, ...ctxBaseCopies].map(normalizeAtom);
  const s2Added = computeAdded(atoms, atomsS2);
  atoms = atomsS2;
  stages.push({
    stage: 'S2',
    title: 'S2 Context axes (base ctx:*)',
    atoms,
    atomsAddedIds: s2Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s2Added.length, ...stageStats(atoms) },
    artifacts: { socialProximity: sp, hazardGeometry: hz, ctxAxisCount: ctxAtoms.length }
  });

  // S3: lens (субъективные поправки)
  const lens = applyCharacterLens({ selfId, atoms, agent });
  const atomsS3 = [...atoms, ...arr((lens as any)?.atoms)].map(normalizeAtom);
  const s3Added = computeAdded(atoms, atomsS3);
  atoms = atomsS3;
  stages.push({
    stage: 'S3',
    title: 'S3 Lens (subjective ctx/tom overrides)',
    atoms,
    atomsAddedIds: s3Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s3Added.length, ...stageStats(atoms) },
    artifacts: { lens: (lens as any)?.lens }
  });

  // S4: appraisal -> emotions
  const app = deriveAppraisalAtoms({ selfId, atoms });
  const emo = deriveEmotionAtoms({ selfId, atoms: [...atoms, ...arr((app as any)?.atoms)] });
  const dy = deriveDyadicEmotionAtoms({ selfId, atoms: [...atoms, ...arr((app as any)?.atoms), ...arr((emo as any)?.atoms)] });
  const atomsS4 = [...atoms, ...arr((app as any)?.atoms), ...arr((emo as any)?.atoms), ...arr((dy as any)?.atoms)].map(normalizeAtom);
  const s4Added = computeAdded(atoms, atomsS4);
  atoms = atomsS4;
  stages.push({
    stage: 'S4',
    title: 'S4 Appraisal → Emotions',
    atoms,
    atomsAddedIds: s4Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s4Added.length, ...stageStats(atoms) },
    artifacts: { appCount: (app?.atoms || []).length, emoCount: (emo?.atoms || []).length, dyEmoCount: (dy?.atoms || []).length }
  });

  // S5: ToM (priors/ctx/final + policy)
  const relPriors = applyRelationPriorsToDyads({ selfId, atoms });
  const beliefBias = buildBeliefToMBias({ selfId, atoms });
  const policy = buildTomPolicyLayer({ selfId, atoms: [...atoms, ...(relPriors?.atoms || []), ...(beliefBias?.atoms || [])] });
  const atomsS5 = [...atoms, ...(relPriors?.atoms || []), ...(beliefBias?.atoms || []), ...(policy?.atoms || [])].map(normalizeAtom);
  const s5Added = computeAdded(atoms, atomsS5);
  atoms = atomsS5;
  stages.push({
    stage: 'S5',
    title: 'S5 ToM (priors/ctx/final + policy)',
    atoms,
    atomsAddedIds: s5Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s5Added.length, ...stageStats(atoms) },
    artifacts: { relPriorsCount: (relPriors?.atoms || []).length, beliefBiasCount: (beliefBias?.atoms || []).length, policyCount: (policy?.atoms || []).length }
  });

  // S6: drivers bridge (canonical drv:* atoms)
  const scoreboard = computeContextMindScoreboard({ selfId, atoms });
  const mindAtoms = atomizeContextMindMetrics({ selfId, metrics: scoreboard as any, atoms });
  const drv = deriveDriversAtoms({ selfId, atoms: [...atoms, ...(mindAtoms || [])] });

  const atomsS6 = [...atoms, ...(mindAtoms || []), ...(drv?.atoms || [])].map(normalizeAtom);
  const s6Added = computeAdded(atoms, atomsS6);
  atoms = atomsS6;
  stages.push({
    stage: 'S6',
    title: 'S6 Drivers (drv:*) / ContextMind',
    atoms,
    atomsAddedIds: s6Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s6Added.length, ...stageStats(atoms) },
    artifacts: { contextMind: scoreboard, drvCount: (drv?.atoms || []).length }
  });

  // S7: goals (пока не атомизированы)
  stages.push({
    stage: 'S7',
    title: 'S7 Goals (not yet fully atomized)',
    atoms,
    atomsAddedIds: [],
    warnings: ['goals currently computed outside pipeline; atomization planned'],
    stats: { atomCount: atoms.length, addedCount: 0, ...stageStats(atoms) }
  });

  // S8: actions
  const possReg = derivePossibilitiesRegistry({ world, selfId, atoms, participantIds });
  const possAtoms = atomizePossibilities({ selfId, registry: possReg, atoms });
  const access = deriveAccess({ world, selfId, atoms, participantIds });
  const priors = deriveActionPriors({ selfId, atoms: [...atoms, ...possAtoms], possibilities: possReg as any, access: access as any });
  const choice = decideAction({ selfId, priors: priors as any, atoms, access: access as any, possibilities: possReg as any });
  const atomsS8 = [...atoms, ...possAtoms].map(normalizeAtom);
  const s8Added = computeAdded(atoms, atomsS8);
  atoms = atomsS8;
  stages.push({
    stage: 'S8',
    title: 'S8 Decision / actions',
    atoms,
    atomsAddedIds: s8Added,
    warnings: [],
    stats: { atomCount: atoms.length, addedCount: s8Added.length, ...stageStats(atoms) },
    artifacts: { access, actionPriors: priors, choice }
  });

  return { schemaVersion: 1, selfId, tick, participantIds: participantIds.slice(), stages };
}
