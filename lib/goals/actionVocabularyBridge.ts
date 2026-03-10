/**
 * Goal↔Action Vocabulary Bridge
 *
 * PROBLEM: GOAL_DEFS.allowedActions uses domain-specific verbs (reassure, share_information,
 * triage_wounded) while the Possibilities registry (defs.ts) uses abstract keys
 * (help, talk, treat). Out of ~45 unique actions in GOAL_DEFS, only 5 overlap
 * with the ~35 possibility keys. This means deriveGoalActionLinkAtoms generates
 * hint atoms that buildDeltaGoals never finds → the entire explicit goal→action
 * path is dead.
 *
 * SOLUTION: Map every GOAL_DEFS action key to one or more canonical possibility keys.
 * deriveGoalActionLinkAtoms emits hint atoms for BOTH the original key AND
 * the mapped possibility key(s).
 *
 * MAINTENANCE: When adding new GOAL_DEFS actions or new possibility defs, update this map.
 */

const GOAL_TO_POSSIBILITY: Record<string, string[]> = {
  // Social / care
  reassure: ['comfort', 'talk'],
  share_information: ['share', 'talk'],
  share_personal_belief: ['talk', 'share'],
  seek_comfort: ['comfort', 'talk'],
  introduce: ['talk'],
  ask_status: ['ask_info', 'talk'],
  ask_question: ['ask_info'],
  seek_information: ['ask_info', 'investigate'],

  // Leadership / discipline
  acknowledge_order: ['talk', 'wait'],
  issue_order: ['command'],
  follow_order: ['wait'],
  enforce_order: ['command', 'confront'],
  support_leader: ['talk', 'praise'],
  challenge_leader: ['confront', 'accuse'],
  refuse_order: ['confront'],
  assert_autonomy: ['confront'],

  // Care / medical
  help_wounded: ['help', 'treat'],
  triage_wounded: ['treat', 'help'],
  evacuate_wounded: ['escort', 'help'],
  self_treat: ['treat', 'rest'],
  aid_ally: ['help'],
  protect_other: ['guard', 'help'],
  protect_others: ['guard', 'help'],
  protect_exit: ['guard'],
  sacrifice_self: ['help', 'guard'],

  // Movement / exploration
  search_route: ['investigate', 'observe_area'],
  search_exit_alone: ['escape', 'investigate'],
  retreat: ['escape'],
  clear_debris: ['help'],
  scavenge: ['propose_trade', 'share_resource'],

  // Social manipulation
  persuade: ['negotiate', 'talk'],
  deceive: ['talk', 'deceive'],
  betray: ['betray'],
  loot: ['loot'],
  submit: ['submit'],
  intimidate: ['threaten'],
  sow_dissent: ['talk', 'accuse'],
  blame_other: ['accuse'],
  form_subgroup: ['talk', 'signal'],
  maintain_cohesion: ['talk', 'comfort'],
  hoard: ['share_resource'],
  meditate: ['rest', 'self_talk'],

  // Identity-mapped keys that need possibility-specific variants.
  // Without these, GOAL_DEFS `observe` generates hint atoms for 'observe',
  // but the actual possibility keys are 'observe_area' and 'observe_target'.
  observe: ['observe_area', 'observe_target'],
  attack: ['attack'],
  hide: ['hide'],
  rest: ['rest'],
  wait: ['wait'],
};

/**
 * Given a GOAL_DEFS allowedAction key, return the canonical possibility keys
 * that should ALSO receive goal:hint:allow:* atoms.
 *
 * Always includes the original key (so exact matches still work).
 */
export function mapGoalActionToPossibilityKeys(goalAction: string): string[] {
  const key = String(goalAction || '').trim();
  if (!key) return [];

  const mapped = GOAL_TO_POSSIBILITY[key];
  if (!mapped || !mapped.length) return [key];

  const set = new Set([key, ...mapped]);
  return Array.from(set);
}
