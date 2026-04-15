// lib/dilemma/runner.ts — v6
//
// Contains both runners:
// - runDilemmaGame() — v1 legacy decomposition (D + R + M + P + E)
// - runDilemmaV2()   — v2 pipeline (compile → dyad → filter → score → resolve → update)

import type {
  DilemmaAnalysis, DilemmaGameState, DilemmaSpec,
  RoundTrace, ActionDecomposition,
  V2RunConfig, V2RunResult, V2GameState, V2RoundTrace,
  ActionScore, StateUpdate, CompiledAgent, CompiledDyad,
  ScenarioTemplate, ActionTemplate,
} from './types';
import type { AgentState, WorldState, Relationship, TomEntry, TomBeliefTraits, CharacterEntity } from '../../types';
import { createGame, advanceGame, isGameOver } from './engine';
import { getSpec } from './catalog';
import { analyzeGame } from './analysis';
import { clamp01 } from '../util/math';
import { compileAgent, compileDyad, computePerceivedStakes } from './compiler';
import { getScenario } from './scenarios';
import { explainDecision, summarizeGame } from './explainer';
import { initTomForCharacters } from '../tom/init';

export type DilemmaRunConfig = {
  specId: string;
  players: readonly [string, string];
  totalRounds: number;
  world: WorldState;
  initialTrust?: number;   // if set, OVERRIDES pair-specific trust (for manual tuning)
  seed?: number;
};
export type DilemmaRunResult = { game: DilemmaGameState; analysis: DilemmaAnalysis };

// ═══════════════════════════════════════════════════════════════
// Trait reader
// ═══════════════════════════════════════════════════════════════

