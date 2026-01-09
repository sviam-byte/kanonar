// lib/simkit/core/simulator.ts
// Core simulator: step/run/reset/history plus optional plugins.

import type { SimWorld, SimAction, ActionOffer, SimTickRecord, TickTrace } from './types';
import { RNG } from './rng';
import { cloneWorld, buildSnapshot } from './world';
import { proposeActions, applyAction, applyEvent } from './rules';
import { validateActionStrict } from '../actions/validate';

export type SimPlugin = {
  id: string;
  // Optional pre-step decision hook: can return actions to apply before default heuristic.
  decideActions?: (args: {
    world: SimWorld;
    offers: ActionOffer[];
    rng: RNG;
    tickIndex: number;
  }) => SimAction[] | null | void;
  afterSnapshot?: (args: {
    world: SimWorld;
    snapshot: any;              // SimSnapshot
    record: SimTickRecord;      // mutable attach point
  }) => void;
};

export type SimulatorConfig = {
  scenarioId: string;
  seed: number;
  initialWorld: SimWorld;
  plugins?: SimPlugin[];
  maxRecords?: number;
};

function pickTopOffer(offers: ActionOffer[], actorId: string): ActionOffer | null {
  const forActor = offers.filter(o => o.actorId === actorId && !o.blocked);
  if (!forActor.length) return null;
  return forActor[0];
}

export class SimKitSimulator {
  public cfg: SimulatorConfig;
  public rng: RNG;
  public world: SimWorld;
  public records: SimTickRecord[] = [];

  // внешняя очередь “принудительных” действий на следующий тик
  public forcedActions: SimAction[] = [];

  constructor(cfg: SimulatorConfig) {
    this.cfg = cfg;
    this.rng = new RNG(cfg.seed);
    this.world = cloneWorld(cfg.initialWorld);
    this.world.seed = cfg.seed;
  }

  reset(seed?: number) {
    const s = Number.isFinite(seed as any) ? Number(seed) : this.cfg.seed;
    this.rng = new RNG(s);
    this.world = cloneWorld(this.cfg.initialWorld);
    this.world.seed = s;
    this.records = [];
    this.forcedActions = [];
  }

  /** Replace initial world (used by Scene Setup) and reset session. */
  setInitialWorld(next: SimWorld, opts?: { seed?: number; scenarioId?: string }) {
    const seed = Number.isFinite(opts?.seed as any) ? Number(opts!.seed) : this.cfg.seed;
    if (opts?.scenarioId) this.cfg.scenarioId = opts.scenarioId;

    // keep cfg.seed in sync
    this.cfg.seed = seed;

    // normalize world for new session
    const w = cloneWorld(next);
    w.tickIndex = 0;
    w.seed = seed;
    w.events = w.events || [];
    w.facts = w.facts || {};

    this.cfg.initialWorld = w;
    this.reset(seed);
  }

  /** Useful for UI: show a map even before first tick. */
  getPreviewSnapshot() {
    return buildSnapshot(this.world);
  }

  enqueueAction(a: SimAction) {
    this.forcedActions.push(a);
  }

