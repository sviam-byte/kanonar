// lib/dilemma/runner.ts
//
// Orchestrator: runs a complete dilemma game, round by round.
// Connects engine, bridge, and existing decision pipeline.
//
// v2: Character traits → goal energy; trust/ToM → atom context;
//     rich per-round traces with hesitation signal.

import type { ContextAtom } from '../context/v2/types';
import type { ActionCandidate } from '../decision/actionCandidate';
import type {
  DilemmaAnalysis,
  DilemmaGameState,
  DilemmaSpec,
  RoundTrace,
} from './types';
import type { AgentState, WorldState, Relationship, TomEntry, TomBeliefTraits } from '../../types';

import { createGame, advanceGame, isGameOver } from './engine';
import { getSpec } from './catalog';
import { atomizeDilemma, buildDilemmaPossibilities, extractDilemmaActionId } from './bridge';
import { analyzeGame } from './analysis';
import { scorePossibility } from '../decision/score';
import { buildActionCandidates } from '../decision/actionCandidateUtils';
import { decideAction } from '../decision/decide';
import { clamp01 } from '../util/math';
import { atomizeFeatures } from '../features/atomize';
import { extractCharacterFeatures } from '../features/extractCharacter';

export type DilemmaRunConfig = {
  specId: string;
  players: readonly [string, string];
  totalRounds: number;
  /** World state to extract agents from. Will be cloned — not mutated. */
  world: WorldState;
  /** Optional initial trust override (0–1). If omitted, uses agent's existing trust. */
  initialTrust?: number;
  /** RNG seed for deterministic runs. Default: 42. */
  seed?: number;
};

export type DilemmaRunResult = {
  game: DilemmaGameState;
  analysis: DilemmaAnalysis;
};

// ═══════════════════════════════════════════════════════════════
// Goal energy inference from character traits
// ═══════════════════════════════════════════════════════════════

/**
 * Maps character vector_base (A_*, B_*, C_*) and body/cognitive features
 * into goal domain energies that the decision pipeline can use.
 *
 * This is the critical missing link: without goal energy, scoreAction
 * returns 0 for all candidates regardless of deltaGoals.
 *
 * Goal domains match FEATURE_GOAL_PROJECTION_KEYS in actionProjection.ts:
 *   survival, safety, social, resource, autonomy, wellbeing,
 *   affiliation, control, status, exploration, order, rest, wealth
 */