function vb(agent: AgentState, key: string, fb = 0.5): number {
  const val = Number((agent as any).vector_base?.[key]);
  return Number.isFinite(val) ? clamp01(val) : fb;
}
function stateNum(agent: AgentState, key: string, fb = 50): number {
  const val = Number((agent as any).state?.[key]);
  return Number.isFinite(val) ? val : fb;
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
  // State
  for (const k of ['will', 'loyalty', 'dark_exposure', 'burnout_risk']) {
    const v = Number((agent as any).state?.[k]);
    if (Number.isFinite(v)) out[`state.${k}`] = v;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Pair-specific initial trust: A's trust of B
// ═══════════════════════════════════════════════════════════════

function computePairTrust(a: AgentState, b: AgentState): number {
  let t = 0.5;

  // 1. Value alignment: difference on value axes
  const valueAxes = [
    'A_Safety_Care', 'A_Knowledge_Truth', 'A_Tradition_Continuity',
    'A_Legitimacy_Procedure', 'A_Liberty_Autonomy',
  ];
  let valDiff = 0;
  for (const k of valueAxes) valDiff += Math.abs(vb(a, k) - vb(b, k));
  valDiff /= valueAxes.length;
  t += 0.15 * (1 - valDiff * 2);  // aligned → +0.15

  // 2. Reciprocity match
  t += 0.08 * Math.min(vb(a, 'C_reciprocity_index'), vb(b, 'C_reciprocity_index'));

  // 3. Power competition (both high → distrust)
  t -= 0.15 * vb(a, 'A_Power_Sovereignty') * vb(b, 'A_Power_Sovereignty');

  // 4. Empathy readability (A can read B)
  t += 0.06 * vb(a, 'C_dominance_empathy') * vb(b, 'C_reputation_sensitivity');

  // 5. Institutional loyalty alignment
  t += 0.05 * (stateNum(a, 'loyalty', 50) / 100) * (stateNum(b, 'loyalty', 50) / 100);

  // 6. Dark exposure gap → experiential distance
  t -= 0.12 * Math.abs(stateNum(a, 'dark_exposure', 0) - stateNum(b, 'dark_exposure', 0)) / 100;

  // 7. A's caution from betrayal sensitivity
  t -= 0.10 * vb(a, 'C_betrayal_cost');
  t += 0.05;  // rebalance

  // 8. Use existing relationship if present
  const rel = a.relationships?.[b.entityId ?? (b as any).id] as Partial<Relationship> | undefined;
  if (rel?.trust !== undefined) {
    const existing = clamp01(Number(rel.trust));
    t = 0.3 * t + 0.7 * existing;  // existing relationship dominates
  }

  return clamp01(Math.max(0.1, Math.min(0.9, t)));
}

// ═══════════════════════════════════════════════════════════════
// D — Dispositional (with state)
// ═══════════════════════════════════════════════════════════════

function cooperativeDisposition(agent: AgentState): number {
  // Trait base
  const base =
    + 0.25 * vb(agent, 'A_Safety_Care')
    + 0.20 * vb(agent, 'C_reciprocity_index')
    + 0.20 * vb(agent, 'C_coalition_loyalty')
    + 0.15 * vb(agent, 'C_dominance_empathy')
    + 0.10 * vb(agent, 'C_reputation_sensitivity')
    - 0.20 * vb(agent, 'A_Power_Sovereignty')
    - 0.10 * vb(agent, 'B_exploration_rate')
    - 0.30;

  // State modifiers
  const will = stateNum(agent, 'will', 50) / 100;     // 0..1
  const burnout = Number((agent as any).state?.burnout_risk ?? 0);
  const dark = stateNum(agent, 'dark_exposure', 0) / 100;  // 0..1

  const willMod = (will - 0.5) * 0.15;       // low will → less cooperative
  const burnoutMod = -burnout * 0.10;          // burnout → less cooperative
  const darkMod = -dark * 0.08;               // cynicism

  return (base + willMod + burnoutMod + darkMod) * 1.5;
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
  agent: AgentState, selfId: string, otherId: string,
): TrustCompositeResult {
  const relSnapshot: Record<string, number> = {};
  const rel = agent.relationships?.[otherId] as Partial<Relationship> | undefined;

  const relTrust = clamp01(Number(rel?.trust ?? 0.5));
  const relBond = clamp01(Number(rel?.bond ?? 0.3));
  const relConflict = clamp01(Number(rel?.conflict ?? 0));
  relSnapshot.trust = relTrust;
  relSnapshot.bond = relBond;
  relSnapshot.conflict = relConflict;
  relSnapshot.align = clamp01(Number(rel?.align ?? 0.5));
  relSnapshot.respect = clamp01(Number(rel?.respect ?? 0.5));
  relSnapshot.fear = clamp01(Number(rel?.fear ?? 0));

  let tomTrust = 0.5; let tomReliability = 0.5; let soPerceivedTrust = 0.5;
  const tomState = (agent as any).tom;
  if (tomState) {
    const te: Partial<TomEntry> | null =
      tomState?.[selfId]?.[otherId] ?? tomState?.views?.[selfId]?.[otherId] ?? null;
    if (te?.traits) {
      const tr = te.traits as Partial<TomBeliefTraits>;
      if (tr.trust !== undefined) tomTrust = clamp01(Number(tr.trust));
      if (tr.reliability !== undefined) tomReliability = clamp01(Number(tr.reliability));
    }
    if (te?.secondOrderSelf?.perceivedTrustFromTarget !== undefined) {
      soPerceivedTrust = clamp01(Number(te.secondOrderSelf.perceivedTrustFromTarget));
    }
  }

  const paranoia = vb(agent, 'C_betrayal_cost');
  const truthNeed = vb(agent, 'A_Knowledge_Truth');
  const repSens = vb(agent, 'C_reputation_sensitivity');
  const wRT = 0.35; const wRB = 0.20; const wRC = 0.15;
  const wTT = 0.15 * (1 - 0.5 * paranoia);
  const wTR = 0.10 * (1 + 0.5 * truthNeed);
  const wST = 0.05 * (1 + repSens);
  const wSum = wRT + wRB + wRC + wTT + wTR + wST;

  const composite = clamp01(
    (wRT * relTrust + wRB * relBond + wRC * (1 - relConflict) + wTT * tomTrust + wTR * tomReliability + wST * soPerceivedTrust) / wSum,
  );

  return { composite, components: { relTrust, relBond, relConflict, tomTrust, tomReliability, soPerceivedTrust }, relSnapshot };
}

const BETA_REL = 1.0;

// ═══════════════════════════════════════════════════════════════
// M — Momentum
// ═══════════════════════════════════════════════════════════════

type MomentumState = {
  oppEma: number;
  myLastCoop: number;
  betrayalShock: number;
  oppPrevCooperated: boolean;
};

const EMA_ALPHA = 0.3;
const SHOCK_DECAY = 0.6;
const W_EMA = 0.8; const W_TREND = 0.4; const W_INERTIA = 0.3; const W_SHOCK = 0.6;

function initMomentum(): MomentumState {
  return { oppEma: 0.5, myLastCoop: 0, betrayalShock: 0, oppPrevCooperated: false };
}

function updateMomentum(m: MomentumState, oppCoop: boolean, iCoop: boolean, betrayalSens: number): MomentumState {
  const betrayed = m.oppPrevCooperated && !oppCoop;
  return {
    oppEma: EMA_ALPHA * (oppCoop ? 1 : 0) + (1 - EMA_ALPHA) * m.oppEma,
    myLastCoop: iCoop ? 1 : -1,
    betrayalShock: SHOCK_DECAY * m.betrayalShock + (betrayed ? betrayalSens : 0),
    oppPrevCooperated: oppCoop,
  };
}

function computeM(agent: AgentState, mom: MomentumState, prevOppEma: number, isCoop: boolean): number {
  const recip = vb(agent, 'C_reciprocity_index');
  const betCost = vb(agent, 'C_betrayal_cost');
  const power = vb(agent, 'A_Power_Sovereignty');
  const coher = vb(agent, 'B_goal_coherence', 0.5);
  const sig = mom.oppEma - 0.5;
  const trend = mom.oppEma - prevOppEma;

  if (isCoop) {
    return W_EMA * sig * recip + W_TREND * Math.max(0, trend) * recip
      + W_INERTIA * Math.max(0, mom.myLastCoop) * coher - W_SHOCK * mom.betrayalShock;
  } else {
    return W_EMA * (-sig) * (1 - betCost) + W_TREND * Math.max(0, -trend) * power
      + W_INERTIA * Math.max(0, -mom.myLastCoop) * coher + W_SHOCK * mom.betrayalShock;
  }
}

// ═══════════════════════════════════════════════════════════════
// P — Payoff
// ═══════════════════════════════════════════════════════════════

const W_PAYOFF = 1.2;

function computeP(spec: DilemmaSpec, agent: AgentState, actionId: string, oppCoopProb: number): { P: number; ev: number } {
  const coopAct = spec.cooperativeActionId;
  const defAct = spec.actions.find((a) => a.id !== coopAct)?.id ?? '';
  const evVsCoop = spec.payoffs[actionId]?.[coopAct]?.[0] ?? 0.5;
  const evVsDef = spec.payoffs[actionId]?.[defAct]?.[0] ?? 0.5;
  const ev = oppCoopProb * evVsCoop + (1 - oppCoopProb) * evVsDef;
  const rat = vb(agent, 'B_goal_coherence', 0.5) * (1 - vb(agent, 'B_decision_temperature', 0.5) * 0.7);
  return { P: W_PAYOFF * rat * (ev - 0.5), ev };
}

// ═══════════════════════════════════════════════════════════════
// E — Endgame
// ═══════════════════════════════════════════════════════════════

function computeE(agent: AgentState, roundsRem: number, total: number, isCoop: boolean): { E: number; effectiveShadow: number } {
  const ratio = total > 1 ? roundsRem / total : 0.5;
  const shadow = Math.pow(ratio, 1.5) * (1 - vb(agent, 'B_discount_rate', 0.5) * 0.5);
  return isCoop
    ? { E: 0.12 * shadow, effectiveShadow: shadow }
    : { E: 0.12 * (1 - shadow) * (1 - vb(agent, 'C_reputation_sensitivity')), effectiveShadow: shadow };
}

// ═══════════════════════════════════════════════════════════════
// Full Q
// ═══════════════════════════════════════════════════════════════

function computeQ(
  spec: DilemmaSpec, agent: AgentState, selfId: string, otherId: string,
  mom: MomentumState, prevOppEma: number, roundsRem: number, total: number,
): {
  actions: ActionDecomposition[]; trustComposite: number; trustComponents: RoundTrace['trustComponents'];
  relSnapshot: Record<string, number>; disposition: number; oppEma: number; oppTrend: number;
  myInertia: number; betrayalShock: number; effectiveShadow: number; evPerAction: Record<string, number>;
} {
  const disposition = cooperativeDisposition(agent);
  const tc = computeTrustComposite(agent, selfId, otherId);
  const evPerAction: Record<string, number> = {};
  const actions: ActionDecomposition[] = [];
  let es = 0;

  for (const action of spec.actions) {
    const isCoop = action.id === spec.cooperativeActionId;
    const D = isCoop ? +disposition * 1.5 : -disposition * 1.5;
    const R = BETA_REL * (isCoop ? (tc.composite - 0.5) : -(tc.composite - 0.5));
    const M = computeM(agent, mom, prevOppEma, isCoop);
    const { P, ev } = computeP(spec, agent, action.id, mom.oppEma);
    const { E, effectiveShadow } = computeE(agent, roundsRem, total, isCoop);
    es = effectiveShadow;
    evPerAction[action.id] = ev;
    actions.push({ actionId: action.id, q: D + R + M + P + E, chosen: false, D, R, M, P, E });
  }

  return {
    actions, trustComposite: tc.composite, trustComponents: tc.components,
    relSnapshot: tc.relSnapshot, disposition, oppEma: mom.oppEma,
    oppTrend: mom.oppEma - prevOppEma, myInertia: mom.myLastCoop,
    betrayalShock: mom.betrayalShock, effectiveShadow: es, evPerAction,
  };
}

// ═══════════════════════════════════════════════════════════════
// Gumbel sampling
// ═══════════════════════════════════════════════════════════════

function gumbelSample(actions: ActionDecomposition[], temp: number, rng: () => number): ActionDecomposition[] {
  let best = -Infinity; let bestI = 0;
  const out = actions.map((a, i) => {
    const u = Math.min(1 - 1e-12, Math.max(1e-12, rng()));
    const score = a.q / temp + (-Math.log(-Math.log(u)));
    if (score > best) { best = score; bestI = i; }
    return { ...a };
  });
  out[bestI].chosen = true;
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

export function runDilemmaGame(config: DilemmaRunConfig): DilemmaRunResult {
  const spec = getSpec(config.specId);
  const [p0Id, p1Id] = config.players;
  const agents = cloneAgents(config.world, [p0Id, p1Id]);
  if (!agents[p0Id] || !agents[p1Id]) throw new Error(`Agent not found: ${!agents[p0Id] ? p0Id : p1Id}`);

  const rngs: Record<string, () => number> = {
    [p0Id]: makeRng(config.seed ?? 42),
    [p1Id]: makeRng((config.seed ?? 42) * 2654435761),
  };

  // Pair-specific initial trust (or override from slider)
  const pairTrust0to1 = config.initialTrust !== undefined
    ? clamp01(config.initialTrust)
    : computePairTrust(agents[p0Id], agents[p1Id]);
  const pairTrust1to0 = config.initialTrust !== undefined
    ? clamp01(config.initialTrust)
    : computePairTrust(agents[p1Id], agents[p0Id]);

  ensureRelationship(agents[p0Id], p1Id, pairTrust0to1);
  ensureRelationship(agents[p1Id], p0Id, pairTrust1to0);

  const momentum: Record<string, MomentumState> = { [p0Id]: initMomentum(), [p1Id]: initMomentum() };
  const emaHistory: Record<string, number[]> = { [p0Id]: [0.5], [p1Id]: [0.5] };
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

      const result = computeQ(spec, agent, playerId, otherId, mom, prevOppEma,
        game.totalRounds - game.currentRound, game.totalRounds);

      const charTemp = vb(agent, 'B_decision_temperature');
      const temperature = 0.3 + 1.4 * charTemp;
      const ranked = gumbelSample(result.actions, temperature, rngs[playerId]);
      choices[playerId] = ranked.find((a) => a.chosen)?.actionId ?? spec.actions[0].id;

      const sorted = [...ranked].sort((a, b) => b.q - a.q);
      const qMargin = sorted.length >= 2 ? sorted[0].q - sorted[1].q : Infinity;

      traces[playerId] = {
        ranked, dilemmaAtomIds: [], trustAtDecision: result.trustComposite,
        qMargin, temperature, cooperativeDisposition: result.disposition,
        trustComposite: result.trustComposite, trustComponents: result.trustComponents,
        oppEma: result.oppEma, oppTrend: result.oppTrend, myInertia: result.myInertia,
        betrayalShock: result.betrayalShock, evPerAction: result.evPerAction,
        effectiveShadow: result.effectiveShadow,
        relSnapshot: result.relSnapshot, traitSnapshot: traitSnapshot(agent),
      };
    }

    game = advanceGame(spec, game, choices, traces);

    const lastRound = game.rounds[game.rounds.length - 1];
    if (lastRound) {
      for (const pid of config.players) {
        const oid = pid === p0Id ? p1Id : p0Id;
        const oppCoop = lastRound.choices[oid] === spec.cooperativeActionId;
        const iCoop = lastRound.choices[pid] === spec.cooperativeActionId;
        momentum[pid] = updateMomentum(momentum[pid], oppCoop, iCoop, vb(agents[pid], 'C_betrayal_cost'));
        emaHistory[pid].push(momentum[pid].oppEma);

        const rel = agents[pid].relationships?.[oid] as { trust?: number; conflict?: number; bond?: number } | undefined;
        if (rel) {
          rel.trust = clamp01((rel.trust ?? 0.5) + (oppCoop ? 0.06 : -0.10));
          if (oppCoop) { rel.conflict = clamp01((rel.conflict ?? 0) - 0.03); rel.bond = clamp01((rel.bond ?? 0.3) + 0.02); }
          else { rel.conflict = clamp01((rel.conflict ?? 0) + 0.05); rel.bond = clamp01((rel.bond ?? 0.3) - 0.01); }
        }
      }
    }
  }

  return { game, analysis: analyzeGame(spec, game) };
}

// ═══════════════════════════════════════════════════════════════
// v2 pipeline runner
// ═══════════════════════════════════════════════════════════════

export function runDilemmaV2(config: V2RunConfig): V2RunResult {
  const scenario = getScenario(config.scenarioId);
  const [p0Id, p1Id] = config.players;
  const agents = cloneAgents(config.world, [p0Id, p1Id]);
  if (!agents[p0Id] || !agents[p1Id]) {
    throw new Error(`Agent not found: ${!agents[p0Id] ? p0Id : p1Id}`);
  }

  /**
   * Инициализация отношений для v2:
   * 1) сначала пробуем биографическую/ToM инициализацию;
   * 2) если ToM недоступен для пары — откатываемся на computePairTrust.
   *
   * Это повышает совместимость с существующим контентом персонажей:
   * ToM-данные учитывают историю и dyad-конфиги, а fallback сохраняет
   * детерминированный baseline для старых/неполных карточек.
   */
  const chars = Object.values(agents) as CharacterEntity[];
  const minWorld: WorldState = {
    tick: 0,
    agents: chars as unknown as AgentState[],
    locations: [],
    leadership: { leaderId: null } as WorldState['leadership'],
    initialRelations: {},
  };
  const tomState = initTomForCharacters(chars, minWorld);

  for (const pid of config.players) {
    const oid = pid === p0Id ? p1Id : p0Id;
    const tomEntry = tomState?.[pid]?.[oid];
    const existing = agents[pid].relationships?.[oid] as Partial<Relationship> | undefined;

    if (tomEntry?.traits) {
      if (!agents[pid].relationships) agents[pid].relationships = {} as AgentState['relationships'];
      agents[pid].relationships[oid] = {
        trust: clamp01(tomEntry.traits.trust ?? existing?.trust ?? 0.5),
        align: clamp01(tomEntry.traits.align ?? existing?.align ?? 0.5),
        respect: clamp01(tomEntry.traits.respect ?? existing?.respect ?? 0.5),
        fear: clamp01(tomEntry.traits.fear ?? existing?.fear ?? 0),
        bond: clamp01(tomEntry.traits.bond ?? existing?.bond ?? 0.1),
        conflict: clamp01(tomEntry.traits.conflict ?? existing?.conflict ?? 0.1),
        history: existing?.history ?? [],
      } as Relationship;
    } else {
      const pairTrust = computePairTrust(agents[pid], agents[oid]);
      ensureRelationship(agents[pid], oid, pairTrust);
    }

    /**
     * compileDyad / trust-composite читают ToM из агента; кладем сюда
     * инициализированный срез для self-view (pid -> target).
     */
    if (!(agents[pid] as any).tom) (agents[pid] as any).tom = {};
    if (tomState[pid]) (agents[pid] as any).tom[pid] = tomState[pid];
  }

  const rngs: Record<string, () => number> = {
    [p0Id]: makeRng(config.seed ?? 42),
    [p1Id]: makeRng((config.seed ?? 42) * 2654435761),
  };

  const game: V2GameState = {
    scenarioId: config.scenarioId,
    players: config.players,
    rounds: [],
    currentRound: 0,
    totalRounds: config.totalRounds,
  };

  const allTraces: Record<string, V2RoundTrace[]> = { [p0Id]: [], [p1Id]: [] };

  for (let round = 0; round < config.totalRounds; round++) {
    const choices: Record<string, string> = {};
    const traces: Record<string, V2RoundTrace> = {};
    const pending: Record<string, {
      playerId: string;
      otherId: string;
      compiled: CompiledAgent;
      dyad: CompiledDyad;
      availableActions: string[];
      filteredOut: string[];
      scores: ActionScore[];
      chosenId: string;
      chosenTemplate: ActionTemplate;
      explanation: string;
    }> = {};

    for (const playerId of config.players) {
      const otherId = playerId === p0Id ? p1Id : p0Id;
      const compiled = compileAgent(agents[playerId]);
      const compiledOther = compileAgent(agents[otherId]);
      compiled.perceivedStakes = computePerceivedStakes(compiled, scenario);
      compiled.effectiveTemperature *= (1 - 0.4 * compiled.perceivedStakes);
      const dyad = compileDyad(compiled, compiledOther, agents[playerId], agents[otherId]);

      const { available, filteredOut } = filterActions(scenario, compiled);
      const instPressure = config.institutionalPressure ?? scenario.institutionalPressure;
      const scores = scoreActions(available, scenario, compiled, dyad, round, config.totalRounds, instPressure);
      const chosenId = resolveAction(scores, compiled.effectiveTemperature, rngs[playerId]);
      choices[playerId] = chosenId;

      for (const score of scores) score.chosen = score.actionId === chosenId;

      const explanation = explainDecision({ agent: compiled, dyad, scenario, scores, chosenId });
      const chosenTemplate = scenario.actionPool.find((a) => a.id === chosenId);
      if (!chosenTemplate) {
        throw new Error(`Action ${chosenId} not found in scenario ${scenario.id}`);
      }

      pending[playerId] = {
        playerId,
        otherId,
        compiled,
        dyad,
        availableActions: available.map((a) => a.id),
        filteredOut,
        scores,
        chosenId,
        chosenTemplate,
        explanation,
      };
    }

    const pairUpdates = computePairOutcome(pending[p0Id], pending[p1Id], scenario);

    for (const playerId of config.players) {
      const update = pairUpdates[playerId];
      const trace: V2RoundTrace = {
        compiled: { agent: pending[playerId].compiled, dyad: pending[playerId].dyad },
        availableActions: pending[playerId].availableActions,
        filteredOut: pending[playerId].filteredOut,
        scores: pending[playerId].scores,
        chosenActionId: pending[playerId].chosenId,
        stateUpdate: update,
        explanation: pending[playerId].explanation,
      };

      traces[playerId] = trace;
      allTraces[playerId].push(trace);
      applyStateUpdate(agents[playerId], pending[playerId].otherId, update);
    }

    game.rounds.push({ index: round, choices, traces });
    game.currentRound = round + 1;
  }

  const confidence: Record<string, number> = {};
  const summaries: Record<string, string> = {};
  for (const playerId of config.players) {
    const first = allTraces[playerId][0];
    confidence[playerId] = first?.compiled.agent.confidence ?? 0;
    summaries[playerId] = summarizeGame(
      playerId,
      allTraces[playerId].map((t) => ({ chosenActionId: t.chosenActionId, explanation: t.explanation })),
      confidence[playerId],
    );
  }

  return { game, confidence, summaries };
}

function filterActions(
  scenario: ScenarioTemplate,
  agent: CompiledAgent,
): { available: ActionTemplate[]; filteredOut: string[] } {
  const available: ActionTemplate[] = [];
  const filteredOut: string[] = [];

  for (const action of scenario.actionPool) {
    if (!meetsRequirements(action, agent)) {
      filteredOut.push(action.id);
      continue;
    }
    available.push(action);
  }

  return available.length < 2 ? { available: scenario.actionPool, filteredOut: [] } : { available, filteredOut };
}

function meetsRequirements(action: ActionTemplate, agent: CompiledAgent): boolean {
  const req = action.requires;
  if (!req) return true;
  if (req.roles && req.roles.length > 0 && !req.roles.some((r) => agent.roles.includes(r))) return false;
  if (req.minClearance !== undefined && agent.clearance < req.minClearance) return false;
  if (req.minTrait) {
    const val = agent.axes[req.minTrait.axis] ?? 0.5;
    if (val < req.minTrait.threshold) return false;
  }
  if (req.maxTrait) {
    const val = agent.axes[req.maxTrait.axis] ?? 0.5;
    if (val > req.maxTrait.threshold) return false;
  }
  if (req.hasFallback && req.hasFallback.length > 0) {
    const fallback = agent.cognitive.fallbackPolicy ?? '';
    if (!req.hasFallback.includes(fallback)) return false;
  }
  return true;
}

function scoreActions(
  actions: ActionTemplate[],
  scenario: ScenarioTemplate,
  agent: CompiledAgent,
  dyad: CompiledDyad,
  round: number,
  totalRounds: number,
  instPressure: number,
): ActionScore[] {
  const w = agent.weights;
  const goalSalience = computeGoalSalience(agent, dyad, scenario);
  const remaining = totalRounds - round;
  const shadowRatio = totalRounds > 1 ? remaining / totalRounds : 1;
  const shadow = Math.pow(shadowRatio, 1.5) * (1 - (agent.axes.B_discount_rate ?? 0.5) * 0.5);
  const stakesAmp = 1 + 0.5 * agent.perceivedStakes;

  return actions.map((action) => {
    const p = reweightActionProfile(action, agent, dyad, scenario);
    const baseG = (p.goalFit ?? 0) * goalSalience;
    const resonance = computeGoalActionResonance(agent, action);
    const G = w.wG * (baseG + resonance) * stakesAmp;
    const trustComposite = clamp01(
      0.30 * dyad.rel.trust
      + 0.20 * dyad.rel.bond
      + 0.15 * dyad.rel.align
      + 0.10 * dyad.rel.respect
      - 0.20 * dyad.rel.conflict
      - 0.15 * dyad.rel.fear,
    );
    const mirrorComposite = clamp01(
      0.35 * dyad.secondOrder.perceivedTrust
      + 0.35 * dyad.secondOrder.perceivedAlign
      + 0.15 * (1 - Math.abs(dyad.secondOrder.perceivedDominance - 0.5) * 2)
      + 0.15 * dyad.secondOrder.mirrorIndex,
    );
    const historyAmp = 0.7 + 0.3 * dyad.sharedHistoryDensity;
    const powerPenalty = 1 - 0.2 * Math.max(0, -dyad.powerAsymmetry);
    const R = w.wR * (p.relationalFit ?? 0) * (0.45 + 0.55 * trustComposite) * historyAmp;
    const I = w.wI * (p.identityFit ?? 0);
    const L = w.wL * (p.legitimacyFit ?? 0) * (0.5 + 0.5 * instPressure);
    const safetyBoost = 1 + agent.state.burnoutRisk + (agent.acute.stress / 100) * 0.5;
    const S = w.wS * (p.safetyFit ?? 0) * safetyBoost * powerPenalty;
    const M = w.wM * (p.mirrorFit ?? 0) * (0.4 + 0.6 * mirrorComposite);
    const X = w.wX * (p.expectedCost ?? 0) * shadow;
    const U = G + R + I + L + S + M - X;

    return { actionId: action.id, U, G, R, I, L, S, M, X, probability: 0, chosen: false };
  });
}

/**
 * Adds direct semantic resonance between named goals and action tags.
 * Example: protect_* goals bias actions tagged as protect/support.
 */
function computeGoalActionResonance(agent: CompiledAgent, action: ActionTemplate): number {
  if (action.socialTags.length === 0) return 0;
  const goals = agent.cognitive.wGoals;
  if (Object.keys(goals).length === 0) return 0;

  let maxResonance = 0;
  for (const [goalKey, goalWeight] of Object.entries(goals)) {
    const gk = goalKey.toLowerCase();
    for (const tag of action.socialTags) {
      const tg = tag.toLowerCase();
      if (gk.includes(tg) || tg.includes(gk)) {
        maxResonance = Math.max(maxResonance, goalWeight * 0.5);
      }
    }
  }

  const fallback = agent.cognitive.fallbackPolicy.toLowerCase();
  for (const tag of action.socialTags) {
    const tg = tag.toLowerCase();
    if (fallback.includes(tg) || tg.includes(fallback)) {
      maxResonance = Math.max(maxResonance, 0.25);
    }
  }

  return maxResonance;
}

function computeGoalSalience(
  agent: CompiledAgent,
  dyad: CompiledDyad,
  scenario: ScenarioTemplate,
): number {
  const base = (agent.axes.B_goal_coherence ?? 0.5) * (1 - agent.state.burnoutRisk * 0.5);
  const stakesMag = (scenario.stakes.personal + scenario.stakes.relational) / 2;
  const conflictPenalty = dyad.rel.conflict * 0.3;
  return clamp01(base * (0.7 + 0.3 * stakesMag) - conflictPenalty);
}

function resolveAction(scores: ActionScore[], temperature: number, rng: () => number): string {
  const maxU = Math.max(...scores.map((s) => s.U));
  const exps = scores.map((s) => Math.exp((s.U - maxU) / Math.max(0.01, temperature)));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scores.length; i++) scores[i].probability = exps[i] / sumExp;

  let bestScore = -Infinity;
  let bestId = scores[0]?.actionId ?? '';
  for (const score of scores) {
    const u = Math.min(1 - 1e-12, Math.max(1e-12, rng()));
    const gumbel = score.U / Math.max(0.01, temperature) + (-Math.log(-Math.log(u)));
    if (gumbel > bestScore) {
      bestScore = gumbel;
      bestId = score.actionId;
    }
  }
  return bestId;
}

