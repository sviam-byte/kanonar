// lib/dilemma/runner.ts
//
// Dedicated dilemma decision model: U(a) = D + R + M + P + E
//
// D — Dispositional: static character traits → cooperation baseline
// R — Relational: trust composite from relationship + ToM about THIS opponent
// M — Momentum: opponent EMA, trend, own inertia, betrayal shock
// P — Payoff: expected value given opponent prediction × rationality
// E — Endgame: shadow of the future

import type {
  DilemmaAnalysis,
  DilemmaGameState,
  DilemmaSpec,
  RoundTrace,
  ActionDecomposition,
} from './types';
import type { AgentState, WorldState, Relationship, TomEntry, TomBeliefTraits } from '../../types';

import { createGame, advanceGame, isGameOver } from './engine';
import { getSpec } from './catalog';
import { analyzeGame } from './analysis';
import { clamp01 } from '../util/math';

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

export type DilemmaRunConfig = {
  specId: string;
  players: readonly [string, string];
  totalRounds: number;
  world: WorldState;
  initialTrust?: number;
  seed?: number;
};

export type DilemmaRunResult = {
  game: DilemmaGameState;
  analysis: DilemmaAnalysis;
};

// ═══════════════════════════════════════════════════════════════
// Character trait reader
// ═══════════════════════════════════════════════════════════════

function vb(agent: AgentState, key: string, fb = 0.5): number {
  const val = Number((agent as any).vector_base?.[key]);
  return Number.isFinite(val) ? clamp01(val) : fb;
}

const TRAIT_KEYS = [
  'A_Safety_Care', 'A_Power_Sovereignty', 'A_Liberty_Autonomy',
  'A_Knowledge_Truth', 'A_Tradition_Continuity', 'A_Legitimacy_Procedure',
  'C_reciprocity_index', 'C_betrayal_cost', 'C_coalition_loyalty',
  'C_reputation_sensitivity', 'C_dominance_empathy',
  'B_exploration_rate', 'B_tolerance_ambiguity', 'B_decision_temperature',
  'B_goal_coherence', 'B_discount_rate',
] as const;

