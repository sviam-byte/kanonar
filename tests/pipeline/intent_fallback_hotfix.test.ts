import { describe, expect, it } from 'vitest';

import { buildGoalEvalContext } from '@/lib/goal-lab/pipeline/buildGoalEvalContext';
import { deriveIntentCandidatesV1 } from '@/lib/intents/specs/deriveIntentCandidatesV1';
import { INTENT_SPECS_V1 } from '@/lib/intents/specs/registry';
import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';

import { mockWorld } from './fixtures';

/**
 * Regression tests for v15 hotfix:
 * - Layer F must never return an empty intent set.
 * - Pipeline S7 artifacts must keep intent/schema candidate lists non-empty in calm scenes.
 */
describe('Hotfix v15: intent/schema deadlock prevention', () => {
  it('injects pause fallback when all registry intents are blocked', () => {
    // Build a deterministic baseline context with no special signals.
    const ctx = buildGoalEvalContext({
      selfId: 'self',
      targetId: 'target',
      tick: 1,
      metrics: {
        hazard: 0,
        self_stress: 0,
        self_fatigue: 0,
        self_health: 1,
        trust: 0,
        closeness: 0,
        authority: 0,
        dependency: 0,
        distance: 0,
        uncertainty: 0,
        utility_of_target: 0,
      },
      recentEvents: [],
      appraisals: [],
      beliefs: [],
      capabilities: [],
      recentActionKinds: [],
      cooldownReady: [],
    });

    // Temporarily replace registry with one impossible spec, then restore.
    const backup = [...INTENT_SPECS_V1];
    try {
      INTENT_SPECS_V1.splice(0, INTENT_SPECS_V1.length, {
        id: 'forced_blocked_intent',
        family: 'movement',
        label: 'blocked',
        description: 'blocked by impossible prereq',
        allowedGoalIds: [],
        targeting: 'self',
        prerequisites: [{ kind: 'metric', metric: 'hazard', op: '>', value: 1.5 }],
        blockers: [],
        scoreBase: 0,
        scoreModifiers: [],
        groundingHints: ['wait'],
      });

      const out = deriveIntentCandidatesV1(ctx, []);
      expect(out).toHaveLength(1);
      expect(out[0].intentId).toBe('pause');
      expect(out[0].reasons).toContain('fallback_no_active_intents');
    } finally {
      INTENT_SPECS_V1.splice(0, INTENT_SPECS_V1.length, ...backup);
    }
  });

  it('keeps S7 Layer F/G artifacts non-empty in calm baseline world', () => {
    const p = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
    });

    const s7 = (p?.stages ?? []).find((s) => s.stage === 'S7');
    expect(s7).toBeTruthy();

    const intents = Array.isArray(s7?.artifacts?.intentCandidatesV1)
      ? s7.artifacts.intentCandidatesV1
      : [];
    const schemas = Array.isArray(s7?.artifacts?.actionSchemaCandidatesV1)
      ? s7.artifacts.actionSchemaCandidatesV1
      : [];

    expect(intents.length).toBeGreaterThan(0);
    expect(schemas.length).toBeGreaterThan(0);
  });
});
