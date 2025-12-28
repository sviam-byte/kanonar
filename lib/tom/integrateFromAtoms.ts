// lib/tom/integrateFromAtoms.ts
import type { WorldState, TomEntry } from '../../types';
import type { ContextAtom } from '../context/v2/types';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const ema = (prev: number, next: number, a: number) => clamp01(prev + a * (next - prev));

function getMag(atoms: ContextAtom[], id: string): number | null {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return typeof m === 'number' && Number.isFinite(m) ? m : null;
}

function listTargets(selfId: string, atoms: ContextAtom[]): Set<string> {
  const out = new Set<string>();
  const prefix = `tom:effective:dyad:${selfId}:`;
  for (const a of atoms) {
    if (!String(a.id).startsWith(prefix)) continue;
    const parts = String(a.id).split(':'); // tom:effective:dyad:self:other:metric
    if (parts.length >= 6) out.add(parts[4]);
  }
  out.delete(selfId);
  return out;
}

export function integrateTomFromAtoms(args: {
  world: WorldState;
  selfId: string;
  atoms: ContextAtom[];
  tick: number;
  alpha?: number;
}) {
  const { world, selfId, atoms, tick } = args;
  const a = Number.isFinite(args.alpha) ? (args.alpha as number) : 0.25;

  const w: any = world as any;
  const views: Record<string, Record<string, TomEntry>> = (w.tom?.views ?? w.tom) as any;
  if (!views || !views[selfId]) return;

  for (const otherId of listTargets(selfId, atoms)) {
    const entry = views[selfId][otherId];
    if (!entry) continue;

    // Map from dyad atoms to TomEntry traits
    const trust = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:trust`);
    const threat = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:threat`);
    const align = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:alignment`);
    const respect = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:respect`);
    const dominance = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:dominance`);
    const intimacy = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:intimacy`);
    const uncertainty = getMag(atoms, `tom:effective:dyad:${selfId}:${otherId}:uncertainty`);

    if (trust !== null) entry.traits.trust = ema(entry.traits.trust, trust, a);
    if (align !== null) entry.traits.align = ema(entry.traits.align, align, a);
    if (respect !== null) entry.traits.respect = ema(entry.traits.respect, respect, a);
    if (dominance !== null) entry.traits.dominance = ema(entry.traits.dominance, dominance, a);
    if (intimacy !== null) entry.traits.bond = ema(entry.traits.bond, intimacy, a);

    // conflict & fear are driven by threat/uncertainty (детерминированно)
    if (threat !== null) entry.traits.conflict = ema(entry.traits.conflict, threat, a);
    if (uncertainty !== null) {
      entry.traits.uncertainty = ema(entry.traits.uncertainty, uncertainty, 0.2);
      entry.uncertainty = entry.traits.uncertainty;
    }

    entry.lastUpdatedTick = tick;
  }

  if (w.tom?.views) w.tom.views = views;
  else w.tom = views;
}
