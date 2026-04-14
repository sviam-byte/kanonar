// lib/dilemma/types.ts
//
// Core types for DilemmaLab.
// Pure game-theory layer — no dependencies on GoalLab, ContextAtom, pipeline.

/** One action available in a dilemma. */
export type DilemmaAction = {
  id: string;
  label: string;
  description?: string;
};

/**
 * Payoff matrix for 2-player symmetric game.
 * payoffs[myAction][theirAction] = [myPayoff, theirPayoff]
 * Payoffs are normalized to [0, 1].
 */
export type PayoffMatrix = Record<string, Record<string, readonly [number, number]>>;

/**
 * How a dilemma action maps to the decision pipeline.
 *
 * The pipeline dispatches on Possibility id-prefix and action family.
 * This structure tells the bridge which prefix/family to use for each action,
 * which determines which trait weights scoring applies.
 */
export type ActionScoringMap = {
  /**
   * Possibility id prefix. Determines which scoring branch fires.
   * Examples: 'off:help', 'aff:confront', 'aff:attack', 'cog:wait',
   *           'exit:escape', 'aff:hide', 'aff:talk'
   */
  idPrefix: string;

  /**
   * PossibilityKind used in the Possibility object.
   * One of: 'aff' | 'con' | 'off' | 'exit' | 'cog'
   */
  kind: 'aff' | 'con' | 'off' | 'exit' | 'cog';
};

/**
 * Narrative framing for a specific dilemma.
 * Used in UI; does not affect pipeline behavior.
 */
export type DilemmaFraming = {
  setup: string;
  actionLabels: Record<string, string>;
  outcomeDescriptions: Record<string, Record<string, string>>;
};

/** Full dilemma specification. */
export type DilemmaSpec = {
  id: string;
  name: string;
  actions: DilemmaAction[];
  payoffs: PayoffMatrix;

  /**
   * Known equilibria (precomputed or analytical).
   * Each entry is a pair [player0action, player1action].
   */
  nashEquilibria: readonly (readonly [string, string])[];
  paretoOptimal: readonly (readonly [string, string])[];

  /**
   * Which action is "cooperative" for computing opponent reliability.
   * In PD: cooperate. In Stag Hunt: stag. In Chicken: dove.
   */
  cooperativeActionId: string;

  /** How each action maps to pipeline scoring families. */
  scoringMap: Record<string, ActionScoringMap>;

  /** Narrative framing (for UI). */
  framing: DilemmaFraming;
};

// ── Game state ──

export type DilemmaRound = {
  index: number;
  choices: Record<string, string>; // agentId → actionId
  payoffs: Record<string, number>; // agentId → payoff this round
  traces: Record<string, RoundTrace>; // agentId → decision trace
};

/**
 * Per-action U decomposition: U(a) = D + R + M + P + E.
 *
 * D — Dispositional (who am I, static traits)
 * R — Relational (who are they to me, trust composite)
 * M — Momentum (history: EMA, trend, inertia, betrayal shock)
 * P — Payoff (expected value given opponent prediction)
 * E — Endgame (shadow of the future)
 */
export type ActionDecomposition = {
  actionId: string;
  q: number;
  chosen: boolean;
  D: number;
  R: number;
  M: number;
  P: number;
  E: number;
};

export type RoundTrace = {
  /** Per-action Q with D/R/M/P/E decomposition. */
  ranked: ActionDecomposition[];
  /** Atoms used (for backward compat / debug). */
  dilemmaAtomIds: string[];
  /** Trust composite at decision time. */
  trustAtDecision: number;

  // ── Diagnostics ──

  /** ΔQ between top-1 and top-2 (hesitation signal). */
  qMargin: number;
  /** Effective sampling temperature. */
  temperature: number;

  /** Dispositional baseline (same across rounds for a character). */
  cooperativeDisposition: number;

  /** Trust composite breakdown. */
  trustComposite: number;
  trustComponents: {
    relTrust: number;
    relBond: number;
    relConflict: number;
    tomTrust: number;
    tomReliability: number;
    soPerceivedTrust: number;
  };

  /** Momentum signals. */
  oppEma: number;
  oppTrend: number;
  myInertia: number;  // +1 last cooperated, -1 last defected, 0 first round
  betrayalShock: number;  // accumulated shock from opponent betrayals

  /** Payoff signal. */
  evPerAction: Record<string, number>;  // actionId → EV

  /** Endgame. */
  effectiveShadow: number;

  /** Relationship state snapshot (full). */
  relSnapshot: Record<string, number>;
  /** Key trait values used. */
  traitSnapshot: Record<string, number>;
};

export type DilemmaGameState = {
  specId: string;
  players: readonly [string, string];
  rounds: DilemmaRound[];
  currentRound: number;
  totalRounds: number;
  cumulativePayoffs: Record<string, number>;
};

// ── Analysis ──

export type StrategyMatchScores = {
  titForTat: number;
  alwaysCooperate: number;
  alwaysDefect: number;
  pavlov: number;
  grimTrigger: number;
};

export type DilemmaAnalysis = {
  /** Per-agent: fraction of rounds matching Nash prediction. */
  nashAlignment: Record<string, number>;
  /** Per-round cooperation rate (0–1). */
  cooperationCurve: number[];
  /** Per-agent cumulative payoff. */
  totalPayoffs: Record<string, number>;
  /** Per-agent classical strategy matching (iterated games only). */
  strategyMatch: Record<string, StrategyMatchScores>;
  /** Overall: mutual cooperation rate. */
  mutualCooperationRate: number;
  /** Overall: mutual defection rate. */
  mutualDefectionRate: number;
};
