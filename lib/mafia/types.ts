// lib/mafia/types.ts
//
// MafiaLab: deterministic simulation of mafia game with bounded-rational agents.
// Bypasses generic action pipeline. Uses D+R+M+P+E-style dedicated scoring
// adapted to hidden-role setting, built on existing trust composite + ToM.
//
// Key concepts:
// - Role: hidden attribute assigned per game
// - Phase: day (public talk + vote) or night (role-specific actions)
// - Suspicion: per-observer, per-target probability of being mafia
//   (runs parallel to baseTrust, game-local, bayesian-updated)
// - Trace: per-decision decomposition for analysis

import type { AgentState, WorldState } from '../../types';

// ═══════════════════════════════════════════════════════════════
// Roles
// ═══════════════════════════════════════════════════════════════

export type RoleId = 'mafia' | 'citizen' | 'sheriff' | 'doctor' | 'blocker';

export type Team = 'mafia' | 'town';

export type RoleSpec = {
  id: RoleId;
  team: Team;
  /** Can this role perform a night action? */
  hasNightAction: boolean;
  /** Knows other mafia at start? (true for mafia) */
  knowsTeammates: boolean;
  description: string;
};

// ═══════════════════════════════════════════════════════════════
// Game spec & config
// ═══════════════════════════════════════════════════════════════

export type RoleAssignment = Record<string, RoleId>;  // playerId → role

export type MafiaGameConfig = {
  players: readonly string[];              // ordered list of entity ids
  roleAssignment: RoleAssignment | 'random';
  /** For 'random': count of each role. Must sum to players.length. */
  roleDistribution?: Record<RoleId, number>;
  world: WorldState;
  seed?: number;
  /** Cap on total day/night cycles before forced draw. */
  maxCycles?: number;
};

// ═══════════════════════════════════════════════════════════════
// Phase & game state
// ═══════════════════════════════════════════════════════════════

export type Phase = 'day' | 'night' | 'ended';

export type NightActionKind = 'kill' | 'check' | 'heal' | 'block';

export type NightAction = {
  actorId: string;
  role: RoleId;
  /** What they tried to do */
  kind: NightActionKind;
  targetId: string;
  /** For sheriff: result of check (revealed to sheriff only) */
  resolved?: {
    success: boolean;
    info?: RoleId;  // sheriff learns target's role
  };
};

export type DayVote = {
  voterId: string;
  targetId: string | null;  // null = abstain
  reasoning: VoteTrace;
};

export type PublicClaim = {
  actorId: string;
  kind: 'claim_sheriff' | 'accuse' | 'defend' | 'stay_silent';
  targetId?: string;  // for accuse / defend
  /** For claim_sheriff: did they reveal a check result? */
  claimedCheck?: { targetId: string; asRole: RoleId };
  reasoning: ClaimTrace;
};

export type DayState = {
  cycle: number;                     // day number (1-indexed)
  claims: PublicClaim[];             // in order of speaking
  votes: DayVote[];
  eliminatedId: string | null;       // whoever got voted out (or null if tie/abstain)
};

export type NightState = {
  cycle: number;                     // night number (1-indexed)
  actions: NightAction[];
  killedId: string | null;           // null if healed or no kill
};

// ═══════════════════════════════════════════════════════════════
// Game state
// ═══════════════════════════════════════════════════════════════

/** Sheriff's private check results: sheriffId → targetId → role */
export type SheriffKnowledgeMap = Record<string, Record<string, RoleId>>;

/** Per-observer suspicion: suspicion[observerId][targetId] = P(target is mafia) */
export type SuspicionMatrix = Record<string, Record<string, number>>;

export type MafiaGameState = {
  config: MafiaGameConfig;
  roles: RoleAssignment;
  alive: Set<string>;
  phase: Phase;
  cycle: number;                     // current cycle number
  history: {
    days: DayState[];
    nights: NightState[];
  };
  /** Public knowledge: who died and when/how */
  eliminations: Array<{
    playerId: string;
    cycle: number;
    phase: 'day' | 'night';
    revealedRole?: RoleId;           // on day-elimination, role is revealed
  }>;
  /** Sheriff's private check results */
  sheriffKnowledge: SheriffKnowledgeMap;
  /** Per-observer suspicion */
  suspicion: SuspicionMatrix;
  winner: Team | 'draw' | null;
  rngState: number; // For seeded determinism
};

