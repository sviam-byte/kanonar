
import { ContextAtom } from '../context/v2/types';

export type PossibilityKind = 'aff' | 'con' | 'off' | 'exit';

export type Possibility = {
  id: string; // stable id (aff:hide, con:protocol:noViolence, off:npc:help, exit:door:A)
  kind: PossibilityKind;
  label: string;
  magnitude: number; // 0..1 availability/strength
  confidence: number; // 0..1
  subjectId: string;
  targetId?: string;
  blockedBy?: string[]; // atom ids con:* that block it
  requires?: string[]; // atom ids required to exist (soft; for trace/debug)
  trace?: { usedAtomIds: string[]; notes?: string[]; parts?: any };
  meta?: any;
};

export type PossibilityDef = {
  key: string; // "hide", "escape", "talk_private", "attack", "help_offer", etc
  kind: PossibilityKind;
  label: string;
  // Build the possibility from atoms; return null if not applicable.
  build: (ctx: {
    selfId: string;
    atoms: ContextAtom[];
    helpers: Helpers;
  }) => Possibility | null;
};

export type Helpers = {
  get: (id: string, fallback?: number) => number;
  has: (id: string) => boolean;
  findPrefix: (prefix: string) => ContextAtom[];
  clamp01: (x: number) => number;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function makeHelpers(atoms: ContextAtom[]): Helpers {
  const map = new Map<string, number>();
  for (const a of atoms) {
    if (typeof a?.id !== 'string') continue;
    const m = (typeof (a as any).magnitude === 'number') ? (a as any).magnitude : NaN;
    if (Number.isFinite(m)) map.set(a.id, m);
  }

  return {
    get: (id: string, fb = 0) => map.has(id) ? (map.get(id) as number) : fb,
    has: (id: string) => map.has(id),
    findPrefix: (prefix: string) => atoms.filter(a => typeof a?.id === 'string' && a.id.startsWith(prefix)),
    clamp01
  };
}
