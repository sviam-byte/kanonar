// lib/simkit/core/simulator.ts
// Core simulator: step/run/reset/history plus optional plugins.

import type { SimWorld, SimAction, ActionOffer, SimTickRecord, TickTrace } from './types';
import { RNG } from './rng';
import { cloneWorld, buildSnapshot } from './world';
import { proposeActions, applyAction, applyEvent } from './rules';

export type SimPlugin = {
  id: string;
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

  enqueueAction(a: SimAction) {
    this.forcedActions.push(a);
  }

  step(): SimTickRecord {
    const w0 = cloneWorld(this.world);

    const offers = proposeActions(this.world);

    const actionsApplied: SimAction[] = [];
    const eventsApplied: any[] = [];
    const notes: string[] = [];

    // 1) применяем forcedActions (если есть), иначе — топ-оффер для каждого чара
    const forced = this.takeForcedActions();
    if (forced.length) {
      for (const a of forced) {
        const r = applyAction(this.world, a);
        this.world = r.world;
        actionsApplied.push(a);
        notes.push(...r.notes);
        // события от действий идут в очередь событий этого тика
        this.world.events.push(...r.events);
      }
    } else {
      for (const cId of Object.keys(this.world.characters).sort()) {
        const best = pickTopOffer(offers, cId);
        if (!best) continue;
        const a: SimAction = {
          id: `act:${best.kind}:${this.world.tickIndex}:${cId}`,
          kind: best.kind,
          actorId: cId,
          targetId: best.targetId ?? null,
        };
        const r = applyAction(this.world, a);
        this.world = r.world;
        actionsApplied.push(a);
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
    const snapshot = buildSnapshot(this.world);

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
