
export type CostVector = {
  time: number;   // 0..1
  energy: number; // 0..1
  social: number; // 0..1
  risk: number;   // 0..1 (immediate action risk)
  moral: number;  // 0..1
};

export type ActionId =
  | 'move'
  | 'hide'
  | 'escape'
  | 'talk'
  | 'attack'
  | 'help'
  | 'share_secret'
  | 'obey'
  | 'disobey';

export type ActionCost = {
  actionId: ActionId;
  targetId?: string;
  cost: CostVector;
  total: number; // 0..1 scalarized
  explain?: Record<string, any>;
};
