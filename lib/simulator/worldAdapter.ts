// lib/simulator/worldAdapter.ts
// Bridge between world state and GoalLab snapshots for the simulator.

import type { SimAction, SimEvent, WorldState, GoalLabSnapshotV1Like } from './types';

export type WorldAdapter = {
  // генерит снапшот для GoalLab из состояния мира
  buildSnapshot(state: WorldState): GoalLabSnapshotV1Like;

  // применяет действия игрока/агента к состоянию мира
  applyActions(state: WorldState, actions: SimAction[]): WorldState;

  // применяет события мира к состоянию мира (hazards/norms/etc)
  applyEvents(state: WorldState, events: SimEvent[]): WorldState;

  // опционально: планировщик событий на следующий тик
  scheduleNext(state: WorldState): WorldState;
};

// ДЕФОЛТНЫЙ адаптер-заглушка, чтобы симулятор уже работал
export const defaultWorldAdapter: WorldAdapter = {
  buildSnapshot(state) {
    return {
      id: `snap:t${String(state.tickIndex).padStart(5, '0')}`,
      time: new Date().toISOString(),
      tickIndex: state.tickIndex,
      characters: state.characters,
      locations: state.locations,
      events: state.scheduledEvents,
      atoms: [], // оркестратор заполнит
      debug: {},
    };
  },

  applyActions(state, actions) {
    // сюда ты воткнёшь свои move/affordances/constraints
    // сейчас: просто пишем факт "lastActions"
    const facts = { ...(state.facts || {}), lastActions: actions };
    return { ...state, facts };
  },

  applyEvents(state, events) {
    // сейчас: копим "lastEvents"
    const facts = { ...(state.facts || {}), lastEvents: events };
    return { ...state, facts };
  },

  scheduleNext(state) {
    // сейчас: ничего не планируем
    return state;
  },
};
