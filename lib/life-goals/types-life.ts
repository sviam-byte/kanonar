
// lib/life-goals/types-life.ts
import type { GoalDomainId, GoalDomainWeight } from '../types-goals';

export type LifeGoalId =
  | 'protect_lives'
  | 'maintain_order'
  | 'seek_status'
  | 'preserve_autonomy'
  | 'serve_authority'
  | 'pursue_truth'
  | 'maintain_bonds'
  | 'seek_comfort'
  | 'self_transcendence'
  | 'accumulate_resources'
  | 'other';

export type LifeGoalVector = Partial<Record<LifeGoalId, number>>; // 0..1

export interface LifeGoalDef {
  id: LifeGoalId;
  label: string;
  // Mapping of life goal to goal domains for the contextual engine
  domains: GoalDomainWeight[];
}
