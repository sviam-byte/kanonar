// lib/context/sources/commThreatAtoms.ts
//
// Communication v1a (I-2.1, ledger MVP0-C1-V0): derive a communication-borne
// threat source from incoming speech atoms, so a threaten speech act can reach
// the danger axis. Produces `ctx:src:comm:threat:<selfId>` = max over incoming
// threaten atoms of magnitude·confidence; deriveAxes joins it into
// dangerSocial as max(sceneThreat, commThreat).
//
// Called ONLY when FC.communication.speechThreatV1.enabled — with the flag off
// the atom is never produced and every axis output is bit-identical to legacy.

import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';
import { clamp01 } from '../../util/math';

/** An incoming speech atom counts as a threat carrier iff it was spoken BY
 *  someone else AND the speech act was 'threaten' (v1: the one causal channel;
 *  intimidating content of other acts is v2+). */
function isIncomingThreat(atom: ContextAtom, selfId: string): boolean {
  const meta: any = (atom as any)?.meta;
  if (String(meta?.act ?? '') !== 'threaten') return false;
  const from = String(meta?.from ?? meta?.origin?.from ?? '');
  return Boolean(from) && from !== selfId;
}

export function deriveCommThreatAtoms(args: { selfId: string; atoms: ContextAtom[] }): { atoms: ContextAtom[] } {
  const { selfId, atoms } = args;
  let value = 0;
  const usedAtomIds: string[] = [];
  const contributors: Array<{ id: string; from: string; v: number }> = [];

  for (const a of atoms) {
    if (!isIncomingThreat(a, selfId)) continue;
    const v = clamp01(Number((a as any)?.magnitude ?? 0)) * clamp01(Number((a as any)?.confidence ?? 1));
    const id = String((a as any)?.id ?? '');
    if (id) {
      usedAtomIds.push(id);
      contributors.push({ id, from: String((a as any)?.meta?.from ?? ''), v });
    }
    if (v > value) value = v;
  }

  if (!contributors.length) return { atoms: [] };

  return {
    atoms: [
      normalizeAtom({
        id: `ctx:src:comm:threat:${selfId}`,
        ns: 'ctx',
        kind: 'ctx_input',
        origin: 'derived',
        source: 'commThreatV1',
        subject: selfId,
        magnitude: clamp01(value),
        confidence: 1,
        tags: ['ctx', 'src', 'comm', 'threat'],
        label: `comm.threat=${Math.round(clamp01(value) * 100)}%`,
        trace: {
          usedAtomIds,
          notes: ['max(magnitude·confidence) over incoming threaten speech atoms'],
          parts: { contributors, formula: 'commThreat = max_i(mag_i · conf_i), i: speech atoms act=threaten from≠self' },
        },
      }),
    ],
  };
}
