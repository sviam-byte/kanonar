import type { Condition } from '../../ontology/conditions';
import type { AppraisalView, GoalEvalContext, RecentEventView } from '../../goals/specs/evalTypes';

export type IntentFamily =
  | 'movement'
  | 'communication'
  | 'care'
  | 'epistemic'
  | 'conflict'
  | 'self_regulation'
  | 'coordination';

export type IntentPriorityRule =
  | {
      kind: 'constant';
      value: number;
    }
  | {
      kind: 'weighted_metric';
      metric: string;
      weight: number;
      clamp?: [number, number];
    }
  | {
      kind: 'weighted_appraisal';
      tag: string;
      weight: number;
      clamp?: [number, number];
    }
  | {
      kind: 'weighted_goal';
      goalId: string;
      weight: number;
      clamp?: [number, number];
    };

export interface IntentSpecV1 {
  id: string;
  family: IntentFamily;

  label: string;
  description: string;

  targeting:
    | 'self'
    | 'other'
    | 'optional_other'
    | 'group'
    | 'location';

  sourceGoals: string[];

  preconditions: Condition[];
  blockers: Condition[];

  priorityBase: number;
  priorityRules: IntentPriorityRule[];

  groundingHints?: string[];

  dialogueAct?: string;
  desiredEffect?: string;

  tags?: string[];
}

export interface IntentEvalContext extends GoalEvalContext {
  recentEvents: RecentEventView[];
  appraisals: AppraisalView[];
  goalPressures: Record<string, number>;
}

export interface DerivedIntentCandidateV1 {
  intentId: string;
  family: IntentFamily;
  score: number;
  sourceGoalIds: string[];
  targetId?: string;
  reasons: string[];
  groundingHints: string[];
  dialogueAct?: string;
  desiredEffect?: string;
  tags?: string[];
}
