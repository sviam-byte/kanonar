import type { GoalLabPipelineV1, GoalLabStageFrame } from './runPipelineV1';
import type { ArtifactRef, PipelineRun, PipelineStage, Provenance } from './contracts';
import { arr } from '../../utils/arr';

const TYPED_V1_KEYS = new Set([
  'obsAtomsCount',
  'provenanceSize',
  'observationSnapshot',
  'quarks',
  'socialProximity',
  'hazardGeometry',
  'ctxAxisCount',
  'lens',
  'appCount',
  'emoCount',
  'dyEmoCount',
  'relPriorsCount',
  'nonContextDyadCount',
  'beliefBiasCount',
  'policyCount',
  'contextMind',
  'drvCount',
  'goalAtomsCount',
  'goalDebug',
  'planGoalAtomsCount',
  'goalActionLinksCount',
  'utilAtomsCount',
  'topPlanGoals',
  'accessDecisions',
  'ranked',
  'best',
  'intentPreview',
  'overriddenIds',
  'priorsAtomIds',
  'decisionAtomIds',
  'error',
]);

function stableArtifactId(stageId: string, kind: string, key: string): string {
  const clean = String(key || 'artifact').replace(/[^a-zA-Z0-9:_-]+/g, '_');
  return `${stageId}:${kind}:${clean}`;
}

function coerceProvenanceFromAtom(atom: any, stageId: string): Provenance[] | undefined {
  const tr = atom?.trace;
  if (!tr || typeof tr !== 'object') return undefined;
  const used = arr<string>((tr as any).usedAtomIds).filter((x) => typeof x === 'string' && x.length > 0);
  const parts = (tr as any).parts;
  const notes = arr<string>((tr as any).notes).filter((x) => typeof x === 'string' && x.length > 0);

  const prov: Provenance[] = [];

  // Minimal, but real: reference the dependency chain by usedAtomIds.
  if (used.length) {
    for (const u of used.slice(0, 24)) {
      prov.push({
        group: 'H',
        path: `H.atom.${u}`,
        stageId,
        producer: 'atom.trace.usedAtomIds',
        note: 'dependency',
      });
    }
  }

  // If parts is a dict, expose keys as provenance pointers (best-effort).
  if (parts && typeof parts === 'object' && !Array.isArray(parts)) {
    for (const k of Object.keys(parts).slice(0, 24)) {
      prov.push({
        group: 'X',
        path: `X.trace.parts.${k}`,
        stageId,
        producer: 'atom.trace.parts',
      });
    }
  }

  // Attach short notes (debuggable human strings).
  for (const n of notes.slice(0, 16)) {
    prov.push({
      group: 'X',
      path: 'X.trace.note',
      stageId,
      producer: 'atom.trace.notes',
      note: n,
    });
  }

  return prov.length ? prov : undefined;
}