function inferGoalEnergy(agent: AgentState, selfId: string): { atoms: ContextAtom[]; snapshot: Record<string, number> } {
  const atoms: ContextAtom[] = [];
  const snapshot: Record<string, number> = {};

  const vb = (agent as any).vector_base || {};
  const body = (agent as any).body?.acute || {};
  const state = (agent as any).state || {};

  // Helper: read a vector_base value, fallback to 0.5
  const v = (key: string, fb = 0.5): number => {
    const val = Number(vb[key]);
    return Number.isFinite(val) ? clamp01(val) : fb;
  };

  // Helper: read numeric field
  const num = (val: unknown, fb = 0): number => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fb;
  };

  // ── Derive goal energy from character vector ──

  const goals: Record<string, number> = {
    survival: clamp01(
      0.4 * v('A_Safety_Care', 0.5)
      + 0.2 * (1 - num(body.fatigue, 0) / 100)
      + 0.2 * v('C_betrayal_cost', 0.5)
      + 0.2 * (1 - num(state.burnout_risk, 0) / 100)
    ),

    safety: clamp01(
      0.5 * v('A_Safety_Care', 0.5)
      + 0.3 * v('C_betrayal_cost', 0.5)
      + 0.2 * (1 - v('B_exploration_rate', 0.5))
    ),

    social: clamp01(
      0.3 * v('C_reciprocity_index', 0.5)
      + 0.3 * v('C_coalition_loyalty', 0.5)
      + 0.2 * v('C_dominance_empathy', 0.5)
      + 0.2 * v('C_reputation_sensitivity', 0.5)
    ),

    affiliation: clamp01(
      0.35 * v('C_coalition_loyalty', 0.5)
      + 0.35 * v('C_reciprocity_index', 0.5)
      + 0.3 * v('C_dominance_empathy', 0.5)
    ),

    control: clamp01(
      0.5 * v('A_Power_Sovereignty', 0.5)
      + 0.3 * (1 - v('A_Liberty_Autonomy', 0.5))
      + 0.2 * v('A_Legitimacy_Procedure', 0.5)
    ),

    status: clamp01(
      0.4 * v('A_Power_Sovereignty', 0.5)
      + 0.3 * v('C_reputation_sensitivity', 0.5)
      + 0.3 * v('C_dominance_empathy', 0.5)
    ),

    autonomy: clamp01(
      0.5 * v('A_Liberty_Autonomy', 0.5)
      + 0.3 * v('B_exploration_rate', 0.5)
      + 0.2 * (1 - v('A_Legitimacy_Procedure', 0.5))
    ),

    order: clamp01(
      0.4 * v('A_Tradition_Continuity', v('A_Tradition_Order', 0.5))
      + 0.3 * v('A_Legitimacy_Procedure', 0.5)
      + 0.3 * (1 - v('B_tolerance_ambiguity', 0.5))
    ),

    exploration: clamp01(
      0.4 * v('B_exploration_rate', 0.5)
      + 0.3 * v('A_Knowledge_Truth', 0.5)
      + 0.3 * v('B_tolerance_ambiguity', 0.5)
    ),

    wellbeing: clamp01(
      0.3 * (1 - num(body.stress, 0) / 100)
      + 0.3 * (1 - num(body.fatigue, 0) / 100)
      + 0.2 * v('A_Safety_Care', 0.5)
      + 0.2 * v('C_dominance_empathy', 0.5)
    ),

    resource: 0.4,
    wealth: 0.3,
    rest: clamp01(num(body.fatigue, 0) / 100),
  };

  for (const [domain, energy] of Object.entries(goals)) {
    const e = clamp01(energy);
    snapshot[domain] = e;
    atoms.push({
      id: `goal:domain:${domain}:${selfId}`,
      kind: 'fact' as const,
      source: 'goal_inference' as any,
      magnitude: e,
      ns: 'goal',
      origin: 'derived' as any,
      confidence: 1.0,
      label: `goal:${domain}=${(e * 100).toFixed(0)}%`,
    });
  }

  return { atoms, snapshot };
}

// ═══════════════════════════════════════════════════════════════
// Relationship & ToM atom extraction
// ═══════════════════════════════════════════════════════════════

