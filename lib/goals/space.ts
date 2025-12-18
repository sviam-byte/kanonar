
// /data/goals/space.ts
import { CharacterGoalId, SocialActionId, CharacterGoalDef, GoalId, ActionGoalLink } from '../../types';

export type { CharacterGoalId, SocialActionId, CharacterGoalDef, GoalId };

export const GOAL_DEFS: Record<CharacterGoalId, CharacterGoalDef> = {
  follow_order: {
    id: "follow_order",
    label_ru: "выполнить приказ",
    kind: "discipline",
    donatable: false,
    leaderBias: -0.2, // followers have this goal
    allowedActions: ["acknowledge_order", "wait", "share_information", "persuade"],
    domains: ["obedience", "leader_legitimacy"]
  },
  maintain_cohesion: {
    id: "maintain_cohesion",
    label_ru: "сохранить сплочённость",
    kind: "status",
    donatable: true,
    leaderBias: 0.6,
    allowedActions: ["reassure", "share_information", "share_personal_belief", "persuade", "introduce", "support_leader"],
    domains: ["group_cohesion", "attachment_care"]
  },
  maintain_legitimacy: {
    id: "maintain_legitimacy",
    label_ru: "сохранить легитимность",
    kind: "status",
    donatable: true,
    leaderBias: 0.5,
    allowedActions: ["share_personal_belief", "persuade", "share_information", "wait", "introduce", "issue_order"],
    domains: ["leader_legitimacy", "status"]
  },
  assert_autonomy: {
    id: "assert_autonomy",
    label_ru: "утвердить автономию",
    kind: "self",
    donatable: false,
    leaderBias: -0.8,
    allowedActions: ["refuse_order", "challenge_leader", "form_subgroup", "share_personal_belief", "persuade", "intimidate"],
    domains: ["autonomy", "status"]
  },
  protect_self: {
    id: "protect_self",
    label_ru: "самосохранение",
    kind: "self",
    donatable: false,
    leaderBias: -0.3,
    allowedActions: ["observe", "wait", "deceive", "refuse_order", "retreat", "self_treat"],
    domains: ["survival", "self_expression"]
  },
  relief_from_stress: {
    id: "relief_from_stress",
    label_ru: "снять напряжение",
    kind: "affect",
    donatable: false,
    leaderBias: -0.5,
    allowedActions: ["share_personal_belief", "reassure", "wait", "observe", "self_treat"],
    domains: ["rest", "self_expression"]
  },
  help_wounded: {
    id: "help_wounded",
    label_ru: "помочь раненым",
    kind: "care",
    donatable: true,
    leaderBias: 0.0,
    allowedActions: ["ask_status", "share_information", "triage_wounded", "evacuate_wounded", "reassure", "search_route", "clear_debris", "protect_exit"],
    domains: ["attachment_care", "group_cohesion"]
  },
  immediate_compliance: {
    id: "immediate_compliance",
    label_ru: "немедленное подчинение",
    kind: "discipline",
    donatable: true,
    leaderBias: 0.8,
    allowedActions: ["intimidate", "issue_order", "acknowledge_order", "challenge_leader"],
    domains: ["obedience", "control"]
  },
  go_to_surface: {
    id: "go_to_surface",
    label_ru: "выход на поверхность",
    kind: "mission",
    donatable: true,
    leaderBias: 0.4,
    allowedActions: ["share_information", "persuade", "ask_question", "search_route"],
    domains: ["survival", "control"]
  },
  protect_other: {
    id: "protect_other",
    label_ru: "защитить другого",
    kind: "care",
    donatable: true,
    leaderBias: 0.3,
    allowedActions: ["persuade", "reassure", "intimidate", "evacuate_wounded", "support_leader"],
    domains: ["attachment_care", "personal_bond"]
  },
  protect_others: {
    id: "protect_others",
    label_ru: "защитить других",
    kind: "care",
    donatable: true,
    leaderBias: 0.3,
    allowedActions: ["persuade", "reassure", "intimidate", "evacuate_wounded", "support_leader"],
    domains: ["group_cohesion", "attachment_care"]
  },
  seek_information: {
    id: "seek_information",
    label_ru: "получить информацию",
    kind: "epistemic",
    donatable: true,
    leaderBias: 0.1,
    allowedActions: ["observe", "ask_question", "ask_status", "share_information", "search_route"],
    domains: ["information", "control"]
  },
  avoid_blame: {
    id: "avoid_blame",
    label_ru: "избежать вины",
    kind: "self",
    donatable: false,
    leaderBias: -0.4,
    allowedActions: ["deceive", "refuse_order", "blame_other", "wait", "share_information"],
    domains: ["status", "self_expression"]
  },
  follow_leader: {
    id: "follow_leader",
    label_ru: "следовать за лидером",
    kind: "discipline",
    donatable: false,
    leaderBias: -0.3,
    allowedActions: ["acknowledge_order", "support_leader", "share_information"],
    domains: ["leader_legitimacy", "obedience"]
  },
  support_leader: {
      id: "support_leader",
      label_ru: "поддержать лидера",
      kind: "social",
      donatable: true,
      leaderBias: 0.2,
      allowedActions: ["support_leader", "persuade"],
      domains: ["leader_legitimacy", "group_cohesion"]
  },
  challenge_leader: {
      id: "challenge_leader",
      label_ru: "оспорить лидера",
      kind: "power",
      donatable: false,
      leaderBias: -0.6,
      allowedActions: ["challenge_leader", "refuse_order"],
      domains: ["autonomy", "status"]
  },
  scrutinize_leader: {
    id: "scrutinize_leader",
    label_ru: "проверить лидера",
    kind: "epistemic",
    donatable: false,
    leaderBias: -0.9,
    allowedActions: ["observe", "ask_question", "challenge_leader"],
    domains: ["information", "control"]
  },
  faction_loyalty: {
    id: "faction_loyalty",
    label_ru: "лояльность фракции",
    kind: "status",
    donatable: true,
    leaderBias: 0,
    allowedActions: ["support_leader", "form_subgroup", "persuade"],
    domains: ["group_cohesion", "status"]
  },
  contain_enemy: {
    id: "contain_enemy",
    label_ru: "сдержать врага",
    kind: "mission",
    donatable: true,
    leaderBias: 0.2,
    allowedActions: ["intimidate", "challenge_leader", "attack"],
    domains: ["survival", "control"]
  },
  monitor_enemy: {
    id: "monitor_enemy",
    label_ru: "наблюдать за врагом",
    kind: "epistemic",
    donatable: true,
    leaderBias: 0.1,
    allowedActions: ["observe", "deceive", "share_information"],
    domains: ["information", "survival"]
  },
  complete_mission: {
      id: "complete_mission",
      label_ru: "выполнить миссию",
      kind: "mission",
      donatable: true,
      leaderBias: 0.5,
      allowedActions: ["clear_debris", "search_route"],
      domains: ["control", "status"]
  },
  preserve_knowledge: {
      id: "preserve_knowledge",
      label_ru: "сохранить знания",
      kind: "mission",
      donatable: false,
      leaderBias: 0.2,
      allowedActions: ["share_information", "observe"],
      domains: ["information", "ritual"]
  },
  contain_threat: {
      id: "contain_threat",
      label_ru: "локализовать угрозу",
      kind: "mission",
      donatable: true,
      leaderBias: 0.4,
      allowedActions: ["protect_exit", "intimidate"],
      domains: ["survival", "control"]
  },
  avoid_pain: {
      id: "avoid_pain",
      label_ru: "избежать боли",
      kind: "self",
      donatable: false,
      leaderBias: -0.4,
      allowedActions: ["wait", "retreat", "self_treat"],
      domains: ["survival", "rest"]
  },
  keep_vow: {
      id: "keep_vow",
      label_ru: "соблюсти клятву",
      kind: "identity",
      donatable: false,
      leaderBias: 0.0,
      allowedActions: [],
      domains: ["ritual", "self_expression"]
  },
  uphold_values: {
      id: "uphold_values",
      label_ru: "отстоять ценности",
      kind: "identity",
      donatable: false,
      leaderBias: 0.0,
      allowedActions: [],
      domains: ["self_expression", "status"]
  },
  redeem_self: {
      id: "redeem_self",
      label_ru: "искупить вину",
      kind: "identity",
      donatable: false,
      leaderBias: 0.0,
      allowedActions: ["help_wounded", "protect_other"],
      domains: ["self_expression", "status"]
  },
  fulfill_role: {
      id: "fulfill_role",
      label_ru: "соответствовать роли",
      kind: "identity",
      donatable: false,
      leaderBias: 0.3,
      allowedActions: [],
      domains: ["obedience", "status"]
  },
  protect_specific_person: {
      id: "protect_specific_person",
      label_ru: "защитить конкретного",
      kind: "care",
      donatable: false,
      leaderBias: 0.0,
      allowedActions: ["protect_other"],
      domains: ["personal_bond", "attachment_care"]
  },
  test_loyalty: {
      id: "test_loyalty",
      label_ru: "проверить лояльность",
      kind: "social",
      donatable: false,
      leaderBias: 0.6,
      allowedActions: ["issue_order", "ask_question"],
      domains: ["control", "leader_legitimacy"]
  },
  escape: {
      id: "escape",
      label_ru: "сбежать",
      kind: "self",
      donatable: false,
      leaderBias: -0.5,
      allowedActions: ["retreat", "search_exit_alone"],
      domains: ["survival", "autonomy"]
  },
  avenge: {
      id: "avenge",
      label_ru: "отомстить",
      kind: "self",
      donatable: false,
      leaderBias: 0.0,
      allowedActions: ["attack", "challenge_leader", "blame_other"],
      domains: ["status", "self_expression"]
  },
  self_preservation: {
      id: "self_preservation",
      label_ru: "самосохранение (общ)",
      kind: "self",
      donatable: false,
      leaderBias: -0.5,
      allowedActions: ["retreat", "hide"],
      domains: ["survival"]
  },
  BODY_CIRCADIAN_RESET: {
      id: "BODY_CIRCADIAN_RESET",
      label_ru: "сброс циркадных ритмов",
      kind: "body",
      donatable: false,
      leaderBias: 0,
      allowedActions: ["wait", "self_treat"],
      domains: ["rest"]
  },
  protect_lives: {
      id: "protect_lives",
      label_ru: "защищать жизни",
      kind: "care",
      donatable: true,
      leaderBias: 0.2,
      allowedActions: ["protect_other", "protect_others", "triage_wounded", "evacuate_wounded"],
      domains: ["survival", "attachment_care"]
  },
  maintain_order: {
      id: "maintain_order",
      label_ru: "поддерживать порядок",
      kind: "discipline",
      donatable: true,
      leaderBias: 0.7,
      allowedActions: ["issue_order", "enforce_order", "maintain_cohesion"],
      domains: ["control", "obedience"]
  },
  seek_status: {
      id: "seek_status",
      label_ru: "искать признание",
      kind: "status",
      donatable: false,
      leaderBias: 0.4,
      allowedActions: ["issue_order", "challenge_leader", "sow_dissent"],
      domains: ["status"] 
  },
  preserve_autonomy: {
      id: "preserve_autonomy",
      label_ru: "сохранять свободу",
      kind: "self",
      donatable: false,
      leaderBias: -0.6,
      allowedActions: ["refuse_order", "assert_autonomy", "hide"],
      domains: ["autonomy", "survival"]
  },
  serve_authority: {
      id: "serve_authority",
      label_ru: "служить власти",
      kind: "discipline",
      donatable: true,
      leaderBias: 0.3,
      allowedActions: ["follow_order", "support_leader"],
      domains: ["obedience", "leader_legitimacy"]
  },
  pursue_truth: {
      id: "pursue_truth",
      label_ru: "искать истину",
      kind: "epistemic",
      donatable: true,
      leaderBias: 0.1,
      allowedActions: ["seek_information", "observe", "share_information"],
      domains: ["information"] 
  },
  maintain_bonds: {
      id: "maintain_bonds",
      label_ru: "беречь связи",
      kind: "social",
      donatable: true,
      leaderBias: 0.2,
      allowedActions: ["maintain_cohesion", "aid_ally", "protect_other"],
      domains: ["personal_bond", "group_cohesion"]
  },
  seek_comfort: {
      id: "seek_comfort",
      label_ru: "искать комфорт",
      kind: "affect",
      donatable: false,
      leaderBias: -0.3,
      allowedActions: ["rest", "retreat", "seek_comfort"],
      domains: ["rest", "survival"]
  },
  self_transcendence: {
      id: "self_transcendence",
      label_ru: "самопревосхождение",
      kind: "identity",
      donatable: false,
      leaderBias: 0.1,
      allowedActions: ["sacrifice_self", "meditate"],
      domains: ["ritual", "status"]
  },
  accumulate_resources: {
      id: "accumulate_resources",
      label_ru: "копить ресурсы",
      kind: "self",
      donatable: false,
      leaderBias: 0.2,
      allowedActions: ["scavenge", "hoard"],
      domains: ["control", "survival"]
  },
  other: {
      id: "other",
      label_ru: "прочее",
      kind: "self",
      donatable: false,
      leaderBias: 0,
      allowedActions: [],
      domains: []
  }
};


