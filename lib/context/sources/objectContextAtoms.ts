// lib/context/sources/objectContextAtoms.ts
//
// Object v1 context axes (I-2.3): obj:v0:* facts become per-agent
// resourceAccess / scarcity SOURCE atoms, feeding the existing deriveAxes
// sockets (`ctx:src:scene:resourceAccess`, `ctx:src:scene:scarcity`) — the
// axis formulas are untouched:
//   control  = … + 0.20·resourceAccess
//   scarcity = 0.75·sceneScarcity + 0.25·(1−resourceAccess)
//
// FROZEN v1 constants (the observable's definition — do not tune to make a
// prediction pass; a change is a new version):
//   self holds an object            → resourceAccess 0.9, scarcity 0.0
//   unheld object in self's location→ resourceAccess 0.5, scarcity 0.35
//   object held by another agent
//   in self's location              → resourceAccess 0.1, scarcity 0.7
//   no object relevant to self      → NO atoms (absent input, not zero)
// When several objects are relevant, the BEST access wins (max access,
// its paired scarcity).
//
// Called ONLY when FC.objects.contextAxesV1.enabled. Defers to scene metrics:
// if the pool already carries the source atom id, nothing is emitted for it.

import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';
import { clamp01 } from '../../util/math';

export const OBJECT_CONTEXT_V1 = {
  holding: { resourceAccess: 0.9, scarcity: 0.0 },
  unheldHere: { resourceAccess: 0.5, scarcity: 0.35 },
  rivalHolds: { resourceAccess: 0.1, scarcity: 0.7 },
} as const;

type ObjectV0Fact = { holderId: string | null; locId: string };

const OBJ_PREFIX = 'obj:v0:';

function agentLocations(world: any): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of Array.isArray(world?.agents) ? world.agents : []) {
    const id = String(a?.entityId ?? '');
    if (id) out.set(id, String(a?.locationId ?? ''));
  }
  return out;
}

function simFacts(world: any): Record<string, unknown> {
  const f = world?.sceneSnapshot?.simkit?.facts;
  return f && typeof f === 'object' ? f : {};
}

export function deriveObjectContextAtoms(args: {
  selfId: string;
  world: any;
  atoms: ContextAtom[];
}): { atoms: ContextAtom[] } {
  const { selfId, world, atoms } = args;
  const facts = simFacts(world);
  const locs = agentLocations(world);
  const selfLoc = locs.get(selfId) ?? '';

  let best: { resourceAccess: number; scarcity: number; objId: string; relation: string } | null = null;

  for (const key of Object.keys(facts).sort()) {
    if (!key.startsWith(OBJ_PREFIX)) continue;
    const raw = facts[key] as ObjectV0Fact | null;
    if (!raw || typeof raw !== 'object') continue;
    const objId = key.slice(OBJ_PREFIX.length);
    const holderId = raw.holderId != null ? String(raw.holderId) : null;
    // Object's effective location: its holder's, else its own.
    const objLoc = holderId ? (locs.get(holderId) ?? String(raw.locId ?? '')) : String(raw.locId ?? '');

    let cand: { resourceAccess: number; scarcity: number; relation: string } | null = null;
    if (holderId === selfId) {
      cand = { ...OBJECT_CONTEXT_V1.holding, relation: 'holding' };
    } else if (!holderId && objLoc && objLoc === selfLoc) {
      cand = { ...OBJECT_CONTEXT_V1.unheldHere, relation: 'unheldHere' };
    } else if (holderId && objLoc && objLoc === selfLoc) {
      cand = { ...OBJECT_CONTEXT_V1.rivalHolds, relation: 'rivalHolds' };
    }
    if (cand && (!best || cand.resourceAccess > best.resourceAccess)) {
      best = { ...cand, objId };
    }
  }

  if (!best) return { atoms: [] };

  const out: ContextAtom[] = [];
  const emit = (kind: 'resourceAccess' | 'scarcity', value: number) => {
    const id = `ctx:src:scene:${kind}:${selfId}`;
    // Defer to scene metrics: never shadow an existing source atom.
    if (atoms.some((a) => String((a as any)?.id) === id)) return;
    out.push(
      normalizeAtom({
        id,
        ns: 'ctx',
        kind: 'ctx_input',
        origin: 'derived',
        source: 'objectContextV1',
        subject: selfId,
        magnitude: clamp01(value),
        confidence: 1,
        tags: ['ctx', 'src', 'scene', kind, 'object'],
        label: `obj.${kind}=${Math.round(clamp01(value) * 100)}%`,
        trace: {
          usedAtomIds: [],
          notes: [`object v1: ${best!.relation} (${best!.objId})`],
          parts: { objId: best!.objId, relation: best!.relation, constants: OBJECT_CONTEXT_V1[best!.relation as keyof typeof OBJECT_CONTEXT_V1] },
        },
      }),
    );
  };

  emit('resourceAccess', best.resourceAccess);
  emit('scarcity', best.scarcity);
  return { atoms: out };
}
