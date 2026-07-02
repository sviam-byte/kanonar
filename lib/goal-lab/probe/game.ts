// lib/goal-lab/probe/game.ts
//
// T1 (docs/GOALS_AND_TASKS.md): the outcome scorer — observable B.
// Maps the agent's CHOSEN action at S8 to an outcome label and a [self, other]
// payoff, per scene. This is the measurement boundary OUTSIDE the mechanism:
// between an axis and an outcome stands the whole stack (priors → Gumbel choice
// → outcome), so a sign prediction here can fail non-tautologically — unlike
// act:prior, which is near-linear in PERSONALITY_ACTION_MAP coefficients.
//
// A `Game` is the action→outcome map + payoff matrix, kept separate from the
// scene's world-building (seeds the T5 Scene/Game split; N players later
// generalize `OtherPolicy` to a move vector). The other agent (B) is a static
// prop in the probe — it does not act — so joint outcomes are resolved against
// a stipulated fixed policy for B.
//
// FROZEN 2026-07-02 (observable B v1, docs/SCENE_BATTERY_v1.md §0-B). The verb
// tables and resolution rules are part of the OBSERVABLE'S DEFINITION, not
// tunable coefficients — deliberately NOT in formulaConfig. Do not edit a
// table to make a prediction pass; vocabulary drift must fail loudly through
// the unclassified-rate gate (tests/goals/outcome_scorer.test.ts), and a
// changed classification is a new observable version, re-registered.

export type PayoffPair = [number, number]; // [self, other]

/** B's stipulated move in joint games. Default across the harness: 'cooperate'
 *  (the frame where i_defect is profitable — what T3 needs). */
export type OtherPolicy = 'cooperate' | 'defect';

export const UNCLASSIFIED = 'unclassified';

export interface Game {
  id: string; // versioned, e.g. 'G_contest.v1'
  /** Outcome label -> [self, other]. Superset of scene.payoff.outcomes
   *  (a game may add game-level labels like no_engagement). */
  outcomes: Record<string, PayoffPair>;
  /** Verb -> move. Data, not regex; a verb absent here scores UNCLASSIFIED. */
  moves: Record<string, string>;
  /** Total on declared moves: (selfMove, otherPolicy) -> label ∈ outcomes. */
  resolve(selfMove: string, other: OtherPolicy): string;
}

export interface OutcomeScore {
  verb: string;
  move: string | null; // null == unclassified verb
  label: string;       // outcome label, or UNCLASSIFIED
  self: number;        // payoff (0 when UNCLASSIFIED)
  other: number;
}

/** Chosen-action keys are possibility ids `${kind}:${verb}:${self}[:${target}]`
 *  (lib/possibilities/defs.ts); the verb is segment 1. */
export function verbOfActionKey(actionKey: string): string {
  const parts = String(actionKey).split(':');
  return parts.length > 1 ? parts[1] : parts[0];
}

/** Pure and deterministic: same key + policy always yields the same score. */
export function scoreAction(game: Game, actionKey: string, other: OtherPolicy): OutcomeScore {
  const verb = verbOfActionKey(actionKey);
  const move = game.moves[verb];
  if (!move) return { verb, move: null, label: UNCLASSIFIED, self: 0, other: 0 };
  const label = game.resolve(move, other);
  const pay = game.outcomes[label] ?? [0, 0];
  return { verb, move, label, self: pay[0], other: pay[1] };
}

/** Invert {move: verbs[]} into the flat verb->move table. */
function movesTable(spec: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [move, verbs] of Object.entries(spec)) {
    for (const v of verbs) out[v] = move;
  }
  return out;
}

// ---------------------------------------------------------------------------
// G_contest.v1 — unilateral allocation game. The scene frames B as acceding to
// self's stance, so `resolve` ignores the other policy and move == label.
// Verb vocabulary = every key emitted by lib/possibilities/defs.ts (45 verbs).
// ---------------------------------------------------------------------------

