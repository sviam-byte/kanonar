import { derivePossibilities } from '../../context/possibilities/derivePossibilities';
import type { Possibility } from '../../context/possibilities/types';
import type { GoalLabScenario } from './scenarios';
import { generateGoalLabReportMarkdown } from '../reporting/generateGoalLabReport';
import type { GoalLabPipelineV1 } from '../pipeline/runPipelineV1';

export type ScenarioResult = {
  ok: boolean;
  failures: string[];
  report?: string;
  possibilities: Possibility[];
};

/**
 * Evaluate a scenario against the current possibilities output.
 * When pipeline data is provided, attach a GoalLab markdown report for inspection.
 */
export function runScenario(s: GoalLabScenario, pipeline?: GoalLabPipelineV1 | null): ScenarioResult {
  const { possibilities } = derivePossibilities(s.atoms, s.selfId);
  const failures: string[] = [];

  const findMatching = (prefix: string) => possibilities.filter((p) => String(p.id).startsWith(prefix));

  for (const pfx of (s.expect.mustDisablePrefixes ?? [])) {
    const matches = findMatching(pfx);
    const anyEnabled = matches.some((p) => Boolean(p.enabled));
    if (anyEnabled) failures.push(`Expected disabled: ${pfx} but got enabled`);
  }
  for (const pfx of (s.expect.mustEnablePrefixes ?? [])) {
    const matches = findMatching(pfx);
    const anyEnabled = matches.some((p) => Boolean(p.enabled));
    if (!anyEnabled) failures.push(`Expected enabled: ${pfx} but got disabled/missing`);
  }

  const ok = failures.length === 0;
  const report = pipeline
    ? generateGoalLabReportMarkdown(pipeline, { maxAtoms: 120, maxGoals: 30, maxActions: 20 })
    : undefined;

  return { ok, failures, report, possibilities };
}