function traitSnapshot(agent: AgentState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of TRAIT_KEYS) {
    const v = Number((agent as any).vector_base?.[k]);
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// D — Dispositional
// ═══════════════════════════════════════════════════════════════

function cooperativeDisposition(agent: AgentState): number {
  return (
    +0.25 * vb(agent, 'A_Safety_Care')
    + 0.20 * vb(agent, 'C_reciprocity_index')
    + 0.20 * vb(agent, 'C_coalition_loyalty')
    + 0.15 * vb(agent, 'C_dominance_empathy')
    + 0.10 * vb(agent, 'C_reputation_sensitivity')
    - 0.20 * vb(agent, 'A_Power_Sovereignty')
    - 0.10 * vb(agent, 'B_exploration_rate')
    - 0.30 // center so all-0.5 → 0
  );
}

// ═══════════════════════════════════════════════════════════════
// R — Relational
// ═══════════════════════════════════════════════════════════════

type TrustCompositeResult = {
  composite: number;
  components: RoundTrace['trustComponents'];
  relSnapshot: Record<string, number>;
};

function computeTrustComposite(
  agent: AgentState,
  selfId: string,
  otherId: string,
): TrustCompositeResult {
  const relSnapshot: Record<string, number> = {};
  const rel = agent.relationships?.[otherId] as Partial<Relationship> | undefined;

  const relTrust = clamp01(Number(rel?.trust ?? 0.5));
  const relBond = clamp01(Number(rel?.bond ?? 0.3));
  const relConflict = clamp01(Number(rel?.conflict ?? 0));
  const relAlign = clamp01(Number(rel?.align ?? 0.5));
  const relRespect = clamp01(Number(rel?.respect ?? 0.5));
  const relFear = clamp01(Number(rel?.fear ?? 0));

  relSnapshot.trust = relTrust;
  relSnapshot.bond = relBond;
  relSnapshot.conflict = relConflict;
  relSnapshot.align = relAlign;
  relSnapshot.respect = relRespect;
  relSnapshot.fear = relFear;

  // ToM
  let tomTrust = 0.5;
  let tomReliability = 0.5;
  let soPerceivedTrust = 0.5;

  const tomState = (agent as any).tom;
  if (tomState) {
    const tomEntry: Partial<TomEntry> | null =
      tomState?.[selfId]?.[otherId]
      ?? tomState?.views?.[selfId]?.[otherId]
      ?? null;

    if (tomEntry?.traits) {
      const traits = tomEntry.traits as Partial<TomBeliefTraits>;
      if (traits.trust !== undefined) tomTrust = clamp01(Number(traits.trust));
      if (traits.reliability !== undefined) tomReliability = clamp01(Number(traits.reliability));
    }
    if (tomEntry?.secondOrderSelf?.perceivedTrustFromTarget !== undefined) {
      soPerceivedTrust = clamp01(Number(tomEntry.secondOrderSelf.perceivedTrustFromTarget));
    }
  }

  // Personality-modulated weights
  const paranoia = vb(agent, 'C_betrayal_cost');
  const truthNeed = vb(agent, 'A_Knowledge_Truth');
  const repSensitivity = vb(agent, 'C_reputation_sensitivity');

  let wRelTrust = 0.35;
  let wRelBond = 0.20;
  let wRelConflict = 0.15;
  let wTomTrust = 0.15 * (1.0 - 0.5 * paranoia);
  let wTomReliability = 0.10 * (1.0 + 0.5 * truthNeed);
  let wSoTrust = 0.05 * (1.0 + 1.0 * repSensitivity);

  const wSum = wRelTrust + wRelBond + wRelConflict + wTomTrust + wTomReliability + wSoTrust;

  const composite = clamp01(
    (wRelTrust * relTrust
      + wRelBond * relBond
      + wRelConflict * (1 - relConflict)
      + wTomTrust * tomTrust
      + wTomReliability * tomReliability
      + wSoTrust * soPerceivedTrust
    ) / wSum
  );

  return {
    composite,
    components: { relTrust, relBond, relConflict, tomTrust, tomReliability, soPerceivedTrust },
    relSnapshot,
  };
}

const BETA_REL = 1.0;

// ═══════════════════════════════════════════════════════════════
// M — Momentum
// ═══════════════════════════════════════════════════════════════

type MomentumState = {
  oppEma: number;
  myLastCoop: number;     // +1 cooperated, -1 defected, 0 first round
  betrayalShock: number;  // accumulated, decays each round
  oppPrevCooperated: boolean; // for betrayal detection
};

const EMA_ALPHA = 0.3;
const SHOCK_DECAY = 0.6;
const W_EMA = 0.8;
const W_TREND = 0.4;
const W_INERTIA = 0.3;
const W_SHOCK = 0.6;

function initMomentum(): MomentumState {
  return { oppEma: 0.5, myLastCoop: 0, betrayalShock: 0, oppPrevCooperated: false };
}

function updateMomentum(
  m: MomentumState,
  opponentCooperated: boolean,
  iCooperated: boolean,
  betrayalSensitivity: number,  // C_betrayal_cost
): MomentumState {
  // Betrayal = opponent was cooperating, now defected
  const betrayalJustHappened = m.oppPrevCooperated && !opponentCooperated;
  const newShock = SHOCK_DECAY * m.betrayalShock
    + (betrayalJustHappened ? betrayalSensitivity : 0);

  return {
    oppEma: EMA_ALPHA * (opponentCooperated ? 1 : 0) + (1 - EMA_ALPHA) * m.oppEma,
    myLastCoop: iCooperated ? 1 : -1,
    betrayalShock: newShock,
    oppPrevCooperated: opponentCooperated,
  };
}

function computeM(
  agent: AgentState,
  mom: MomentumState,
  prevOppEma: number,
  isCoopAction: boolean,
): number {
  const reciprocity = vb(agent, 'C_reciprocity_index');
  const betrayalCost = vb(agent, 'C_betrayal_cost');
  const power = vb(agent, 'A_Power_Sovereignty');
  const coherence = vb(agent, 'B_goal_coherence', 0.5);

  const reciprocitySignal = mom.oppEma - 0.5;
  const oppTrend = mom.oppEma - prevOppEma;

  if (isCoopAction) {
    return (
      W_EMA * reciprocitySignal * reciprocity
      + W_TREND * Math.max(0, oppTrend) * reciprocity
      + W_INERTIA * Math.max(0, mom.myLastCoop) * coherence
      - W_SHOCK * mom.betrayalShock  // shock pushes AWAY from cooperation
    );
  } else {
    return (
      W_EMA * (-reciprocitySignal) * (1 - betrayalCost)
      + W_TREND * Math.max(0, -oppTrend) * power
      + W_INERTIA * Math.max(0, -mom.myLastCoop) * coherence
      + W_SHOCK * mom.betrayalShock  // shock pushes TOWARD defection
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// P — Payoff (expected value)
// ═══════════════════════════════════════════════════════════════

const W_PAYOFF = 0.8;

/**
 * Expected payoff given opponent prediction (opp_ema as P(opp cooperates)).
 * Scaled by rationality = coherence * (1 - temperature).
 * Centers EV around 0.5 so neutral payoff → 0 contribution.
 */
function computeP(
  spec: DilemmaSpec,
  agent: AgentState,
  actionId: string,
  oppCoopProb: number,
): { P: number; ev: number } {
  const coopAction = spec.cooperativeActionId;
  // Find the defect action (the other one)
  const defectAction = spec.actions.find((a) => a.id !== coopAction)?.id ?? '';

  const payoffVsCoop = spec.payoffs[actionId]?.[coopAction]?.[0] ?? 0.5;
  const payoffVsDefect = spec.payoffs[actionId]?.[defectAction]?.[0] ?? 0.5;

  const ev = oppCoopProb * payoffVsCoop + (1 - oppCoopProb) * payoffVsDefect;

  const coherence = vb(agent, 'B_goal_coherence', 0.5);
  const temp = vb(agent, 'B_decision_temperature', 0.5);
  const rationality = coherence * (1 - temp * 0.7);  // high temp → less rational

  const P = W_PAYOFF * rationality * (ev - 0.5);  // center on 0.5

  return { P, ev };
}

// ═══════════════════════════════════════════════════════════════
// E — Endgame
// ═══════════════════════════════════════════════════════════════

const KAPPA = 1.5;

function computeE(
  agent: AgentState,
  roundsRemaining: number,
  totalRounds: number,
  isCoopAction: boolean,
): { E: number; effectiveShadow: number } {
  const ratio = totalRounds > 1 ? roundsRemaining / totalRounds : 0.5;
  const futureShadow = Math.pow(ratio, KAPPA);
  const discount = vb(agent, 'B_discount_rate', 0.5);
  const repSens = vb(agent, 'C_reputation_sensitivity');

  const effectiveShadow = futureShadow * (1 - discount * 0.5);

  if (isCoopAction) {
    return { E: 0.3 * effectiveShadow, effectiveShadow };
  } else {
    return {
      E: 0.3 * (1 - effectiveShadow) * (1 - repSens),
      effectiveShadow,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Full Q
// ═══════════════════════════════════════════════════════════════

type QResult = {
  actions: ActionDecomposition[];
  trustComposite: number;
  trustComponents: RoundTrace['trustComponents'];
  relSnapshot: Record<string, number>;
  disposition: number;
  oppEma: number;
  oppTrend: number;
  myInertia: number;
  betrayalShock: number;
  effectiveShadow: number;
  evPerAction: Record<string, number>;
};

function computeQ(
  spec: DilemmaSpec,
  agent: AgentState,
  selfId: string,
  otherId: string,
  mom: MomentumState,
  prevOppEma: number,
  roundsRemaining: number,
  totalRounds: number,
): QResult {
  const disposition = cooperativeDisposition(agent);
  const tc = computeTrustComposite(agent, selfId, otherId);
  const oppTrend = mom.oppEma - prevOppEma;
  const evPerAction: Record<string, number> = {};

  const actions: ActionDecomposition[] = [];
  let lastEffectiveShadow = 0;

  for (const action of spec.actions) {
    const isCoop = action.id === spec.cooperativeActionId;

    const D = isCoop ? +disposition : -disposition;
    const R = isCoop
      ? +BETA_REL * (tc.composite - 0.5)
      : -BETA_REL * (tc.composite - 0.5);
    const M = computeM(agent, mom, prevOppEma, isCoop);
    const pResult = computeP(spec, agent, action.id, mom.oppEma);
    const eResult = computeE(agent, roundsRemaining, totalRounds, isCoop);
    lastEffectiveShadow = eResult.effectiveShadow;
    evPerAction[action.id] = pResult.ev;

    const q = D + R + M + pResult.P + eResult.E;

    actions.push({
      actionId: action.id,
      q,
      chosen: false,
      D, R, M, P: pResult.P, E: eResult.E,
    });
  }

  return {
    actions,
    trustComposite: tc.composite,
    trustComponents: tc.components,
    relSnapshot: tc.relSnapshot,
    disposition,
    oppEma: mom.oppEma,
    oppTrend,
    myInertia: mom.myLastCoop,
    betrayalShock: mom.betrayalShock,
    effectiveShadow: lastEffectiveShadow,
    evPerAction,
  };
}

// ═══════════════════════════════════════════════════════════════
// Gumbel sampling
// ═══════════════════════════════════════════════════════════════

function gumbelSample(
  actions: ActionDecomposition[],
  temperature: number,
  rng: () => number,
): ActionDecomposition[] {
  let bestScore = -Infinity;
  let bestIdx = 0;

  const sampled = actions.map((a, i) => {
    const u = Math.min(1 - 1e-12, Math.max(1e-12, rng()));
    const noise = -Math.log(-Math.log(u));
    const score = a.q / temperature + noise;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
    return { ...a };
  });

  sampled[bestIdx].chosen = true;
  return sampled;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

export function runDilemmaGame(config: DilemmaRunConfig): DilemmaRunResult {
  const spec = getSpec(config.specId);
  const [p0Id, p1Id] = config.players;

  const agents = cloneAgents(config.world, [p0Id, p1Id]);
  if (!agents[p0Id] || !agents[p1Id]) {
    throw new Error(`Agent not found: ${!agents[p0Id] ? p0Id : p1Id}`);
  }

  const rngs: Record<string, () => number> = {
    [p0Id]: makeRng(config.seed ?? 42),
    [p1Id]: makeRng((config.seed ?? 42) * 2654435761),
  };

  if (config.initialTrust !== undefined) {
    const t = clamp01(config.initialTrust);
    ensureRelationship(agents[p0Id], p1Id, t);
    ensureRelationship(agents[p1Id], p0Id, t);
  }

  const momentum: Record<string, MomentumState> = {
    [p0Id]: initMomentum(),
    [p1Id]: initMomentum(),
  };

  const emaHistory: Record<string, number[]> = {
    [p0Id]: [0.5],
    [p1Id]: [0.5],
  };

  let game = createGame(spec, [p0Id, p1Id], config.totalRounds);

  while (!isGameOver(game)) {
    const choices: Record<string, string> = {};
    const traces: Record<string, RoundTrace> = {};

    for (const playerId of config.players) {
      const otherId = playerId === p0Id ? p1Id : p0Id;
      const agent = agents[playerId];
      const mom = momentum[playerId];

      const hist = emaHistory[playerId];
      const prevOppEma = hist.length >= 3 ? hist[hist.length - 3] : hist[0];
      const roundsRemaining = game.totalRounds - game.currentRound;

      const result = computeQ(
        spec, agent, playerId, otherId,
        mom, prevOppEma,
        roundsRemaining, game.totalRounds,
      );

      const charTemp = vb(agent, 'B_decision_temperature');
      const temperature = 0.3 + 1.4 * charTemp;

      const ranked = gumbelSample(result.actions, temperature, rngs[playerId]);
      const chosen = ranked.find((a) => a.chosen);
      choices[playerId] = chosen?.actionId ?? spec.actions[0].id;

      const sorted = [...ranked].sort((a, b) => b.q - a.q);
      const qMargin = sorted.length >= 2 ? sorted[0].q - sorted[1].q : Infinity;

      traces[playerId] = {
        ranked,
        dilemmaAtomIds: [],
        trustAtDecision: result.trustComposite,
        qMargin,
        temperature,
        cooperativeDisposition: result.disposition,
        trustComposite: result.trustComposite,
        trustComponents: result.trustComponents,
        oppEma: result.oppEma,
        oppTrend: result.oppTrend,
        myInertia: result.myInertia,
        betrayalShock: result.betrayalShock,
        evPerAction: result.evPerAction,
        effectiveShadow: result.effectiveShadow,
        relSnapshot: result.relSnapshot,
        traitSnapshot: traitSnapshot(agent),
      };
    }

    game = advanceGame(spec, game, choices, traces);

    // Post-round updates
    const lastRound = game.rounds[game.rounds.length - 1];
    if (lastRound) {
      for (const playerId of config.players) {
        const otherId = playerId === p0Id ? p1Id : p0Id;
        const oppCooperated = lastRound.choices[otherId] === spec.cooperativeActionId;
        const iCooperated = lastRound.choices[playerId] === spec.cooperativeActionId;

        momentum[playerId] = updateMomentum(
          momentum[playerId],
          oppCooperated,
          iCooperated,
          vb(agents[playerId], 'C_betrayal_cost'),
        );
        emaHistory[playerId].push(momentum[playerId].oppEma);

        // Update relationship
        const rel = agents[playerId].relationships?.[otherId] as
          { trust?: number; conflict?: number; bond?: number } | undefined;
        if (rel) {
          rel.trust = clamp01((rel.trust ?? 0.5) + (oppCooperated ? 0.06 : -0.10));
          if (oppCooperated) {
            rel.conflict = clamp01((rel.conflict ?? 0) - 0.03);
            rel.bond = clamp01((rel.bond ?? 0.3) + 0.02);
          } else {
            rel.conflict = clamp01((rel.conflict ?? 0) + 0.05);
            rel.bond = clamp01((rel.bond ?? 0.3) - 0.01);
          }
        }
      }
    }
  }

  return { game, analysis: analyzeGame(spec, game) };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function cloneAgents(world: WorldState, playerIds: readonly string[]): Record<string, AgentState> {
  const result: Record<string, AgentState> = {};
  for (const id of playerIds) {
    const agent = world.agents?.find((a) => a.entityId === id || a.id === id);
    if (agent) result[id] = JSON.parse(JSON.stringify(agent));
  }
  return result;
}

function ensureRelationship(agent: AgentState, otherId: string, trust: number) {
  if (!agent.relationships) agent.relationships = {};
  if (!agent.relationships[otherId]) {
    agent.relationships[otherId] = {
      trust: clamp01(trust), align: 0.5, respect: 0.5,
      fear: 0, bond: 0.3, conflict: 0, history: [],
    } as any;
  } else {
    (agent.relationships[otherId] as { trust?: number }).trust = clamp01(trust);
  }
}

function makeRng(seed: number): () => number {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
