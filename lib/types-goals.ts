
import { GoalDomainId as LegacyGoalDomainId } from '../types';

export type ScenarioKind =
  | 'strategic_council'
  | 'fight_escape'
  | 'patrol'
  | 'interrogation'
  | 'domestic_scene'
  | 'ritual'
  | 'private_scene'
  | 'other';

export interface SituationContext {
  scenarioKind: ScenarioKind;
  stage: string;            // Sub-phase of scenario
  threatLevel: number;      // 0..1
  timePressure: number;     // 0..1
  woundedPresent: number;   // 0..1
  leaderPresent: boolean;
  isFormal: boolean;
  isPrivate: boolean;
  crowdSize: number;        // How many agents present
  roleId: string;           // Role of the agent in the scene
  z: Record<string, number>; // Extra context params
}

export type GoalDomainId = LegacyGoalDomainId;

export interface GoalDomainWeight {
  domain: GoalDomainId;
  weight: number; // α_{j,d}
}

// Extended Goal Definition for the Planner
export interface PlanningGoalDef {
  id: string;
  label: string;
  domains: GoalDomainWeight[];
  deficitWeight: number; // γ_j
  baseValue?: number;
  // Maps to legacy structures if needed
  legacyId?: string;
}

export interface GoalPlanningResult {
  priorities: number[];
  alpha: number[];
  debug: any;
}
