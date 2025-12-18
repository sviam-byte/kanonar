
// lib/social/tuning.ts

export const TRUST_ALPHA = 0.05;        // Trust inertia
export const GOAL_ALPHA  = 0.03;        // ToM goal inertia

// Weights for Q-value components
export const Q_WEIGHTS = {
  goals: 0.35,
  scenario: 1.0,
  relations: 0.25,
  procedure: 0.25,
  faction: 0.25,
  risk: 0.2, // Added risk weight
};

// Maximum amplitude limits for normalization before weighting
export const Q_LIMITS: Record<string, [number, number]> = {
  goals: [-0.5, 0.5],
  scenario: [0, 3],
  relations: [-0.25, 0.25],
  procedure: [-0.25, 0.25],
  faction: [-0.3, 0.3],
  risk: [-0.5, 0.5],
};

// Event intensity mapping
export const EVENT_INTENSITY = {
  soft: 0.2,   // Observe, Talk
  medium: 0.5, // Argue, Refuse
  hard: 1.0,   // Attack, Betray
};

// Leadership inertia constants
export const LEADER_MOMENTUM = 0.9;
export const LEADER_SWITCH_THRESHOLD = 0.15;
export const LEADER_MIN_TICKS_TO_SWITCH = 3;
export const FACTION_LEADER_DEFAULT_INERTIA = 0.5;