function reweightActionProfile(
  action: ActionTemplate,
  _agent: CompiledAgent,
  dyad: CompiledDyad,
  scenario: ScenarioTemplate,
): ActionTemplate['profile'] {
  // Dynamic profile shaping keeps static scenario templates simple while
  // making per-round scoring sensitive to current relationship context.
  const p = { ...action.profile };
  const tags = new Set(action.socialTags.map((t) => t.toLowerCase()));
  const isSupportive = tags.has('support') || tags.has('help') || tags.has('protect') || action.id === scenario.cooperativeActionId;
  const isHarmful = tags.has('harm') || tags.has('punish');
  const isBetrayal = tags.has('deceive') || tags.has('betrayal') || tags.has('lie');

  if (isSupportive) {
    p.goalFit = (p.goalFit ?? 0) + 0.25 * dyad.rel.align + 0.20 * dyad.sharedHistoryDensity;
    p.relationalFit = (p.relationalFit ?? 0) + 0.35 * dyad.rel.trust + 0.25 * dyad.rel.bond;
    p.expectedCost = Math.max(0, (p.expectedCost ?? 0) + 0.15 * dyad.rel.fear + 0.10 * Math.max(0, -dyad.powerAsymmetry));
    p.mirrorFit = (p.mirrorFit ?? 0) + 0.20 * dyad.secondOrder.perceivedTrust;
  }

  if (isBetrayal) {
    p.relationalFit = (p.relationalFit ?? 0) - 0.55 * dyad.rel.trust - 0.35 * dyad.rel.bond;
    p.identityFit = (p.identityFit ?? 0) - 0.15 * dyad.rel.respect;
    p.mirrorFit = (p.mirrorFit ?? 0) - 0.35 * dyad.secondOrder.perceivedTrust - 0.20 * dyad.secondOrder.perceivedAlign;
  }

  if (isHarmful) {
    p.relationalFit = (p.relationalFit ?? 0) - 0.25 * dyad.rel.respect - 0.25 * dyad.rel.bond;
    p.legitimacyFit = (p.legitimacyFit ?? 0) + 0.25 * Math.max(0, dyad.secondOrder.perceivedDominance - 0.5);
    p.expectedCost = Math.max(0, (p.expectedCost ?? 0) + 0.10 * dyad.sharedHistoryDensity);
  }

  return p;
}

