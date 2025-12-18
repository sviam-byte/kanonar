
// lib/events/factory.ts

import type {
  Event,
  EventKind,
  EventChannel,
  EventEffects,
  EventEpistemics,
  EventCheck,
  ActionEvent,
  InteractionEvent,
  PerceptionEvent,
  SceneTransitionEvent,
} from "./types";
import type {
  EventID,
  AgentID,
  LocationID,
  ObjectID,
  GoalTag,
  FactID,
} from "../location/types";

// Внешние зависимости фабрики
export interface EventFactoryDeps {
  makeId: () => EventID;
  now: () => number;
  schemaVersion: number;
  defaultChannel?: EventChannel;
}

export interface MakeBaseEventParams {
  kind: EventKind;
  channel?: EventChannel;

  locationId?: LocationID | null;
  zoneId?: string;
  position?: { x: number; y: number; z?: number };

  actors?: AgentID[];
  targets?: AgentID[];
  objects?: ObjectID[];

  tags?: string[];
  facts?: FactID[];
  goalTags?: GoalTag[];

  effects?: Partial<EventEffects>;
  epistemics?: Partial<EventEpistemics>;

  sceneId?: string;
  aggregateId?: string;
  triggeredBy?: string;
  transition?: { from?: string; to?: string };

  check?: EventCheck;

  importance?: number;
  priority?: number;
  orderKey?: string;

  payload?: Record<string, unknown>;
}

export function createEventFactory(deps: EventFactoryDeps) {
  const {
    makeId,
    now,
    schemaVersion,
    defaultChannel = "world",
  } = deps;

  const makeBase = (params: MakeBaseEventParams): Event => {
    const timestamp = now();
    const id = makeId();

    const effects: EventEffects = {
      worldDelta: params.effects?.worldDelta ?? {},
      stateDelta: params.effects?.stateDelta ?? {},
      goalDelta: params.effects?.goalDelta ?? {},
      tensionDelta: params.effects?.tensionDelta ?? 0,
    };

    const epistemics: EventEpistemics = {
      witnesses: params.epistemics?.witnesses ?? [],
      visibility: params.epistemics?.visibility ?? 1,
      beliefByAgent: params.epistemics?.beliefByAgent,
    };

    return {
      id,
      kind: params.kind,
      channel: params.channel ?? defaultChannel,
      schemaVersion,

      timestamp,

      locationId:
        params.locationId === undefined ? null : params.locationId,
      zoneId: params.zoneId,
      position: params.position,

      actors: params.actors ?? [],
      targets: params.targets ?? [],
      objects: params.objects,

      affordanceId: undefined,
      normsViolated: [],
      normsSatisfied: [],

      tags: params.tags ?? [],
      facts: params.facts ?? [],
      goalTags: params.goalTags ?? [],

      effects,
      epistemics,

      sceneId: params.sceneId,
      aggregateId: params.aggregateId,
      triggeredBy: params.triggeredBy,
      transition: params.transition,

      check: params.check,

      causedBy: [],
      causes: [],
      importance: params.importance ?? 0.5,

      lifecycleStage: "planned",
      status: "hypothetical",
      validationStatus: "unchecked",
      validationErrors: [],

      priority: params.priority ?? 0,
      orderKey:
        params.orderKey ?? `${timestamp.toString().padStart(12, "0")}`,

      randomSeed: undefined,
      randomInputs: {},

      isAtomic: true,

      payload: params.payload ?? {},
    };
  };

  const makeAction = (params: {
    locationId: LocationID;
    actors: [AgentID, ...AgentID[]];
    affordanceId: string;
    targets?: AgentID[];
    objects?: ObjectID[];
    tags?: string[];
    facts?: FactID[];
    goalTags?: GoalTag[];
    check?: EventCheck;
    effects?: Partial<EventEffects>;
    payload?: Record<string, unknown>;
  }): ActionEvent => {
    const base = makeBase({
      kind: "action",
      locationId: params.locationId,
      actors: params.actors,
      targets: params.targets ?? [],
      objects: params.objects,
      tags: params.tags,
      facts: params.facts,
      goalTags: params.goalTags,
      check: params.check,
      effects: params.effects,
      payload: params.payload,
    });

    return {
      ...base,
      kind: "action",
      affordanceId: params.affordanceId,
      locationId: params.locationId,
      actors: params.actors,
    };
  };

  const makeInteraction = (params: {
    actors: [AgentID, ...AgentID[]];
    targets: [AgentID, ...AgentID[]];
    locationId?: LocationID | null;
    tags?: string[];
    facts?: FactID[];
    goalTags?: GoalTag[];
    check?: EventCheck;
    effects?: Partial<EventEffects>;
    payload?: Record<string, unknown>;
  }): InteractionEvent => {
    const base = makeBase({
      kind: "interaction",
      locationId:
        params.locationId === undefined ? null : params.locationId,
      actors: params.actors,
      targets: params.targets,
      tags: params.tags,
      facts: params.facts,
      goalTags: params.goalTags,
      check: params.check,
      effects: params.effects,
      payload: params.payload,
    });

    return {
      ...base,
      kind: "interaction",
      actors: params.actors,
      targets: params.targets,
    };
  };

  const makePerception = (params: {
    observer: AgentID;
    observedEventId: EventID;
    locationId?: LocationID | null;
    visibility?: number;
    confidence?: number;
    interpretationTag?: string;
  }): PerceptionEvent => {
    const base = makeBase({
      kind: "perception",
      locationId:
        params.locationId === undefined ? null : params.locationId,
      actors: [params.observer],
      effects: {},
      epistemics: {
        witnesses: [params.observer],
        visibility: params.visibility ?? 1,
        beliefByAgent: {
          [params.observer]: {
            seen: true,
            confidence: params.confidence ?? 1,
            interpretationTag: params.interpretationTag,
          },
        },
      },
      payload: {
        observedEventId: params.observedEventId,
      },
    });

    return {
      ...base,
      kind: "perception",
      actors: [params.observer],
      payload: {
        observedEventId: params.observedEventId,
      },
    };
  };

  const makeSceneTransition = (params: {
    sceneId: string;
    transition: { from?: string; to?: string };
    tags?: string[];
    importance?: number;
  }): SceneTransitionEvent => {
    const base = makeBase({
      kind: "scene_transition",
      locationId: null,
      tags: params.tags,
      importance: params.importance ?? 1,
      sceneId: params.sceneId,
      transition: params.transition,
      effects: {},
      payload: {},
    });

    return {
      ...base,
      kind: "scene_transition",
      sceneId: params.sceneId,
      transition: params.transition,
    };
  };

  return {
    makeBase,
    makeAction,
    makeInteraction,
    makePerception,
    makeSceneTransition,
  };
}

export type EventFactory = ReturnType<typeof createEventFactory>;