const CONTEST_MOVES = movesTable({
  // engage the allocation on equal terms
  fair_split: ['negotiate', 'share', 'trade'],
  // coercion / appropriation
  self_favoring: [
    'command', 'threaten', 'confront', 'accuse', 'attack', 'suppress',
    'betray', 'deceive', 'loot', 'challenge', 'cover_fire',
  ],
  // transfer value or deference to B
  concede: ['submit', 'plead', 'apologize', 'comfort', 'praise', 'help', 'treat', 'encourage'],
  // does not engage the allocation
  no_deal: [
    'wait', 'escape', 'hide', 'avoid', 'rest', 'retreat', 'take_cover',
    'observe', 'observe_area', 'observe_target', 'monologue', 'self_talk',
    'patrol', 'investigate', 'verify', 'ask_info', 'talk', 'warn', 'signal',
    'call_backup', 'rally', 'guard', 'escort', 'confide',
  ],
});

export function makeContestGame(outcomes: Record<string, PayoffPair>): Game {
  return {
    id: 'G_contest.v1',
    outcomes: { ...outcomes },
    moves: CONTEST_MOVES,
    resolve: move => move,
  };
}

// ---------------------------------------------------------------------------
// G_defection.v1 — joint PD-like game, moves {cooperate, defect, disengage}.
// `avoid` is the documented defect proxy (scenes.ts affordance note / ledger
// OBS-VOCAB). `disengage` resolves to the game-level label no_engagement [0,0]
// under BOTH policies: a passive move must not be scored as exploitation
// (i_defect [5,0]) or victimhood — the scene's frozen PD matrix stays pure.
// ---------------------------------------------------------------------------

const DEFECTION_MOVES = movesTable({
  cooperate: [
    'share', 'trade', 'negotiate', 'help', 'praise', 'guard', 'treat',
    'comfort', 'encourage', 'escort', 'warn', 'apologize', 'confide', 'rally',
  ],
  defect: [
    'attack', 'threaten', 'accuse', 'confront', 'command', 'suppress',
    'betray', 'deceive', 'loot', 'challenge', 'cover_fire',
    'avoid', // defect proxy — see header
  ],
  disengage: [
    'wait', 'escape', 'hide', 'rest', 'retreat', 'take_cover',
    'observe', 'observe_area', 'observe_target', 'monologue', 'self_talk',
    'patrol', 'investigate', 'verify', 'ask_info', 'talk', 'signal',
    'call_backup', 'submit', 'plead',
  ],
});

export function makeDefectionGame(outcomes: Record<string, PayoffPair>): Game {
  return {
    id: 'G_defection.v1',
    outcomes: { ...outcomes, no_engagement: [0, 0] },
    moves: DEFECTION_MOVES,
    resolve: (move, other) => {
      if (move === 'disengage') return 'no_engagement';
      if (move === 'cooperate') return other === 'cooperate' ? 'both_cooperate' : 'they_defect';
      return other === 'cooperate' ? 'i_defect' : 'both_defect';
    },
  };
}

// ---------------------------------------------------------------------------
// G_coercive.v1 — ADDED 2026-07-02 (T1.5 freeze, same discipline): unilateral
// response to a coercive order from an authority (S_coercive_order). Frozen
// with the v3 pre-registration, BEFORE its first run. move == label.
// ---------------------------------------------------------------------------

const COERCIVE_MOVES = movesTable({
  // insubordination / open resistance (command back = counter-command)
  defied: [
    'challenge', 'confront', 'threaten', 'accuse', 'attack', 'suppress',
    'betray', 'deceive', 'loot', 'cover_fire', 'command',
  ],
  // execute or defer to the order
  complied: [
    'submit', 'plead', 'apologize', 'help', 'escort', 'guard', 'treat',
    'encourage', 'praise', 'comfort',
  ],
  // engage the order's terms without obeying or defying
  negotiated_terms: [
    'negotiate', 'talk', 'trade', 'share', 'ask_info', 'verify', 'confide',
    'warn', 'signal',
  ],
  // neither obey nor resist
  evaded: [
    'wait', 'escape', 'hide', 'avoid', 'rest', 'retreat', 'take_cover',
    'observe', 'observe_area', 'observe_target', 'monologue', 'self_talk',
    'patrol', 'investigate', 'call_backup', 'rally',
  ],
});

export function makeCoerciveOrderGame(outcomes: Record<string, PayoffPair>): Game {
  return {
    id: 'G_coercive.v1',
    outcomes: { ...outcomes },
    moves: COERCIVE_MOVES,
    resolve: move => move,
  };
}
