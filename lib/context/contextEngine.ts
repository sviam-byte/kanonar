
import {
  WorldState,
  ScenarioContextState,
  ContextAtomsState,
  DomainEvent,
  StoryTime,
} from '../../types';
import { emptyContextAtoms, addSimpleFact } from './contextAtoms';

export function initScenarioContext(now: StoryTime): ScenarioContextState {
  const atoms: ContextAtomsState = emptyContextAtoms();
  return {
    atoms,
    norms: [],
    activePhase: undefined,
    phaseHistory: [],
    sceneMetrics: {
      events_total: 0,
      threat_level: 0,
      social_tension: 0,
    },
  };
}

/**
 * Обновить ScenarioContextState с учётом одного доменного события:
 * - увеличиваем общие счётчики
 * - добавляем простые факты вида "actor совершил действие domain/тег"
 * - грубо правим метрики угрозы/напряжения
 */
export function applyDomainEventToContext(
  ctx: ScenarioContextState,
  ev: DomainEvent
): ScenarioContextState {
  const next: ScenarioContextState = {
    ...ctx,
    atoms: ctx.atoms,
    norms: ctx.norms,
    activePhase: ctx.activePhase,
    phaseHistory: ctx.phaseHistory,
    sceneMetrics: { ...ctx.sceneMetrics },
  };

  // 1) счётчики
  next.sceneMetrics.events_total =
    (next.sceneMetrics.events_total ?? 0) + 1;

  const valence = typeof ev.polarity === 'number' ? ev.polarity : 0;
  const intensity = typeof ev.intensity === 'number' ? ev.intensity : 0.5;

  // 2) грубая оценка "угрозы": отрицательные и интенсивные события
  if (ev.tags?.includes("threat")) {
    next.sceneMetrics.threat_level = Math.min(1, Math.max(0,
      (next.sceneMetrics.threat_level ?? 0) + ev.intensity * (ev.polarity > 0 ? -1 : 1) * 0.2 // Negative polarity increases threat
    ));
  } else {
    // Default fallback if no tag but high negative intensity?
    // Keep legacy logic just in case
    const threatDelta = Math.max(0, -valence) * intensity;
     next.sceneMetrics.threat_level = Math.min(1, Math.max(0,
      (next.sceneMetrics.threat_level ?? 0) + threatDelta
    ));
  }

  // 3) грубая оценка "соц. напряжения": отрицательные события между агентами
  const hasDyad = !!(ev.actorId && ev.targetId && ev.actorId !== ev.targetId);
  if (hasDyad && valence < 0) {
    const tensionDelta = Math.abs(valence) * intensity;
    next.sceneMetrics.social_tension =
      (next.sceneMetrics.social_tension ?? 0) + tensionDelta;
  }
  
  if (ev.tags?.includes("support") || ev.tags?.includes("cooperate")) {
    next.sceneMetrics.cooperation = Math.min(1, Math.max(0,
      (next.sceneMetrics.cooperation ?? 0) + ev.intensity * Math.abs(ev.polarity) * 0.2
    ));
  }

  if (ev.tags?.includes("disobey") || ev.tags?.includes("mutiny")) {
    next.sceneMetrics.disobedience_count =
      (next.sceneMetrics.disobedience_count ?? 0) + 1;
  }

  // 4) добавим простой факт "actor совершил действие domain" для последующего анализа
  const now = ev.t;
  if (ev.actorId && ev.tags?.includes("action")) {
    addSimpleFact(
        next.atoms,
        now,
        'did_action',
        {
          domain: ev.domain,
          tags: ev.tags ?? [],
        },
        0.8,
        ev.actorId,
        ev.targetId,
        ev.actorId
    );
  }
  
  if (ev.tags?.includes("norm_violation") && ev.actorId) {
    addSimpleFact(
        next.atoms,
        now,
        'violated_norm',
        { norm: 'generic' },
        1.0,
        ev.actorId
    );
  }

  // 5) если событие привязано к локации — добавим факт "actor был в location"
  if (ev.locationId) {
    next.atoms = addSimpleFact(
      next.atoms,
      now,
      'at_location',
      ev.locationId,
      0.9,
      ev.actorId,
      undefined,
      undefined
    );
  }

  return next;
}

/**
 * Высокоуровневый апдейтер: применить набор доменных событий тика к WorldState,
 * обновляя только ScenarioContextState (пока без влияния на тело/соц/ToM).
 */
export function applyDomainEventsToWorldContext(
  world: WorldState,
  events: DomainEvent[]
): WorldState {
  if (events.length === 0) return world;

  const now: StoryTime = world.tick;
  const baseCtx =
    world.scenarioContext ?? initScenarioContext(now);

  let ctx = baseCtx;
  for (const ev of events) {
    ctx = applyDomainEventToContext(ctx, ev);
  }

  return {
    ...world,
    scenarioContext: ctx,
  };
}
