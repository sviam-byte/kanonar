// lib/tom/opponentBelief/s5DualEmitLayer.ts
//
// Flag-gated S5 layer (runtimeMechanics.opponentBeliefS5V1): build directed
// OpponentBeliefV1 per dyad and dual-emit the approved tom:belief:* grammar
// alongside the existing tom:dyad:* compatibility atoms.
//
// Evidence sources, combined through the one update law:
//   1. legacy world.tom entry -> compatibility_prior via legacy-tom-decoder;
//   2. resolved-scene envelopes (world.resolvedObservations[observer], put
//      there by the scene adapters) -> directed observation evidence.
// A dyad with neither source emits nothing; invalid dyads are reported in
// `skipped` — never replaced with a neutral belief.

import type { WorldState } from '../../../types';
import type { ContextAtom } from '../../context/v2/types';
import type { ObservationEnvelopeV1 } from '../../scene/observation/types';
import { codeUnitCompare } from '../../utils/compare';
import { evidenceFromObservationsV1, makeNeutralOpponentBeliefPriorV1, projectOpponentBeliefToS5AtomsV1 } from './builder';
import { decodeLegacyTomToOpponentBeliefV1 } from './legacyDecoder';
import { validateOpponentBeliefV1 } from './serialization';
import { updateOpponentBeliefV1 } from './update';
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
  const rawEnvelopes = (args.world as { resolvedObservations?: Record<string, unknown> }).resolvedObservations?.[args.selfId];
  const envelopes: ObservationEnvelopeV1[] = Array.isArray(rawEnvelopes) ? rawEnvelopes : [];

  for (const targetId of [...args.otherIds].sort(codeUnitCompare)) {
    if (!targetId || targetId === args.selfId) continue;

    const entry = tomStore?.[args.selfId]?.[targetId];
    let prior: OpponentBeliefV1;
    if (entry === undefined || entry === null) {
      prior = makeNeutralOpponentBeliefPriorV1({ observerId: args.selfId, targetId, tick: args.tick });
    } else {
      const decoded = decodeLegacyTomToOpponentBeliefV1({ entry, observerId: args.selfId, targetId, tick: args.tick });
      // Explicit discriminant comparison: the repo compiles without
      // strictNullChecks, where `!decoded.ok` does not narrow the err branch.
      if (decoded.ok === false) {
        skipped.push({ targetId, code: decoded.code });
        continue;
      }
      prior = decoded.belief;
    }

    const evidence = evidenceFromObservationsV1({ observerId: args.selfId, targetId, observations: envelopes });
    if (evidence.length === 0 && (entry === undefined || entry === null)) continue;

    const belief = evidence.length > 0 ? updateOpponentBeliefV1(prior, evidence, args.tick) : prior;
    const validation = validateOpponentBeliefV1(belief);
    if (!validation.valid) {
      skipped.push({ targetId, code: validation.errors[0]?.code ?? 'invalid_belief' });
      continue;
    }
    beliefs.push(belief);
    atoms.push(...projectOpponentBeliefToS5AtomsV1(belief));
  }

  return { atoms, beliefs, skipped };
}
