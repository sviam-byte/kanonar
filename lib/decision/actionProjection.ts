/**
 * Shared projection constants used by both the decision layer (deltaGoals fallback)
 * and the lookahead layer (V* value function).
 *
 * Single source of truth: if you add a goal domain or feature, update HERE.
 */

export type FeatureKeyLite =
  | 'threat' | 'escape' | 'cover' | 'visibility'
  | 'socialTrust' | 'emotionValence'
  | 'resourceAccess' | 'scarcity' | 'fatigue' | 'stress';

/** Feature→Goal projection: how each feature contributes to each goal domain. */
export const FEATURE_GOAL_PROJECTION_KEYS: Record<string, Partial<Record<FeatureKeyLite, number>>> = {
  survival: { threat: -1.0, escape: 0.6, cover: 0.5, fatigue: -0.3, stress: -0.3 },
  safety: { threat: -0.9, cover: 0.4, visibility: -0.3, escape: 0.3 },
  social: { socialTrust: 0.8, emotionValence: 0.4, visibility: 0.2 },
  resource: { resourceAccess: 0.7, scarcity: -0.6 },
  autonomy: { escape: 0.5, cover: 0.3, visibility: -0.2 },
  wellbeing: { fatigue: -0.5, stress: -0.5, emotionValence: 0.4, socialTrust: 0.2 },
  // Дополнительные goal-домены для большей разницы между действиями.
  affiliation: { socialTrust: 0.7, emotionValence: 0.5, stress: -0.2 },
  control: { threat: -0.4, escape: 0.3, visibility: 0.3, stress: -0.3 },
  status: { visibility: 0.5, socialTrust: 0.3, emotionValence: 0.2 },
  exploration: { escape: 0.3, resourceAccess: 0.3, visibility: 0.2, fatigue: -0.2 },
  order: { threat: -0.3, stress: -0.4, socialTrust: 0.3 },
  rest: { fatigue: -0.8, stress: -0.5, emotionValence: 0.2 },
  wealth: { resourceAccess: 0.9, scarcity: -0.7 },
};

/**
 * Base action effect table: expected feature-level deltas per action kind.
 * Mirrors the table in lookahead.ts but is importable by the decision layer.
 */
const BASE_EFFECTS: Record<string, Partial<Record<FeatureKeyLite, number>>> = {
  hide: { threat: -0.08, visibility: -0.12, cover: +0.05, fatigue: +0.02 },
  escape: { escape: +0.18, threat: +0.03, fatigue: +0.06, stress: +0.03 },
  wait: { fatigue: -0.02, stress: -0.02, threat: +0.02 },
  rest: { fatigue: -0.05, stress: -0.03 },
  approach: { threat: +0.05, escape: -0.06, stress: +0.03 },
  negotiate: { threat: -0.03, stress: -0.02, socialTrust: +0.06, emotionValence: +0.03 },
  help: { stress: -0.03, fatigue: +0.03, socialTrust: +0.08, emotionValence: +0.05 },
  attack: { threat: -0.02, stress: +0.05, fatigue: +0.06, visibility: +0.08 },
  confront: { threat: +0.04, stress: +0.04, socialTrust: -0.06, emotionValence: -0.03, visibility: +0.06 },
  npc: { stress: -0.01, socialTrust: +0.03, emotionValence: +0.02 },
  loot: { resourceAccess: +0.08, scarcity: -0.04, threat: +0.03, fatigue: +0.04, socialTrust: -0.05 },
  betray: { socialTrust: -0.15, emotionValence: -0.08, stress: +0.04, threat: +0.06 },
  persuade: { socialTrust: +0.04, emotionValence: +0.02, stress: +0.01 },
  cooperate: { socialTrust: +0.10, emotionValence: +0.06, stress: -0.02, fatigue: +0.01 },
  submit: { stress: -0.03, socialTrust: +0.02, emotionValence: -0.04, escape: -0.04 },
  threaten: { threat: +0.06, stress: +0.05, socialTrust: -0.10, visibility: +0.08 },
  observe: { threat: -0.02, stress: -0.01, visibility: -0.04 },
  protect: { threat: -0.04, socialTrust: +0.06, emotionValence: +0.04, fatigue: +0.03 },
};

const PATTERN_MAP: Array<[RegExp, string]> = [
  [/hide/, 'hide'],
  [/escape|run|flee/, 'escape'],
  [/wait|idle/, 'wait'],
  [/rest|sleep/, 'rest'],
  [/approach|move/, 'approach'],
  [/talk|negot|ask|persuade/, 'negotiate'],
  [/help|assist|save|cooperate/, 'help'],
  [/attack|fight|shoot/, 'attack'],
  [/confront|challenge|demand|accuse/, 'confront'],
  [/npc|generic|default/, 'npc'],
  [/loot|take|steal/, 'loot'],
  [/betray/, 'betray'],
  [/submit|comply|obey|surrender/, 'submit'],
  [/threaten|intimidate/, 'threaten'],
  [/observe|watch|scout|scan/, 'observe'],
  [/protect|defend|guard|shield/, 'protect'],
];

/**
 * Return the base feature-level effect for an action kind.
 * Uses exact match first, then pattern fallback, then empty.
 */
export function actionEffectForKind(kindRaw: string): Partial<Record<FeatureKeyLite, number>> {
  const kind = String(kindRaw || '').toLowerCase();
  if (BASE_EFFECTS[kind]) return BASE_EFFECTS[kind];
  for (const [re, key] of PATTERN_MAP) {
    if (re.test(kind)) return BASE_EFFECTS[key] ?? {};
  }
  return {};
}
