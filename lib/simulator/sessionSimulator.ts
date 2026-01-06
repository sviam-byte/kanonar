// lib/simulator/sessionSimulator.ts
// Minimal session simulator: apply world actions/events, run orchestrator, store history.

import type { ProducerSpec } from '../orchestrator/types';
import { runTick } from '../orchestrator/runTick';
import { buildRegistry } from '../orchestrator/registry';

import type {
  SimAction, SimEvent, WorldState, SimTickRecord, SimulatorExportV1,
} from './types';
import type { WorldAdapter } from './worldAdapter';

const nowIso = () => new Date().toISOString();

function padTick(i: number) {
  return `t${String(i).padStart(5, '0')}`;
}

export type SessionSimulatorConfig = {
  seed?: number | null;
  registry: ProducerSpec[];
  world: WorldAdapter;
  initialWorld: WorldState;

  // safety: limit history size if needed
  maxHistory?: number;
};

export class SessionSimulator {
  private cfg: SessionSimulatorConfig;

  public worldState: WorldState;
  public history: SimTickRecord[] = [];
  public actionQueue: SimAction[] = [];
  public eventQueue: SimEvent[] = [];

  constructor(cfg: SessionSimulatorConfig) {
    this.cfg = { ...cfg };
    this.worldState = { ...cfg.initialWorld };
    this.cfg.registry = buildRegistry(cfg.registry);
  }

  enqueueAction(a: SimAction) {
    this.actionQueue.push(a);
  }

  enqueueEvent(e: SimEvent) {
    this.eventQueue.push(e);
  }

  reset(toWorld?: WorldState) {
    this.worldState = { ...(toWorld ?? this.cfg.initialWorld), tickIndex: 0, seed: this.cfg.seed ?? null };
    this.history = [];
    this.actionQueue = [];
    this.eventQueue = [];
  }

  step(): SimTickRecord {
    const tickIndex = this.worldState.tickIndex;
    const tickId = padTick(tickIndex);

    // 1) забираем действия/ивенты на этот тик
    const actionsNow = this.takeActionsForTick(tickIndex);
    const eventsNow = this.takeEventsForTick(tickIndex);

    // 2) применяем к worldState
    let ws = this.worldState;
    ws = this.cfg.world.applyActions(ws, actionsNow);
    ws = this.cfg.world.applyEvents(ws, eventsNow);

    // 3) строим снапшот
    const snapshotIn = this.cfg.world.buildSnapshot(ws);

    // 4) прогоняем оркестратор
    const prevSnapshot = this.history.length ? this.history[this.history.length - 1].snapshot : null;

    const { nextSnapshot, trace } = runTick({
      tickIndex,
      snapshot: snapshotIn,
      prevSnapshot,
      overrides: null,
      registry: this.cfg.registry,
      seed: this.cfg.seed ?? null,
    });

    // 5) записываем тик в историю
    const rec: SimTickRecord = {
      tickIndex,
      snapshot: nextSnapshot,
      orchestratorTrace: trace,
      actionsApplied: actionsNow,
      eventsApplied: eventsNow,
    };

    this.history.push(rec);
    if (this.cfg.maxHistory && this.history.length > this.cfg.maxHistory) {
      this.history = this.history.slice(-this.cfg.maxHistory);
    }

    // 6) планируем следующий тик и увеличиваем tickIndex
    ws = { ...ws, tickIndex: tickIndex + 1 };
    ws = this.cfg.world.scheduleNext(ws);

    this.worldState = ws;
    return rec;
  }

  run(n: number): SimTickRecord[] {
    const out: SimTickRecord[] = [];
    for (let i = 0; i < n; i++) out.push(this.step());
    return out;
  }

  export(): SimulatorExportV1 {
    return {
      schema: 'GoalLabSessionSimExportV1',
      seed: this.cfg.seed ?? null,
      createdAt: nowIso(),
      ticks: this.history,
    };
  }

  private takeActionsForTick(t: number): SimAction[] {
    const now: SimAction[] = [];
    const rest: SimAction[] = [];
    for (const a of this.actionQueue) {
      const at = a.atTick ?? null;
      if (at === null || at === t) now.push({ ...a, atTick: t });
      else rest.push(a);
    }
    this.actionQueue = rest;
    // deterministic
    now.sort((x, y) => x.id.localeCompare(y.id));
    return now;
  }

  private takeEventsForTick(t: number): SimEvent[] {
    const now: SimEvent[] = [];
    const rest: SimEvent[] = [];
    for (const e of this.eventQueue) {
      // по умолчанию — применить на текущем тике
      now.push(e);
    }
    this.eventQueue = rest;
    now.sort((x, y) => x.id.localeCompare(y.id));
    return now;
  }
}
