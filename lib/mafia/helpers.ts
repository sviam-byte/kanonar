// lib/mafia/helpers.ts
//
// Utility: seeded RNG, trait reader, math.

import type { AgentState, WorldState } from '../../types';
import type {
  MafiaCandidateAudit,
  MafiaGameState,
  MafiaPerceptionSnapshot,
  MafiaSamplingTrace,
  PublicClaim,
  RoleId,
} from './types';

// ═══════════════════════════════════════════════════════════════
// Math
// ═══════════════════════════════════════════════════════════════

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return x < lo ? lo : x > hi ? hi : x;
}

// ═══════════════════════════════════════════════════════════════
// Deterministic xorshift32 RNG
// ═══════════════════════════════════════════════════════════════

export type RngState = { s: number };

export function makeRng(seed: number): RngState {
  // ensure non-zero state
  const s = (seed | 0) || 0x9e3779b1;
  return { s };
}

export function nextUint(rng: RngState): number {
  let x = rng.s | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  rng.s = x | 0;
  return (x >>> 0);
}

export function nextFloat(rng: RngState): number {
  return nextUint(rng) / 0x100000000;
}

export function pickOne<T>(rng: RngState, arr: readonly T[]): T {
  return arr[Math.floor(nextFloat(rng) * arr.length)];
}

