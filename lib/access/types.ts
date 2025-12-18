
export type AccessKind =
  | 'enter_location'
  | 'open_door'
  | 'command'
  | 'arrest'
  | 'use_weapon';

export type AccessDecision = {
  kind: AccessKind;
  allowed: boolean;
  score: number; // 0..1 allowance strength
  reason: string;
  usedAtomIds: string[];
};
