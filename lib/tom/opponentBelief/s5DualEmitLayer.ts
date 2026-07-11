// lib/tom/opponentBelief/s5DualEmitLayer.ts
//
// Flag-gated S5 layer (runtimeMechanics.opponentBeliefS5V1): decode the
// legacy world.tom store into directed OpponentBeliefV1 and dual-emit the
// approved tom:belief:final|confidence|uncertainty grammar alongside the
// existing tom:dyad:* compatibility atoms. Invalid or undecodable dyads are
// reported in `skipped` — never replaced with a neutral belief.

import type { WorldState } from '../../../types';
import type { ContextAtom } from '../../context/v2/types';
import { codeUnitCompare } from '../../utils/compare';
import { projectOpponentBeliefToS5AtomsV1 } from './builder';
import { decodeLegacyTomToOpponentBeliefV1 } from './legacyDecoder';
import { validateOpponentBeliefV1 } from './serialization';
import type { OpponentBeliefV1 } from './types';

export function buildOpponentBeliefDualEmitLayerV1(args: {
  world: WorldState;
  selfId: string;
  otherIds: string[];
  tick: number;
}): {
  atoms: ContextAtom[];
  beliefs: OpponentBeliefV1[];
  skipped: Array<{ targetId: string; code: string }>;
} {
  const atoms: ContextAtom[] = [];
  const beliefs: OpponentBeliefV1[] = [];
  const skipped: Array<{ targetId: string; code: string }> = [];
  const tomStore = (args.world as { tom?: Record<string, Record<string, unknown>> }).tom;

  for (const targetId of [...args.otherIds].sort(codeUnitCompare)) {
    if (!targetId || targetId === args.selfId) continue;
    const entry = tomStore?.[args.selfId]?.[targetId];
    if (entry === undefined || entry === null) continue;

    const decoded = decodeLegacyTomToOpponentBeliefV1({ entry, observerId: args.selfId, targetId, tick: args.tick });
    // Explicit discriminant comparison: the repo compiles without
    // strictNullChecks, where `!decoded.ok` does not narrow the err branch.
    if (decoded.ok === false) {
      skipped.push({ targetId, code: decoded.code });
      continue;
    }
    const validation = validateOpponentBeliefV1(decoded.belief);
    if (!validation.valid) {
      skipped.push({ targetId, code: validation.errors[0]?.code ?? 'invalid_belief' });
      continue;
    }
    beliefs.push(decoded.belief);
    atoms.push(...projectOpponentBeliefToS5AtomsV1(decoded.belief));
  }

  return { atoms, beliefs, skipped };
}