function blankStateUpdate(agentId: string, againstActionId: string, outcomeTag: string): StateUpdate {
  return {
    agentId,
    againstActionId,
    outcomeTag,
    willDelta: 0,
    burnoutDelta: 0,
    stressDelta: 0,
    fatigueDelta: 0,
    shameDelta: 0,
    tomObservation: { actionId: againstActionId, socialTags: [], success: 0 },
    trustDelta: 0,
    bondDelta: 0,
    conflictDelta: 0,
    fearDelta: 0,
  };
}

function addUpdate(dst: StateUpdate, patch: Partial<StateUpdate>): StateUpdate {
  dst.willDelta += patch.willDelta ?? 0;
  dst.burnoutDelta += patch.burnoutDelta ?? 0;
  dst.stressDelta += patch.stressDelta ?? 0;
  dst.fatigueDelta += patch.fatigueDelta ?? 0;
  dst.shameDelta += patch.shameDelta ?? 0;
  dst.trustDelta += patch.trustDelta ?? 0;
  dst.bondDelta += patch.bondDelta ?? 0;
  dst.conflictDelta += patch.conflictDelta ?? 0;
  dst.fearDelta += patch.fearDelta ?? 0;
  if (patch.tomObservation) dst.tomObservation = patch.tomObservation;
  if (patch.outcomeTag) dst.outcomeTag = patch.outcomeTag;
  if (patch.againstActionId) dst.againstActionId = patch.againstActionId;
  return dst;
}