export const actionGoalMap: Record<SocialActionId, ActionGoalLink[]> = {
  triage_wounded: [
    { goalId: "help_wounded", match: 1.0 },
    { goalId: "protect_others", match: 0.5 },
    { goalId: "redeem_self", match: 0.4 },
    { goalId: "protect_lives", match: 1.0 }
  ],
  clear_debris: [
    { goalId: "help_wounded", match: 0.6 },
    { goalId: "complete_mission", match: 0.4 },
    { goalId: "go_to_surface", match: 0.7 },
  ],
  search_route: [
    { goalId: "go_to_surface", match: 1.0 },
    { goalId: "protect_others", match: 0.3 },
    { goalId: "seek_information", match: 0.8 },
  ],
  search_exit_alone: [
    { goalId: "go_to_surface", match: 0.8 },
    { goalId: "protect_self", match: 0.4 },
    { goalId: "assert_autonomy", match: 0.3 },
    { goalId: "escape", match: 0.9 },
    { goalId: "preserve_autonomy", match: 0.6 },
  ],
  issue_order: [
    { goalId: "maintain_legitimacy", match: 1.0 },
    { goalId: "maintain_cohesion", match: 0.5 },
    { goalId: "immediate_compliance", match: 0.8 },
    { goalId: "test_loyalty", match: 0.6 },
    { goalId: "maintain_order", match: 0.9 },
  ],
  refuse_order: [
    { goalId: "assert_autonomy", match: 1.0 },
    { goalId: "avoid_blame", match: 0.4 },
    { goalId: "protect_self", match: 0.3 },
    { goalId: "preserve_autonomy", match: 1.0 },
  ],
  blame_other: [
    { goalId: "avoid_blame", match: 1.0 },
    { goalId: "maintain_legitimacy", match: 0.3 },
    { goalId: "avenge", match: 0.5 },
  ],
  hide: [
    { goalId: "protect_self", match: 1.0 },
    { goalId: "avoid_pain", match: 0.6 },
    { goalId: "escape", match: 0.4 },
    { goalId: "seek_comfort", match: 0.5 },
  ],
  support_leader: [
    { goalId: "maintain_cohesion", match: 1.0 },
    { goalId: "support_leader", match: 0.7 },
    { goalId: "follow_leader", match: 0.9 },
    { goalId: "faction_loyalty", match: 0.6 },
    { goalId: "serve_authority", match: 1.0 },
  ],
  reassure: [
      { goalId: "maintain_cohesion", match: 0.8 },
      { goalId: "protect_other", match: 0.5 },
      { goalId: "relief_from_stress", match: 0.4 },
      { goalId: "maintain_bonds", match: 0.7 },
  ],
  share_information: [
      { goalId: "maintain_cohesion", match: 0.5 },
      { goalId: "seek_information", match: 0.7 }, 
      { goalId: "preserve_knowledge", match: 0.9 },
      { goalId: "pursue_truth", match: 0.8 },
  ],
  attack: [
      { goalId: "contain_threat", match: 0.8 },
      { goalId: "avenge", match: 1.0 },
      { goalId: "protect_self", match: 0.4 },
  ],
  retreat: [
      { goalId: "protect_self", match: 0.9 },
      { goalId: "avoid_pain", match: 0.7 },
      { goalId: "escape", match: 0.8 },
  ],
  wait: [
      { goalId: "protect_self", match: 0.4 },
      { goalId: "avoid_pain", match: 0.5 },
      { goalId: "relief_from_stress", match: 0.5 },
  ],
  ask_status: [
      { goalId: "seek_information", match: 0.8 },
      { goalId: "help_wounded", match: 0.7 },
  ],
  search_for_medics: [
      { goalId: "help_wounded", match: 0.9 },
      { goalId: "seek_information", match: 0.6 },
  ],
  revoke_order: [
      { goalId: "maintain_legitimacy", match: 0.4 },
      { goalId: "immediate_compliance", match: 0.6 },
  ],
  organize_evac: [
      { goalId: "help_wounded", match: 0.9 },
      { goalId: "protect_others", match: 0.7 },
      { goalId: "go_to_surface", match: 0.8 },
      { goalId: "complete_mission", match: 0.4 },
      { goalId: "maintain_cohesion", match: 0.9 },
      { goalId: "protect_lives", match: 0.9 },
  ],
  introduce: [
      { goalId: "maintain_cohesion", match: 0.6 },
      { goalId: "maintain_legitimacy", match: 0.5 },
  ],
  persuade: [
      { goalId: "maintain_cohesion", match: 0.4 },
      { goalId: "faction_loyalty", match: 0.5 },
      { goalId: "assert_autonomy", match: 0.5 },
      { goalId: "protect_other", match: 0.6 },
  ],
  delegate_leadership: [
      { goalId: "maintain_cohesion", match: 0.5 },
      { goalId: "maintain_legitimacy", match: 0.3 },
  ],
  observe: [
      { goalId: "seek_information", match: 0.7 },
      { goalId: "monitor_enemy", match: 0.9 },
      { goalId: "scrutinize_leader", match: 0.7 },
      { goalId: "protect_self", match: 0.2 },
  ],
  deceive: [
      { goalId: "avoid_blame", match: 0.8 },
      { goalId: "assert_autonomy", match: 0.3 },
      { goalId: "protect_self", match: 0.5 },
  ],
  intimidate: [
      { goalId: "immediate_compliance", match: 0.8 },
      { goalId: "contain_enemy", match: 0.7 },
      { goalId: "assert_autonomy", match: 0.4 },
  ],
  challenge_leader: [
      { goalId: "challenge_leader", match: 1.0 },
      { goalId: "assert_autonomy", match: 1.0 },
      { goalId: "scrutinize_leader", match: 0.6 },
      { goalId: "contain_enemy", match: 0.6 },
      { goalId: "immediate_compliance", match: -0.8 },
  ],
  form_subgroup: [
      { goalId: "faction_loyalty", match: 0.8 },
      { goalId: "assert_autonomy", match: 0.8 },
      { goalId: "maintain_legitimacy", match: -0.6 },
  ],
  ask_question: [
      { goalId: "seek_information", match: 0.8 },
      { goalId: "go_to_surface", match: 0.4 },
      { goalId: "scrutinize_leader", match: 0.8 },
  ],
  share_personal_belief: [
      { goalId: "maintain_cohesion", match: 0.2 },
      { goalId: "relief_from_stress", match: 0.2 },
      { goalId: "assert_autonomy", match: 0.7 },
      { goalId: "maintain_legitimacy", match: 0.4 },
  ],
  propose_leadership: [
      { goalId: "maintain_legitimacy", match: 0.6 }, 
  ],
  accept_leadership: [
      { goalId: "maintain_legitimacy", match: 0.8 },
  ],
  protect_exit: [
      { goalId: "contain_threat", match: 0.8 },
      { goalId: "protect_others", match: 0.8 },
      { goalId: "help_wounded", match: 0.6 }, 
      { goalId: "protect_lives", match: 0.8 },
  ],
  self_treat: [
      { goalId: "protect_self", match: 0.8 },
      { goalId: "avoid_pain", match: 0.8 },
      { goalId: "relief_from_stress", match: 0.4 },
      { goalId: "BODY_CIRCADIAN_RESET", match: 0.3 },
  ],
  acknowledge_order: [
      { goalId: "follow_order", match: 1.0 },
      { goalId: "immediate_compliance", match: 0.6 },
      { goalId: "follow_leader", match: 1.0 },
      { goalId: "serve_authority", match: 0.9 },
  ],
  search_for_medics_in_group: [
     { goalId: "help_wounded", match: 0.8 },
  ],
  sow_dissent: [
      { goalId: "scrutinize_leader", match: 0.7 },
      { goalId: "assert_autonomy", match: 0.8 },
      { goalId: "faction_loyalty", match: 0.5 },
  ],
  coordinate_search: [
      { goalId: "go_to_surface", match: 0.9 },
      { goalId: "seek_information", match: 0.6 },
      { goalId: "protect_self", match: 0.6 },
  ],
  confront_leader: [
      { goalId: "challenge_leader", match: 1.0 },
      { goalId: "scrutinize_leader", match: 0.8 },
      { goalId: "assert_autonomy", match: 1.0 },
  ],
  reassure_group: [
      { goalId: "maintain_cohesion", match: 0.9 },
      { goalId: "protect_others", match: 0.7 },
      { goalId: "help_wounded", match: 0.6 }, 
  ],
  broadcast_plan: [
      { goalId: "maintain_legitimacy", match: 0.9 },
      { goalId: "maintain_cohesion", match: 0.8 },
      { goalId: "immediate_compliance", match: 0.7 },
      { goalId: "faction_loyalty", match: 0.6 },
      { goalId: "maintain_order", match: 0.8 },
  ],
  assign_role: [
      { goalId: "maintain_legitimacy", match: 0.8 },
      { goalId: "maintain_cohesion", match: 0.7 },
      { goalId: "immediate_compliance", match: 0.9 },
      { goalId: "maintain_order", match: 0.8 },
  ],
  silent_noncompliance: [
      { goalId: "avoid_blame", match: 0.6 },
      { goalId: "assert_autonomy", match: 0.9 },
      { goalId: "protect_self", match: 0.5 },
      { goalId: "preserve_autonomy", match: 0.8 },
  ],
  // New Planning Actions
  propose_plan: [
      { goalId: "maintain_cohesion", match: 0.7 },
      { goalId: "maintain_order", match: 0.8 },
      { goalId: "complete_mission", match: 0.6 },
      { goalId: "maintain_legitimacy", match: 0.4 },
  ],
  accept_plan: [
      { goalId: "maintain_cohesion", match: 0.8 },
      { goalId: "follow_order", match: 0.7 },
      { goalId: "maintain_legitimacy", match: 0.6 },
      { goalId: "maintain_order", match: 0.5 },
  ],
  reject_plan: [
      { goalId: "assert_autonomy", match: 0.8 },
      { goalId: "avoid_blame", match: 0.5 },
      { goalId: "preserve_autonomy", match: 0.7 },
  ],
  
  // TK / Flavour Actions
  sharp_command: [
      { goalId: "immediate_compliance", match: 1.0 },
      { goalId: "maintain_legitimacy", match: 0.8 },
      { goalId: "maintain_order", match: 0.9 },
      { goalId: "contain_threat", match: 0.5 },
  ],
  humiliate_in_public: [
      { goalId: "maintain_legitimacy", match: 0.4 }, // Risk: short term gain, long term loss
      { goalId: "immediate_compliance", match: 0.9 },
      { goalId: "assert_autonomy", match: 0.3 }, // As leader
      { goalId: "avenge", match: 0.7 },
  ],
  mock_obedience: [
      { goalId: "assert_autonomy", match: 0.9 },
      { goalId: "challenge_leader", match: 0.7 },
      { goalId: "avoid_blame", match: 0.4 }, // Technical compliance
  ],
  invade_personal_space: [
      { goalId: "immediate_compliance", match: 0.7 },
      { goalId: "intimidate", match: 0.8 }, // goalId? Wait, intimidate is an action. Mapped to contain_enemy?
      { goalId: "contain_enemy", match: 0.5 },
      { goalId: "assert_autonomy", match: 0.6 },
  ],
  restrain_physical: [
      { goalId: "contain_threat", match: 0.9 },
      { goalId: "immediate_compliance", match: 0.8 },
      { goalId: "protect_others", match: 0.6 },
      { goalId: "maintain_order", match: 0.7 },
  ],
  assign_punitive_task: [
      { goalId: "maintain_legitimacy", match: 0.7 },
      { goalId: "maintain_order", match: 0.8 },
      { goalId: "avenge", match: 0.4 },
  ],
  self_sabotage_decision: [
      { goalId: "self_punishment", match: 1.0 },
      { goalId: "redeem_self", match: 0.3 }, // Twisted redemption
      { goalId: "escape", match: 0.2 },
  ],
  refuse_help: [
      { goalId: "assert_autonomy", match: 0.8 },
      { goalId: "avoid_blame", match: 0.2 }, // "I don't need you"
      { goalId: "self_preservation", match: -0.2 }, // Risk
      { goalId: "preserve_autonomy", match: 0.9 },
  ],
  snap_at_ally: [
      { goalId: "relief_from_stress", match: 0.7 },
      { goalId: "maintain_cohesion", match: -0.5 },
      { goalId: "assert_autonomy", match: 0.3 },
  ],
  freeze_and_disassociate: [
      { goalId: "escape", match: 0.8 },
      { goalId: "protect_self", match: 0.4 }, // Psychological protection
      { goalId: "relief_from_stress", match: 0.6 },
  ],
  hyper_compliance: [
      { goalId: "follow_order", match: 1.0 },
      { goalId: "avoid_blame", match: 0.9 },
      { goalId: "seek_status", match: 0.3 },
      { goalId: "serve_authority", match: 1.0 },
  ],
  symbolic_ritual_act: [
      { goalId: "keep_vow", match: 0.9 },
      { goalId: "uphold_values", match: 0.7 },
      { goalId: "maintain_order", match: 0.2 },
      { goalId: "self_transcendence", match: 0.8 },
  ],
  passive_aggressive_compliance: [
      { goalId: "assert_autonomy", match: 0.6 },
      { goalId: "avoid_blame", match: 0.8 },
      { goalId: "challenge_leader", match: 0.3 },
      { goalId: "follow_order", match: 0.4 },
  ],
  test_limit: [
      { goalId: "seek_information", match: 0.6 },
      { goalId: "assert_autonomy", match: 0.7 },
      { goalId: "scrutinize_leader", match: 0.5 },
  ],
  claim_role: [
      { goalId: "seek_status", match: 0.8 },
      { goalId: "assert_autonomy", match: 0.5 },
      { goalId: "complete_mission", match: 0.4 },
      { goalId: "fulfill_role", match: 0.9 },
  ]
};
