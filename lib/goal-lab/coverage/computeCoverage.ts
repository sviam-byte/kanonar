
// lib/goal-lab/coverage/computeCoverage.ts
import { ContextAtom } from '../../context/v2/types';
import { CoverageGroup, DEFAULT_COVERAGE_GROUPS, Expectation } from './expectations';
import { GOAL_LAB_COVERAGE_SCHEMA_VERSION } from '../versioning';

export type CoverageHit = {
  expectationId: string;
  label: string;
  ok: boolean;
  severity: 'info' | 'warn' | 'error';
  matchedAtomIds: string[];
};

export type CoverageReport = {
  schemaVersion: typeof GOAL_LAB_COVERAGE_SCHEMA_VERSION;
  total: number;
  ok: number;
  missing: number;
  groups: {
    groupId: string;
    title: string;
    hits: CoverageHit[];
  }[];
};

function matchExpectation(atoms: ContextAtom[], e: Expectation): CoverageHit {
  const matched: string[] = [];

  for (const rule of e.anyOf) {
    if (rule.exact) {
      if (atoms.some(a => a.id === rule.exact)) matched.push(rule.exact);
    }
    if (rule.prefix) {
      for (const a of atoms) {
        if (a.id?.startsWith(rule.prefix)) matched.push(a.id);
      }
    }
  }

  const uniq = Array.from(new Set(matched)).slice(0, 30);
  const ok = uniq.length > 0;

  return {
    expectationId: e.id,
    label: e.label,
    ok,
    severity: (e.severity || 'info'),
    matchedAtomIds: uniq
  };
}

export function computeCoverageReport(atoms: ContextAtom[], groups?: CoverageGroup[]): CoverageReport {
  const g = groups || DEFAULT_COVERAGE_GROUPS;

  const outGroups = g.map(gr => {
    const hits = gr.expectations.map(e => matchExpectation(atoms, e));
    return { groupId: gr.groupId, title: gr.title, hits };
  });

  const flat = outGroups.flatMap(x => x.hits);
  const ok = flat.filter(h => h.ok).length;

  return {
    schemaVersion: GOAL_LAB_COVERAGE_SCHEMA_VERSION,
    total: flat.length,
    ok,
    missing: flat.length - ok,
    groups: outGroups
  };
}