function buildArtifactsFromFrame(frame: GoalLabStageFrame, run: GoalLabPipelineV1): ArtifactRef[] {
  const stageId = String(frame.stage);
  const out: ArtifactRef[] = [];

  // Always expose atoms as a first-class artifact (even if empty).
  const atoms = arr<any>(frame.atoms).map((a: any) => ({
    ...a,
    provenance: coerceProvenanceFromAtom(a, stageId),
  }));

  out.push({
    id: stableArtifactId(stageId, 'atoms', 'atoms'),
    kind: 'atoms',
    label: 'Atoms',
    data: { atoms, addedIds: arr<string>(frame.atomsAddedIds) },
  });

  // Stage-specific typed artifacts (Level 2): expose known V1 artifacts under stable kinds.
  // This keeps the UI honest: it shows what the real pipeline computed, without inventing new semantics.
  const v1 = frame.artifacts && typeof frame.artifacts === 'object' ? frame.artifacts : {};

  const push = (kind: ArtifactRef['kind'], key: string, label: string, data: any) => {
    out.push({
      id: stableArtifactId(stageId, kind, key),
      kind,
      label,
      data,
    });
  };

  // S0: canonicalization summary (truth/observation/modes proxy).
  // Level 3.0 (minimal honesty): expose Truth vs Observation vs Belief slices from S0 atoms.
  // We do not have the full world snapshot here, but S0 already produces typed atoms with stable prefixes.
  if (stageId === 'S0') {
    const prefixCounts: Record<string, number> = {};
    for (const a of atoms) {
      const id = String((a as any)?.id || '');
      const pfx = id.split(':', 1)[0] || 'other';
      prefixCounts[pfx] = (prefixCounts[pfx] || 0) + 1;
    }

    const pickByPrefix = (allow: Set<string>) =>
      atoms.filter((a: any) => {
        const id = String(a?.id || '');
        const p = id.split(':', 1)[0] || '';
        return allow.has(p);
      });

    const pickByIds = (ids: string[]) => {
      if (!ids.length) return [];
      const set = new Set(ids);
      const outAtoms: any[] = [];
      for (const a of atoms) {
        const id = String((a as any)?.id || '');
        if (set.has(id)) outAtoms.push(a);
      }
      return outAtoms;
    };

    // Heuristic prefix groups (best-effort, but faithful to existing S0 atom ids).
    const truthPfx = new Set(['truth', 'world', 'scene', 'geo', 'phys', 'map', 'loc']);
    const obsPfx = new Set(['obs', 'see', 'seen', 'vis', 'percept']);
    const beliefPfx = new Set(['belief', 'mem', 'prior', 'self', 'trait', 'bio', 'ctx']);

    const truthAtoms = pickByPrefix(truthPfx);
    // Level 3.1+: prefer explicit obsAtomIds from observationSnapshot if present.
    const obsSnap = (v1 as any)?.observationSnapshot;
    const obsAtomIds = Array.isArray(obsSnap?.obsAtomIds) ? obsSnap.obsAtomIds.filter((x: any) => typeof x === 'string') : [];
    const obsAtoms = obsAtomIds.length ? pickByIds(obsAtomIds) : pickByPrefix(obsPfx);
    const beliefAtoms = pickByPrefix(beliefPfx);

    push('truth', 'truth_atoms', 'Truth atoms (S0)', {
      count: truthAtoms.length,
      atoms: truthAtoms.slice(0, 300),
      note: 'Best-effort slice by atom id prefix. This is the closest available Truth view in S0.',
    });

    push('observation', 'observation_atoms', 'Observation atoms (S0)', {
      count: obsAtoms.length,
      atoms: obsAtoms.slice(0, 300),
      note: obsAtomIds.length
        ? 'S0 observation slice by explicit obsAtomIds (from observationSnapshot).'
        : 'S0 observation slice by atom id prefix (obs:* / vis:*).',
    });

    push('belief', 'belief_atoms', 'Belief/Memory atoms (S0)', {
      count: beliefAtoms.length,
      atoms: beliefAtoms.slice(0, 300),
      note: 'S0 belief-ish slice by atom id prefix (mem:* / belief:* / self:* / trait:*).',
    });

    push('truth', 'truth_summary', 'Truth summary (by atom prefix)', { prefixCounts });
    push('modes', 'run_step', 'Modes / step', {
      tick: Number(run.tick ?? 0),
      step: (run as any).step ?? null,
    });
    if ((v1 as any).obsAtomsCount != null || (v1 as any).provenanceSize != null || (v1 as any)?.observationSnapshot != null) {
      push('observation', 'observation_summary', 'Observation summary', {
        obsAtomsCount: (v1 as any).obsAtomsCount ?? null,
        provenanceSize: (v1 as any).provenanceSize ?? null,
        observationSnapshot: (v1 as any).observationSnapshot ?? null,
      });
      if ((v1 as any)?.observationSnapshot != null) {
        push('observation', 'observation_snapshot', 'ObservationSnapshot (S0)', (v1 as any).observationSnapshot);
      }
    }

    if ((v1 as any)?.beliefUpdateSnapshot != null) {
      push('belief', 'belief_update_snapshot', 'BeliefUpdateSnapshot (lite, S0)', (v1 as any).beliefUpdateSnapshot);
    }
  }

  // S1: quarks are compact observation features.
  if (stageId === 'S1' && (v1 as any).quarks != null) {
    push('observation', 'quarks', 'Quarks', (v1 as any).quarks);
  }

  // S2-S4: context/lens/emotions shape belief state.
  if (stageId === 'S2') {
    push('belief', 'context_axes', 'Context axes / enrichers', {
      socialProximity: (v1 as any).socialProximity ?? null,
      hazardGeometry: (v1 as any).hazardGeometry ?? null,
      ctxAxisCount: (v1 as any).ctxAxisCount ?? null,
      overriddenIds: (v1 as any).overriddenIds ?? [],
      moduleAdds: (v1 as any).moduleAdds ?? null,
    });
  }
  if (stageId === 'S3') {
    push('belief', 'lens', 'Lens (subjective overrides)', {
      lens: (v1 as any).lens ?? null,
      overriddenIds: (v1 as any).overriddenIds ?? [],
    });
  }
  if (stageId === 'S4') {
    push('belief', 'appraisal_emotions', 'Appraisal → Emotions', {
      appCount: (v1 as any).appCount ?? null,
      emoCount: (v1 as any).emoCount ?? null,
      dyEmoCount: (v1 as any).dyEmoCount ?? null,
      overriddenIds: (v1 as any).overriddenIds ?? [],
    });
  }

  // S5: ToM summaries.
  if (stageId === 'S5') {
    push('tom', 'tom_summary', 'ToM summary', {
      relPriorsCount: (v1 as any).relPriorsCount ?? null,
      nonContextDyadCount: (v1 as any).nonContextDyadCount ?? null,
      beliefBiasCount: (v1 as any).beliefBiasCount ?? null,
      policyCount: (v1 as any).policyCount ?? null,
      overriddenIds: (v1 as any).overriddenIds ?? [],
    });
  }

  // S6: ContextMind and driver layer.
  if (stageId === 'S6') {
    push('belief', 'contextmind', 'ContextMind / Drivers', {
      contextMind: (v1 as any).contextMind ?? null,
      drvCount: (v1 as any).drvCount ?? null,
      overriddenIds: (v1 as any).overriddenIds ?? [],
    });
  }

  // S7: Goal ecology and planning surface.
  if (stageId === 'S7') {
    push('goals', 'goals', 'Goals (ecology + planning)', {
      goalAtomsCount: (v1 as any).goalAtomsCount ?? null,
      goalDebug: (v1 as any).goalDebug ?? null,
      planGoalAtomsCount: (v1 as any).planGoalAtomsCount ?? null,
      goalActionLinksCount: (v1 as any).goalActionLinksCount ?? null,
      utilAtomsCount: (v1 as any).utilAtomsCount ?? null,
      topPlanGoals: (v1 as any).topPlanGoals ?? [],
      overriddenIds: (v1 as any).overriddenIds ?? [],
    });
  }

  // S8: Final decision surface.
  if (stageId === 'S8') {
    if ((v1 as any).error) {
      push('decision', 'decision_error', 'Decision error', (v1 as any).error);
    }
    push('decision', 'decision', 'Decision (ranked/best/intent)', {
      accessDecisions: (v1 as any).accessDecisions ?? [],
      ranked: (v1 as any).ranked ?? [],
      best: (v1 as any).best ?? null,
      intentPreview: (v1 as any).intentPreview ?? null,
      overriddenIds: (v1 as any).overriddenIds ?? [],
      priorsAtomIds: (v1 as any).priorsAtomIds ?? [],
      decisionAtomIds: (v1 as any).decisionAtomIds ?? [],
    });
  }

  // Pass through remaining raw V1 artifacts as debug (bounded by known typed key set).
  for (const k of Object.keys(v1)) {
    if (TYPED_V1_KEYS.has(k)) continue;
    push('debug', `raw_${k}`, `V1:${k}`, (v1 as any)[k]);
  }

  return out;
}

export function adaptPipelineV1ToContract(p: GoalLabPipelineV1 | null): PipelineRun | null {
  if (!p) return null;
  const stages: PipelineStage[] = arr<GoalLabStageFrame>(p.stages).map((s) => {
    const stats =
      s.stats && typeof s.stats === 'object'
        ? {
            atomCount: Number((s as any).stats?.atomCount ?? 0),
            addedCount: Number((s as any).stats?.addedCount ?? 0),
            missingCodeCount: Number((s as any).stats?.missingCodeCount ?? 0),
            missingTraceDerivedCount: Number((s as any).stats?.missingTraceDerivedCount ?? 0),
          }
        : undefined;

    return {
      id: String(s.stage),
      title: String(s.title || s.stage),
      warnings: arr<string>(s.warnings),
      stats,
      artifacts: buildArtifactsFromFrame(s, p),
    };
  });

  return {
    schemaVersion: 2,
    selfId: String(p.selfId),
    tick: Number(p.tick ?? 0),
    participantIds: arr<string>(p.participantIds),
    stages,
  };
}
