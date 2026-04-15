import { describe, expect, it } from 'vitest';
import { getSpec } from '../../lib/dilemma/catalog';
import { createGame } from '../../lib/dilemma/engine';
import { analyzeGame } from '../../lib/dilemma/analysis';
import {
  buildDilemmaSessionExport,
  makeDilemmaSessionFileName,
} from '../../lib/dilemma/sessionExport';
import type { CharacterEntity } from '../../types';

describe('dilemma/sessionExport', () => {
  it('builds stable session export payload with full required sections', () => {
    const spec = getSpec('prisoners_dilemma');
    const game = createGame(spec, ['character-a', 'character-b'], 5);
    const analysis = analyzeGame(spec, game);

    const participants: CharacterEntity[] = [
      { entityId: 'character-a', title: 'A' } as CharacterEntity,
      { entityId: 'character-b', title: 'B' } as CharacterEntity,
    ];

    const exported = buildDilemmaSessionExport({
      exportedAt: '2026-04-15T09:00:00.000Z',
      config: {
        mode: 'pipeline',
        narrative: true,
        seed: 42,
        initialTrust: null,
        selectedSpecId: spec.id,
        selectedPlayers: game.players,
        totalRoundsRequested: game.totalRounds,
      },
      spec,
      game,
      analysis,
      participants,
    });

    expect(exported.schema).toBe('DilemmaLabSessionExportV1');
    expect(exported.spec.id).toBe('prisoners_dilemma');
    expect(exported.game.totalRounds).toBe(5);
    expect(exported.config.seed).toBe(42);
    expect(exported.participants.map((p) => p.entityId)).toEqual(['character-a', 'character-b']);
  });

  it('sanitizes file name tokens and keeps json suffix', () => {
    const fileName = makeDilemmaSessionFileName({
      specId: 'trust game',
      players: ['character:a', 'character/b'],
      exportedAt: '2026-04-15T09:00:00.000Z',
    });

    expect(fileName).toContain('trust_game');
    expect(fileName).toContain('character_a');
    expect(fileName).toContain('character_b');
    expect(fileName.endsWith('.json')).toBe(true);
  });
});
