// lib/mafia/decisions/vote.ts
//
// Day vote decision with explicit worldview snapshot and stochastic audit.

import type { AgentState } from '../../../types';
import type {
  MafiaCandidateAudit,
  MafiaGameState,
  VoteDecomposition,
  VoteTrace,
  PublicClaim,
} from '../types';
import {
  vb,
  clamp01,
  readRel,
  buildPerceptionSnapshot,
  sampleSoftmaxWithTrace,
  sortCandidateAudit,
  type RngState,
} from '../helpers';
import { isMafia } from '../roles';

export function decideVote(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  voterId: string,
  currentDayClaims: PublicClaim[],
  rng: RngState
): { targetId: string | null; trace: VoteTrace } {
  const voter = agents[voterId];
  if (!voter) throw new Error(`Voter ${voterId} missing`);

  const myRole = state.roles[voterId];
  const imMafia = isMafia(myRole);
  const myTeammates = imMafia
    ? Object.entries(state.roles)
      .filter(([id, r]) => r === 'mafia' && id !== voterId && state.alive.has(id))
      .map(([id]) => id)
    : [];

  const accusationCounts: Record<string, number> = {};
  const defenseCounts: Record<string, number> = {};
  for (const c of currentDayClaims) {
    if (c.kind === 'accuse' && c.targetId) {
      accusationCounts[c.targetId] = (accusationCounts[c.targetId] ?? 0) + 1;
    }
    if (c.kind === 'defend' && c.targetId) {
      defenseCounts[c.targetId] = (defenseCounts[c.targetId] ?? 0) + 1;
    }
  }
  const maxSignal = Math.max(1, ...Object.values(accusationCounts), ...Object.values(defenseCounts));

  const sheriffAccusations = new Map<string, Array<{ claimer: string; target: string }>>();
  for (const c of currentDayClaims) {
    if (c.kind === 'claim_sheriff' && c.claimedCheck?.asRole === 'mafia') {
      const target = c.claimedCheck.targetId;
      const list = sheriffAccusations.get(target) ?? [];
      list.push({ claimer: c.actorId, target });
      sheriffAccusations.set(target, list);
    }
  }

  const candidates = [...state.alive].filter(p => p !== voterId);
  const decs: VoteDecomposition[] = [];
  const scores: Record<string, number> = {};
  const audit: MafiaCandidateAudit[] = [];

  const autonomy = vb(voter, 'A_Liberty_Autonomy');
  const loyalty = vb(voter, 'C_coalition_loyalty');
  const truthNeed = vb(voter, 'A_Knowledge_Truth');
  const conformism = 1 - autonomy;
  const perception = buildPerceptionSnapshot(state, agents, voterId, 'day', myRole, currentDayClaims);

  const abstainScore = -0.35;

  for (const targetId of candidates) {
    const suspicion = state.suspicion[voterId]?.[targetId] ?? 0.5;
    const rel = readRel(voter, targetId);

    const targetAcc = accusationCounts[targetId] ?? 0;
    const targetDef = defenseCounts[targetId] ?? 0;
    const publicPressure = (targetAcc - 0.7 * targetDef) / maxSignal;
    const bandwagon = conformism * publicPressure;

    const bondPenalty = loyalty * rel.bond;

    let teamProtection = 0;
    if (imMafia && myTeammates.includes(targetId)) {
      teamProtection = -2.0;
    }

    let claimBonus = 0;
    if (imMafia) {
      for (const claim of currentDayClaims) {
        if (claim.kind === 'claim_sheriff' && claim.actorId === targetId) {
          claimBonus += 0.8;
        }
      }
    } else {
      const accByClaims = sheriffAccusations.get(targetId);
      if (accByClaims && accByClaims.length > 0) {
        const claimer = accByClaims[0].claimer;
        const claimerRel = readRel(voter, claimer);
        const sheriffTrustBonus = (0.9 * truthNeed * claimerRel.trust) + 0.15 * accByClaims.length;
        claimBonus += sheriffTrustBonus;
      }
    }

    const u =
      1.45 * suspicion
      + 1.05 * bandwagon
      - 0.55 * bondPenalty
      + teamProtection
      + claimBonus;

    decs.push({
      targetId,
      u,
      chosen: false,
      suspicion,
      bandwagon,
      bondPenalty,
      teamProtection,
      claimBonus,
    });
    scores[targetId] = u;
    audit.push({
      key: targetId,
      label: `vote:${targetId}`,
      kind: 'vote',
      targetId,
      included: true,
      reason: 'all living non-self players are legal vote targets',
    });
  }

  scores.__ABSTAIN__ = abstainScore;
  decs.push({
    targetId: null,
    u: abstainScore,
    chosen: false,
    suspicion: 0,
    bandwagon: 0,
    bondPenalty: 0,
    teamProtection: 0,
    claimBonus: 0,
  });
  audit.push({
    key: '__ABSTAIN__',
    label: 'abstain',
    kind: 'abstain',
    included: true,
    reason: 'legal fallback when no target clears utility threshold',
  });

  const temperature = clamp01(0.1 + 0.9 * vb(voter, 'B_decision_temperature', 0.3));
  const sampling = sampleSoftmaxWithTrace(rng, scores, temperature);
  const chosenTargetId = sampling.chosenKey === '__ABSTAIN__' ? null : sampling.chosenKey;

  decs.sort((a, b) => b.u - a.u);
  for (const d of decs) {
    d.chosen = (d.targetId === chosenTargetId) || (d.targetId === null && chosenTargetId === null);
  }

  const suspicionSnapshot: Record<string, number> = {};
  for (const p of state.alive) {
    if (p !== voterId) {
      suspicionSnapshot[p] = state.suspicion[voterId]?.[p] ?? 0.5;
    }
  }

  const traitSnapshot: Record<string, number> = {
    A_Liberty_Autonomy: autonomy,
    C_coalition_loyalty: loyalty,
    A_Knowledge_Truth: truthNeed,
    B_decision_temperature: vb(voter, 'B_decision_temperature'),
    C_betrayal_cost: vb(voter, 'C_betrayal_cost'),
  };

  return {
    targetId: chosenTargetId,
    trace: {
      voterId,
      ranked: decs,
      suspicionSnapshot,
      traitSnapshot,
      perception,
      candidates: sortCandidateAudit(audit),
      sampling,
    },
  };
}
