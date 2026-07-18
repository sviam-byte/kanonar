// NKERNEL-TRAJECTORY-0 (NKERNEL_FOUNDATION_0 §6.3): N-generalization of the
// dyadic runConflictTrajectory (lib/dilemma/dynamics/engine.ts). Mirrors its
// semantics exactly: a step with forced actions runs the N-step in 'freeze'
// mode (the kernel's array form defaults to freeze), a step without forced
// actions is endogenous — the NKERNEL-CHOICE-0 replicator choice, which is the
// kernel's own non-forced path lifted to N. At N = 2 a mixed forced/endogenous
// schedule reproduces runConflictTrajectory step results byte-for-byte.
//
// The kernel runner RE-NORMALIZES the state between steps (and the initial
// state) — that is load-bearing, not cosmetic: normalizeActionProbabilities is
// not byte-idempotent when a probability lands below the replicator floor
// after division (the floor lifts it again), so skipping the inter-step pass
// drifts from the dyadic runner. Mirrored here via the single adapter.

import { normalizeConflictState } from '../dynamics/state';
import type { ConflictAction, ConflictProtocol, Result } from '../dynamics/types';
import { resolveConflictNChoiceStepV1 } from './nchoice';
import { asKernelConflictStateV1 } from './nstate';
import { resolveConflictNStepV1 } from './nstep';
import type {
  ConflictNStepErrorV1,
  ConflictNStepResultV1,
  ConflictStateNV1,
} from './types';

export interface ConflictNTrajectoryInputV1 {
  readonly initialState: ConflictStateNV1;
  readonly protocol: ConflictProtocol;
  readonly steps: number;
  // Sparse schedule: an entry forces that step (freeze mode, matching the
  // kernel's array-form default); a missing/undefined entry runs endogenously.
  readonly forcedActionsByStep?: readonly (readonly ConflictAction[] | undefined)[];
}

export function runConflictNTrajectoryV1(
  input: ConflictNTrajectoryInputV1,
): Result<readonly ConflictNStepResultV1[], ConflictNStepErrorV1> {
  let state: ConflictStateNV1 = normalizeConflictState(asKernelConflictStateV1(input.initialState));
  const results: ConflictNStepResultV1[] = [];

  for (let i = 0; i < input.steps; i++) {
    const forced = input.forcedActionsByStep?.[i];
    if (forced) {
      const step = resolveConflictNStepV1({
        state,
        protocol: input.protocol,
        forcedJointActions: forced,
        forcedActionStrategyMode: 'freeze',
      });
      if (step.ok === false) return step;
      results.push(step.value);
      state = normalizeConflictState(asKernelConflictStateV1(step.value.state));
    } else {
      const choice = resolveConflictNChoiceStepV1({ state, protocol: input.protocol });
      if (choice.ok === false) return choice;
      results.push(choice.value.step);
      state = normalizeConflictState(asKernelConflictStateV1(choice.value.step.state));
    }
  }

  return { ok: true, value: results };
}
