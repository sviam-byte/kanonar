// tests/pipeline/provenance_gate.test.ts
// Provenance gate (Phase 1a): every DERIVED atom must declare how it was produced
// -- either a non-empty trace.usedAtomIds (it references its inputs) or non-empty
// trace.parts (it records the computed breakdown). This promotes the existing
// runPipelineV1 `stageStats.missingTraceDerivedCount` observation into an enforced
// invariant: a green run now means derived atoms are inspectable, not merely that
// the pipeline did not throw.
//
// Legitimate exceptions (true leaves, or documented derived atoms that intentionally
// carry neither) go in PROVENANCE_WHITELIST as id matchers. Keep it small and
// documented; an empty whitelist is the desired end state.

import { describe, expect, it } from 'vitest';

import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';
import type { ContextAtom } from '@/lib/context/v2/types';
import { arr } from '@/lib/utils/arr';

import { mockAgent, mockWorld } from './fixtures';

const PROVENANCE_WHITELIST: Array<(id: string) => boolean> = [
  // Add documented leaf/source prefixes here if a derived atom is a true leaf, e.g.:
  // (id) => id.startsWith('debug:'),
];

function isDerived(a: ContextAtom): boolean {
  return String(a?.origin ?? '') === 'derived';
}

// Mirrors runPipelineV1.stageStats: an atom is "missing provenance" iff it has no
// usedAtomIds AND its parts is null/undefined or an empty object. Anything else
// (a populated parts, or any usedAtomIds) counts as provenance.
function hasProvenance(a: ContextAtom): boolean {
  const tr = a?.trace;
  const used = Array.isArray(tr?.usedAtomIds) ? tr!.usedAtomIds! : [];
  if (used.length > 0) return true;
  const parts = tr?.parts;
  const partsEmpty =
    parts == null || (typeof parts === 'object' && Object.keys(parts).length === 0);
  return !partsEmpty;
}

function runFixturePipeline() {
  return runGoalLabPipelineV1({
    world: mockWorld([mockAgent('A'), mockAgent('B')]),
    agentId: 'A',
    participantIds: ['A', 'B'],
  });
}

describe('Pipeline: provenance gate', () => {
  it('every derived atom declares provenance (usedAtomIds or parts)', () => {
    const p = runFixturePipeline();

    const offenders: Array<{ stage: string; id: string; ns: string; source: string }> = [];
    for (const st of arr(p?.stages)) {
      const stage = String((st as { stage?: unknown })?.stage ?? '');
      for (const a of arr<ContextAtom>((st as { atoms?: unknown })?.atoms)) {
        if (!isDerived(a)) continue;
        const id = String(a?.id ?? '');
        if (PROVENANCE_WHITELIST.some((match) => match(id))) continue;
        if (!hasProvenance(a)) {
          offenders.push({
            stage,
            id,
            ns: String(a?.ns ?? ''),
            source: String((a as { source?: unknown })?.source ?? ''),
          });
        }
      }
    }

    expect(
      offenders,
      `Derived atoms missing provenance (no trace.usedAtomIds and no trace.parts).\n` +
        `Either fix the producing stage to record provenance, or whitelist a true leaf:\n` +
        offenders
          .slice(0, 40)
          .map((o) => `  [${o.stage}] ${o.id} (ns=${o.ns} source=${o.source})`)
          .join('\n'),
    ).toEqual([]);
  });

  it('provenance walk agrees with runPipelineV1 stageStats counter', () => {
    // Cross-check: our derived-without-provenance count (no whitelist) must equal
    // the sum of the runtime's own stageStats.missingTraceDerivedCount. This pins
    // the gate's definition to the runtime's and catches silent drift in either.
    const p = runFixturePipeline();

    let walkMissing = 0;
    for (const st of arr(p?.stages)) {
      for (const a of arr<ContextAtom>((st as { atoms?: unknown })?.atoms)) {
        if (isDerived(a) && !hasProvenance(a)) walkMissing += 1;
      }
    }

    const statTotal = arr(p?.stages).reduce(
      (sum: number, st: { stats?: { missingTraceDerivedCount?: unknown } }) =>
        sum + Number(st?.stats?.missingTraceDerivedCount ?? 0),
      0,
    );

    expect(walkMissing).toBe(statTotal);
  });
});
