// lib/mafia/decisions/night.ts
//
// Night decision models for mafia, sheriff, doctor with explicit explainability traces.

import type { AgentState } from '../../../types';
import type {
  MafiaCandidateAudit,
  MafiaGameState,
  KillDecomposition,
  CheckDecomposition,
  HealDecomposition,
  NightTrace,
} from '../types';
import {
  vb,
  clamp01,
  readRel,
  readTom,
  buildPerceptionSnapshot,
  sampleSoftmaxWithTrace,
  sortCandidateAudit,
  type RngState,
} from '../helpers';

export function decideMafiaKill(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  mafiaIds: string[],
  rng: RngState
): { targetId: string; traces: NightTrace[] } {
  const candidates = [...state.alive].filter(p => !mafiaIds.includes(p));
  if (candidates.length === 0) {
    return { targetId: mafiaIds[0], traces: [] };
  }

  const aggregate: Record<string, number> = {};
  const traces: NightTrace[] = [];
  const leaderId = [...mafiaIds].sort((a, b) => (
    vb(agents[b]!, 'A_Power_Sovereignty', 0.5) + vb(agents[b]!, 'C_coalition_loyalty', 0.5)
  ) - (
    vb(agents[a]!, 'A_Power_Sovereignty', 0.5) + vb(agents[a]!, 'C_coalition_loyalty', 0.5)
  ))[0] ?? mafiaIds[0];

  for (const actorId of mafiaIds) {
    const actor = agents[actorId];
    if (!actor) continue;

    const decompositions: KillDecomposition[] = [];
    const localScores: Record<string, number> = {};
    for (const targetId of candidates) {
      const dec = scoreKill(state, actor, actorId, targetId);
      decompositions.push(dec);
      localScores[targetId] = dec.u;
      const callerWeight = actorId === leaderId ? 1.0 : 0.55;
      const coordinationNoise = 0.08 * avgTemperature(agents, mafiaIds) * (hashNoise(`${actorId}:coord`, targetId) - 0.5);
      aggregate[targetId] = (aggregate[targetId] ?? 0) + callerWeight * dec.u + coordinationNoise;
    }

    decompositions.sort((a, b) => b.u - a.u);
    const perception = buildPerceptionSnapshot(state, agents, actorId, 'night', 'mafia');
    const audit: MafiaCandidateAudit[] = candidates.map(targetId => ({
      key: targetId,
      label: `kill:${targetId}`,
      kind: 'kill',
      targetId,
      included: true,
      reason: 'all living non-mafia players are legal kill targets',
    }));
    traces.push({
      actorId,
      role: 'mafia',
      kind: 'kill',
      ranked: decompositions,
      chosenTargetId: '',
      perception,
      candidates: sortCandidateAudit(audit),
      sampling: {
        temperature: 0,
        scores: localScores,
        probabilities: {},
        rngDraw: 0,
        chosenKey: '',
      },
    });
  }

  const temperature = avgTemperature(agents, mafiaIds);
  const sampling = sampleSoftmaxWithTrace(rng, aggregate, temperature);
  const chosen = sampling.chosenKey;

  for (const tr of traces) {
    tr.chosenTargetId = chosen;
    tr.sampling = sampling;
    for (const d of tr.ranked) {
      (d as KillDecomposition).chosen = d.targetId === chosen;
    }
  }

  return { targetId: chosen, traces };
}

function scoreKill(
  state: MafiaGameState,
  actor: AgentState,
  actorId: string,
  targetId: string
): KillDecomposition {
  const tom = readTom(actor, actorId, targetId);

  const suspicionAgainstUs = state.suspicion[targetId]?.[actorId] ?? 0.5;
  const vocality = computeVocality(state, targetId);
  const hasClaimedSheriff = didClaimSheriff(state, targetId);

  const threat = clamp01(
    0.25 * tom.competence
    + 0.30 * suspicionAgainstUs
    + 0.20 * vocality
    + 0.40 * (hasClaimedSheriff ? 1 : 0)
    + 0.10 * (1 - tom.vulnerability)
  );

  const rel = readRel(actor, targetId);
  const loyalty = vb(actor, 'C_coalition_loyalty');
  const coalitionCost = loyalty * rel.bond;

  const visibility = vocality;

  const paranoia = vb(actor, 'C_betrayal_cost');
  const randomize = paranoia * 0.15;

  const u =
    1.0 * threat
    - 0.6 * coalitionCost
    + 0.3 * visibility * 0.2
    + randomize * (hashNoise(actorId, targetId) - 0.5);

  return {
    targetId,
    u,
    chosen: false,
    threat,
    coalitionCost,
    visibility,
    randomize,
  };
}