function isSupportiveAction(action: ActionTemplate, scenario: ScenarioTemplate): boolean {
  return action.id === scenario.cooperativeActionId || action.socialTags.includes('support') || action.socialTags.includes('help') || action.socialTags.includes('protect');
}

function isHarmfulAction(action: ActionTemplate): boolean {
  return action.socialTags.includes('harm') || action.socialTags.includes('punish');
}

function isBetrayalAction(action: ActionTemplate): boolean {
  return action.socialTags.includes('deceive') || action.socialTags.includes('betrayal') || action.socialTags.includes('lie');
}

function computeIntrinsicSelfEffect(agentId: string, action: ActionTemplate, agent: CompiledAgent): StateUpdate {
  const cost = action.profile.expectedCost ?? 0;
  const isSupportive = action.socialTags.includes('support') || action.socialTags.includes('help') || action.socialTags.includes('protect');
  const isHarmful = isHarmfulAction(action);
  const isBetrayal = isBetrayalAction(action);
  const shameSens = agent.cognitive.shameGuiltSensitivity / 100;

  return {
    agentId,
    againstActionId: '',
    outcomeTag: 'intrinsic',
    willDelta: -cost * 3,
    burnoutDelta: cost * 0.05 * (1 + agent.acute.stress / 100),
    stressDelta: isSupportive ? -2 : isHarmful ? 4 : isBetrayal ? 6 : 1,
    fatigueDelta: 1 + cost * 2,
    shameDelta: isBetrayal ? shameSens * 0.2 : isHarmful ? shameSens * 0.1 : 0,
    tomObservation: { actionId: action.id, socialTags: action.socialTags, success: isSupportive ? 0.4 : isHarmful ? -0.4 : 0 },
    trustDelta: 0,
    bondDelta: 0,
    conflictDelta: 0,
    fearDelta: 0,
  };
}

