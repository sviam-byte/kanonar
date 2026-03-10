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
  // Aggressive actions should explicitly include social trust penalty for comparability.
  attack: { threat: -0.02, stress: +0.05, fatigue: +0.06, visibility: +0.08, socialTrust: -0.05 },
  confront: { threat: +0.04, stress: +0.04, socialTrust: -0.06, emotionValence: -0.03, visibility: +0.06 },
  npc: { stress: -0.01, socialTrust: +0.03, emotionValence: +0.02 },
  loot: { resourceAccess: +0.08, scarcity: -0.04, threat: +0.03, fatigue: +0.04, socialTrust: -0.05 },
  betray: { socialTrust: -0.15, emotionValence: -0.08, stress: +0.04, threat: +0.06 },
  persuade: { socialTrust: +0.04, emotionValence: +0.02, stress: +0.01 },
  cooperate: { socialTrust: +0.10, emotionValence: +0.06, stress: -0.02, fatigue: +0.01 },
  submit: { stress: -0.03, socialTrust: +0.02, emotionValence: -0.04, escape: -0.04 },
  threaten: { threat: +0.06, stress: +0.05, socialTrust: -0.10, visibility: +0.08 },
  observe: { threat: -0.02, stress: -0.01, visibility: -0.04 },
  // Cognitive actions are intentionally low-magnitude but non-zero to keep
  // reflective behaviors viable in ambiguous or socially sensitive contexts.
  monologue: { stress: -0.04, fatigue: +0.01 },
  verify: { stress: +0.01, socialTrust: +0.03 },
  protect: { threat: -0.04, socialTrust: +0.06, emotionValence: +0.04, fatigue: +0.03 },
  // ── Social actions (from possibilities/defs.ts) ──
  talk: { socialTrust: +0.03, emotionValence: +0.02, stress: -0.01 },
  ask_info: { socialTrust: +0.02, stress: +0.01, emotionValence: +0.01 },
  comfort: { emotionValence: +0.06, socialTrust: +0.05, stress: -0.04 },
  apologize: { socialTrust: +0.04, emotionValence: +0.03, stress: -0.02, visibility: +0.02 },
  praise: { socialTrust: +0.06, emotionValence: +0.04 },
  accuse: { socialTrust: -0.08, stress: +0.04, emotionValence: -0.04, visibility: +0.06 },
  command: { socialTrust: -0.02, stress: +0.02, visibility: +0.06 },
  signal: { socialTrust: +0.02, visibility: +0.02 },
  share: { socialTrust: +0.04, emotionValence: +0.02, resourceAccess: +0.02 },
  share_resource: { socialTrust: +0.05, scarcity: -0.03, resourceAccess: +0.04 },
  // ── Targeted social actions ──
  guard: { threat: -0.06, socialTrust: +0.04, fatigue: +0.04, cover: +0.03 },
  escort: { threat: -0.04, socialTrust: +0.04, fatigue: +0.04, escape: +0.06 },
  treat: { fatigue: +0.03, socialTrust: +0.06, emotionValence: +0.04, stress: -0.02 },
  call_backup: { threat: -0.06, stress: +0.02, fatigue: +0.02 },
  // ── Cognitive / investigative ──
  investigate: { stress: +0.02, visibility: -0.04, socialTrust: +0.01 },
  observe_area: { threat: -0.02, stress: -0.01, visibility: -0.03 },
  observe_target: { stress: +0.01, visibility: -0.02, socialTrust: -0.01 },
  self_talk: { stress: -0.03, fatigue: +0.01 },
  // ── Trade / negotiation variants ──
  propose_trade: { resourceAccess: +0.05, scarcity: -0.04, socialTrust: +0.03 },
  trade: { resourceAccess: +0.05, scarcity: -0.04, socialTrust: +0.03 },
  // ── Conflict de-escalation ──
  avoid: { threat: -0.04, socialTrust: -0.03, escape: +0.06, stress: -0.02 },
  // ── Missing from possibilities but in GOAL_DEFS/bridge ──
  deceive: { socialTrust: -0.10, emotionValence: -0.03, stress: +0.03, visibility: -0.04 },
  recruit: { socialTrust: +0.06, emotionValence: +0.03, visibility: +0.04 },
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
  [/monologue|self.talk|think|reflect|plan/, 'monologue'],
  [/verify|check|confirm|validate/, 'verify'],
  [/protect|defend|guard|shield/, 'protect'],
  [/comfort|reassure|console|calm/, 'comfort'],
  [/praise|compliment|flatter/, 'praise'],
  [/apologize|sorry|atone/, 'apologize'],
  [/command|order|instruct|direct/, 'command'],
  [/accuse|blame|denounce/, 'accuse'],
  [/signal|gesture|beckon|wave/, 'signal'],
  [/share|give|distribute|donate/, 'share'],
  [/guard|sentry|watch_over|patrol/, 'guard'],
  [/escort|accompany|lead_to/, 'escort'],
  [/treat|heal|bandage|medic/, 'treat'],
  [/call_backup|radio|summon|alert/, 'call_backup'],
  [/investigate|search|probe|examine/, 'investigate'],
  [/trade|barter|exchange|swap/, 'trade'],
  [/avoid|evade|dodge|sidestep/, 'avoid'],
  [/deceive|lie|mislead|bluff/, 'deceive'],
  [/recruit|enlist|rally|mobilize/, 'recruit'],
  [/ask|inquire|question|query/, 'ask_info'],
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

