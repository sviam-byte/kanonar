// lib/mafia/suspicion.ts
//
// Suspicion is per-observer, per-target probability that target is mafia.
// Parallel to baseTrust (read-only input). Game-local, updated each phase.
//
// Initialization: prior = 1 - baseTrust (low trust → high suspicion baseline),
// modulated by C_betrayal_cost (paranoid players start more suspicious).

import type { AgentState } from '../../types';
import type {
  MafiaGameState,
  PublicClaim,
  RoleId,
} from './types';
import { vb, clamp01, readRel, readTom } from './helpers';

/**
 * Build initial suspicion matrix at game start.
 * Each observer starts with prior suspicion = f(baseTrust, tomTrust, paranoia).
 */
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

      state.suspicion[observerId][vote.voterId] = clamp01(
        state.suspicion[observerId][vote.voterId] + learningRate * delta
      );
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
        state.suspicion[observerId][claim.actorId] = clamp01(
          state.suspicion[observerId][claim.actorId] + learningRate * delta
        );
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
      state.suspicion[observerId][accused] = clamp01(
        state.suspicion[observerId][accused] + learningRate * 0.12
      );
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
      state.suspicion[observerId][targetId] = clamp01(
        state.suspicion[observerId][targetId] + learningRate * credibilityShift
      );
    }
  }
}

export function updateFromPublicClaim(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  claim: PublicClaim
): void {
  // Fast social learning from public claims inside the same day.
  // This keeps claim order meaningful and traceable before elimination feedback kicks in.
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
      const targetDelta = 0.05 + 0.12 * belief;
      state.suspicion[observerId][targetId] = clamp01(
        state.suspicion[observerId][targetId] + learningRate * targetDelta
      );

      const observerPrior = state.suspicion[observerId][targetId] ?? 0.5;
      const actorDelta = observerPrior >= 0.55 ? -0.03 : +0.04;
      state.suspicion[observerId][actorId] = clamp01(
        state.suspicion[observerId][actorId] + learningRate * actorDelta
      );
    }

    if (claim.kind === 'defend' && claim.targetId && claim.targetId !== observerId) {
      const targetId = claim.targetId;
      const targetPrior = state.suspicion[observerId][targetId] ?? 0.5;
      const targetDelta = -(0.03 + 0.08 * belief);
      state.suspicion[observerId][targetId] = clamp01(
        state.suspicion[observerId][targetId] + learningRate * targetDelta
      );

      const actorDelta = targetPrior >= 0.6 ? +0.08 : -0.02;
      state.suspicion[observerId][actorId] = clamp01(
        state.suspicion[observerId][actorId] + learningRate * actorDelta
      );
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
      state.suspicion[observerId][targetId] = clamp01(
        state.suspicion[observerId][targetId] + belief * shift
      );
    }
  }
}

function updateRate(observer: AgentState): number {
  const paranoia = vb(observer, 'C_betrayal_cost');
  const truthNeed = vb(observer, 'A_Knowledge_Truth');
  const power = vb(observer, 'A_Power_Sovereignty');
  return clamp01(0.6 + 0.5 * paranoia + 0.3 * truthNeed + 0.2 * power);
}
