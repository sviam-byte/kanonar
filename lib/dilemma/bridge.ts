// lib/dilemma/bridge.ts
//
// Translates dilemma state into ContextAtoms and Possibilities
// that the existing decision pipeline (score.ts, decide.ts) can process.

import type { ContextAtom, ContextSource } from '../context/v2/types';
import type { Possibility } from '../possibilities/catalog';
import type { DilemmaGameState, DilemmaSpec } from './types';
import { cooperationRate, playerHistory } from './engine';
import { clamp01 } from '../util/math';

function mkAtom(
  id: string,
  magnitude: number,
  source: ContextSource,
  tick: number,
  label?: string,
): ContextAtom {
  return {
    id,
    kind: 'fact',
    source,
    magnitude: clamp01(magnitude),
    ns: source === 'scene' ? 'scene' : source === 'tom' ? 'tom' : source === 'social' ? 'soc' : 'misc',
    origin: 'derived',
    t: tick,
    label: label ?? id,
    confidence: 1.0,
  };
}

/**
 * Generate ContextAtoms that describe the dilemma situation for one agent.
 *
 * Does NOT include agent's own trait/emotion atoms — those are passed in
 * via `agentAtoms` and forwarded unchanged.
 */
export function atomizeDilemma(args: {
  spec: DilemmaSpec;
  game: DilemmaGameState;
  selfId: string;
  otherId: string;
  agentAtoms: ContextAtom[];
  tick: number;
}): ContextAtom[] {
  const {
    spec, game, selfId, otherId, agentAtoms, tick,
  } = args;
  const atoms: ContextAtom[] = [];

  if (game.rounds.length > 0) {
    const oppCoopRate = cooperationRate(spec, game, otherId);
    const oppHistory = playerHistory(game, otherId);
    const lastChoice = oppHistory[oppHistory.length - 1];
    const lastWasCooperative = lastChoice === spec.cooperativeActionId;

    atoms.push(mkAtom(
      `rel:state:${selfId}:${otherId}:trust`,
      oppCoopRate,
      'social',
      tick,
      `Trust: opponent cooperated ${(oppCoopRate * 100).toFixed(0)}% of the time`,
    ));

    atoms.push(mkAtom(
      `soc:recentHelpBy:${otherId}:${selfId}`,
      lastWasCooperative ? 0.7 : 0.0,
      'social',
      tick,
      lastWasCooperative ? 'Opponent cooperated last round' : 'Opponent did not cooperate last round',
    ));
    atoms.push(mkAtom(
      `soc:recentHarmBy:${otherId}:${selfId}`,
      lastWasCooperative ? 0.0 : 0.6,
      'social',
      tick,
      lastWasCooperative ? 'Opponent did not defect last round' : 'Opponent defected last round',
    ));
  }

  if (game.totalRounds > 1) {
    const remaining = game.totalRounds - game.currentRound;
    const remainingRatio = remaining / game.totalRounds;
    atoms.push(mkAtom(
      `ctx:uncertainty:${selfId}`,
      clamp01(0.3 + 0.4 * (1 - remainingRatio)),
      'scene',
      tick,
      `Uncertainty: ${remaining} rounds remaining`,
    ));
  }

  atoms.push(mkAtom(
    `threat:final:${selfId}`,
    0.15,
    'scene',
    tick,
    'Low ambient threat (social dilemma, not combat)',
  ));

  atoms.push(mkAtom(
    `dilemma:active:${selfId}`,
    1.0,
    'scene',
    tick,
    `Dilemma: ${spec.name}`,
  ));

  if (game.totalRounds > 1) {
    atoms.push(mkAtom(
      `dilemma:round:${selfId}`,
      game.currentRound / game.totalRounds,
      'scene',
      tick,
      `Round ${game.currentRound + 1} of ${game.totalRounds}`,
    ));
  }

  return dedupeById([...agentAtoms, ...atoms]);
}

function dedupeById(atoms: ContextAtom[]): ContextAtom[] {
  const map = new Map<string, ContextAtom>();
  for (const atom of atoms) {
    if (atom?.id) map.set(atom.id, atom);
  }
  return Array.from(map.values());
}

/**
 * Create one Possibility per dilemma action.
 */
export function buildDilemmaPossibilities(args: {
  spec: DilemmaSpec;
  selfId: string;
  otherId: string;
  atoms: ContextAtom[];
}): Possibility[] {
  const {
    spec, selfId, otherId, atoms,
  } = args;

  return spec.actions.map((action) => {
    const mapping = spec.scoringMap[action.id];
    if (!mapping) throw new Error(`No scoring map for action: ${action.id}`);

    const id = `${mapping.idPrefix}:dilemma:${spec.id}:${selfId}`;

    const dilemmaAtomIds = atoms
      .filter((a) => a.id.startsWith('dilemma:')
        || a.id.startsWith(`rel:state:${selfId}:${otherId}`)
        || a.id.startsWith('soc:recent'))
      .map((a) => a.id);

    return {
      id,
      kind: mapping.kind,
      label: action.label,
      magnitude: 0.7,
      confidence: 0.9,
      subjectId: selfId,
      targetId: otherId,
      trace: {
        usedAtomIds: dilemmaAtomIds,
        notes: [`dilemma:${spec.id}`, `action:${action.id}`],
        parts: { dilemmaActionId: action.id, scoringPrefix: mapping.idPrefix },
      },
      meta: {
        dilemmaActionId: action.id,
        dilemmaSpecId: spec.id,
      },
    };
  });
}

/** Extract dilemma action id from chosen possibility id. */
export function extractDilemmaActionId(
  chosenId: string,
  possibilities: Possibility[],
): string | null {
  const p = possibilities.find((x) => x.id === chosenId);
  if (!p) return null;
  return (p.meta as { dilemmaActionId?: string } | undefined)?.dilemmaActionId ?? null;
}