export function shuffle<T>(rng: RngState, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(rng) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sampleSoftmaxWithTrace(
  rng: RngState,
  scores: Record<string, number>,
  temperature: number
): MafiaSamplingTrace {
  const keys = Object.keys(scores);
  const T = Math.max(1e-4, temperature);
  if (keys.length === 0) throw new Error('sampleSoftmaxWithTrace: empty');
  if (keys.length === 1) {
    return {
      temperature: T,
      scores: { ...scores },
      probabilities: { [keys[0]]: 1 },
      rngDraw: 0,
      chosenKey: keys[0],
    };
  }

  const vals = keys.map(k => scores[k]);
  const maxV = Math.max(...vals);
  const exps = vals.map(v => Math.exp((v - maxV) / T));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(e => e / sum);

  const r = nextFloat(rng);
  let chosenKey = keys[keys.length - 1];
  let acc = 0;
  const probabilityMap: Record<string, number> = {};
  for (let i = 0; i < keys.length; i++) {
    probabilityMap[keys[i]] = probs[i];
    acc += probs[i];
    if (r < acc && chosenKey === keys[keys.length - 1]) {
      chosenKey = keys[i];
    }
  }

  return {
    temperature: T,
    scores: { ...scores },
    probabilities: probabilityMap,
    rngDraw: r,
    chosenKey,
  };
}

export function sampleSoftmax(
  rng: RngState,
  scores: Record<string, number>,
  temperature: number
): string {
  return sampleSoftmaxWithTrace(rng, scores, temperature).chosenKey;
}

/** Argmax with deterministic tie-break (first wins). */
export function argmax(scores: Record<string, number>): string {
  const keys = Object.keys(scores);
  if (keys.length === 0) throw new Error('argmax: empty');
  let best = keys[0];
  let bestV = scores[best];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (scores[k] > bestV) { best = k; bestV = scores[k]; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════
// Agent trait reader
// ═══════════════════════════════════════════════════════════════

/** Read vector_base value with fallback. Always clamped to [0,1]. */
export function vb(agent: AgentState, key: string, fb = 0.5): number {
  const val = Number((agent as any)?.vector_base?.[key]);
  return Number.isFinite(val) ? clamp01(val) : fb;
}

/** Find agent in world by id. */
export function findAgent(world: WorldState, id: string): AgentState | null {
  const agents = (world as any).agents ?? [];
  for (const a of agents) {
    if (a.entityId === id || a.id === id) return a;
  }
  return null;
}

/** Clone only the agents we need for this game. */
export function cloneAgents(
  world: WorldState,
  playerIds: readonly string[]
): Record<string, AgentState> {
  const result: Record<string, AgentState> = {};
  for (const id of playerIds) {
    const a = findAgent(world, id);
    if (a) result[id] = JSON.parse(JSON.stringify(a));
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Relationship / ToM access
// ═══════════════════════════════════════════════════════════════

export type RelSnapshot = {
  trust: number;
  bond: number;
  conflict: number;
  align: number;
  respect: number;
  fear: number;
  familiarity: number;
};

export function readRel(agent: AgentState, otherId: string): RelSnapshot {
  const rel = (agent as any).relationships?.[otherId] ?? {};
  return {
    trust: clamp01(Number(rel.trust ?? 0.5)),
    bond: clamp01(Number(rel.bond ?? 0.3)),
    conflict: clamp01(Number(rel.conflict ?? 0)),
    align: clamp01(Number(rel.align ?? 0.5)),
    respect: clamp01(Number(rel.respect ?? 0.5)),
    fear: clamp01(Number(rel.fear ?? 0)),
    familiarity: clamp01(Number(rel.familiarity ?? 0.3)),
  };
}

export type TomSnapshot = {
  trust: number;
  competence: number;
  reliability: number;
  dominance: number;
  uncertainty: number;
  vulnerability: number;
};

export function readTom(
  agent: AgentState,
  selfId: string,
  otherId: string
): TomSnapshot {
  const tomState = (agent as any).tom;
  const entry = tomState?.[selfId]?.[otherId]
    ?? tomState?.views?.[selfId]?.[otherId]
    ?? null;
  const t = entry?.traits ?? {};
  return {
    trust: clamp01(Number(t.trust ?? 0.5)),
    competence: clamp01(Number(t.competence ?? 0.5)),
    reliability: clamp01(Number(t.reliability ?? 0.5)),
    dominance: clamp01(Number(t.dominance ?? 0.5)),
    uncertainty: clamp01(Number(t.uncertainty ?? 0.5)),
    vulnerability: clamp01(Number(t.vulnerability ?? 0.5)),
  };
}

export function buildPublicFieldSnapshot(currentDayClaims: readonly PublicClaim[]) {
  const accusationCounts: Record<string, number> = {};
  const defenseCounts: Record<string, number> = {};
  const sheriffClaims: Array<{ claimerId: string; targetId: string; asRole: RoleId }> = [];

  for (const claim of currentDayClaims) {
    if (claim.kind === 'accuse' && claim.targetId) {
      accusationCounts[claim.targetId] = (accusationCounts[claim.targetId] ?? 0) + 1;
    }
    if (claim.kind === 'defend' && claim.targetId) {
      defenseCounts[claim.targetId] = (defenseCounts[claim.targetId] ?? 0) + 1;
    }
    if (claim.kind === 'claim_sheriff' && claim.claimedCheck) {
      sheriffClaims.push({
        claimerId: claim.actorId,
        targetId: claim.claimedCheck.targetId,
        asRole: claim.claimedCheck.asRole,
      });
    }
  }

  return {
    accusationCounts,
    defenseCounts,
    sheriffClaims,
    claimCount: currentDayClaims.length,
  };
}

export function buildPerceptionSnapshot(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  actorId: string,
  phase: 'day' | 'night',
  role: RoleId,
  currentDayClaims: readonly PublicClaim[] = []
): MafiaPerceptionSnapshot {
  const actor = agents[actorId];
  if (!actor) throw new Error(`Actor ${actorId} missing for perception snapshot`);

  const aliveOrder = [...state.alive];
  const publicField = buildPublicFieldSnapshot(currentDayClaims);
  const byTarget: MafiaPerceptionSnapshot['byTarget'] = {};
  const sheriffKnowledge = state.sheriffKnowledge[actorId] ?? {};

  for (const targetId of aliveOrder) {
    if (targetId === actorId) {
      byTarget[targetId] = {
        suspicion: 0,
        publicSignal: {
          accusedBy: publicField.accusationCounts[targetId] ?? 0,
          defendedBy: publicField.defenseCounts[targetId] ?? 0,
          sheriffClaimsMafia: publicField.sheriffClaims.filter(c => c.targetId === targetId && c.asRole === 'mafia').length,
          sheriffClaimsTown: publicField.sheriffClaims.filter(c => c.targetId === targetId && c.asRole !== 'mafia').length,
        },
        roleKnowledge: 'self',
      };
      continue;
    }

    let roleKnowledge: 'known_mafia' | 'known_town' | 'unknown' = 'unknown';
    if (sheriffKnowledge[targetId] === 'mafia') roleKnowledge = 'known_mafia';
    else if (sheriffKnowledge[targetId] && sheriffKnowledge[targetId] !== 'mafia') roleKnowledge = 'known_town';

    byTarget[targetId] = {
      suspicion: state.suspicion[actorId]?.[targetId] ?? 0.5,
      rel: (() => {
        const rel = readRel(actor, targetId);
        return {
          trust: rel.trust,
          bond: rel.bond,
          conflict: rel.conflict,
          fear: rel.fear,
          familiarity: rel.familiarity,
        };
      })(),
      tom: (() => {
        const tom = readTom(actor, actorId, targetId);
        return {
          trust: tom.trust,
          competence: tom.competence,
          reliability: tom.reliability,
          dominance: tom.dominance,
          vulnerability: tom.vulnerability,
          uncertainty: tom.uncertainty,
        };
      })(),
      publicSignal: {
        accusedBy: publicField.accusationCounts[targetId] ?? 0,
        defendedBy: publicField.defenseCounts[targetId] ?? 0,
        sheriffClaimsMafia: publicField.sheriffClaims.filter(c => c.targetId === targetId && c.asRole === 'mafia').length,
        sheriffClaimsTown: publicField.sheriffClaims.filter(c => c.targetId === targetId && c.asRole !== 'mafia').length,
      },
      roleKnowledge,
    };
  }

  return {
    actorId,
    role,
    cycle: state.cycle,
    phase,
    aliveOrder,
    publicField,
    byTarget,
  };
}

export function sortCandidateAudit(candidates: MafiaCandidateAudit[]): MafiaCandidateAudit[] {
  return [...candidates].sort((a, b) => {
    if (a.included !== b.included) return a.included ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}
