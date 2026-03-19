// lib/simkit/core/simulatorScenario.ts
// Optional scenario wiring for SimKitSimulator: PhaseManager + TriggerEngine.

import type { SimKitSimulator } from './simulator';
import { PhaseManager, type PhaseSpec } from '../scenario/phaseManager';
import { TriggerEngine, type TriggerSpec, type DegradationRule } from '../scenario/triggerEngine';

export type ScenarioAttachment = {
  phases: PhaseManager;
  triggers: TriggerEngine;
};

export type ScenarioConfig = {
  phases?: PhaseSpec[];
  triggers?: TriggerSpec[];
  degradation?: DegradationRule[];
};

const ATTACH_KEY = '__scenario_attachment';

/**
 * Prepend scenario plugin so it runs before regular decider plugins.
 */
export function attachScenario(sim: SimKitSimulator, config: ScenarioConfig): ScenarioAttachment {
  const phases = new PhaseManager(config.phases || []);
  const triggers = new TriggerEngine(config.triggers || [], config.degradation || []);

  const attachment: ScenarioAttachment = { phases, triggers };
  (sim as any)[ATTACH_KEY] = attachment;

  const initial = phases.current;
  (sim.world.facts as any)['scenario:phase'] = initial.id;
  (sim.world.facts as any)['scenario:phaseLabel'] = initial.label;
  phases.applyGoalOverrides(sim.world);

  const scenarioPlugin = {
    id: 'plugin:scenario',
    decideActions: ({ world }: any) => {
      const injectedEvents = triggers.evaluate(world);
      if (injectedEvents.length) {
        world.events = [...(world.events || []), ...injectedEvents];
      }

      triggers.applyDegradation(world);

      const transition = phases.check(world);
      if (transition) {
        phases.applyGoalOverrides(world);
        (world.facts as any)['scenario:lastTransition'] = transition;
      }

      // This plugin only mutates world/events; does not pick actions.
      return null;
    },
  };

  sim.cfg.plugins = [scenarioPlugin as any, ...(sim.cfg.plugins || [])];

  return attachment;
}

export function getScenarioAttachment(sim: SimKitSimulator): ScenarioAttachment | null {
  return ((sim as any)[ATTACH_KEY] ?? null) as ScenarioAttachment | null;
}
