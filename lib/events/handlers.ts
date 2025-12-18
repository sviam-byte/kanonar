
// lib/events/handlers.ts

import type {
  Event,
  EventKind,
  EventPattern,
} from "./types";

// Обработчики (обобщённо, чтобы не ломать твои типы мира/ToM/целей)
export type WorldReducer<W> = (world: W, event: Event) => W;
export type TomReducer<T> = (tom: T, event: Event) => T;
export type GoalsReducer<G> = (goals: G, event: Event) => G;

export interface EventHandlers<W, T, G> {
  world: Map<EventKind, WorldReducer<W>[]>;
  tom: Map<EventKind, TomReducer<T>[]>;
  goals: Map<EventKind, GoalsReducer<G>[]>;
}

export function createEmptyHandlers<W, T, G>(): EventHandlers<W, T, G> {
  return {
    world: new Map(),
    tom: new Map(),
    goals: new Map(),
  };
}

export function registerWorldHandler<W, T, G>(
  handlers: EventHandlers<W, T, G>,
  kind: EventKind,
  reducer: WorldReducer<W>
) {
  const arr = handlers.world.get(kind) ?? [];
  arr.push(reducer);
  handlers.world.set(kind, arr);
}

export function registerTomHandler<W, T, G>(
  handlers: EventHandlers<W, T, G>,
  kind: EventKind,
  reducer: TomReducer<T>
) {
  const arr = handlers.tom.get(kind) ?? [];
  arr.push(reducer);
  handlers.tom.set(kind, arr);
}

export function registerGoalsHandler<W, T, G>(
  handlers: EventHandlers<W, T, G>,
  kind: EventKind,
  reducer: GoalsReducer<G>
) {
  const arr = handlers.goals.get(kind) ?? [];
  arr.push(reducer);
  handlers.goals.set(kind, arr);
}

// Применение события ко всему слою (мир + ToM + цели)
export function applyEvent<W, T, G>(
  world: W,
  tom: T,
  goals: G,
  event: Event,
  handlers: EventHandlers<W, T, G>
): { world: W; tom: T; goals: G } {
  let w = world;
  let t = tom;
  let g = goals;

  const worldReducers = handlers.world.get(event.kind) ?? [];
  for (const r of worldReducers) w = r(w, event);

  const tomReducers = handlers.tom.get(event.kind) ?? [];
  for (const r of tomReducers) t = r(t, event);

  const goalsReducers = handlers.goals.get(event.kind) ?? [];
  for (const r of goalsReducers) g = r(g, event);

  return { world: w, tom: t, goals: g };
}

// Простая структурная валидация (инварианты уровня схемы)
export interface EventValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateEventStructure(event: Event): EventValidationResult {
  const errors: string[] = [];

  if (!event.id) errors.push("Event.id is empty");
  if (!event.kind) errors.push("Event.kind is empty");
  if (event.timestamp == null) errors.push("Event.timestamp is missing");

  if (event.kind === "action") {
    if (!event.affordanceId) errors.push("ActionEvent requires affordanceId");
    if (!event.locationId) errors.push("ActionEvent requires locationId");
    if (!event.actors.length) errors.push("ActionEvent requires actors");
  }

  if (event.kind === "interaction") {
    if (!event.actors.length) errors.push("InteractionEvent requires actors");
    if (!event.targets.length)
      errors.push("InteractionEvent requires targets");
  }

  if (event.kind === "scene_transition") {
    if (!event.sceneId)
      errors.push("SceneTransitionEvent requires sceneId");
    if (!event.transition)
      errors.push("SceneTransitionEvent requires transition");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

// Матчинг события с паттерном (для триггеров/фильтров)

export function matchPattern(pattern: EventPattern, event: Event): boolean {
  if (pattern.kinds && !pattern.kinds.includes(event.kind)) return false;

  if (pattern.locationId !== undefined) {
    if (event.locationId !== pattern.locationId) return false;
  }

  if (pattern.sceneId !== undefined) {
    if (event.sceneId !== pattern.sceneId) return false;
  }

  if (pattern.tagsAny && pattern.tagsAny.length) {
    if (!pattern.tagsAny.some((t) => event.tags.includes(t))) {
      return false;
    }
  }

  if (pattern.tagsAll && pattern.tagsAll.length) {
    if (!pattern.tagsAll.every((t) => event.tags.includes(t))) {
      return false;
    }
  }

  if (pattern.actorIdsAny && pattern.actorIdsAny.length) {
    if (!pattern.actorIdsAny.some((id) => event.actors.includes(id))) {
      return false;
    }
  }

  if (pattern.targetIdsAny && pattern.targetIdsAny.length) {
    if (!pattern.targetIdsAny.some((id) => event.targets.includes(id))) {
      return false;
    }
  }

  if (
    pattern.minImportance !== undefined &&
    (event.importance ?? 0) < pattern.minImportance
  ) {
    return false;
  }

  return true;
}
