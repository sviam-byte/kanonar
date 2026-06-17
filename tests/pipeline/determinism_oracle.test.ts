// tests/pipeline/determinism_oracle.test.ts
// Determinism oracle (Phase 1b): a seeded run with a fixed config must reproduce
// identical SEMANTIC output. Per AGENTS.md ("Full record byte equality is not a
// valid determinism check while snapshots include wall-clock `time`; compare
// semantic fields instead"), we project each atom to its computed semantics
// (id/ns/kind/origin/magnitude/confidence/usedAtomIds) and deliberately exclude
// wall-clock/id-only fields (timestamp/t/time). This makes "deterministic" a
// machine-enforced property of the canonical pipeline rather than an assumption.

import { describe, expect, it } from 'vitest';

import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';
import type { ContextAtom } from '@/lib/context/v2/types';
import { arr } from '@/lib/utils/arr';

import { mockAgent, mockWorld } from './fixtures';

// Fresh-but-identical input each call (fixtures are pure: no Date.now / no RNG).
// Cast as any to match the existing pipeline tests, which pass extra sceneControl
// tuning fields the public input type does not enumerate.
function fixedInput() {
  return {
    world: mockWorld([mockAgent('A'), mockAgent('B')]),
    agentId: 'A',
    participantIds: ['A', 'B'],
    observeLiteParams: { seed: 1234 },
    sceneControl: {
      enableToM: true,
      enablePredict: true,
      useLookaheadForChoice: true,
      lookaheadGamma: 0.7,
      lookaheadRiskAversion: 0.2,
    },
  } as any;
}

type AtomSemantics = {
  id: string;
  ns: string;
  kind: string;
  origin: string;
  magnitude: number | null;
  confidence: number | null;
  usedAtomIds: string[];
};

function atomSemantics(a: ContextAtom): AtomSemantics {
  return {
    id: String(a?.id ?? ''),
    ns: String(a?.ns ?? ''),
    kind: String(a?.kind ?? ''),
    origin: String(a?.origin ?? ''),
    magnitude: Number.isFinite(a?.magnitude as number) ? Number(a?.magnitude) : null,
    confidence: Number.isFinite(a?.confidence as number) ? Number(a?.confidence) : null,
    usedAtomIds: arr<string>(a?.trace?.usedAtomIds).map(String).sort(),
  };
}

// Per-stage, id-sorted semantic projection. Sorting removes any incidental
// ordering noise so we test computed values, not iteration order.
function semanticProjection(p: any) {
  return arr(p?.stages).map((st: { stage?: unknown; atoms?: unknown }) => ({
    stage: String(st?.stage ?? ''),
    atoms: arr<ContextAtom>(st?.atoms)
      .map(atomSemantics)
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)),
  }));
}

describe('Pipeline: determinism oracle', () => {
  it('seeded run reproduces identical semantic output across all stages', () => {
    const p1 = runGoalLabPipelineV1(fixedInput());
    const p2 = runGoalLabPipelineV1(fixedInput());
    expect(semanticProjection(p1)).toEqual(semanticProjection(p2));
  });

  it('seeded decision ranking (S8) is reproducible', () => {
    const p1 = runGoalLabPipelineV1(fixedInput());
    const p2 = runGoalLabPipelineV1(fixedInput());

    const rankedOf = (p: any) => {
      const s8 = arr(p?.stages).find(
        (s: { stage?: unknown }) => String(s?.stage ?? '') === 'S8',
      ) as { artifacts?: { ranked?: unknown } } | undefined;
      return arr(s8?.artifacts?.ranked).map((r: Record<string, unknown>) => ({
        id: String(r?.id ?? r?.actionId ?? r?.name ?? ''),
        q: Number(r?.q ?? 0),
      }));
    };

    expect(rankedOf(p1)).toEqual(rankedOf(p2));
  });
});
