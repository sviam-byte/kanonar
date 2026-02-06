import { describe, expect, it } from 'vitest';
import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';

function mockWorld() {
  const location = {
    entityId: 'loc:demo',
    kind: 'location',
    name: 'Demo Room',
    tags: ['demo'],
    access: { isPublic: true },
    hazards: [],
    geometry: {
      w: 20,
      h: 20,
      walls: [],
      doors: [],
      exits: [],
    },
  };

  const agentA = {
    entityId: 'A',
    name: 'A',
    locationId: location.entityId,
    pos: { x: 5, y: 5 },
    memory: { beliefAtoms: [] },
    lifeGoals: [],
    body: {
      acute: { pain: 0, fatigue: 0, stress: 0 },
      reserves: { energy: 1, sleep_debt_h: 0 },
      regulation: { arousal: 0.5 },
    },
    vector_base: {
      C_betrayal_cost: 0.5,
      C_reputation_sensitivity: 0.5,
      B_tolerance_ambiguity: 0.5,
      D_HPA_reactivity: 0.5,
      B_decision_temperature: 0.5,
      B_discount_rate: 0.5,
      A_Care_Compassion: 0.5,
      A_Safety_Care: 0.5,
      A_Power_Sovereignty: 0.5,
      A_Procedure_Formalism: 0.5,
      A_Tradition_Order: 0.5,
      A_Liberty_Autonomy: 0.5,
      A_Knowledge_Truth: 0.5,
    },
    context: { age: 30 },
    identity: { clearance_level: 0 },
  };

  return {
    tick: 0,
    agents: [agentA],
    locations: [location],
    sceneSnapshot: { presetId: 'scene:demo', participants: [{ entityId: 'A' }] },
    eventLog: { events: [] },
    mods: {},
  } as any;
}

describe('Pipeline: Stage Isolation', () => {
  it('S0 atoms must not have ctx:* namespace', () => {
    const result = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
    });

    expect(result).toBeTruthy();
    const s0 = (result as any).stages.find((s: any) => s.stage === 'S0');
    const ctxAtoms = s0.atoms.filter((a: any) => a.ns === 'ctx');
    expect(ctxAtoms.length).toBe(0);
  });

  it('S2 must create ctx:* (not ctx:final:*)', () => {
    const result = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
    });

    const s2 = (result as any).stages.find((s: any) => s.stage === 'S2');
    const ctxBase = s2.atoms.filter(
      (a: any) => typeof a.id === 'string' && a.id.startsWith('ctx:') && !a.id.includes(':final:')
    );
    const ctxFinal = s2.atoms.filter((a: any) => typeof a.id === 'string' && a.id.includes('ctx:final:'));

    expect(ctxBase.length).toBeGreaterThan(0);
    expect(ctxFinal.length).toBe(0);
  });

  it('S3 must create ctx:final:* from ctx:*', () => {
    const result = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
    });

    const s3 = (result as any).stages.find((s: any) => s.stage === 'S3');
    const ctxFinal = s3.atoms.filter((a: any) => typeof a.id === 'string' && a.id.includes('ctx:final:'));
    expect(ctxFinal.length).toBeGreaterThan(0);

    const finalDanger = s3.atoms.find((a: any) => a.id === 'ctx:final:danger:A');
    expect(finalDanger).toBeDefined();
    expect(finalDanger.trace?.usedAtomIds || []).toContain('ctx:danger:A');
  });

  it('S7 goals must use ctx:final:*, not ctx:*', () => {
    const result = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
    });

    const s7 = (result as any).stages.find((s: any) => s.stage === 'S7');
    const goals = s7.atoms.filter((a: any) => a.ns === 'goal');

    for (const goal of goals) {
      const used = goal.trace?.usedAtomIds || [];
      const hasCtxWithoutFinal = used.some(
        (id: any) =>
          typeof id === 'string' && id.startsWith('ctx:') && !id.includes(':final:') && !id.includes(':base:')
      );
      expect(hasCtxWithoutFinal).toBe(false);

      if (used.length > 0) {
        const hasValidCtx = used.some(
          (id: any) => typeof id === 'string' && (id.includes('ctx:final:') || id.startsWith('drv:'))
        );
        expect(hasValidCtx).toBe(true);
      }
    }
  });

  it('S8 actions must use util:*, not goal:*', () => {
    const result = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
    });

    const s8 = (result as any).stages.find((s: any) => s.stage === 'S8');
    const actions = s8.atoms.filter((a: any) => a.ns === 'action');

    for (const action of actions) {
      const used = action.trace?.usedAtomIds || [];
      const hasGoal = used.some((id: any) => typeof id === 'string' && id.startsWith('goal:'));
      const hasUtil = used.some((id: any) => typeof id === 'string' && id.startsWith('util:'));

      expect(hasGoal).toBe(false);
      if (used.length > 0) expect(hasUtil).toBe(true);
    }
  });
});
