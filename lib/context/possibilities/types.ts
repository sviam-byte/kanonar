
export type PossibilityKind = 'affordance' | 'constraint' | 'offer' | 'exit';

export type Possibility = {
  id: string; // stable: aff:hide, con:noViolence, off:npc:help, exit:A
  kind: PossibilityKind;
  actionId: string; // action id for cost model: hide/talk/escape/etc
  label: string;
  targetId?: string; // e.g. talk:targetId
  magnitude: number; // 0..1 availability/strength
  enabled: boolean;
  
  // NEW
  costAtomId?: string; // cost:* id
  cost?: number; // cached scalar 0..1 (optional)
  whyAtomIds?: string[];
  blockedBy?: string[]; // con ids
  tags?: string[];
};
