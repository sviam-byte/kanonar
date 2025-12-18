import { GoalDomainWeight } from './types-goals';

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

export type LifeGoalVector = Partial<Record<LifeGoalId, number>>;

export interface LifeGoalDef {
  id: LifeGoalId;
  label: string;
  domains: GoalDomainWeight[]; // Maps life goal to specific domains (e.g. protect_lives -> survival, care)
}
