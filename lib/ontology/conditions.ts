/**
 * Canonical condition language for GoalSpecV1.
 *
 * This module intentionally contains only declarative types so the same DSL can be reused
 * by Goal Lab, Dialogue planners, inspectors, and migration tooling.
 */
export type NumericMetric =
  | 'self_stress'
  | 'self_fatigue'
  | 'self_health'
  | 'target_stress'
  | 'target_fatigue'
  | 'target_health'
  | 'trust'
  | 'closeness'
  | 'authority'
  | 'dependency'
  | 'distance'
  | 'hazard'
  | 'uncertainty'
  | 'utility_of_target';

export type CompareOp = '>' | '>=' | '<' | '<=' | '==' | '!=';

export type Condition =
  | {
      kind: 'recent_event';
      eventKinds: string[];
      maxAge: number;
      minSalience?: number;
      observer?: 'self' | 'any';
      targetRole?: 'self' | 'target' | 'any';
    }
  | {
      kind: 'appraisal_tag';
      tags: string[];
      minScore?: number;
      targetRole?: 'self' | 'target' | 'any';
    }
  | {
      kind: 'metric';
      metric: NumericMetric;
      op: CompareOp;
      value: number;
    }
  | {
      kind: 'belief';
      atomIds: string[];
      mode: 'all' | 'any';
    }
  | {
      kind: 'capability';
      capabilityIds: string[];
      mode: 'all' | 'any';
    }
  | {
      kind: 'cooldown_ready';
      actionIds: string[];
    }
  | {
      kind: 'not_repeated';
      actionIds: string[];
      horizon: number;
      maxCount: number;
    }
  | {
      kind: 'target_exists';
    }
  | {
      kind: 'target_reachable';
      maxDistance?: number;
    }
  | {
      kind: 'target_communicable';
      maxDistance?: number;
    }
  | {
      kind: 'instrumental_need';
      minValue: number;
    }
  | {
      kind: 'all';
      conditions: Condition[];
    }
  | {
      kind: 'any';
      conditions: Condition[];
    }
  | {
      kind: 'not';
      condition: Condition;
    };
