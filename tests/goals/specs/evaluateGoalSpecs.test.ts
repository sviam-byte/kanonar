import { describe, expect, it } from 'vitest';

import { evaluateCondition } from '../../../lib/goals/specs/evaluateCondition';
import { evaluateGoalSpec } from '../../../lib/goals/specs/evaluateGoalSpec';
import { GOAL_SPECS_V1 } from '../../../lib/goals/specs/registry';
import { deriveGoalPressuresV1 } from '../../../lib/goal-lab/pipeline/deriveGoalPressuresV1';
import { buildGoalEvalContext } from '../../../lib/goal-lab/pipeline/buildGoalEvalContext';

function makeCtx() {
  return buildGoalEvalContext({
    selfId: 'a:self',
    targetId: 'a:target',
    tick: 20,
    metrics: {
      hazard: 0.7,
      self_stress: 0.6,
      self_fatigue: 0.2,
      self_health: 0.9,
      trust: 0.4,
      closeness: 0.8,
      authority: 0.5,
      dependency: 0.3,
      distance: 1,
      uncertainty: 0.2,
      utility_of_target: 0.7,
    },
    recentEvents: [
      { id: 'e1', kind: 'threat', age: 1, salience: 0.8, targetId: 'a:self' },
    ],
    appraisals: [
      { tag: 'danger_to_self', score: 0.8, targetId: 'a:self' },
      { tag: 'target_distress', score: 0.5, targetId: 'a:target' },
    ],
    beliefs: ['belief:known'],
    capabilities: ['cap:talk'],
    recentActionKinds: ['withdraw'],
    cooldownReady: ['withdraw', 'seek_cover'],
  });
}

describe('GoalSpecV1 condition evaluator', () => {
  it('evaluates nested boolean conditions deterministically', () => {
    const ctx = makeCtx();
    const ok = evaluateCondition(
      {
        kind: 'all',
        conditions: [
          { kind: 'metric', metric: 'hazard', op: '>=', value: 0.5 },
          {
            kind: 'any',
            conditions: [
              { kind: 'belief', atomIds: ['belief:known'], mode: 'all' },
              { kind: 'capability', capabilityIds: ['cap:unknown'], mode: 'all' },
            ],
          },
        ],
      },
      ctx,
    );

    expect(ok).toBe(true);
  });

  it('respects blocker conditions in goal evaluation', () => {
    const ctx = makeCtx();
    const spec = {
      id: 'spec:test',
      family: 'survival' as const,
      label: 'test',
      description: 'test',
      targeting: 'self' as const,
      arisesFrom: [{ kind: 'metric', metric: 'hazard', op: '>=', value: 0.2 } as const],
      preconditions: [],
      blockers: [{ kind: 'metric', metric: 'self_stress', op: '>=', value: 0.5 } as const],
      priorityBase: 0.1,
      priorityRules: [],
      compatibleIntents: ['withdraw'],
    };

    const result = evaluateGoalSpec(spec, ctx);
    expect(result.active).toBe(false);
    expect(result.reasons).toContain('blocked');
  });
});

describe('GoalSpecV1 pressure derivation', () => {
  it('derives active pressures from the canonical registry', () => {
    const ctx = makeCtx();
    const derived = deriveGoalPressuresV1(ctx);

    expect(derived.length).toBeGreaterThan(0);
    expect(derived[0].pressure).toBeGreaterThanOrEqual(derived[derived.length - 1].pressure);
    expect(GOAL_SPECS_V1.length).toBeGreaterThanOrEqual(8);
  });
});
