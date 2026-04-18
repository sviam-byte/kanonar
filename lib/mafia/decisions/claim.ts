// lib/mafia/decisions/claim.ts
//
// Public claim decision. Each player, before voting, chooses ONE action from:
// { claim_sheriff (if has info), accuse(X), defend(X), stay_silent }

import type { AgentState } from '../../../types';
import type {
  MafiaGameState,
  PublicClaim,
  ClaimDecomposition,
  ClaimTrace,
} from '../types';
import {
  vb,
  clamp01,
  sampleSoftmax,
  type RngState,
} from '../helpers';
import { isMafia } from '../roles';

export function decideClaim(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  actorId: string,
  currentDayClaims: PublicClaim[],
  rng: RngState
): { claim: PublicClaim; trace: ClaimTrace } {
  const actor = agents[actorId];
  if (!actor) throw new Error(`Actor ${actorId} missing`);

  const myRole = state.roles[actorId];
  const imMafia = isMafia(myRole);
  const isSheriff = myRole === 'sheriff';
  const mySheriffInfo = state.sheriffKnowledge[actorId] ?? {};
  const hasUnrevealedInfo = isSheriff && Object.keys(mySheriffInfo).length > 0;

  const priorSheriffClaimers = new Set<string>();
  for (const day of state.history.days) {
    for (const c of day.claims) {
      if (c.kind === 'claim_sheriff') priorSheriffClaimers.add(c.actorId);
    }
  }
  for (const c of currentDayClaims) {
    if (c.kind === 'claim_sheriff') priorSheriffClaimers.add(c.actorId);
  }

  const truthNeed = vb(actor, 'A_Knowledge_Truth');
  const repSens = vb(actor, 'C_reputation_sensitivity');
  const power = vb(actor, 'A_Power_Sovereignty');
  const temperature = clamp01(0.15 + 0.85 * vb(actor, 'B_decision_temperature', 0.3));

  type Candidate = { kind: PublicClaim['kind']; targetId?: string; claimedCheck?: PublicClaim['claimedCheck'] };
  const candidates: Candidate[] = [];

  candidates.push({ kind: 'stay_silent' });

  const others = [...state.alive].filter(p => p !== actorId);
  const susSorted = [...others].sort(
    (a, b) => (state.suspicion[actorId]?.[b] ?? 0.5) - (state.suspicion[actorId]?.[a] ?? 0.5)
  );
  for (const tid of susSorted.slice(0, 3)) {
    candidates.push({ kind: 'accuse', targetId: tid });
  }

  const accCountsToday: Record<string, number> = {};
  for (const c of currentDayClaims) {
    if (c.kind === 'accuse' && c.targetId) {
      accCountsToday[c.targetId] = (accCountsToday[c.targetId] ?? 0) + 1;
    }
  }
  const mostAccusedToday = Object.entries(accCountsToday)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id)
    .filter(id => state.alive.has(id) && id !== actorId);
  for (const tid of mostAccusedToday.slice(0, 2)) {
    candidates.push({ kind: 'defend', targetId: tid });
  }

  if (isSheriff && hasUnrevealedInfo) {
    const checks = Object.entries(mySheriffInfo);
    checks.sort(([, ra], [, rb]) => {
      if (ra === 'mafia' && rb !== 'mafia') return -1;
      if (rb === 'mafia' && ra !== 'mafia') return 1;
      return 0;
    });
    const [tid, asRole] = checks[0];
    candidates.push({
      kind: 'claim_sheriff',
      targetId: tid,
      claimedCheck: { targetId: tid, asRole },
    });
  } else if (imMafia) {
    const teammates = Object.entries(state.roles)
      .filter(([id, r]) => r === 'mafia' && state.alive.has(id))
      .map(([id]) => id);
    const townTargets = [...state.alive].filter(p => !teammates.includes(p) && p !== actorId);
    if (townTargets.length > 0) {
      const target = susSorted.find(id => townTargets.includes(id)) ?? townTargets[0];
      candidates.push({
        kind: 'claim_sheriff',
        targetId: target,
        claimedCheck: { targetId: target, asRole: 'mafia' },
      });
    }
  }

  const decs: ClaimDecomposition[] = [];
  const scores: Record<string, number> = {};

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const key = candKey(cand, i);

    let informationValue = 0;
    let visibilityCost = 0;
    let socialRisk = 0;
    let majorityAlignment = 0;

    if (cand.kind === 'stay_silent') {
      informationValue = 0;
      visibilityCost = imMafia ? -0.3 : 0;
      socialRisk = -0.1 * repSens;
    } else if (cand.kind === 'accuse') {
      const targetSuspicion = state.suspicion[actorId]?.[cand.targetId!] ?? 0.5;
      informationValue = (0.7 * truthNeed + 0.4 * power) * targetSuspicion;
      visibilityCost = imMafia ? 0.4 : -0.2;
      socialRisk = 0.2 * (1 - targetSuspicion);
      majorityAlignment = repSens * ((accCountsToday[cand.targetId!] ?? 0) / Math.max(1, others.length));
    } else if (cand.kind === 'defend') {
      const targetSuspicion = state.suspicion[actorId]?.[cand.targetId!] ?? 0.5;
      informationValue = 0.6 * (1 - targetSuspicion);
      visibilityCost = imMafia ? 0.7 : 0.1;
      socialRisk = 0.4 * targetSuspicion;
      majorityAlignment = -repSens * ((accCountsToday[cand.targetId!] ?? 0) / Math.max(1, others.length));
    } else if (cand.kind === 'claim_sheriff') {
      const isReal = isSheriff;
      const rivalClaimers = priorSheriffClaimers.size;
      const hasConfirmedMafia =
        isSheriff && Object.values(mySheriffInfo).some(r => r === 'mafia');
      const cycleUrgency = clamp01(state.cycle / 4);
      const selfHeat = (accCountsToday[actorId] ?? 0) / Math.max(1, others.length);
      const realInfoValue = hasConfirmedMafia
        ? (1.35 + 0.55 * cycleUrgency + 0.35 * selfHeat) * truthNeed / (1 + 0.7 * rivalClaimers)
        : (0.45 + 0.30 * cycleUrgency + 0.20 * selfHeat) * truthNeed / (1 + rivalClaimers);
      informationValue = isReal
        ? realInfoValue
        : 0.45 * power / (1 + rivalClaimers);
      visibilityCost = isReal ? 0.7 : 1.15;
      socialRisk = isReal ? 0.05 : 1.35;
      majorityAlignment = isReal ? 0.1 * selfHeat : 0;
    }

    const hasMafiaResult = cand.kind === 'claim_sheriff' && cand.claimedCheck?.asRole === 'mafia';
    const silencePenalty = cand.kind === 'stay_silent' && hasUnrevealedInfo
      ? ((Object.values(mySheriffInfo).some(r => r === 'mafia') ? 0.85 : 0.35) * truthNeed)
      : 0;

    const u =
      1.05 * informationValue
      - (imMafia ? 0.75 : 0.22) * visibilityCost
      - 0.48 * socialRisk
      + 0.3 * majorityAlignment
      + (hasMafiaResult && isSheriff ? 0.45 : 0)
      - silencePenalty;

    decs.push({
      kind: cand.kind,
      targetId: cand.targetId,
      u,
      chosen: false,
      informationValue,
      visibilityCost,
      socialRisk,
      majorityAlignment,
    });
    scores[key] = u;
  }

  const chosenKey = sampleSoftmax(rng, scores, temperature);
  const chosenIdx = candidates.findIndex((c, i) => candKey(c, i) === chosenKey);
  const chosenCand = candidates[chosenIdx];

  decs.sort((a, b) => b.u - a.u);
  for (const d of decs) {
    d.chosen =
      d.kind === chosenCand.kind &&
      d.targetId === chosenCand.targetId;
  }

  const claim: PublicClaim = {
    actorId,
    kind: chosenCand.kind,
    targetId: chosenCand.targetId,
    claimedCheck: chosenCand.claimedCheck,
    reasoning: {
      actorId,
      ranked: decs,
      chosenKind: chosenCand.kind,
    },
  };

  return { claim, trace: claim.reasoning };
}

function candKey(c: { kind: string; targetId?: string }, idx: number): string {
  return `${c.kind}:${c.targetId ?? ''}:${idx}`;
}
