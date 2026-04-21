// lib/mafia/suspicion.ts
//
// Suspicion is per-observer, per-target probability that target is mafia.
// Game-local hidden belief state with explicit ledger for explainability.

import type { AgentState } from '../../types';
import type {
  MafiaGameState,
  MafiaSuspicionDelta,
  PublicClaim,
  RoleId,
  SuspicionDeltaReason,
} from './types';
import { vb, clamp01, readRel, readTom } from './helpers';

export function initSuspicion(
  playerIds: readonly string[],
  agents: Record<string, AgentState>
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const observerId of playerIds) {
    const observer = agents[observerId];
    if (!observer) continue;
    out[observerId] = {};

    const paranoia = vb(observer, 'C_betrayal_cost', 0.5);

    for (const targetId of playerIds) {
      if (targetId === observerId) {
        out[observerId][targetId] = 0;
        continue;
      }
      const rel = readRel(observer, targetId);
      const tom = readTom(observer, observerId, targetId);
      const trustComposite = 0.5 * rel.trust + 0.3 * tom.trust + 0.2 * 0.5;
      const suspicion = clamp01(0.65 - 0.50 * trustComposite + 0.15 * paranoia);
      out[observerId][targetId] = suspicion;
    }
  }
  return out;
}

export function seedInitialSuspicionLedger(state: MafiaGameState): void {
  for (const [observerId, row] of Object.entries(state.suspicion)) {
    for (const [targetId, after] of Object.entries(row)) {
      if (observerId === targetId) continue;
      state.suspicionLedger.push({
        cycle: 0,
        phase: 'day',
        observerId,
        targetId,
        before: 0.5,
        delta: after - 0.5,
        after,
        reason: 'init_prior',
        sourceRefs: [{ kind: 'init' }],
      });
    }
  }
}

export function updateAfterDayElimination(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  eliminatedId: string,
  revealedRole: RoleId
): void {
  const eliminatedWasMafia = revealedRole === 'mafia';

  const lastDay = state.history.days[state.history.days.length - 1];
  if (!lastDay) return;

  for (const observerId of state.alive) {
    const observer = agents[observerId];
    if (!observer) continue;

    const learningRate = updateRate(observer);

    for (const vote of lastDay.votes) {
      if (vote.voterId === observerId) continue;

      const votedForElim = vote.targetId === eliminatedId;

      let delta = 0;
      if (eliminatedWasMafia) {
        delta = votedForElim ? -0.15 : +0.08;
      } else {
        delta = votedForElim ? +0.18 : -0.04;
      }

      applySuspicionDelta(state, {
        observerId,
        targetId: vote.voterId,
        delta: learningRate * delta,
        reason: 'day_vote_alignment',
        phase: 'day',
        sourceRefs: [{ kind: 'vote', actorId: vote.voterId, targetId: vote.targetId ?? undefined }],
      });
    }

    for (const claim of lastDay.claims) {
      if (claim.actorId === observerId) continue;

      let delta = 0;
      if (claim.kind === 'accuse' && claim.targetId === eliminatedId) {
        delta = eliminatedWasMafia ? -0.10 : +0.12;
      } else if (claim.kind === 'defend' && claim.targetId === eliminatedId) {
        delta = eliminatedWasMafia ? +0.20 : -0.06;
      }

      if (delta !== 0) {
        applySuspicionDelta(state, {
          observerId,
          targetId: claim.actorId,
          delta: learningRate * delta,
          reason: 'day_claim_alignment',
          phase: 'day',
          sourceRefs: [{ kind: 'claim', actorId: claim.actorId, targetId: claim.targetId }],
        });
      }
    }
  }
}

export function updateAfterNightKill(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  killedId: string
): void {
  const lastDay = state.history.days[state.history.days.length - 1];
  if (!lastDay) return;

  const killedAccusations = lastDay.claims
    .filter(c => c.actorId === killedId && c.kind === 'accuse' && c.targetId)
    .map(c => c.targetId!);

  for (const observerId of state.alive) {
    const observer = agents[observerId];
    if (!observer) continue;
    const learningRate = updateRate(observer);

    for (const accused of killedAccusations) {
      if (!state.alive.has(accused)) continue;
      if (accused === observerId) continue;
      applySuspicionDelta(state, {
        observerId,
        targetId: accused,
        delta: learningRate * 0.12,
        reason: 'night_kill_inference',
        phase: 'night',
        sourceRefs: [{ kind: 'night_action', actorId: killedId, targetId: accused }],
      });
    }
  }

  const wasClaimedSheriff = state.history.days.some(day =>
    day.claims.some(c => c.actorId === killedId && c.kind === 'claim_sheriff')
  );

  if (!wasClaimedSheriff) return;

  const sheriffChecks = state.sheriffKnowledge[killedId] ?? {};
  for (const [targetId, asRole] of Object.entries(sheriffChecks)) {
    if (!state.alive.has(targetId)) continue;

    for (const observerId of state.alive) {
      if (observerId === targetId) continue;
      const observer = agents[observerId];
      if (!observer) continue;

      const learningRate = updateRate(observer);
      const credibilityShift = asRole === 'mafia' ? +0.20 : -0.08;
      applySuspicionDelta(state, {
        observerId,
        targetId,
        delta: learningRate * credibilityShift,
        reason: 'dead_sheriff_posthumous_signal',
        phase: 'night',
        sourceRefs: [{ kind: 'role_reveal', actorId: killedId, targetId }],
      });
    }
  }
}

