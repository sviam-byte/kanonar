// lib/simkit/core/simulator.ts
// Core simulator: step/run/reset/history plus optional plugins.

import type { SimWorld, SimAction, ActionOffer, SimTickRecord, TickTrace } from './types';
import { RNG } from './rng';
import { cloneWorld, buildSnapshot, ensureCharacterPos } from './world';
import { proposeActions, applyAction, applyEvent } from './rules';
import { validateActionStrict } from '../actions/validate';
import { normalizeAtom } from '../../context/v2/infer';
import type { ContextAtom } from '../../context/v2/types';

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function applyHazardPoints(world: SimWorld) {
  const points = Array.isArray((world.facts as any)?.hazardPoints) ? (world.facts as any).hazardPoints : [];
  if (!points.length) return;
  for (const c of Object.values(world.characters as any)) {
    const locId = (c as any).locId;
    const x = Number((c as any).pos?.x);
    const y = Number((c as any).pos?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    let danger = 0;
    let safe = 0;
    for (const p of points) {
      if (p.locationId !== locId) continue;
      const dx = x - Number(p.x);
      const dy = y - Number(p.y);
      const r = Math.max(10, Number(p.radius ?? 120));
      const d2 = dx * dx + dy * dy;
      const falloff = Math.exp(-d2 / (2 * r * r));
      const s = clamp01(Number(p.strength ?? 0.7)) * falloff;
      if (p.kind === 'danger') danger += s;
      else safe += s;
    }
    const danger01 = clamp01(danger - 0.8 * safe);
    (world.facts as any)[`ctx:danger:${(c as any).id}`] = danger01;
    (world.facts as any)[`ctx:privacy:${(c as any).id}`] = clamp01(0.5 + 0.5 * safe - 0.4 * danger);
  }
}

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

    for (const id of Object.keys(this.world.characters)) {
      ensureCharacterPos(this.world, id);
    }

    // Apply hazard/safe map points into world facts before scoring/actions.
    applyHazardPoints(this.world);

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

    // --- integrate inboxAtoms into agentAtoms (with simple trust gate v0)
    const inbox = (this.world.facts['inboxAtoms'] && typeof this.world.facts['inboxAtoms'] === 'object')
      ? this.world.facts['inboxAtoms']
      : null;

    if (inbox) {
      for (const [agentId, atoms] of Object.entries(inbox as Record<string, any[]>)) {
        const c = this.world.characters[agentId];
        if (!c) continue;

        const arr: ContextAtom[] = [];
        const boostTick = this.world.facts[`observeBoost:${agentId}`];
        const boosted = Number.isFinite(boostTick) && this.world.tickIndex === boostTick + 1;
        for (const a of atoms) {
          // v0: принять всё, но с пониженной уверенностью
          const conf = typeof a.confidence === 'number' ? a.confidence : 0.6;
          const atom: ContextAtom = normalizeAtom({
            id: a.id,
            kind: 'ctx',
            magnitude: typeof a.magnitude === 'number' ? a.magnitude : 1,
            confidence: boosted ? Math.min(1, conf + 0.2) : conf,
            origin: {
              type: 'speech',
              from: a.meta?.from ?? null,
              tickIndex: this.world.tickIndex,
            },
            meta: a.meta ?? {},
          });
          arr.push(atom);
        }

        const key = `agentAtoms:${agentId}`;
        const prev = Array.isArray(this.world.facts[key]) ? this.world.facts[key] : [];
        this.world.facts[key] = prev.concat(arr);
      }

      delete this.world.facts['inboxAtoms'];
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
