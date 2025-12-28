// lib/mind/integrateTom.ts
// Deterministic integration: (atoms produced by GoalLab context) -> persistent ToM dyads in world.tom.

import type { WorldState, TomEntry } from '../../types';
import type { ContextAtom } from '../context/v2/types';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string): number | null {
  const a = atoms.find(x => x.id === id);
  if (!a) return null;
  const v = (a as any).mag;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function ema(prev: number, next: number, alpha: number) {
  const p = Number.isFinite(prev) ? prev : 0.5;
  const n = Number.isFinite(next) ? next : p;
  return clamp01(p + alpha * (n - p));
}

function listOthersFromAtoms(selfId: string, atoms: ContextAtom[]): Set<string> {
  const s = new Set<string>();
  const prefixes = [
    `tom:effective:dyad:${selfId}:`,
    `tom:mode:${selfId}:`,
    `tom:predict:${selfId}:`,
    `tom:att:${selfId}:`,
    `tom:help:${selfId}:`,
    `tom:afford:${selfId}:`,
  ];
  for (const a of atoms) {
    const id = a.id;
    for (const p of prefixes) {
      if (id.startsWith(p)) {
        const rest = id.slice(p.length);
        const other = rest.split(':')[0];
        if (other) s.add(other);
      }
    }
  }
  s.delete(selfId);
  return s;
}

function getEntry(world: any, selfId: string, otherId: string): TomEntry | null {
  const tom = world.tom;
  if (!tom) return null;
  const views = tom.views ?? tom;
  return views?.[selfId]?.[otherId] ?? null;
}

export function integrateTomFromAtoms(args: {
  world: WorldState;
  selfId: string;
  atoms: ContextAtom[];
  tick: number;
}) {
  const { world, selfId, atoms, tick } = args;
  const w: any = world as any;
  if (!w.tom) return;

  const views: Record<string, Record<string, TomEntry>> = (w.tom.views ?? w.tom) as any;
  if (!views[selfId]) views[selfId] = {};

  const others = listOthersFromAtoms(selfId, atoms);

  // Tuning knobs (kept here to stay deterministic and debuggable).
  const A_TRAITS = 0.25;
  const A_FEAR = 0.30;
  const A_POLICY = 0.50;

  for (const otherId of others) {
    const entry = getEntry(w, selfId, otherId);
    if (!entry) continue;

    // ---- trait updates from effective dyads / dyadic emotions ----
    const trust = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:trust`);
    const threat = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:threat`);
    const align = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:alignment`);
    const respect = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:respect`);
    const dominance = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:dominance`);
    const intimacy = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:intimacy`);
    const uncertainty = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:uncertainty`);

    const fearOf = getMag(atoms, `emo:dyad:fearOf:${selfId}:${otherId}`);
    const hostility = getMag(atoms, `emo:dyad:hostility:${selfId}:${otherId}`);

    if (trust !== null) entry.traits.trust = ema(entry.traits.trust, trust, A_TRAITS);

    if (align !== null) entry.traits.align = ema(entry.traits.align, align, A_TRAITS);
    if (respect !== null) entry.traits.respect = ema(entry.traits.respect, respect, A_TRAITS);
    if (dominance !== null) entry.traits.dominance = ema(entry.traits.dominance, dominance, A_TRAITS);

    if (intimacy !== null) entry.traits.bond = ema(entry.traits.bond, intimacy, A_TRAITS);

    // conflict/fear: deterministic mapping (no random, no hidden heuristics)
    if (threat !== null || hostility !== null) {
      const threatX = clamp01((threat ?? 0.5) * 0.75 + (hostility ?? 0.5) * 0.25);
      entry.traits.conflict = ema(entry.traits.conflict, threatX, A_TRAITS);
    }
    if (fearOf !== null) entry.traits.fear = ema(entry.traits.fear, fearOf, A_FEAR);

    if (uncertainty !== null) {
      entry.traits.uncertainty = ema(entry.traits.uncertainty, uncertainty, 0.20);
      (entry as any).uncertainty = entry.traits.uncertainty;
    }

    // ---- policy extraction (mode/predict/att/help/afford) ----
    const policy: any = {
      tick,
      mode: {
        system2: getMag(atoms, `tom:mode:${selfId}:${otherId}:S2`),
      },
      predict: {
        help: getMag(atoms, `tom:predict:${selfId}:${otherId}:help`),
        harm: getMag(atoms, `tom:predict:${selfId}:${otherId}:harm`),
        exploit: getMag(atoms, `tom:predict:${selfId}:${otherId}:exploit`),
        truthful: getMag(atoms, `tom:predict:${selfId}:${otherId}:truthful`),
        unstable: getMag(atoms, `tom:predict:${selfId}:${otherId}:unstable`),
        hostile: getMag(atoms, `tom:predict:${selfId}:${otherId}:hostile`),
      },
      attitude: {
        approach: getMag(atoms, `tom:att:${selfId}:${otherId}:approach`),
        avoid: getMag(atoms, `tom:att:${selfId}:${otherId}:avoid`),
        care: getMag(atoms, `tom:att:${selfId}:${otherId}:care`),
        hostile: getMag(atoms, `tom:att:${selfId}:${otherId}:hostile`),
        respect: getMag(atoms, `tom:att:${selfId}:${otherId}:respect`),
      },
      help: {
        willing: getMag(atoms, `tom:help:${selfId}:${otherId}:willing`),
        priority: getMag(atoms, `tom:help:${selfId}:${otherId}:priority`),
      },
      afford: {} as Record<string, number | null>,
    };

    // Collect affordances if present.
    const affordPrefix = `tom:afford:${selfId}:${otherId}:action:`;
    for (const a of atoms) {
      if (!a.id.startsWith(affordPrefix)) continue;
      const action = a.id.slice(affordPrefix.length);
      const mag = (a as any).mag;
      if (typeof mag === 'number' && Number.isFinite(mag)) policy.afford[action] = mag;
    }

    // Smooth policy to avoid “jitter” while staying deterministic.
    const prevPolicy = (entry as any).policy;
    if (prevPolicy && typeof prevPolicy === 'object') {
      const sm = (k: string, cur: any, prev: any) => {
        if (typeof cur === 'number' && typeof prev === 'number') return ema(prev, cur, A_POLICY);
        if (cur && typeof cur === 'object') {
          const out: any = {};
          for (const kk of Object.keys(cur)) out[kk] = sm(`${k}.${kk}`, cur[kk], prev?.[kk]);
          return out;
        }
        return cur ?? prev;
      };
      (entry as any).policy = sm('policy', policy, prevPolicy);
    } else {
      (entry as any).policy = policy;
    }

    entry.lastUpdatedTick = tick;
    views[selfId][otherId] = entry;
  }

  if (w.tom.views) w.tom.views = views;
  else w.tom = views;
}