/**
 * Action effect with context modulation.
 *
 * SINGLE SOURCE OF TRUTH for transition model.
 * Used by both decision layer (deltaGoals fallback) and lookahead (POMDP-lite).
 *
 * If `z` is provided, base effects are scaled by environmental features:
 * - hide: cover amplifies concealment, threat amplifies threat reduction
 * - escape: escape routes amplify effectiveness, fatigue reduces it
 * - attack: fatigue increases cost, threat increases payoff
 * - negotiate: low trust reduces trust gain effectiveness
 * - help: high trust → diminishing returns
 */
export function actionEffectWithContext(
  kindRaw: string,
  z?: Partial<Record<FeatureKeyLite, number>>,
): Partial<Record<FeatureKeyLite, number>> {
  const base = actionEffectForKind(kindRaw);
  if (!z || Object.keys(base).length === 0) return base;

  const out = { ...base };
  const kind = String(kindRaw || '').toLowerCase();
  const zz = z as Record<string, number>;
  const c = (k: string) => {
    const v = Number(zz[k] ?? 0);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  };

  if (/hide/.test(kind)) {
    out.cover = (out.cover ?? 0) * (0.6 + 0.8 * c('cover'));
    out.threat = (out.threat ?? 0) * (0.6 + 0.6 * c('threat'));
    out.visibility = (out.visibility ?? 0) * (0.6 + 0.6 * c('visibility'));
  } else if (/escape|run|flee/.test(kind)) {
    out.escape = (out.escape ?? 0) * (0.5 + 0.8 * c('escape')) * (1.1 - 0.3 * c('fatigue'));
  } else if (/attack|fight|shoot/.test(kind)) {
    out.fatigue = (out.fatigue ?? 0) * (0.7 + 0.6 * c('fatigue'));
    out.threat = (out.threat ?? 0) * (0.5 + 0.8 * c('threat'));
  } else if (/talk|negot|ask|persuade/.test(kind)) {
    out.socialTrust = (out.socialTrust ?? 0) * (0.4 + 0.8 * c('socialTrust'));
  } else if (/help|assist|save|cooperate/.test(kind)) {
    out.socialTrust = (out.socialTrust ?? 0) * (1.2 - 0.4 * c('socialTrust'));
  }

  return out;
}
