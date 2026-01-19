// lib/decision/decompose.ts
// Goal-to-intent decomposer (System 2): turns goals into staged intent scripts.

import type { AgentState } from '../../types';
import type { AgentMemory } from '../core/mindTypes';
import type { IntentAtomicDelta, IntentScript } from '../simkit/core/types';
import type { Goal } from '../registry/goals';

type MemoryPredicate = (atom: any) => boolean;

function findInMemory(memory: AgentMemory | undefined, predicate: MemoryPredicate) {
  if (!memory?.facts) return null;
  for (const fact of memory.facts.values()) {
    if (predicate(fact.atom)) {
      return fact.atom;
    }
  }
  return null;
}

function createExploreScript(): IntentScript {
  // Minimal explore intent: a short execute stage with no side effects yet.
  return {
    id: 'explore',
    stages: [
      {
        kind: 'execute',
        ticksRequired: 8,
      },
    ],
    explain: ['No sleepable object found in memory; exploring instead.'],
  };
}

function buildApproachDeltas(destination: any): IntentAtomicDelta[] {
  if (!destination || typeof destination !== 'object') return [];
  return [
    {
      target: 'agent',
      key: 'move_toward',
      op: 'set',
      value: destination,
    },
  ];
}

export function decomposeGoal(agent: AgentState, goal: Goal): IntentScript | null {
  // Example: Goal = "RecoverEnergy".
  if (goal.id === 'RecoverEnergy') {
    // 1. Look in memory (not the world) for a sleepable object.
    const bed = findInMemory(agent.memory, (atom) => Array.isArray(atom?.tags) && atom.tags.includes('sleepable'));

    if (bed) {
      const bedId = String(bed?.id ?? bed?.entityId ?? 'bed');
      const bedPos = bed?.pos ?? bed?.position ?? null;
      return {
        id: `sleep_at_${bedId}`,
        stages: [
          {
            kind: 'approach',
            ticksRequired: 'until_condition',
            perTick: buildApproachDeltas(bedPos),
          },
          {
            kind: 'attach',
            ticksRequired: 1,
            onEnter: [{ target: 'world', key: `occupied:${bedId}`, op: 'set', value: true }],
          },
          {
            kind: 'execute',
            ticksRequired: 'until_condition',
            completionCondition: {
              mode: 'all',
              checks: [
                { target: 'agent', key: 'energy', op: '>=', value: 0.75 },
                { target: 'agent', key: 'stress', op: '<=', value: 0.35 },
              ],
            },
            // Gradual convergence to an attractor (instead of a single huge delta).
            perTick: [
              { target: 'agent', key: 'energy', op: 'toward', value: 0.82, rate: 0.12 },
              { target: 'agent', key: 'stress', op: 'toward', value: 0.2, rate: 0.1 },
            ],
          },
          {
            kind: 'detach',
            ticksRequired: 1,
            onExit: [{ target: 'world', key: `occupied:${bedId}`, op: 'set', value: false }],
          },
        ],
        explain: ['RecoverEnergy: found sleepable object in memory.'],
      };
    }

    // Object unknown -> explore.
    return createExploreScript();
  }

  return null;
}
