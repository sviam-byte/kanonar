// lib/mafia/types.ts
//
// MafiaLab: deterministic simulation of mafia game with bounded-rational agents.
// Bypasses generic action pipeline. Uses dedicated hidden-role scoring.
// Explainability is local to lib/mafia and does NOT introduce new atom namespaces.

import type { WorldState } from '../../types';

export type RoleId = 'mafia' | 'citizen' | 'sheriff' | 'doctor';
export type Team = 'mafia' | 'town';

export type RoleSpec = {
  id: RoleId;
  team: Team;
  hasNightAction: boolean;
  knowsTeammates: boolean;
  description: string;
};

export type RoleAssignment = Record<string, RoleId>;

export type MafiaGameConfig = {
  players: readonly string[];
  roleAssignment: RoleAssignment | 'random';
  roleDistribution?: Record<RoleId, number>;
  world: WorldState;
  seed?: number;
  maxCycles?: number;
};

export type Phase = 'day' | 'night' | 'ended';

export type MafiaSheriffClaim = {
  claimerId: string;
  targetId: string;
  asRole: RoleId;
};

export type MafiaPublicFieldSnapshot = {
  accusationCounts: Record<string, number>;
  defenseCounts: Record<string, number>;
  sheriffClaims: MafiaSheriffClaim[];
  claimCount: number;
};

export type MafiaPerTargetView = {
  suspicion: number;
  rel?: {
    trust: number;
    bond: number;
    conflict: number;
    fear: number;
    familiarity: number;
  };
  tom?: {
    trust: number;
    competence: number;
    reliability: number;
    dominance: number;
    vulnerability: number;
    uncertainty: number;
  };
  publicSignal: {
    accusedBy: number;
    defendedBy: number;
    sheriffClaimsMafia: number;
    sheriffClaimsTown: number;
  };
  roleKnowledge: 'known_mafia' | 'known_town' | 'unknown' | 'self';
};

export type MafiaPerceptionSnapshot = {
  actorId: string;
  role: RoleId;
  cycle: number;
  phase: 'day' | 'night';
  aliveOrder: string[];
  publicField: MafiaPublicFieldSnapshot;
  byTarget: Record<string, MafiaPerTargetView>;
};

export type MafiaSamplingTrace = {
  temperature: number;
  scores: Record<string, number>;
  probabilities: Record<string, number>;
  rngDraw: number;
  chosenKey: string;
};

export type MafiaCandidateAudit = {
  key: string;
  label: string;
  kind: string;
  targetId?: string;
  included: boolean;
  reason: string;
};

export type SuspicionDeltaReason =
  | 'init_prior'
  | 'day_vote_alignment'
  | 'day_claim_alignment'
  | 'night_kill_inference'
  | 'sheriff_public_claim'
  | 'public_accusation'
  | 'public_defense'
  | 'dead_sheriff_posthumous_signal';

export type MafiaSuspicionDelta = {
  cycle: number;
  phase: 'day' | 'night';
  observerId: string;
  targetId: string;
  before: number;
  delta: number;
  after: number;
  reason: SuspicionDeltaReason;
  sourceRefs: Array<{
    kind: 'init' | 'vote' | 'claim' | 'night_action' | 'role_reveal';
    actorId?: string;
    targetId?: string;
  }>;
};

export type KillDecomposition = {
  targetId: string;
  u: number;
  chosen: boolean;
  threat: number;
  coalitionCost: number;
  visibility: number;
  randomize: number;
};

export type CheckDecomposition = {
  targetId: string;
  u: number;
  chosen: boolean;
  suspicion: number;
  familiarity: number;
  already: number;
  truthNeed: number;
};

export type HealDecomposition = {
  targetId: string;
  u: number;
  chosen: boolean;
  perceivedThreat: number;
  bond: number;
  selfPreservation: number;
};

export type VoteDecomposition = {
  targetId: string | null;
  u: number;
  chosen: boolean;
  suspicion: number;
  bandwagon: number;
  bondPenalty: number;
  teamProtection: number;
  claimBonus: number;
};

export type ClaimDecomposition = {
  kind: 'claim_sheriff' | 'accuse' | 'defend' | 'stay_silent';
  targetId?: string;
  u: number;
  chosen: boolean;
  informationValue: number;
  visibilityCost: number;
  socialRisk: number;
  majorityAlignment: number;
};

