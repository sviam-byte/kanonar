// lib/dilemma/runner.ts
//
// Orchestrator: runs a complete dilemma game, round by round.
// Connects engine, bridge, and existing decision pipeline.

import type { ContextAtom } from '../context/v2/types';
import type { ActionCandidate } from '../decision/actionCandidate';
import type {
  DilemmaAnalysis,
  DilemmaGameState,
  DilemmaSpec,
  RoundTrace,
} from './types';
import type { AgentState, WorldState } from '../../types';

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

  const rng = makeRng(config.seed ?? 42);

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

      const agentAtoms = extractAgentAtoms(agent, playerId);
      const allAtoms = atomizeDilemma({
        spec,
        game,
        selfId: playerId,
        otherId,
        agentAtoms,
        tick: game.currentRound,
      });
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

      const decision = decideAction({
        actions: actions.length > 0 ? actions : scoredToActions(scored, playerId),
        goalEnergy,
        temperature: 0.8,
        rng,
      });

      const chosenActionId = decision.best?.id ?? '';
      const dilemmaAction = extractDilemmaActionId(chosenActionId, possibilities)
        ?? fallbackChoice(spec, scored);

      choices[playerId] = dilemmaAction;

      const trustAtom = allAtoms.find((a) => a.id === `rel:state:${playerId}:${otherId}:trust`);
      traces[playerId] = {
        ranked: decision.ranked.map((r) => ({
          actionId: r.action?.id ?? '',
          q: r.q,
          chosen: r.chosen,
        })),
        dilemmaAtomIds: allAtoms.filter((a) => a.id.startsWith('dilemma:')).map((a) => a.id),
        trustAtDecision: trustAtom?.magnitude ?? 0.5,
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

export function extractAgentAtoms(agent: AgentState, selfId: string): ContextAtom[] {
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
        id: `feat:char:${selfId}:trait.${key}`,
        kind: 'fact',
        source: 'character_lens',
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
      ?? 0,
    );
    atoms.push({
      id: `emo:${emo}:${selfId}`,
      kind: 'fact',
      source: 'affect',
      magnitude: clamp01(val),
      ns: 'emo',
      confidence: 1.0,
    });
  }

  const goalAtoms = deriveActiveGoalAtoms(agent, selfId, atoms);
  atoms.push(...goalAtoms);

  return atoms;
}

/**
 * Infer util:activeGoal atoms for the dilemma runner.
 *
 * Why here:
 * - Dilemma scenarios bypass parts of the full GoalLab pipeline.
 * - Without active-goal energy, action ranking degenerates into near-uniform noise.
 *
 * Priority:
 * 1) Explicit agent goal/driver payloads (goalEcology, goals, drivers, etc).
 * 2) Trait-based fallback from character features / behavioral params.
 */
function deriveActiveGoalAtoms(agent: AgentState, selfId: string, atoms: ContextAtom[]): ContextAtom[] {
  const goalDomains = ['survival', 'safety', 'social', 'autonomy', 'affiliation', 'control', 'status', 'order'] as const;
  const explicit = collectExplicitGoalSignals(agent, goalDomains);

  const byId = new Map(atoms.map((a) => [a.id, a] as const));
  const trait = (name: string, fallback = 0.5) =>
    clamp01(Number(byId.get(`feat:char:${selfId}:trait.${name}`)?.magnitude ?? (agent.behavioralParams as any)?.[name] ?? fallback));

  const inferredByTrait: Record<(typeof goalDomains)[number], number> = {
    // Core self-preservation and threat sensitivity.
    survival: 0.7 * trait('safety') + 0.3 * trait('paranoia'),
    safety: 0.8 * trait('safety') + 0.2 * trait('paranoia'),
    // Social valuation and prosocial orientation.
    social: 0.6 * trait('care') + 0.4 * trait('normSensitivity'),
    affiliation: 0.7 * trait('care') + 0.3 * (1 - trait('powerDrive')),
    // Agency and hierarchy pressure.
    autonomy: 0.8 * trait('autonomy') + 0.2 * (1 - trait('order')),
    control: 0.8 * trait('powerDrive') + 0.2 * trait('autonomy'),
    status: 0.8 * trait('powerDrive') + 0.2 * trait('normSensitivity'),
    // Institutional / structure orientation.
    order: 0.7 * trait('order') + 0.3 * trait('normSensitivity'),
  };

  return goalDomains.map((domain) => ({
    id: `util:activeGoal:${selfId}:${domain}`,
    kind: 'fact',
    source: 'goal_inference',
    magnitude: clamp01(explicit[domain] ?? inferredByTrait[domain] ?? 0.5),
    ns: 'util',
    confidence: 1.0,
  }));
}

/**
 * Extract explicit goal energy from agent state when present.
 * Accepts multiple legacy payload shapes and normalizes to canonical domains.
 */
function collectExplicitGoalSignals(
  agent: AgentState,
  goalDomains: readonly string[],
): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  const norm = (key: string): string | null => {
    const lower = String(key ?? '').toLowerCase();
    const base = lower.includes(':') ? lower.split(':').pop() ?? lower : lower;
    const aliases: Record<string, string> = {
      affiliation: 'affiliation',
      belong: 'affiliation',
      belonging: 'affiliation',
      social: 'social',
      society: 'social',
      survive: 'survival',
      survival: 'survival',
      safety: 'safety',
      autonomy: 'autonomy',
      liberty: 'autonomy',
      control: 'control',
      power: 'control',
      status: 'status',
      order: 'order',
    };
    const mapped = aliases[base] ?? base;
    return goalDomains.includes(mapped) ? mapped : null;
  };
  const put = (key: string, raw: unknown) => {
    const domain = norm(key);
    if (!domain) return;
    const value = clamp01(Number(raw ?? 0.5));
    out[domain] = Math.max(out[domain] ?? 0, value);
  };

  // 1) Goal ecology from the core planner.
  for (const g of agent.goalEcology?.execute ?? []) {
    put(g.domain || g.id, g.activation_score ?? g.priority ?? g.weight ?? 0);
  }

  // 2) Generic object forms found in diagnostics/snapshots.
  const bags = [
    (agent as any).goals,
    (agent as any).drivers,
    (agent as any).behavioralParams?.drivers,
  ];
  for (const bag of bags) {
    if (!bag || typeof bag !== 'object') continue;
    for (const [k, v] of Object.entries(bag as Record<string, unknown>)) {
      if (typeof v === 'number') put(k, v);
      else if (v && typeof v === 'object') {
        const vv = (v as any).value ?? (v as any).score ?? (v as any).magnitude;
        if (typeof vv === 'number') put(k, vv);
      }
    }
  }

  // 3) Fallback: active goal ids + effective weights.
  const ids = Array.isArray(agent.goalIds) ? agent.goalIds : [];
  const ws = Array.isArray(agent.w_eff) ? agent.w_eff : [];
  for (let i = 0; i < ids.length; i++) {
    put(ids[i] ?? '', ws[i] ?? 0.5);
  }

  return out;
}

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
    const rel = agent.relationships?.[otherId] as { trust?: number } | undefined;
    if (rel) {
      const delta = opponentCooperated ? 0.06 : -0.10;
      rel.trust = clamp01((rel.trust ?? 0.5) + delta);
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
    agent.relationships[otherId] = {};
  }
  (agent.relationships[otherId] as { trust?: number }).trust = clamp01(trust);
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
