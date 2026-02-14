import type { Provenance } from './contracts';
import { arr } from '../../utils/arr';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type FeatureKey =
  | 'threat'
  | 'escape'
  | 'cover'
  | 'visibility'
  | 'resourceAccess'
  | 'scarcity'
  | 'fatigue'
  | 'stress';

export type FeatureVectorSnapshot = {
  z: Record<FeatureKey, number>;
  provenanceByKey: Record<FeatureKey, Provenance[]>;
  missing: Partial<Record<FeatureKey, string>>;
  note?: string;
};

export type LookaheadActionEval = {
  actionId: string;
  kind: string;
  qNow: number;
  v0: number;
  v1: number;
  qLookahead: number;
  delta: number;
  z1: Record<FeatureKey, number>;
  deltas: Partial<Record<FeatureKey, number>>;
  provenance?: Provenance[];
};

export type TransitionSnapshotLite = {
  enabled: boolean;
  gamma: number;
  riskAversion: number;
  seed: number;
  z0: FeatureVectorSnapshot;
  valueFn: { v0: number; note: string };
  perAction: LookaheadActionEval[];
  warnings: string[];
};

function atomMag(atomsById: Map<string, any>, id: string): number | null {
  const a = atomsById.get(id);
  if (!a) return null;
  const m = Number((a as any)?.magnitude ?? (a as any)?.value ?? 0);
  return Number.isFinite(m) ? m : null;
}

export function buildFeatureVectorFromAtoms(args: {
  selfId: string;
  atoms: any[];
  stageId: string;
}): FeatureVectorSnapshot {
  const atoms = arr<any>(args.atoms);
  const byId = new Map<string, any>();
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, a);
  }

  const spec: Record<FeatureKey, { ids: string[]; note: string }> = {
    threat: {
      ids: [`threat:final:${args.selfId}`, `mind:threat:${args.selfId}`, `ctx:danger:${args.selfId}`],
      note: '0..1: perceived/derived threat',
    },
    escape: {
      ids: [`world:map:escape:${args.selfId}`, `ctx:escape:${args.selfId}`],
      note: '0..1: escape availability / exit proximity',
    },
    cover: {
      ids: [`world:map:cover:${args.selfId}`, `ctx:cover:${args.selfId}`],
      note: '0..1: cover / concealment',
    },
    visibility: {
      ids: [`world:loc:visibility:${args.selfId}`, `ctx:visibility:${args.selfId}`],
      note: '0..1: how visible the agent is in location',
    },
    resourceAccess: {
      ids: [`ctx:src:scene:resourceAccess:${args.selfId}`, `ctx:resourceAccess:${args.selfId}`],
      note: '0..1: access to resources',
    },
    scarcity: {
      ids: [`ctx:src:scene:scarcity:${args.selfId}`, `ctx:scarcity:${args.selfId}`],
      note: '0..1: scarcity level (higher = worse)',
    },
    fatigue: {
      ids: [`body:fatigue:${args.selfId}`],
      note: '0..1: acute fatigue',
    },
    stress: {
      ids: [`body:stress:${args.selfId}`],
      note: '0..1: acute stress',
    },
  };

  const z = {} as Record<FeatureKey, number>;
  const provenanceByKey = {} as Record<FeatureKey, Provenance[]>;
  const missing: Partial<Record<FeatureKey, string>> = {};

  for (const k of Object.keys(spec) as FeatureKey[]) {
    const ids = spec[k].ids;
    let picked: string | null = null;
    let val: number | null = null;
    for (const id of ids) {
      const m = atomMag(byId, id);
      if (m == null) continue;
      picked = id;
      val = m;
      break;
    }
    if (val == null) {
      z[k] = 0;
      missing[k] = `missing atoms: ${ids.join(' | ')}`;
      provenanceByKey[k] = [
        {
          group: 'E',
          path: `E.z.${k}`,
          stageId: args.stageId,
          producer: 'lookahead.buildFeatureVectorFromAtoms',
          note: 'defaulted to 0 (missing)',
        },
      ];
      continue;
    }
    z[k] = clamp01(val);
    provenanceByKey[k] = [
      {
        group: 'E',
        path: `E.z.${k}`,
        stageId: args.stageId,
        producer: 'lookahead.buildFeatureVectorFromAtoms',
        note: spec[k].note,
      },
      {
        group: 'H',
        path: `H.atom.${picked}`,
        stageId: args.stageId,
        producer: 'lookahead.atom_lookup',
        note: 'source atom',
      },
    ];
  }

  return { z, provenanceByKey, missing };
}

function valueFn(z: Record<FeatureKey, number>): { v: number; note: string } {
  // MVP V(z): interpretable mixture.
  const safety = clamp01(1 - z.threat);
  const resource = clamp01(0.6 * z.resourceAccess + 0.4 * (1 - z.scarcity));
  const progress = clamp01(z.escape);
  const stealth = clamp01(0.6 * z.cover + 0.4 * (1 - z.visibility));
  const wellbeing = clamp01(1 - 0.55 * z.fatigue - 0.45 * z.stress);

  const v =
    0.33 * safety +
    0.20 * resource +
    0.22 * progress +
    0.12 * stealth +
    0.13 * wellbeing;

  return {
    v: clamp01(v),
    note: 'V = 0.33*safety + 0.20*resource + 0.22*progress + 0.12*stealth + 0.13*wellbeing; all terms are 0..1',
  };
}

function passiveDelta(z: Record<FeatureKey, number>): Partial<Record<FeatureKey, number>> {
  // Minimal drift: fatigue/stress creep when threat/scarcity are high.
  return {
    fatigue: 0.01 + 0.02 * z.threat,
    stress: 0.01 + 0.02 * z.scarcity + 0.01 * z.threat,
  };
}