export function decideSheriffCheck(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  sheriffId: string,
  rng: RngState
): { targetId: string; trace: NightTrace } {
  const sheriff = agents[sheriffId];
  if (!sheriff) throw new Error(`Sheriff ${sheriffId} missing`);

  const alreadyChecked = state.sheriffKnowledge[sheriffId] ?? {};
  const candidates = [...state.alive].filter(p => p !== sheriffId);

  const decs: CheckDecomposition[] = [];
  const scores: Record<string, number> = {};

  for (const targetId of candidates) {
    const suspicion = state.suspicion[sheriffId]?.[targetId] ?? 0.5;
    const rel = readRel(sheriff, targetId);
    const alreadyPenalty = alreadyChecked[targetId] !== undefined ? 10 : 0;
    const truthNeed = vb(sheriff, 'A_Knowledge_Truth');

    const uncertainty = 1 - Math.abs(suspicion - 0.5) * 2;

    const u =
      1.0 * suspicion
      + 0.4 * truthNeed * uncertainty
      - 0.3 * rel.familiarity
      - alreadyPenalty;

    decs.push({
      targetId,
      u,
      chosen: false,
      suspicion,
      familiarity: rel.familiarity,
      already: alreadyPenalty,
      truthNeed,
    });
    scores[targetId] = u;
  }

  const temp = temperatureOf(sheriff);
  const sampling = sampleSoftmaxWithTrace(rng, scores, temp);
  const chosen = sampling.chosenKey;

  decs.sort((a, b) => b.u - a.u);
  for (const d of decs) d.chosen = d.targetId === chosen;

  return {
    targetId: chosen,
    trace: {
      actorId: sheriffId,
      role: 'sheriff',
      kind: 'check',
      ranked: decs,
      chosenTargetId: chosen,
      perception: buildPerceptionSnapshot(state, agents, sheriffId, 'night', 'sheriff'),
      candidates: sortCandidateAudit(candidates.map(targetId => ({
        key: targetId,
        label: `check:${targetId}`,
        kind: 'check',
        targetId,
        included: true,
        reason: 'all living non-self players are legal sheriff checks',
      }))),
      sampling,
    },
  };
}

export function decideDoctorHeal(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  doctorId: string,
  rng: RngState
): { targetId: string; trace: NightTrace } {
  const doctor = agents[doctorId];
  if (!doctor) throw new Error(`Doctor ${doctorId} missing`);

  const candidates = [...state.alive];
  const decs: HealDecomposition[] = [];
  const scores: Record<string, number> = {};

  for (const targetId of candidates) {
    const vocality = computeVocality(state, targetId);
    const claimedSheriff = didClaimSheriff(state, targetId);
    const perceivedThreat = clamp01(0.4 * vocality + 0.6 * (claimedSheriff ? 1 : 0));

    const rel = targetId === doctorId
      ? { bond: 0.9 } as { bond: number }
      : readRel(doctor, targetId);

    const selfPres = vb(doctor, 'A_Safety_Care');
    const selfBias = targetId === doctorId ? 0.3 * selfPres : 0;

    const u =
      1.0 * perceivedThreat
      + 0.3 * rel.bond
      + selfBias;

    decs.push({
      targetId,
      u,
      chosen: false,
      perceivedThreat,
      bond: rel.bond,
      selfPreservation: selfBias,
    });
    scores[targetId] = u;
  }

  const temp = temperatureOf(doctor);
  const sampling = sampleSoftmaxWithTrace(rng, scores, temp);
  const chosen = sampling.chosenKey;

  decs.sort((a, b) => b.u - a.u);
  for (const d of decs) d.chosen = d.targetId === chosen;

  return {
    targetId: chosen,
    trace: {
      actorId: doctorId,
      role: 'doctor',
      kind: 'heal',
      ranked: decs,
      chosenTargetId: chosen,
      perception: buildPerceptionSnapshot(state, agents, doctorId, 'night', 'doctor'),
      candidates: sortCandidateAudit(candidates.map(targetId => ({
        key: targetId,
        label: `heal:${targetId}`,
        kind: 'heal',
        targetId,
        included: true,
        reason: targetId === doctorId ? 'self-heal allowed in this ruleset' : 'all living players are legal heal targets',
      }))),
      sampling,
    },
  };
}

function computeVocality(state: MafiaGameState, playerId: string): number {
  let accusations = 0;
  let claims = 0;
  let votes = 0;
  for (const day of state.history.days) {
    for (const c of day.claims) {
      if (c.actorId !== playerId) continue;
      if (c.kind === 'accuse') accusations++;
      else if (c.kind === 'claim_sheriff') claims++;
      else if (c.kind === 'defend') accusations++;
    }
    for (const v of day.votes) {
      if (v.voterId === playerId && v.targetId) votes++;
    }
  }
  const cycles = Math.max(1, state.history.days.length);
  return clamp01((accusations + 2 * claims + 0.5 * votes) / (cycles * 2));
}

function didClaimSheriff(state: MafiaGameState, playerId: string): boolean {
  for (const day of state.history.days) {
    for (const c of day.claims) {
      if (c.actorId === playerId && c.kind === 'claim_sheriff') return true;
    }
  }
  return false;
}

function temperatureOf(agent: AgentState): number {
  const t = vb(agent, 'B_decision_temperature', 0.3);
  return clamp01(0.1 + 0.9 * t);
}

function avgTemperature(
  agents: Record<string, AgentState>,
  ids: readonly string[]
): number {
  if (ids.length === 0) return 0.3;
  let s = 0;
  let n = 0;
  for (const id of ids) {
    const a = agents[id];
    if (!a) continue;
    s += temperatureOf(a);
    n += 1;
  }
  return n > 0 ? s / n : 0.3;
}

function hashNoise(a: string, b: string): number {
  let h = 2166136261;
  const s = a + '|' + b;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
