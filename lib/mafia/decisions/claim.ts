// lib/mafia/decisions/claim.ts
//
// Public claim decision. Each player chooses one action from:
// { claim_sheriff, accuse(X), defend(X), stay_silent }
// with explicit candidate audit and sampling trace.

import type { AgentState } from '../../../types';
import type {
  MafiaCandidateAudit,
  MafiaGameState,
  PublicClaim,
  ClaimDecomposition,
  ClaimTrace,
} from '../types';
import {
  vb,
  clamp01,
  buildPerceptionSnapshot,
  sampleSoftmaxWithTrace,
  sortCandidateAudit,
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
  const perception = buildPerceptionSnapshot(state, agents, actorId, 'day', myRole, currentDayClaims);

  type Candidate = { kind: PublicClaim['kind']; targetId?: string; claimedCheck?: PublicClaim['claimedCheck']; key: string; label: string };
  const candidates: Candidate[] = [];
  const audit: MafiaCandidateAudit[] = [];

  const staySilent: Candidate = { kind: 'stay_silent', key: 'stay_silent', label: 'stay_silent' };
  candidates.push(staySilent);
  audit.push({ key: staySilent.key, label: staySilent.label, kind: staySilent.kind, included: true, reason: 'always available' });

  const others = [...state.alive].filter(p => p !== actorId);
  const susSorted = [...others].sort(
    (a, b) => (state.suspicion[actorId]?.[b] ?? 0.5) - (state.suspicion[actorId]?.[a] ?? 0.5)
  );
  const accuseSet = new Set(susSorted.slice(0, 3));
  for (const tid of others) {
    const included = accuseSet.has(tid);
    const candidate: Candidate = { kind: 'accuse', targetId: tid, key: `accuse:${tid}`, label: `accuse:${tid}` };
    audit.push({
      key: candidate.key,
      label: candidate.label,
      kind: candidate.kind,
      targetId: tid,
      included,
      reason: included ? 'top suspicion shortlist' : 'outside top-3 suspicion shortlist',
    });
    if (included) candidates.push(candidate);
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
  const defendSet = new Set(mostAccusedToday.slice(0, 2));
  for (const tid of others) {
    const included = defendSet.has(tid);
    const candidate: Candidate = { kind: 'defend', targetId: tid, key: `defend:${tid}`, label: `defend:${tid}` };
    audit.push({
      key: candidate.key,
      label: candidate.label,
      kind: candidate.kind,
      targetId: tid,
      included,
      reason: included ? 'currently under strongest day pressure' : 'not among most accused today',
    });
    if (included) candidates.push(candidate);
  }

  if (isSheriff && hasUnrevealedInfo) {
    const checks = Object.entries(mySheriffInfo).sort(([, ra], [, rb]) => {
      if (ra === 'mafia' && rb !== 'mafia') return -1;
      if (rb === 'mafia' && ra !== 'mafia') return 1;
      return 0;
    });
    for (const [tid, asRole] of checks) {
      const candidate: Candidate = {
        kind: 'claim_sheriff',
        targetId: tid,
        claimedCheck: { targetId: tid, asRole },
        key: `claim_sheriff:${tid}:${asRole}`,
        label: `claim_sheriff:${tid}:${asRole}`,
      };
      audit.push({
        key: candidate.key,
        label: candidate.label,
        kind: candidate.kind,
        targetId: tid,
        included: true,
        reason: asRole === 'mafia' ? 'real sheriff info: confirmed mafia result' : 'real sheriff info: checked town result',
      });
      candidates.push(candidate);
    }
  } else if (imMafia) {
    const teammates = Object.entries(state.roles)
      .filter(([id, r]) => r === 'mafia' && state.alive.has(id))
      .map(([id]) => id);
    const townTargets = [...state.alive].filter(p => !teammates.includes(p) && p !== actorId);
    const fakeTargets = susSorted.filter(id => townTargets.includes(id)).slice(0, 3);
    for (const tid of townTargets) {
      const included = fakeTargets.includes(tid);
      const candidate: Candidate = {
        kind: 'claim_sheriff',
        targetId: tid,
        claimedCheck: { targetId: tid, asRole: 'mafia' },
        key: `claim_sheriff:${tid}:mafia`,
        label: `claim_sheriff:${tid}:mafia`,
      };
      audit.push({
        key: candidate.key,
        label: candidate.label,
        kind: candidate.kind,
        targetId: tid,
        included,
        reason: included ? 'fake sheriff frame shortlist for mafia' : 'outside mafia fake-claim shortlist',
      });
      if (included) candidates.push(candidate);
    }
  } else {
    audit.push({
      key: 'claim_sheriff:none',
      label: 'claim_sheriff',
      kind: 'claim_sheriff',
      included: false,
      reason: 'no legal sheriff information and not mafia fake-claim branch',
    });
  }

  const decs: ClaimDecomposition[] = [];
  const scores: Record<string, number> = {};

  for (const cand of candidates) {

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
    scores[cand.key] = u;
  }

  const sampling = sampleSoftmaxWithTrace(rng, scores, temperature);
  const chosenCand = candidates.find(c => c.key === sampling.chosenKey) ?? candidates[0];

  decs.sort((a, b) => b.u - a.u);
  for (const d of decs) {
    d.chosen =
      d.kind === chosenCand.kind &&
      d.targetId === chosenCand.targetId;
  }

  const trace: ClaimTrace = {
    actorId,
    ranked: decs,
    chosenKind: chosenCand.kind,
    perception,
    candidates: sortCandidateAudit(audit),
    sampling,
  };

  const claim: PublicClaim = {
    actorId,
    kind: chosenCand.kind,
    targetId: chosenCand.targetId,
    claimedCheck: chosenCand.claimedCheck,
    reasoning: trace,
  };

  return { claim, trace };
}