export function updateFromPublicClaim(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  claim: PublicClaim
): void {
  const actorId = claim.actorId;

  for (const observerId of state.alive) {
    if (observerId === actorId) continue;
    const observer = agents[observerId];
    if (!observer) continue;

    const learningRate = updateRate(observer);
    const rel = readRel(observer, actorId);
    const truthNeed = vb(observer, 'A_Knowledge_Truth');
    const belief = clamp01(0.18 + 0.45 * rel.trust + 0.20 * truthNeed);

    if (claim.kind === 'accuse' && claim.targetId && claim.targetId !== observerId) {
      const targetId = claim.targetId;
      applySuspicionDelta(state, {
        observerId,
        targetId,
        delta: learningRate * (0.05 + 0.12 * belief),
        reason: 'public_accusation',
        phase: 'day',
        sourceRefs: [{ kind: 'claim', actorId, targetId }],
      });

      const observerPrior = state.suspicion[observerId][targetId] ?? 0.5;
      const actorDelta = observerPrior >= 0.55 ? -0.03 : +0.04;
      applySuspicionDelta(state, {
        observerId,
        targetId: actorId,
        delta: learningRate * actorDelta,
        reason: 'public_accusation',
        phase: 'day',
        sourceRefs: [{ kind: 'claim', actorId, targetId }],
      });
    }

    if (claim.kind === 'defend' && claim.targetId && claim.targetId !== observerId) {
      const targetId = claim.targetId;
      const targetPrior = state.suspicion[observerId][targetId] ?? 0.5;
      applySuspicionDelta(state, {
        observerId,
        targetId,
        delta: learningRate * (-(0.03 + 0.08 * belief)),
        reason: 'public_defense',
        phase: 'day',
        sourceRefs: [{ kind: 'claim', actorId, targetId }],
      });

      const actorDelta = targetPrior >= 0.6 ? +0.08 : -0.02;
      applySuspicionDelta(state, {
        observerId,
        targetId: actorId,
        delta: learningRate * actorDelta,
        reason: 'public_defense',
        phase: 'day',
        sourceRefs: [{ kind: 'claim', actorId, targetId }],
      });
    }
  }
}

export function updateFromSheriffClaim(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  claim: PublicClaim
): void {
  if (claim.kind !== 'claim_sheriff' || !claim.claimedCheck) return;

  const { targetId, asRole } = claim.claimedCheck;
  const claimerId = claim.actorId;

  let claimCount = 0;
  for (const day of state.history.days) {
    for (const c of day.claims) {
      if (c.kind === 'claim_sheriff') claimCount++;
    }
  }
  claimCount += 1;

  const baseBeliefWeight = 1.0 / claimCount;

  for (const observerId of state.alive) {
    if (observerId === claimerId) continue;
    const observer = agents[observerId];
    if (!observer) continue;

    const rel = readRel(observer, claimerId);
    const tom = readTom(observer, observerId, claimerId);
    const truthNeed = vb(observer, 'A_Knowledge_Truth');

    const belief = clamp01(
      baseBeliefWeight * (0.4 * rel.trust + 0.3 * tom.reliability + 0.3 * truthNeed)
    );

    const shift = asRole === 'mafia' ? +0.35 : -0.20;
    if (state.alive.has(targetId) && targetId !== observerId) {
      applySuspicionDelta(state, {
        observerId,
        targetId,
        delta: belief * shift,
        reason: 'sheriff_public_claim',
        phase: 'day',
        sourceRefs: [{ kind: 'claim', actorId: claimerId, targetId }],
      });
    }
  }
}

function updateRate(observer: AgentState): number {
  const paranoia = vb(observer, 'C_betrayal_cost');
  const truthNeed = vb(observer, 'A_Knowledge_Truth');
  const power = vb(observer, 'A_Power_Sovereignty');
  return clamp01(0.6 + 0.5 * paranoia + 0.3 * truthNeed + 0.2 * power);
}

type SuspicionDeltaInput = {
  observerId: string;
  targetId: string;
  delta: number;
  reason: SuspicionDeltaReason;
  phase: 'day' | 'night';
  sourceRefs: MafiaSuspicionDelta['sourceRefs'];
};

function applySuspicionDelta(state: MafiaGameState, input: SuspicionDeltaInput): void {
  if (!state.suspicion[input.observerId]) state.suspicion[input.observerId] = {};
  const before = state.suspicion[input.observerId][input.targetId] ?? 0.5;
  const after = clamp01(before + input.delta);
  state.suspicion[input.observerId][input.targetId] = after;
  state.suspicionLedger.push({
    cycle: state.cycle,
    phase: input.phase,
    observerId: input.observerId,
    targetId: input.targetId,
    before,
    delta: after - before,
    after,
    reason: input.reason,
    sourceRefs: input.sourceRefs,
  });
}