function extractRelationshipAtoms(
  agent: AgentState,
  selfId: string,
  otherId: string,
): { atoms: ContextAtom[]; relSnapshot: Record<string, number>; tomSnapshot: Record<string, number> } {
  const atoms: ContextAtom[] = [];
  const relSnapshot: Record<string, number> = {};
  const tomSnapshot: Record<string, number> = {};

  // ── Relationship ──
  const rel = agent.relationships?.[otherId] as Relationship | undefined;
  if (rel) {
    const fields: Array<[string, string, number]> = [
      ['trust', 'trust', rel.trust ?? 0.5],
      ['align', 'alignment', rel.align ?? 0.5],
      ['respect', 'respect', rel.respect ?? 0.5],
      ['fear', 'fear', rel.fear ?? 0],
      ['bond', 'bond', rel.bond ?? 0.3],
      ['conflict', 'conflict', rel.conflict ?? 0],
    ];
    for (const [key, label, val] of fields) {
      const v = clamp01(Number(val));
      relSnapshot[key] = v;
      atoms.push({
        id: `rel:state:${selfId}:${otherId}:${key}`,
        kind: 'fact' as const,
        source: 'social' as any,
        magnitude: v,
        ns: 'soc',
        confidence: 1.0,
        label: `rel:${label}=${(v * 100).toFixed(0)}%`,
      });
    }
  } else {
    relSnapshot.trust = 0.5;
    atoms.push({
      id: `rel:state:${selfId}:${otherId}:trust`,
      kind: 'fact' as const,
      source: 'social' as any,
      magnitude: 0.5,
      ns: 'soc',
      confidence: 0.5,
      label: 'rel:trust=50% (default)',
    });
  }

  // ── Theory of Mind ──
  const tomState = (agent as any).tom;
  if (tomState) {
    const tomEntry: Partial<TomEntry> | null =
      tomState?.[selfId]?.[otherId]
      ?? tomState?.views?.[selfId]?.[otherId]
      ?? null;

    if (tomEntry?.traits) {
      const traits = tomEntry.traits as Partial<TomBeliefTraits>;
      const tomFields: Array<[string, number | undefined]> = [
        ['tom_trust', traits.trust],
        ['tom_align', traits.align],
        ['tom_competence', traits.competence],
        ['tom_dominance', traits.dominance],
        ['tom_reliability', traits.reliability],
        ['tom_uncertainty', traits.uncertainty],
        ['tom_vulnerability', traits.vulnerability],
        ['tom_conflict', traits.conflict],
      ];
      for (const [key, rawVal] of tomFields) {
        if (rawVal === undefined) continue;
        const v = clamp01(Number(rawVal));
        tomSnapshot[key] = v;
        atoms.push({
          id: `tom:dyad:${selfId}:${otherId}:${key.replace('tom_', '')}`,
          kind: 'fact' as const,
          source: 'tom' as any,
          magnitude: v,
          ns: 'tom',
          confidence: 0.8,
          label: `${key}=${(v * 100).toFixed(0)}%`,
        });
      }
    }

    if (tomEntry?.secondOrderSelf) {
      const so = tomEntry.secondOrderSelf;
      if (so.perceivedTrustFromTarget !== undefined)
        tomSnapshot['so_perceivedTrust'] = clamp01(Number(so.perceivedTrustFromTarget));
      if (so.perceivedAlignFromTarget !== undefined)
        tomSnapshot['so_perceivedAlign'] = clamp01(Number(so.perceivedAlignFromTarget));
    }
  }

  return { atoms, relSnapshot, tomSnapshot };
}

// ═══════════════════════════════════════════════════════════════
// Trait snapshot for trace
// ═══════════════════════════════════════════════════════════════

