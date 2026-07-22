import { describe, expect, it } from 'vitest';
import { getSpec } from '../../lib/dilemma/catalog';
import { createGame } from '../../lib/dilemma/engine';
import { analyzeGame } from '../../lib/dilemma/analysis';
import {
  buildConflictTargetMatrixSessionExport,
  buildDilemmaSessionExport,
  makeConflictTargetMatrixSessionFileName,
  makeDilemmaSessionFileName,
} from '../../lib/dilemma/sessionExport';
import { getScenario } from '../../lib/dilemma/scenarios';
import type { ConflictTargetMatrixLabSessionReportV1 } from '../../lib/dilemma/integration/ntargetLiveSession';
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

  it('builds a dedicated target-matrix export without adapting it to V2', () => {
    const scenario = getScenario('trust_interrogation');
    const participants = ['character-a', 'character-b', 'character-c'].map((entityId) => ({ entityId, title: entityId } as CharacterEntity));
    const session = {
      schemaVersion: 'conflict-target-matrix-live-session-v1',
      scenarioId: scenario.id,
      players: participants.map((participant) => participant.entityId),
      totalRounds: 4,
    } as unknown as ConflictTargetMatrixLabSessionReportV1;

    const exported = buildConflictTargetMatrixSessionExport({
      exportedAt: '2026-04-15T09:00:00.000Z',
      config: {
        scenarioId: scenario.id,
        selectedPlayers: session.players,
        totalRoundsRequested: 4,
        seed: 42,
      },
      scenario,
      participants,
      session,
    });

    expect(exported.schema).toBe('ConflictTargetMatrixSessionExportV1');
    expect(exported.session).toBe(session);
    expect(exported.config.selectedPlayers).toEqual(['character-a', 'character-b', 'character-c']);
    expect('game' in exported).toBe(false);
  });

  it('includes every target-matrix participant in a sanitized file name', () => {
    const fileName = makeConflictTargetMatrixSessionFileName({
      scenarioId: 'trust exchange',
      players: ['character:a', 'character/b', 'character c'],
      exportedAt: '2026-04-15T09:00:00.000Z',
    });

    expect(fileName).toContain('trust_exchange');
    expect(fileName).toContain('character_a__character_b__character_c');
    expect(fileName.endsWith('.json')).toBe(true);
  });
});