function computeObservedEffect(
  observerId: string,
  observedAction: ActionTemplate,
  observerDyad: CompiledDyad,
  scenario: ScenarioTemplate,
): StateUpdate {
  const isSupportive = isSupportiveAction(observedAction, scenario);
  const isHarmful = isHarmfulAction(observedAction);
  const isBetrayal = isBetrayalAction(observedAction);
  const vulnerability = Math.max(0, -observerDyad.powerAsymmetry);

  return {
    agentId: observerId,
    againstActionId: observedAction.id,
    outcomeTag: 'observed_action',
    willDelta: 0,
    burnoutDelta: 0,
    stressDelta: isSupportive ? -2 : isHarmful ? 6 : isBetrayal ? 5 : 0,
    fatigueDelta: 0,
    shameDelta: 0,
    tomObservation: { actionId: observedAction.id, socialTags: observedAction.socialTags, success: isSupportive ? 0.6 : isHarmful || isBetrayal ? -0.7 : 0 },
    trustDelta: isSupportive ? 0.10 : isBetrayal ? -0.18 : isHarmful ? -0.12 : observedAction.id === scenario.cooperativeActionId ? 0.05 : -0.01,
    bondDelta: isSupportive ? 0.05 : isBetrayal ? -0.06 : isHarmful ? -0.03 : 0,
    conflictDelta: isSupportive ? -0.05 : isBetrayal ? 0.15 : isHarmful ? 0.10 : 0.01,
    fearDelta: isHarmful ? 0.06 * (1 + vulnerability) : isBetrayal ? 0.02 * (1 + vulnerability * 0.5) : 0,
  };
}

