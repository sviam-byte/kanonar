import { describe, expect, it } from 'vitest';
import {
  defaultConflictAgentState,
  defaultConflictRelationState,
  type ConflictState,
  type StrategyProfile,
} from '../../lib/dilemma';
import { TRUST_EXCHANGE_ACTION_ORDER } from '../../lib/dilemma/dynamics/trustExchange';
import type { ConflictCoreActionLabels } from '../../lib/dilemma/dynamics/types';
import {
  CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION,
  TRUST_EXCHANGE_DEFINITION,
  conflictUtilityCandidateIdV1,
  projectLegalActions,
  resolveProjectedChoice,
  resolveProjectedJointChoice,
} from '../../lib/dilemma/definition';

function makeState(patch?: Partial<ConflictState>): ConflictState {
  const players = ['a', 'b'] as const;
  const strategyProfiles: Record<string, StrategyProfile> = {
    a: { playerId: 'a', probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 } },
    b: { playerId: 'b', probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 } },
  };

  return {
    tick: 0,
    players,
    agents: {
      a: defaultConflictAgentState({ cooperationTendency: 0.72, loyalty: 0.62 }),
      b: defaultConflictAgentState({ cooperationTendency: 0.68, loyalty: 0.58 }),
    },
    relations: {
      a: { b: defaultConflictRelationState({ trust: 0.62, bond: 0.42, conflict: 0.15 }) },
      b: { a: defaultConflictRelationState({ trust: 0.60, bond: 0.40, conflict: 0.18 }) },
    },
    environment: {
      resourceScarcity: 0.25,
      externalPressure: 0.30,
      visibility: 0.20,
      institutionalPressure: 0.45,
    },
    history: [],
    strategyProfiles,
    ...(patch ?? {}),
  };
}

function projectFor(state: ConflictState, actorId: string) {
  const protocol = TRUST_EXCHANGE_DEFINITION.createProtocol(['a', 'b']);
  const projected = projectLegalActions(TRUST_EXCHANGE_DEFINITION, state, protocol, actorId);
  if (projected.ok === false) throw new Error(`projection failed: ${projected.error.message}`);
  return { protocol, rows: projected.value };
}

describe('CONFLICT-GAP-0 projection contract — trust_exchange', () => {
  it('tuple-encodes delimiter-bearing actor and target ids without collisions', () => {
    const base = { protocolId: 'trust_exchange', phaseId: 'simultaneous_choice', tick: 0, historyLength: 0, kernelActionId: 'trust' };
    expect(conflictUtilityCandidateIdV1({ ...base, actorId: 'a', targetIds: ['a->a'] }))
      .not.toBe(conflictUtilityCandidateIdV1({ ...base, actorId: 'a->a', targetIds: ['a'] }));
  });

  it('projects every legal kernel action exactly once with full row fields', () => {
    const { rows } = projectFor(makeState(), 'a');

    expect(rows.map((r) => r.kernelActionId)).toEqual([...TRUST_EXCHANGE_ACTION_ORDER]);
    expect(new Set(rows.map((r) => r.utilityCandidateId)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.schemaVersion).toBe(CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION);
      expect(row.protocolId).toBe('trust_exchange');
      expect(row.phaseId).toBe('simultaneous_choice');
      expect(row.role).toBe('participant');
      expect(row.actorId).toBe('a');
      expect(row.targetIds).toEqual(['b']);
      expect(row.legalSource).toBe('protocol_action_order');
      expect(row.provenance).toEqual({
        source: 'conflict-kernel-observation',
        tick: 0,
        historyLength: 0,
      });
    }
  });

  it('round-trips trust | withhold | betray through candidate IDs', () => {
    const { rows } = projectFor(makeState(), 'a');
    for (const row of rows) {
      const resolved = resolveProjectedChoice(rows, row.utilityCandidateId);
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value).toEqual({ playerId: 'a', actionId: row.kernelActionId });
      }
    }
  });

  it('fail-closed: unknown, foreign or free-form candidates cannot enter the joint action', () => {
    const state = makeState();
    const { rows: rowsA } = projectFor(state, 'a');
    const { rows: rowsB } = projectFor(state, 'b');

    const unknown = resolveProjectedChoice(rowsA, 'goal-lab:help');
    expect(unknown.ok).toBe(false);
    if (unknown.ok === false) expect(unknown.error.code).toBe('unknown_candidate');

    // B's candidate against A's rows: direction is part of identity.
    const foreign = resolveProjectedChoice(rowsA, rowsB[0].utilityCandidateId);
    expect(foreign.ok).toBe(false);

    const joint = resolveProjectedJointChoice([
      { rows: rowsA, utilityCandidateId: rowsA[0].utilityCandidateId },
      { rows: rowsB, utilityCandidateId: 'possibility:share' },
    ]);
    expect(joint.ok).toBe(false);
  });

  it('rejects a candidate ID projected for an earlier tick/history', () => {
    const initial = makeState();
    const oldRows = projectFor(initial, 'a').rows;
    const later = makeState({
      tick: 1,
      history: [{
        tick: 0,
        protocolId: 'trust_exchange',
        actions: { a: 'trust', b: 'withhold' },
        outcomeTag: 'mutual_caution',
        payoffs: { a: 0, b: 0 },
      }],
    });
    const freshRows = projectFor(later, 'a').rows;

    expect(freshRows.map((row) => row.utilityCandidateId))
      .not.toEqual(oldRows.map((row) => row.utilityCandidateId));
    const stale = resolveProjectedChoice(freshRows, oldRows[0].utilityCandidateId);
    expect(stale.ok).toBe(false);
  });

  it('labels and localization are not projection inputs and cannot affect rows', () => {
    const state = makeState();
    const labelsRu: ConflictCoreActionLabels = {
      trust: 'Сотрудничать',
      withhold: 'Промолчать',
      betray: 'Предать',
    };
    const labelsEn: ConflictCoreActionLabels = {
      trust: 'trust / cooperate',
      withhold: 'withhold / hedge / silent',
      betray: 'betray / defect',
    };

    // The projection API takes no label argument by contract; rows built while
    // either label set is "active" for display are byte-identical.
    void labelsRu;
    void labelsEn;
    const first = projectFor(state, 'a').rows;
    const second = projectFor(state, 'a').rows;
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    const allLabelWords = [
      ...Object.values(labelsRu),
      ...Object.values(labelsEn).filter((label) => !TRUST_EXCHANGE_ACTION_ORDER.some((id) => label.startsWith(id))),
    ];
    for (const row of first) {
      for (const label of allLabelWords) {
        expect(row.utilityCandidateId.includes(label)).toBe(false);
      }
    }
  });

  it('same state and same candidate picks produce the same joint action and step result', () => {
    const runOnce = () => {
      const state = makeState();
      const { protocol, rows: rowsA } = projectFor(state, 'a');
      const { rows: rowsB } = projectFor(state, 'b');
      const joint = resolveProjectedJointChoice([
        { rows: rowsA, utilityCandidateId: rowsA.find((r) => r.kernelActionId === 'trust')!.utilityCandidateId },
        { rows: rowsB, utilityCandidateId: rowsB.find((r) => r.kernelActionId === 'betray')!.utilityCandidateId },
      ]);
      if (joint.ok === false) throw new Error('joint resolution failed');
      const step = TRUST_EXCHANGE_DEFINITION.step(state, protocol, {
        forcedJointActions: joint.value,
        forcedActionStrategyMode: 'freeze',
      });
      return JSON.stringify({ rowsA, rowsB, joint, step });
    };

    expect(runOnce()).toBe(runOnce());
  });
});