  step(): SimTickRecord {
    const w0 = cloneWorld(this.world);

    const offers = proposeActions(this.world);

    const actionsApplied: SimAction[] = [];
    const eventsApplied: any[] = [];
    const notes: string[] = [];
    const actionValidations: NonNullable<TickTrace['actionValidations']> = [];

    // 1) применяем forcedActions (если есть), иначе — даём плагинам шанс выбрать действия
    const forced = this.takeForcedActions();
    let pluginDecided: SimAction[] | null = null;
    if (!forced.length) {
      for (const p of this.cfg.plugins || []) {
        const out = p.decideActions?.({
          world: this.world,
          offers,
          rng: this.rng,
          tickIndex: this.world.tickIndex,
        });
        if (Array.isArray(out) && out.length) {
          pluginDecided = out;
          break; // первый решивший плагин выигрывает
        }
      }
    }

    const actionsToApply = forced.length ? forced : (pluginDecided || []);

    if (actionsToApply.length) {
      for (const a of actionsToApply) {
        const vr = validateActionStrict(this.world, a);
        let actionToApply: SimAction | null = null;

        if (vr.allowed) {
          actionToApply = vr.normalizedAction ? vr.normalizedAction : a;
        } else {
          actionToApply = vr.fallbackAction ? vr.fallbackAction : null;
        }

        actionValidations.push({
          actionId: a.id,
          actorId: a.actorId,
          kind: a.kind,
          targetId: a.targetId ?? null,
          allowed: vr.allowed,
          singleTick: vr.singleTick,
          reasons: vr.reasons,
          normalizedTo: actionToApply
            ? { id: actionToApply.id, kind: actionToApply.kind, targetId: actionToApply.targetId ?? null }
            : null,
        });

        if (!actionToApply) {
          notes.push(`action dropped: ${a.id} reasons=${vr.reasons.join(',')}`);
          continue;
        }

        const r = applyAction(this.world, actionToApply);
        this.world = r.world;
        actionsApplied.push(actionToApply);
        notes.push(...r.notes);
        // события от действий идут в очередь событий этого тика
        this.world.events.push(...r.events);
      }
    } else {
      // fallback: эвристика как раньше
      for (const cId of Object.keys(this.world.characters).sort()) {
        const best = pickTopOffer(offers, cId);
        if (!best) continue;
        const a: SimAction = {
          id: `act:${best.kind}:${this.world.tickIndex}:${cId}`,
          kind: best.kind,
          actorId: cId,
          targetId: best.targetId ?? null,
        };
        const vr = validateActionStrict(this.world, a);
        const actionToApply = vr.allowed ? (vr.normalizedAction ? vr.normalizedAction : a) : (vr.fallbackAction || null);

        actionValidations.push({
          actionId: a.id,
          actorId: a.actorId,
          kind: a.kind,
          targetId: a.targetId ?? null,
          allowed: vr.allowed,
          singleTick: vr.singleTick,
          reasons: vr.reasons,
          normalizedTo: actionToApply
            ? { id: actionToApply.id, kind: actionToApply.kind, targetId: actionToApply.targetId ?? null }
            : null,
        });

        if (!actionToApply) {
          notes.push(`action dropped: ${a.id} reasons=${vr.reasons.join(',')}`);
          continue;
        }

        const r = applyAction(this.world, actionToApply);
        this.world = r.world;
        actionsApplied.push(actionToApply);
        notes.push(...r.notes);
        this.world.events.push(...r.events);
      }
    }

    // 2) применяем события (включая те, что уже были в мире)
    const eventsNow = (this.world.events || []).slice();
    this.world.events = []; // consumed
    for (const e of eventsNow) {
      const r = applyEvent(this.world, e);
      this.world = r.world;
      eventsApplied.push(e);
      notes.push(...r.notes);
    }

    // 3) строим снапшот
    // IMPORTANT: by now this.world.events has been consumed/reset.
    // We must pass the applied events explicitly for traceability.
    const snapshot = buildSnapshot(this.world, { events: eventsApplied });

    // 4) собираем trace deltas (минимально: по персонажам + фактам)
    const deltasChars: TickTrace['deltas']['chars'] = [];
    for (const id of Object.keys(this.world.characters).sort()) {
      const before = w0.characters[id];
      const after = this.world.characters[id];
      if (!before || !after) continue;
      // пишем только ключевые поля (можно расширить)
      const b = { locId: before.locId, stress: before.stress, health: before.health, energy: before.energy };
      const a = { locId: after.locId, stress: after.stress, health: after.health, energy: after.energy };
      if (JSON.stringify(b) !== JSON.stringify(a)) deltasChars.push({ id, before: b, after: a });
    }

    const deltasFacts: TickTrace['deltas']['facts'] = {};
    const keys = new Set<string>([...Object.keys(w0.facts || {}), ...Object.keys(this.world.facts || {})]);
    for (const k of Array.from(keys).sort()) {
      const b = (w0.facts || {})[k];
      const a = (this.world.facts || {})[k];
      if (JSON.stringify(b) !== JSON.stringify(a)) deltasFacts[k] = { before: b, after: a };
    }

    const trace: TickTrace = {
      tickIndex: this.world.tickIndex,
      time: snapshot.time,
      actionsProposed: offers,
      actionsApplied,
      eventsApplied,
      deltas: { chars: deltasChars, facts: deltasFacts },
      actionValidations,
      notes,
    };

    const rec: SimTickRecord = {
      snapshot,
      trace,
      plugins: {},
    };

    // 5) plugins (например, оркестратор)
    for (const p of this.cfg.plugins || []) {
      p.afterSnapshot?.({ world: this.world, snapshot, record: rec });
    }

    this.records.push(rec);
    if (this.cfg.maxRecords && this.records.length > this.cfg.maxRecords) {
      this.records = this.records.slice(-this.cfg.maxRecords);
    }

    // 6) increment tick
    this.world.tickIndex += 1;
    return rec;
  }

  run(n: number): SimTickRecord[] {
    const out: SimTickRecord[] = [];
    for (let i = 0; i < n; i++) out.push(this.step());
    return out;
  }

  private takeForcedActions(): SimAction[] {
    const xs = this.forcedActions.slice();
    this.forcedActions = [];
    xs.sort((a, b) => a.id.localeCompare(b.id));
    return xs;
  }
}
