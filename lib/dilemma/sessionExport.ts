import type { CharacterEntity } from '../../types';
import type {
  DilemmaAnalysis,
  DilemmaGameState,
  DilemmaSpec,
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