function classifyPairOutcome(aAction: ActionTemplate, bAction: ActionTemplate, scenario: ScenarioTemplate): string {
  const aCoop = isSupportiveAction(aAction, scenario);
  const bCoop = isSupportiveAction(bAction, scenario);
  const aDefect = isBetrayalAction(aAction) || isHarmfulAction(aAction) || aAction.id === 'stay_opaque' || aAction.id === 'take_all';
  const bDefect = isBetrayalAction(bAction) || isHarmfulAction(bAction) || bAction.id === 'stay_opaque' || bAction.id === 'take_all';

  if (aCoop && bCoop) return 'mutual_cooperation';
  if (aCoop && bDefect) return 'a_exploited';
  if (bCoop && aDefect) return 'b_exploited';
  if (aDefect && bDefect) return 'mutual_defection';
  return 'mixed';
}

function computePairOutcome(
  a: { playerId: string; otherId: string; chosenTemplate: ActionTemplate; compiled: CompiledAgent; dyad: CompiledDyad; },
  b: { playerId: string; otherId: string; chosenTemplate: ActionTemplate; compiled: CompiledAgent; dyad: CompiledDyad; },
  scenario: ScenarioTemplate,
): Record<string, StateUpdate> {
  // Pair resolution is done after both decisions are known to avoid order bias:
  // each player gets (1) intrinsic self-effect, (2) observed opponent effect,
  // (3) payoff matrix adjustments, and (4) outcome-class modifiers.
  const updates: Record<string, StateUpdate> = {
    [a.playerId]: blankStateUpdate(a.playerId, b.chosenTemplate.id, 'pending'),
    [b.playerId]: blankStateUpdate(b.playerId, a.chosenTemplate.id, 'pending'),
  };

  addUpdate(updates[a.playerId], computeIntrinsicSelfEffect(a.playerId, a.chosenTemplate, a.compiled));
  addUpdate(updates[b.playerId], computeIntrinsicSelfEffect(b.playerId, b.chosenTemplate, b.compiled));
  addUpdate(updates[a.playerId], computeObservedEffect(a.playerId, b.chosenTemplate, a.dyad, scenario));
  addUpdate(updates[b.playerId], computeObservedEffect(b.playerId, a.chosenTemplate, b.dyad, scenario));

  const outcomeTag = classifyPairOutcome(a.chosenTemplate, b.chosenTemplate, scenario);
  updates[a.playerId].outcomeTag = outcomeTag;
  updates[b.playerId].outcomeTag = outcomeTag;

  const aPayoff = a.chosenTemplate.payoffVs?.[b.chosenTemplate.id] ?? 0;
  const bPayoff = b.chosenTemplate.payoffVs?.[a.chosenTemplate.id] ?? 0;

  updates[a.playerId].willDelta += aPayoff * 2.5;
  updates[b.playerId].willDelta += bPayoff * 2.5;
  updates[a.playerId].stressDelta += -aPayoff * 2.0;
  updates[b.playerId].stressDelta += -bPayoff * 2.0;

  switch (outcomeTag) {
    case 'mutual_cooperation':
      addUpdate(updates[a.playerId], { trustDelta: 0.08, bondDelta: 0.05, conflictDelta: -0.04, stressDelta: -2 });
      addUpdate(updates[b.playerId], { trustDelta: 0.08, bondDelta: 0.05, conflictDelta: -0.04, stressDelta: -2 });
      break;
    case 'a_exploited':
      addUpdate(updates[a.playerId], { trustDelta: -0.10, bondDelta: -0.04, conflictDelta: 0.08, stressDelta: 4, fearDelta: 0.01 });
      addUpdate(updates[b.playerId], { shameDelta: 0.06 * (b.compiled.cognitive.shameGuiltSensitivity / 100), conflictDelta: 0.02 });
      break;
    case 'b_exploited':
      addUpdate(updates[b.playerId], { trustDelta: -0.10, bondDelta: -0.04, conflictDelta: 0.08, stressDelta: 4, fearDelta: 0.01 });
      addUpdate(updates[a.playerId], { shameDelta: 0.06 * (a.compiled.cognitive.shameGuiltSensitivity / 100), conflictDelta: 0.02 });
      break;
    case 'mutual_defection':
      addUpdate(updates[a.playerId], { trustDelta: -0.05, bondDelta: -0.02, conflictDelta: 0.04, stressDelta: 2 });
      addUpdate(updates[b.playerId], { trustDelta: -0.05, bondDelta: -0.02, conflictDelta: 0.04, stressDelta: 2 });
      break;
    default:
      addUpdate(updates[a.playerId], { conflictDelta: 0.01 });
      addUpdate(updates[b.playerId], { conflictDelta: 0.01 });
      break;
  }

  return updates;
}