// ═══════════════════════════════════════════════════════════════
// Trace types (for analysis & debugging)
// ═══════════════════════════════════════════════════════════════

export type KillDecomposition = {
  targetId: string;
  u: number;
  chosen: boolean;
  threat: number;        // how dangerous target is to mafia
  coalitionCost: number; // ally penalty
  visibility: number;    // how "loud" / noticeable target is
  randomize: number;     // paranoia-driven dispersion
  usedAtomIds?: string[];
  notes?: string[];
};

export type CheckDecomposition = {
  targetId: string;
  u: number;
  chosen: boolean;
  suspicion: number;
  familiarity: number;
  already: number;       // already-checked penalty
  truthNeed: number;
  usedAtomIds?: string[];
  notes?: string[];
};

export type HealDecomposition = {
  targetId: string;
  u: number;
  chosen: boolean;
  perceivedThreat: number; // how likely doctor thinks target is next victim
  bond: number;
  selfPreservation: number; // heal self bias
  usedAtomIds?: string[];
  notes?: string[];
};

export type VoteDecomposition = {
  targetId: string | null;
  u: number;
  chosen: boolean;
  suspicion: number;
  bandwagon: number;        // majority pressure
  bondPenalty: number;
  teamProtection: number;   // mafia protecting mafia
  claimBonus: number;       // sheriff-claimer targeting
  usedAtomIds?: string[];
  notes?: string[];
};

export type ClaimDecomposition = {
  kind: PublicClaim['kind'];
  targetId?: string;
  u: number;
  chosen: boolean;
  informationValue: number;
  visibilityCost: number;
  socialRisk: number;
  majorityAlignment: number;
  usedAtomIds?: string[];
  notes?: string[];
};

export type NightTrace = {
  actorId: string;
  role: RoleId;
  kind: NightActionKind;
  ranked: Array<KillDecomposition | CheckDecomposition | HealDecomposition>;
  chosenTargetId: string;
};

export type VoteTrace = {
  voterId: string;
  ranked: VoteDecomposition[];
  suspicionSnapshot: Record<string, number>;  // voter's view of all alive
  traitSnapshot: Record<string, number>;
};

export type ClaimTrace = {
  actorId: string;
  ranked: ClaimDecomposition[];
  chosenKind: PublicClaim['kind'];
};

// ═══════════════════════════════════════════════════════════════
// Analysis
// ═══════════════════════════════════════════════════════════════

export type MafiaAnalysis = {
  winner: Team | 'draw' | null;
  cycles: number;
  survival: Record<string, { alive: boolean; diedCycle?: number; diedPhase?: 'day' | 'night' }>;
  rolePerformance: Record<RoleId, { won: boolean; survivedToEnd: boolean }>;
  /** For each player: was their final suspicion above threshold → classified mafia */
  suspicionAccuracy: Record<string, {
    actualMafia: boolean;
    avgSuspicionAgainstThem: number;
    correctlyClassified: boolean;
  }>;
};

// ═══════════════════════════════════════════════════════════════
// Batch types
// ═══════════════════════════════════════════════════════════════

export type MafiaBatchConfig = {
  players: readonly string[];
  roleDistribution: Record<RoleId, number>;
  nGames: number;
  world: WorldState;
  baseSeed: number;
  /** If provided, used for ALL games (no randomization). */
  fixedRoleAssignment?: RoleAssignment;
};

export type MafiaBatchResult = {
  games: MafiaAnalysis[];
  aggregate: {
    townWinRate: number;
    mafiaWinRate: number;
    drawRate: number;
    avgCycles: number;
    /** Per-character: how often did they win when assigned role R? */
    byPlayer: Record<string, {
      gamesPlayed: number;
      roleCounts: Record<RoleId, number>;
      winsByRole: Record<RoleId, number>;
      avgSurvivalCycles: number;
    }>;
    /** Per-role: global win rate */
    byRole: Record<RoleId, { games: number; wins: number; winRate: number }>;
  };
};
