
import {
  WorldState,
  ActionRequest,
  ConsequenceBundle,
  DomainEvent,
  ScenarioPhaseRule,
  ScenarioContextState,
} from '../../types';
import {
  initScenarioContext,
  applyDomainEventsToWorldContext,
} from '../context/contextEngine';
import { resolveActionRequest } from './actionResolution';
import { applyPhaseRules } from './phaseMachine';

export interface ScenarioStepInput {
  world: WorldState;
  actions: ActionRequest[];
  externalDomainEvents?: DomainEvent[];
  phaseRules?: ScenarioPhaseRule[];
}

export interface ScenarioStepResult {
  world: WorldState;
  producedDomainEvents: DomainEvent[];
  bundles: ConsequenceBundle[];
}

/**
 * Выполнить один сценарный шаг:
 * 1) убедиться, что есть scenarioContext
 * 2) прогнать список действий через Action Resolution Engine
 * 3) собрать доменные события от действий + внешние события
 * 4) обновить ScenarioContext через contextEngine
 * 5) обновить фазу сценария через phaseMachine
 */
export function applyScenarioStep(
  input: ScenarioStepInput
): ScenarioStepResult {
  const { world: world0, actions, externalDomainEvents = [], phaseRules = [] } =
    input;

  const baseCtx: ScenarioContextState =
    world0.scenarioContext ?? initScenarioContext(world0.tick);

  const bundles: ConsequenceBundle[] = [];
  const actionDomainEvents: DomainEvent[] = [];

  // 2) Разрешаем действия (пока без сложного взаимодействия между ними)
  for (const action of actions) {
    const { bundle } = resolveActionRequest(world0, baseCtx, action);
    bundles.push(bundle);
    actionDomainEvents.push(...bundle.domainEvents);
  }

  // 3) Собираем все доменные события
  const allDomainEvents: DomainEvent[] = [
    ...externalDomainEvents,
    ...actionDomainEvents,
  ];

  // 4) Обновляем контекст через contextEngine
  const world1 = applyDomainEventsToWorldContext(world0, allDomainEvents);

  // 5) Обновляем фазу через phaseMachine (если есть правила)
  let world2 = world1;
  if (phaseRules.length > 0 && world1.scenarioContext) {
    const updatedCtx = applyPhaseRules(
      world1.scenarioContext,
      world1,
      phaseRules
    );
    world2 = {
      ...world1,
      scenarioContext: updatedCtx,
    };
  }

  return {
    world: world2,
    producedDomainEvents: allDomainEvents,
    bundles,
  };
}