export type NightTrace = {
  actorId: string;
  role: RoleId;
  kind: 'kill' | 'check' | 'heal';
  ranked: Array<KillDecomposition | CheckDecomposition | HealDecomposition>;
  chosenTargetId: string;
  perception: MafiaPerceptionSnapshot;
  candidates: MafiaCandidateAudit[];
  sampling: MafiaSamplingTrace;
};

export type VoteTrace = {
  voterId: string;
  ranked: VoteDecomposition[];
  suspicionSnapshot: Record<string, number>;
  traitSnapshot: Record<string, number>;
  perception: MafiaPerceptionSnapshot;
  candidates: MafiaCandidateAudit[];
  sampling: MafiaSamplingTrace;
};

export type ClaimTrace = {
  actorId: string;
  ranked: ClaimDecomposition[];
  chosenKind: 'claim_sheriff' | 'accuse' | 'defend' | 'stay_silent';
  perception: MafiaPerceptionSnapshot;
  candidates: MafiaCandidateAudit[];
  sampling: MafiaSamplingTrace;
};

export type NightAction = {
  actorId: string;
  role: RoleId;
  kind: 'kill' | 'check' | 'heal';
  targetId: string;
  resolved?: {
    success: boolean;
    info?: RoleId;
  };
  reasoning?: NightTrace;
};

export type DayVote = {
  voterId: string;
  targetId: string | null;
  reasoning: VoteTrace;
};

export type PublicClaim = {
  actorId: string;
  kind: 'claim_sheriff' | 'accuse' | 'defend' | 'stay_silent';
  targetId?: string;
  claimedCheck?: { targetId: string; asRole: RoleId };
  reasoning: ClaimTrace;
};

export type DayState = {
  cycle: number;
  claims: PublicClaim[];
  votes: DayVote[];
  eliminatedId: string | null;
};

export type NightState = {
  cycle: number;
  actions: NightAction[];
  killedId: string | null;
  traces: NightTrace[];
};

export type MafiaGameState = {
  config: MafiaGameConfig;
  roles: RoleAssignment;
  alive: Set<string>;
  phase: Phase;
  cycle: number;
  history: {
    days: DayState[];
    nights: NightState[];
  };
  eliminations: Array<{
    playerId: string;
    cycle: number;
    phase: 'day' | 'night';
    revealedRole?: RoleId;
  }>;
  sheriffKnowledge: Record<string, Record<string, RoleId>>;
  suspicion: Record<string, Record<string, number>>;
  suspicionLedger: MafiaSuspicionDelta[];
  winner: Team | 'draw' | null;
  rngState: number;
};

export type MafiaAnalysis = {
  winner: Team | 'draw' | null;
  cycles: number;
  survival: Record<string, { alive: boolean; diedCycle?: number; diedPhase?: 'day' | 'night' }>;
  rolePerformance: Record<RoleId, { won: boolean; survivedToEnd: boolean }>;
  suspicionAccuracy: Record<string, {
    actualMafia: boolean;
    avgSuspicionAgainstThem: number;
    correctlyClassified: boolean;
  }>;
};

export type MafiaBatchConfig = {
  players: readonly string[];
  roleDistribution: Record<RoleId, number>;
  nGames: number;
  world: WorldState;
  baseSeed: number;
  fixedRoleAssignment?: RoleAssignment;
};

export type MafiaGameResult = {
  state: MafiaGameState;
  analysis: MafiaAnalysis;
  trace: {
    days: Array<{ cycle: number; claims: PublicClaim[]; votes: DayVote[]; eliminatedId: string | null }>;
    nights: Array<{ cycle: number; actions: NightAction[]; traces: NightTrace[]; killedId: string | null }>;
    suspicionLedger: MafiaGameState['suspicionLedger'];
  };
};

export type MafiaBatchResult = {
  games: MafiaGameResult[];
  aggregate: {
    townWinRate: number;
    mafiaWinRate: number;
    drawRate: number;
    avgCycles: number;
    byPlayer: Record<string, {
      gamesPlayed: number;
      roleCounts: Record<RoleId, number>;
      winsByRole: Record<RoleId, number>;
      avgSurvivalCycles: number;
    }>;
    byRole: Record<RoleId, { games: number; wins: number; winRate: number }>;
  };
};
