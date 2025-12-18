
import { ContextAtom } from '../context/v2/types';

export type SceneMetricId =
  | 'crowd'
  | 'hostility'
  | 'chaos'
  | 'urgency'
  | 'scarcity'
  | 'loss'
  | 'novelty'
  | 'resourceAccess';

export type SceneNormId =
  | 'publicExposure'
  | 'privacy'
  | 'surveillance'
  | 'normPressure'
  | 'proceduralStrict';

export type SceneMetrics = Record<SceneMetricId, number>; // 0..1
export type SceneNorms = Record<SceneNormId, number>;     // 0..1

export type SceneAtomInjection = {
  id: string;               // fully-qualified atom id
  ns: 'scene' | 'norm' | 'off' | 'con' | 'event';
  kind: string;             // engine-facing atom kind
  magnitude: number;        // 0..1
  confidence?: number;      // default 1
  subject?: string;
  target?: string;
  tags?: string[];
  label?: string;
  meta?: Record<string, any>;
  // gating
  when?: {
    minTickInPhase?: number;
    requireAtomIds?: string[];
  };
};

export type ScenePhase = {
  id: string;
  label: string;
  minDurationTicks?: number;
  injections?: SceneAtomInjection[];
  transitions?: Array<{
    to: string;
    // condition language MVP: compare atom magnitude
    when?: Array<{
      atomId: string;
      op: '>=' | '>' | '<=' | '<';
      value: number;
    }>;
    // optional: timer condition
    afterTicksInPhase?: number;
  }>;
};

export type ScenePreset = {
  schemaVersion: number;
  presetId: string;
  title: string;
  description?: string;

  defaultMetrics: Partial<SceneMetrics>;
  defaultNorms: Partial<SceneNorms>;

  phases: ScenePhase[];
  entryPhaseId: string;

  // global injections always active while scene active
  globalInjections?: SceneAtomInjection[];
};

export type SceneInstance = {
  schemaVersion: number;
  sceneId: string;
  presetId: string;

  startedAtTick: number;
  tick: number;

  phaseId: string;
  phaseEnteredAtTick: number;

  participants: string[];   // agentIds
  locationId?: string;

  metrics: SceneMetrics;    // 0..1
  norms: SceneNorms;        // 0..1

  // manual overrides from GoalLab
  manualInjections?: SceneAtomInjection[];

  // for debugging
  lastTransition?: { from: string; to: string; tick: number; reason: string } | null;
};

export type SceneSnapshot = {
  presetId: string;
  activeWorldInjections: ContextAtom[];
  activeBeliefInjections: ContextAtom[];
};