function extractTraitSnapshot(agent: AgentState): Record<string, number> {
  const vb = (agent as any).vector_base || {};
  const out: Record<string, number> = {};
  const keys = [
    'A_Safety_Care', 'A_Power_Sovereignty', 'A_Liberty_Autonomy',
    'A_Knowledge_Truth', 'A_Tradition_Continuity', 'A_Legitimacy_Procedure',
    'C_reciprocity_index', 'C_betrayal_cost', 'C_coalition_loyalty',
    'C_reputation_sensitivity', 'C_dominance_empathy',
    'B_exploration_rate', 'B_tolerance_ambiguity', 'B_decision_temperature',
  ];
  for (const k of keys) {
    const v = Number(vb[k]);
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Main run function
// ═══════════════════════════════════════════════════════════════

/**
 * Run a complete dilemma game with the existing decision stack.
 */
export function runDilemmaGame(config: DilemmaRunConfig): DilemmaRunResult {
  const spec = getSpec(config.specId);
  const [p0Id, p1Id] = config.players;

  const agents = cloneAgents(config.world, [p0Id, p1Id]);
  if (!agents[p0Id] || !agents[p1Id]) {
    throw new Error(`Agent not found: ${!agents[p0Id] ? p0Id : p1Id}`);
  }

  // Separate RNG per player so their noise sequences diverge
  const rngP0 = makeRng((config.seed ?? 42));
  const rngP1 = makeRng((config.seed ?? 42) * 2654435761); // different seed via golden ratio hash

  if (config.initialTrust !== undefined) {
    const t = clamp01(config.initialTrust);
    ensureRelationship(agents[p0Id], p1Id, t);
    ensureRelationship(agents[p1Id], p0Id, t);
  }

  let game = createGame(spec, [p0Id, p1Id], config.totalRounds);

  while (!isGameOver(game)) {
    const choices: Record<string, string> = {};
    const traces: Record<string, RoundTrace> = {};

    for (const playerId of config.players) {
      const otherId = playerId === p0Id ? p1Id : p0Id;
      const agent = agents[playerId];
      const rng = playerId === p0Id ? rngP0 : rngP1;

      // ── 1. Extract character feature atoms ──
      const agentAtoms = extractAgentAtoms(agent, playerId);

      // ── 2. Infer goal energy from character traits ──
      const goalInference = inferGoalEnergy(agent, playerId);

      // ── 3. Extract relationship & ToM atoms ──
      const relData = extractRelationshipAtoms(agent, playerId, otherId);

      // ── 4. Build dilemma-specific situation atoms ──
      const allAtoms = atomizeDilemma({
        spec,
        game,
        selfId: playerId,
        otherId,
        agentAtoms: [...agentAtoms, ...goalInference.atoms, ...relData.atoms],
        tick: game.currentRound,
      });

      // ── 5. Build possibilities & score ──
      const possibilities = buildDilemmaPossibilities({
        spec,
        selfId: playerId,
        otherId,
        atoms: allAtoms,
      });

      const scored = possibilities.map((p) => scorePossibility({ selfId: playerId, atoms: allAtoms, p }));
      const { actions, goalEnergy } = buildActionCandidates({
        selfId: playerId,
        atoms: allAtoms,
        possibilities,
        currentTick: game.currentRound,
      });

      // ── 6. Decide ──
      const charTemp = Number((agent as any).vector_base?.['B_decision_temperature']);
      const temperature = Number.isFinite(charTemp) ? 0.3 + charTemp * 1.4 : 0.8;

      const decision = decideAction({
        actions: actions.length > 0 ? actions : scoredToActions(scored, playerId),
        goalEnergy,
        temperature,
        rng,
      });

      const chosenActionId = decision.best?.id ?? '';
      const dilemmaAction = extractDilemmaActionId(chosenActionId, possibilities)
        ?? fallbackChoice(spec, scored);

      choices[playerId] = dilemmaAction;

      // ── 7. Build rich trace ──
      const sortedRanked = [...decision.ranked].sort((a, b) => b.q - a.q);
      const qValues = sortedRanked.map((r) => r.q);
      const qMargin = qValues.length >= 2 ? qValues[0] - qValues[1] : Infinity;

      const deltaGoalsPerAction: Record<string, Record<string, number>> = {};
      for (const a of (actions.length > 0 ? actions : scoredToActions(scored, playerId))) {
        deltaGoalsPerAction[a.id] = { ...(a.deltaGoals || {}) };
      }

      const trustAtom = allAtoms.find((a) => a.id === `rel:state:${playerId}:${otherId}:trust`);

      traces[playerId] = {
        ranked: decision.ranked.map((r) => ({
          actionId: r.action?.id ?? '',
          q: r.q,
          chosen: r.chosen,
        })),
        dilemmaAtomIds: allAtoms.filter((a) => a.id.startsWith('dilemma:')).map((a) => a.id),
        trustAtDecision: trustAtom?.magnitude ?? 0.5,

        goalEnergy: { ...goalEnergy },
        deltaGoalsPerAction,
        qMargin,
        effectiveTemperature: temperature,
        tieBandActive: decision.ranked.filter((r) => r.inTieBand).length >= 2,
        traitSnapshot: extractTraitSnapshot(agent),
        tomSnapshot: relData.tomSnapshot,
        relSnapshot: relData.relSnapshot,
      };
    }

    game = advanceGame(spec, game, choices, traces);

    if (!isGameOver(game)) {
      updateTrust(agents, spec, game);
    }
  }

  return {
    game,
    analysis: analyzeGame(spec, game),
  };
}

// ═══════════════════════════════════════════════════════════════
// Agent atom extraction (traits + emotions)
// ═══════════════════════════════════════════════════════════════

function extractAgentAtoms(agent: AgentState, selfId: string): ContextAtom[] {
  const atoms: ContextAtom[] = [];

  try {
    const features = extractCharacterFeatures({ character: agent, selfId });
    const featureAtoms = atomizeFeatures(features, `feat:char:${selfId}`);
    atoms.push(...featureAtoms);
  } catch {
    const bp = agent.behavioralParams ?? {};
    const traitKeys = [
      'safety', 'care', 'paranoia', 'powerDrive', 'truthNeed',
      'autonomy', 'order', 'normSensitivity', 'ambiguityTolerance',
    ];
    for (const key of traitKeys) {
      const val = Number((bp as Record<string, number>)[key] ?? 0.5);
      atoms.push({
        id: `feat:char:${selfId}:${selfId}:trait.${key}`,
        kind: 'fact',
        source: 'character_lens' as any,
        magnitude: clamp01(val),
        ns: 'feat',
        confidence: 1.0,
      });
    }
  }

  const emotions = ['fear', 'anger', 'shame', 'resolve', 'care'];
  for (const emo of emotions) {
    const val = Number(
      (agent as unknown as { emotionState?: Record<string, number> }).emotionState?.[emo]
      ?? (agent as unknown as { affect?: Record<string, number> }).affect?.[emo]
      ?? (agent as any).cognitive?.affective_module?.[emo]
      ?? 0,
    );
    atoms.push({
      id: `emo:${emo}:${selfId}`,
      kind: 'fact',
      source: 'affect' as any,
      magnitude: clamp01(val > 1 ? val / 100 : val),
      ns: 'emo',
      confidence: 1.0,
    });
  }

  return atoms;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function fallbackChoice(spec: DilemmaSpec, _scored: unknown[]): string {
  return spec.actions[0].id;
}

function scoredToActions(scored: Array<{ candidate?: { id?: string; kind?: string }; id?: string }>, selfId: string): ActionCandidate[] {
  return scored.map((s) => ({
    id: s.candidate?.id ?? s.id ?? '',
    kind: s.candidate?.kind ?? 'unknown',
    actorId: selfId,
    deltaGoals: {},
    cost: 0,
    confidence: 0.9,
    supportAtoms: [],
  }));
}

function updateTrust(
  agents: Record<string, AgentState>,
  spec: DilemmaSpec,
  game: DilemmaGameState,
) {
  const lastRound = game.rounds[game.rounds.length - 1];
  if (!lastRound) return;

  for (const playerId of game.players) {
    const otherId = game.players.find((p) => p !== playerId);
    if (!otherId) continue;
    const agent = agents[playerId];
    if (!agent) continue;

    const opponentCooperated = lastRound.choices[otherId] === spec.cooperativeActionId;

    const rel = agent.relationships?.[otherId] as { trust?: number; conflict?: number; bond?: number } | undefined;
    if (rel) {
      const delta = opponentCooperated ? 0.06 : -0.10;
      rel.trust = clamp01((rel.trust ?? 0.5) + delta);

      if (opponentCooperated) {
        rel.conflict = clamp01((rel.conflict ?? 0) - 0.03);
        rel.bond = clamp01((rel.bond ?? 0.3) + 0.02);
      } else {
        rel.conflict = clamp01((rel.conflict ?? 0) + 0.05);
        rel.bond = clamp01((rel.bond ?? 0.3) - 0.01);
      }
    }
  }
}

function cloneAgents(
  world: WorldState,
  playerIds: readonly string[],
): Record<string, AgentState> {
  const result: Record<string, AgentState> = {};
  for (const id of playerIds) {
    const agent = world.agents?.find((a) => a.entityId === id || a.id === id);
    if (agent) {
      result[id] = JSON.parse(JSON.stringify(agent));
    }
  }
  return result;
}

function ensureRelationship(agent: AgentState, otherId: string, trust: number) {
  if (!agent.relationships) agent.relationships = {};
  if (!agent.relationships[otherId]) {
    agent.relationships[otherId] = {
      trust: clamp01(trust),
      align: 0.5,
      respect: 0.5,
      fear: 0,
      bond: 0.3,
      conflict: 0,
      history: [],
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
