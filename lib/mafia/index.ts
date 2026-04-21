// lib/mafia/index.ts
//
// Public API for MafiaLab module.

export type {
  RoleId,
  Team,
  RoleSpec,
  RoleAssignment,
  Phase,
  MafiaGameConfig,
  MafiaGameState,
  DayState,
  NightState,
  NightAction,
  DayVote,
  PublicClaim,
  NightTrace,
  VoteTrace,
  ClaimTrace,
  KillDecomposition,
  CheckDecomposition,
  HealDecomposition,
  VoteDecomposition,
  ClaimDecomposition,
  MafiaPerceptionSnapshot,
  MafiaSamplingTrace,
  MafiaCandidateAudit,
  MafiaSuspicionDelta,
  MafiaAnalysis,
  MafiaBatchConfig,
  MafiaBatchResult,
} from './types';

export {
  ROLES,
  defaultDistribution,
  validateDistribution,
  roleTeam,
  isMafia,
  isTown,
} from './roles';

export {
  createGame,
  checkWin,
  isGameOver,
  applyDayResult,
  applyNightResult,
} from './engine';

export {
  runMafiaGame,
  runMafiaBatch,
} from './runner';

export type { MafiaGameResult } from './runner';

export {
  buildMafiaReplayExport,
  buildMafiaFlatTimeline,
} from './export';

export type {
  MafiaReplayExport,
  MafiaFlatEvent,
} from './export';

export { initSuspicion } from './suspicion';
