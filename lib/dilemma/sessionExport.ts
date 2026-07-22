import type { CharacterEntity } from '../../types';
import type { ConflictTargetMatrixLabSessionReportV1 } from './integration/ntargetLiveSession';
import type {
  DilemmaAnalysis,
  DilemmaGameState,
  DilemmaSpec,
  PressureSchedule,
  ScenarioTemplate,
} from './types';

export type DilemmaLabMode = 'idle' | 'manual' | 'pipeline';

export type DilemmaSessionExportConfig = {
  mode: DilemmaLabMode;
  narrative: boolean;
  seed: number;
  initialTrust: number | null;
  selectedSpecId: string;
  selectedPlayers: readonly [string, string];
  totalRoundsRequested: number;
};

export type DilemmaSessionExportV1 = {
  schema: 'DilemmaLabSessionExportV1';
  exportedAt: string;
  config: DilemmaSessionExportConfig;
  spec: DilemmaSpec;
  game: DilemmaGameState;
  analysis: DilemmaAnalysis | null;
  participants: CharacterEntity[];
};

export type ConflictTargetMatrixSessionExportConfigV1 = {
  scenarioId: string;
  selectedPlayers: readonly string[];
  totalRoundsRequested: number;
  seed: number;
  institutionalPressure?: number;
  pressureSchedule?: PressureSchedule;
};

export type ConflictTargetMatrixSessionExportV1 = {
  schema: 'ConflictTargetMatrixSessionExportV1';
  exportedAt: string;
  config: ConflictTargetMatrixSessionExportConfigV1;
  scenario: ScenarioTemplate;
  participants: CharacterEntity[];
  session: ConflictTargetMatrixLabSessionReportV1;
};

/**
 * Собирает переносимый JSON-пакет одной сессии Dilemma Lab.
 * Функция чистая и детерминированная при фиксированном `exportedAt`.
 */
export function buildDilemmaSessionExport(args: {
  exportedAt: string;
  config: DilemmaSessionExportConfig;
  spec: DilemmaSpec;
  game: DilemmaGameState;
  analysis: DilemmaAnalysis | null;
  participants: CharacterEntity[];
}): DilemmaSessionExportV1 {
  return {
    schema: 'DilemmaLabSessionExportV1',
    exportedAt: args.exportedAt,
    config: args.config,
    spec: args.spec,
    game: args.game,
    analysis: args.analysis,
    participants: args.participants,
  };
}

export function buildConflictTargetMatrixSessionExport(args: {
  exportedAt: string;
  config: ConflictTargetMatrixSessionExportConfigV1;
  scenario: ScenarioTemplate;
  participants: CharacterEntity[];
  session: ConflictTargetMatrixLabSessionReportV1;
}): ConflictTargetMatrixSessionExportV1 {
  return {
    schema: 'ConflictTargetMatrixSessionExportV1',
    exportedAt: args.exportedAt,
    config: args.config,
    scenario: args.scenario,
    participants: args.participants,
    session: args.session,
  };
}

/**
 * Делает безопасное имя файла для экспортированной игровой сессии.
 */
export function makeDilemmaSessionFileName(args: {
  specId: string;
  players: readonly [string, string];
  exportedAt: string;
}): string {
  const safe = (value: string) => value.replace(/[^a-z0-9_-]/gi, '_');
  const [p0, p1] = args.players;
  const stamp = args.exportedAt.replace(/[:.]/g, '-');
  return `dilemma-lab__${safe(args.specId)}__${safe(p0)}__${safe(p1)}__${stamp}.json`;
}

export function makeConflictTargetMatrixSessionFileName(args: {
  scenarioId: string;
  players: readonly string[];
  exportedAt: string;
}): string {
  const safe = (value: string) => value.replace(/[^a-z0-9_-]/gi, '_');
  const stamp = args.exportedAt.replace(/[:.]/g, '-');
  const participants = args.players.map(safe).join('__');
  return `conflict-target-matrix__${safe(args.scenarioId)}__${participants}__${stamp}.json`;
}