function applyStateUpdate(agent: AgentState, otherId: string, update: StateUpdate): void {
  const state = (agent as any).state;
  if (state) {
    state.will = Math.max(0, Math.min(100, (state.will ?? 50) + update.willDelta));
    state.burnout_risk = clamp01((state.burnout_risk ?? 0) + update.burnoutDelta);
  }

  const acute = (agent as any).body?.acute;
  if (acute) {
    acute.stress = Math.max(0, Math.min(100, (acute.stress ?? 0) + update.stressDelta));
    acute.fatigue = Math.max(0, Math.min(100, (acute.fatigue ?? 0) + update.fatigueDelta));
    acute.moral_injury = Math.max(0, Math.min(100, (acute.moral_injury ?? 0) + update.shameDelta * 10));
  }

  const rel = agent.relationships?.[otherId] as Record<string, number> | undefined;
  if (rel) {
    rel.trust = clamp01((rel.trust ?? 0.5) + update.trustDelta);
    rel.bond = clamp01((rel.bond ?? 0.1) + update.bondDelta);
    rel.conflict = clamp01((rel.conflict ?? 0.1) + update.conflictDelta);
    rel.fear = clamp01((rel.fear ?? 0) + update.fearDelta);
  } else {
    if (!agent.relationships) (agent as any).relationships = {};
    (agent as any).relationships[otherId] = {
      trust: clamp01(0.5 + update.trustDelta),
      align: 0.5,
      respect: 0.5,
      fear: clamp01(update.fearDelta),
      bond: clamp01(0.1 + update.bondDelta),
      conflict: clamp01(0.1 + update.conflictDelta),
      history: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
function cloneAgents(world: WorldState, ids: readonly string[]): Record<string, AgentState> {
  const r: Record<string, AgentState> = {};
  for (const id of ids) {
    const a = world.agents?.find((x) => x.entityId === id || x.id === id);
    if (a) r[id] = JSON.parse(JSON.stringify(a));
  }
  return r;
}
function ensureRelationship(agent: AgentState, otherId: string, trust: number) {
  if (!agent.relationships) agent.relationships = {};
  if (!agent.relationships[otherId]) {
    agent.relationships[otherId] = { trust: clamp01(trust), align: 0.5, respect: 0.5, fear: 0, bond: 0.3, conflict: 0, history: [] } as any;
  } else {
    (agent.relationships[otherId] as { trust?: number }).trust = clamp01(trust);
  }
}
function makeRng(seed: number): () => number {
  let x = (seed >>> 0) || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
