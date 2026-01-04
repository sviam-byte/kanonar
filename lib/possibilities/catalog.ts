import { ContextAtom } from '../context/v2/types';

export type PossibilityKind = 'aff' | 'con' | 'off' | 'exit' | 'cog';

export type Possibility = {
  id: string;
  kind: PossibilityKind;
  label: string;
  magnitude: number;
  confidence: number;
  subjectId: string;
  targetId?: string;
  blockedBy?: string[];
  requires?: string[];
  trace?: { usedAtomIds: string[]; notes?: string[]; parts?: any };
  meta?: any;
};

export type PossibilityBuildResult = Possibility | Possibility[] | null;

export type PossibilityDef = {
  key: string;
  kind: PossibilityKind;
  label: string;
  build: (ctx: {
    selfId: string;
    atoms: ContextAtom[];
    helpers: Helpers;
  }) => PossibilityBuildResult;
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

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

/**
 * Build helpers defensively so UI doesn't crash on malformed atoms inputs.
 */
export function makeHelpers(atomsLike: any): Helpers {
  const atoms = arr<ContextAtom>(atomsLike);

  const map = new Map<string, number>();
  for (const a of atoms) {
    if (typeof (a as any)?.id !== 'string') continue;
    const m = (typeof (a as any).magnitude === 'number') ? (a as any).magnitude : NaN;
    if (Number.isFinite(m)) map.set((a as any).id, m);
  }

  return {
    get: (id: string, fb = 0) => map.has(id) ? (map.get(id) as number) : fb,
    has: (id: string) => map.has(id),
    findPrefix: (prefix: string) => atoms.filter(a => typeof (a as any)?.id === 'string' && (a as any).id.startsWith(prefix)),
    clamp01
  };
}
