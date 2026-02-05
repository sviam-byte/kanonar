import type { ContextAtom } from '../context/v2/types';
import type { WorldEvent } from '../events/types';

type GoalDomain =
  | 'safety'
  | 'control'
  | 'affiliation'
  | 'status'
  | 'exploration'
  | 'order'
  | 'rest'
  | 'wealth';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clamp11(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

function getWorldTick(atoms: ContextAtom[]): number | null {
  for (const a of atoms || []) {
    const id = String((a as any)?.id ?? '');
    if (!id.startsWith('world:tick:')) continue;
    const n = Number(id.slice('world:tick:'.length));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function lower(x: unknown): string {
  return String(x ?? '').toLowerCase();
}

function isHarmKind(kind: string): boolean {
  const k = lower(kind);
  return k.includes('attack') || k.includes('hurt') || k.includes('harm') || k.includes('insult') || k.includes('threat') || k.includes('steal') || k.includes('betray');
}

function isHelpKind(kind: string): boolean {
  const k = lower(kind);
  return k.includes('help') || k.includes('assist') || k.includes('heal') || k.includes('protect') || k.includes('save') || k.includes('comfort');
}

/**
 * Lightweight “goal progress” bridge.
 *
 * We intentionally compute progress from the SAME atom-frame used by GoalLab.
 * That keeps the architecture consistent: world→events→atoms→goals→state.
 *
 * Rules here are conservative and heuristic (pattern-matching on event.kind).
 * They are meant to make `GoalState.progress` non-dead and provide a clean hook
 * for later, goal-specific outcome models.
 */
export function computeDomainProgressDeltasFromAtoms(args: {
  atoms: ContextAtom[];
  selfId: string;
  /**
   * If provided, we only look at events in [nowTick-lookback, nowTick].
   * If omitted, we try to extract world:tick:* from atoms.
   */
  nowTick?: number;
  lookbackTicks?: number;
}): Record<GoalDomain, number> {
  const { atoms, selfId } = args;
  const nowTick = Number.isFinite(args.nowTick as any) ? Number(args.nowTick) : (getWorldTick(atoms) ?? null);
  const lookback = args.lookbackTicks ?? 2;

  const out: Record<GoalDomain, number> = {
    safety: 0,
    control: 0,
    affiliation: 0,
    status: 0,
    exploration: 0,
    order: 0,
    rest: 0,
    wealth: 0,
  };

  // Prefer direct event atoms: ns=event, kind=event_recent, meta.event is a WorldEvent.
  for (const a of atoms || []) {
    if ((a as any)?.ns !== 'event') continue;
    if (String((a as any)?.kind ?? '') !== 'event_recent') continue;

    const ev = ((a as any)?.meta?.event ?? null) as WorldEvent | null;
    if (!ev || typeof ev !== 'object') continue;

    const kind = lower(ev.kind);
    const actorId = String(ev.actorId ?? '');
    const targetId = ev.targetId ? String(ev.targetId) : '';
    const mag = clamp01(Number(ev.magnitude ?? (a as any)?.magnitude ?? 0.7));

    // If we have a tick anchor, restrict to very recent events.
    if (nowTick !== null) {
      const t = Number(ev.tick);
      if (Number.isFinite(t) && nowTick - t > lookback) continue;
    }

    // 1) Self performed an action (actor=self): positive progress signals.
    if (actorId === selfId) {
      if (isHelpKind(kind)) out.affiliation += 0.22 * mag;

      if (kind.includes('obey') || kind.includes('order') || kind.includes('kept_oath') || kind.includes('oath') || kind.includes('discipline')) {
        out.order += 0.18 * mag;
      }

      if (kind.includes('rest') || kind.includes('sleep') || kind.includes('recover') || kind.includes('self_treat') || kind.includes('heal_self')) {
        out.rest += 0.22 * mag;
      }

      if (kind.includes('explor') || kind.includes('search') || kind.includes('observe') || kind.includes('scout') || kind.includes('investigate')) {
        out.exploration += 0.18 * mag;
      }

      if (kind.includes('loot') || kind.includes('gather') || kind.includes('collect') || kind.includes('trade') || kind.includes('work') || kind.includes('earn')) {
        out.wealth += 0.16 * mag;
      }

      if (kind.includes('secure') || kind.includes('escape') || kind.includes('retreat') || kind.includes('evade') || kind.includes('took_cover')) {
        out.safety += 0.2 * mag;
      }

      if (kind.includes('attack') || kind.includes('fight') || kind.includes('command') || kind.includes('intimidate') || kind.includes('contain') || kind.includes('control')) {
        out.control += 0.14 * mag;
      }

      if (kind.includes('public') || kind.includes('shame') || kind.includes('praise') || kind.includes('honor') || kind.includes('promotion')) {
        out.status += 0.14 * mag;
      }
    }

    // 2) Something happened TO self (target=self): setbacks reduce progress in relevant domains.
    if (targetId === selfId && actorId && actorId !== selfId) {
      if (isHarmKind(kind)) {
        out.safety -= 0.25 * mag;
        out.control -= 0.12 * mag;
        out.affiliation -= 0.06 * mag;
        out.status -= 0.06 * mag;
      }
      if (kind.includes('disobey') || kind.includes('broke_oath')) {
        out.order -= 0.16 * mag;
      }
    }
  }

  // Clamp to a sane step range so progress can't jump too wildly in a single tick.
  for (const k of Object.keys(out) as GoalDomain[]) {
    out[k] = clamp11(out[k]);
  }

  return out;
}