function actionEffect(kindRaw: string): Partial<Record<FeatureKey, number>> {
  const kind = String(kindRaw || '').toLowerCase();

  const byKind: Record<string, Partial<Record<FeatureKey, number>>> = {
    hide: { threat: -0.08, visibility: -0.12, cover: +0.05, fatigue: +0.02 },
    escape: { escape: +0.18, threat: +0.03, fatigue: +0.06, stress: +0.03 },
    wait: { fatigue: -0.02, stress: -0.02, threat: +0.02 },
    rest: { fatigue: -0.05, stress: -0.03 },
    approach: { threat: +0.05, escape: -0.06, stress: +0.03 },
    negotiate: { threat: -0.03, stress: -0.02 },
    help: { stress: -0.03, fatigue: +0.03 },
    attack: { threat: -0.02, stress: +0.05, fatigue: +0.06, visibility: +0.08 },
    loot: { resourceAccess: +0.08, scarcity: -0.04, threat: +0.03, fatigue: +0.04 },
  };

  if (byKind[kind]) return byKind[kind];

  // Pattern fallbacks.
  if (kind.includes('hide')) return byKind.hide;
  if (kind.includes('escape') || kind.includes('run') || kind.includes('flee')) return byKind.escape;
  if (kind.includes('wait') || kind.includes('idle')) return byKind.wait;
  if (kind.includes('rest') || kind.includes('sleep')) return byKind.rest;
  if (kind.includes('approach') || kind.includes('move')) return byKind.approach;
  if (kind.includes('talk') || kind.includes('negot') || kind.includes('ask')) return byKind.negotiate;
  if (kind.includes('help') || kind.includes('assist') || kind.includes('save')) return byKind.help;
  if (kind.includes('attack') || kind.includes('fight') || kind.includes('shoot')) return byKind.attack;
  if (kind.includes('loot') || kind.includes('take') || kind.includes('steal')) return byKind.loot;

  return {};
}

export function buildTransitionSnapshot(args: {
  selfId: string;
  tick: number;
  seed: number;
  gamma: number;
  riskAversion: number;
  atoms: any[];
  actions: Array<{ id: string; kind: string; qNow: number }>;
}): TransitionSnapshotLite {
  const warnings: string[] = [];

  const stageId = 'S9';
  const z0 = buildFeatureVectorFromAtoms({ selfId: args.selfId, atoms: args.atoms, stageId });

  const v0 = valueFn(z0.z);

  // Deterministic noise per action.
  const baseSeed = (Number.isFinite(args.seed) ? Math.floor(args.seed) : 0) ^ (args.tick * 2654435761);

  const perAction: LookaheadActionEval[] = [];

  for (const a of arr(args.actions)) {
    const actionId = String((a as any)?.id || '');
    const kind = String((a as any)?.kind || '');
    const qNow = Number((a as any)?.qNow ?? 0);

    const rng = mulberry32((baseSeed ^ hash32(actionId)) >>> 0);

    const dzPassive = passiveDelta(z0.z);
    const dzAct = actionEffect(kind);

    // Small gaussian-ish noise via sum of uniforms.
    const noiseScale = 0.02;
    const noise = (k: FeatureKey) => {
      const u = rng() + rng() + rng() + rng();
      const n = (u - 2) * 0.5; // approx N(0,1)
      return noiseScale * n;
    };

    const deltas: Partial<Record<FeatureKey, number>> = {};
    const z1 = { ...(z0.z as any) } as Record<FeatureKey, number>;

    for (const key of Object.keys(z0.z) as FeatureKey[]) {
      const dp = Number((dzPassive as any)[key] ?? 0);
      const da = Number((dzAct as any)[key] ?? 0);
      const dn = noise(key);
      const d = dp + da + dn;
      (deltas as any)[key] = d;
      z1[key] = clamp01(z1[key] + d);
    }

    const v1 = valueFn(z1);

    // Risk adjustment: penalize the action-specific stochasticity.
    const uncertainty = Object.values(deltas).reduce((s, x) => s + Math.abs(Number(x ?? 0)), 0);
    const v1Risk = clamp01(v1.v - Math.max(0, args.riskAversion) * 0.5 * uncertainty);

    const qLookahead = qNow + Math.max(0, Number(args.gamma)) * v1Risk;
    const delta = qLookahead - qNow;

    perAction.push({
      actionId,
      kind,
      qNow,
      v0: v0.v,
      v1: v1Risk,
      qLookahead,
      delta,
      z1,
      deltas,
      provenance: [
        { group: 'K', path: 'K.transition.linear', stageId, producer: 'lookahead.buildTransitionSnapshot' },
        { group: 'E', path: 'E.z', stageId, producer: 'lookahead.buildFeatureVectorFromAtoms' },
        { group: 'J', path: `J.q_now.${actionId}`, stageId, producer: 'decision.scoreAction', note: 'qNow from current decision layer' },
      ],
    });
  }

  // Sort by qLookahead (descending) for display.
  perAction.sort((a, b) => (b.qLookahead ?? 0) - (a.qLookahead ?? 0));

  const missingKeys = Object.keys(z0.missing || {});
  if (missingKeys.length) warnings.push(`Feature vector missing keys: ${missingKeys.join(', ')}`);

  return {
    enabled: true,
    gamma: Number.isFinite(args.gamma) ? Number(args.gamma) : 0,
    riskAversion: Number.isFinite(args.riskAversion) ? Number(args.riskAversion) : 0,
    seed: Number.isFinite(args.seed) ? Math.floor(args.seed) : 0,
    z0,
    valueFn: { v0: v0.v, note: v0.note },
    perAction,
    warnings,
  };
}
