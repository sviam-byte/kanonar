
import { ConcreteGoalDef, TargetedGoalDef } from './v4-types';

export const V4_GOAL_DEFINITIONS: ConcreteGoalDef[] = [
    // 1. Self-Regulation / Affect
    {
        id: 'c_reduce_tension',
        label: 'Снять напряжение',
        baseLogit: -0.8,
        layer: 'body', domain: 'AFFECT',
        preGoalWeights: { escape_transcend: 1.2, care: 0.6, free_flow: 0.4 },
        metricWeights: { Stress: 2.5, Exhaust: 1.8, DriveU: 1.2, V: -1.0, A: 1.0, Rmargin: -1.0, WMcap: -1.0, cop_avoid: 3.0, cop_rescue: 0.5, dist_cat: 1.2, dist_threat: 1.2, MoralDiss: 0.6, FieldSelfSubject: -1.0, ImpulseShare: 1.8 },
        bioWeights: { B_burnout: 2.0, B_chronic_stress: 1.5, B_exile: 0.6, B_trauma_overload: 1.2, B_sensory_sensitivity: 0.8, B_no_safe_place_childhood: 0.5 }
    },
    {
        id: 'c_avoid_pain_phys',
        label: 'Избежать физ. боли',
        baseLogit: -0.3,
        layer: 'survival', domain: 'BODY',
        preGoalWeights: { escape_transcend: 1.2, control: 1.5 }, // mapped survival -> control
        metricWeights: { PainPhys: 4.0, TailRisk: 1.2, Stress: 1.2, Rmargin: -1.5, cop_avoid: 2.5, dist_cat: 1.8, dist_threat: 1.5 },
        bioWeights: { B_chronic_pain: 2.5, B_torture: 1.5, B_coercion: 0.8, B_injury: 1.0 }
    },
    {
        id: 'c_avoid_pain_psych',
        label: 'Избежать душевной боли',
        baseLogit: -0.3,
        layer: 'survival', domain: 'AFFECT',
        preGoalWeights: { escape_transcend: 1.2, free_flow: 0.6 },
        metricWeights: { PainPsych: 3.5, OthersGap: 1.5, SelfGap: 1.5, cop_avoid: 2.5, cop_auto: 0.6, mistrust: 1.2, mindread: 1.2, personal: 1.2, Shame: 2.5, MoralDiss: 1.0 },
        bioWeights: { B_attachment_trauma: 1.8, B_humiliation: 1.5, B_bullying: 1.2, B_betrayed_by_peer: 1.0, B_abandonment: 0.8 }
    },
    {
        id: 'c_restore_sleep',
        label: 'Восстановить сон',
        baseLogit: -0.8,
        layer: 'body', domain: 'REST',
        preGoalWeights: { escape_transcend: 0.6, care: 0.9, efficiency: 1.2 }, // mapped rest -> efficiency/escape
        metricWeights: { SleepDebt: 5.0, Exhaust: 2.5, V: -0.5, A: -1.0, cop_avoid: 1.8, Recovery: -1.5 },
        bioWeights: { B_sleep_disorders: 2.0, B_chronic_stress: 0.8, B_burnout: 1.0, B_overwork: 0.5 } 
    },
    {
        id: 'c_restore_energy',
        label: 'Восстановить энергию',
        baseLogit: -0.3,
        layer: 'body', domain: 'REST',
        preGoalWeights: { escape_transcend: 0.6, care: 0.6, efficiency: 1.0 }, // mapped rest -> efficiency
        metricWeights: { Exhaust: 3.5, Stress: 1.2, Rmargin: -1.2, Recovery: -1.5, MoralDiss: 0.6, DriveU: 2.0, EnergyReserve: -3.0 },
        bioWeights: { B_burnout: 1.8, B_chronic_stress: 1.2, B_scarcity: 1.0, B_survival_mode: 0.8 }
    },
    {
        id: 'c_reduce_overload',
        label: 'Снять перегрузку',
        baseLogit: -1.2,
        layer: 'body', domain: 'REST',
        preGoalWeights: { escape_transcend: 1.2, efficiency: -0.5 },
        metricWeights: { A: 2.5, WMcap: -2.5, InfoHyg: -1.8, V: -1.0, cop_avoid: 2.5, dist_cat: 1.2, dist_threat: 1.2 },
        bioWeights: { B_sensory_sensitivity: 2.5, B_trauma_overload: 1.8, B_burnout: 1.5, B_high_responsibility: 0.5 }
    },

    // 2. Self / Identity
    {
        id: 'c_preserve_self_integrity',
        label: 'Сохранить целостность Я',
        baseLogit: 0.8,
        layer: 'identity', domain: 'IDENTITY',
        preGoalWeights: { truth: 1.8, preserve_order: 1.4, fix_world: 0.5 },
        metricWeights: { SelfGap: 4.5, MoralDiss: 2.0, cop_hyper: 2.5, cop_avoid: -1.0, self_blame: 1.2, black_white: 1.2, Guilt: 1.2, Shame: 1.5, FieldSelfCoherence: -2.0, FieldSelfSubject: -1.5, is_plot_redemption: 1.0 },
        bioWeights: { B_identity_threats: 2.5, B_existential_crises: 1.8, B_lied_to_history: 1.2, B_coercion: 1.0, B_dissociation_history: 1.5 }
    },
    {
        id: 'c_reduce_guilt',
        label: 'Искупить вину',
        baseLogit: -0.3,
        layer: 'identity', domain: 'IDENTITY',
        preGoalWeights: { care: 1.2, fix_world: 1.0, preserve_order: 0.5 },
        metricWeights: { Guilt: 5.0, MoralDiss: 1.5, cop_rescue: 2.5, cop_auto: 0.8, self_blame: 2.0, FieldOthersCare: 1.2, is_role_savior: 0.8, is_plot_redemption: 1.2 },
        bioWeights: { B_moral_injury: 2.5, B_saved_others: 0.8, B_failed_rescue: 2.0, B_betrayal_committed: 1.5 }
    },
    {
        id: 'c_reduce_shame',
        label: 'Восстановить честь',
        baseLogit: -0.3,
        layer: 'identity', domain: 'STATUS',
        preGoalWeights: { power_status: 1.5, care: 0.6, control: 0.5 },
        metricWeights: { Shame: 5.0, MoralDiss: 1.2, cop_avoid: 1.2, mindread: 1.2, personal: 2.0, is_plot_redemption: 0.8, Reputation: -1.5 },
        bioWeights: { B_humiliation: 2.0, B_attachment_trauma: 0.8, B_status_loss_history: 1.5, B_bullying: 1.2 }
    },
    {
        id: 'c_keep_autonomy',
        label: 'Сохранить автономию',
        baseLogit: 0.2,
        layer: 'identity', domain: 'AUTONOMY',
        preGoalWeights: { free_flow: 1.8, escape_transcend: 0.8, power_status: 0.5 },
        metricWeights: { Agency: -3.0, PerceivedExternalControl: 2.5, cop_hyper: 1.0, mistrust: 1.5, threat: 1.2, FieldWorldRadical: 1.2, FieldSysLoyal: -1.5, AutonomyLatent: 3.0 },
        bioWeights: { B_coercion: 2.0, B_betrayed_system: 1.2, B_exile: 1.2, B_captivity: 1.8, B_raised_in_strict_order: -0.5 }
    },
    {
        id: 'c_obey_internal_code',
        label: 'Следовать Кодексу',
        baseLogit: 0.8,
        layer: 'identity', domain: 'RITUAL',
        preGoalWeights: { truth: 2.5, preserve_order: 1.5, fix_world: 0.8 },
        metricWeights: { MoralDiss: 3.5, cop_hyper: 2.5, illus_control: 1.2, FieldSysFormal: 1.5, FieldSelfSubject: 1.8, is_plot_duty: 1.2, is_role_leader: 0.6 },
        bioWeights: { B_strict_moral_upbringing: 2.5, B_leader_exp: 1.0, B_oath_taken: 1.5, B_long_term_commitments: 1.2, B_military_socialization: 1.2 }
    },

    // 3. Relations
    {
        id: 'c_protect_close_ones',
        label: 'Защитить своих',
        baseLogit: 0.3,
        layer: 'social', domain: 'CARE',
        preGoalWeights: { care: 2.0, fix_world: 0.6, preserve_order: 0.8 }, // mapped group_cohesion -> preserve_order
        metricWeights: { ThreatToGroup: 3.0, Stress: 0.6, TailRisk: 0.6, DriveU: 0.6, cop_rescue: 3.0, threat: 1.2, mistrust: 1.2, att_sec: 1.5, att_anx: 1.2, FieldOthersCare: 2.0, FieldSysLoyal: 0.6, is_role_savior: 1.0, is_plot_survival: 0.5 },
        bioWeights: { B_saved_others: 1.5, B_parent_role: 1.5, B_group_trauma: 1.8, B_loss: 1.2 }
    },
    {
        id: 'c_maintain_bonds',
        label: 'Укрепить связи',
        baseLogit: 0.2,
        layer: 'social', domain: 'SOCIAL',
        preGoalWeights: { care: 1.5, preserve_order: 0.6 }, // care twice removed
        metricWeights: { FearOfRejection: 2.5, OthersGap: 1.5, cop_avoid: -0.6, cop_rescue: 1.2, mindread: 1.2, personal: 1.2, att_anx: 2.5, att_av: -1.5, att_sec: 1.0 },
        bioWeights: { B_abandonment: 2.0, B_attachment_trauma: 1.0, B_loss: 1.5, B_betrayed_by_peer: -0.5 }
    },
    {
        id: 'c_avoid_rejection',
        label: 'Избежать отвержения',
        baseLogit: -0.3,
        layer: 'social', domain: 'SOCIAL',
        preGoalWeights: { escape_transcend: 1.2, care: 0.4 },
        metricWeights: { Shame: 2.0, OthersGap: 2.0, cop_avoid: 2.5, mindread: 1.5, personal: 1.5, self_blame: 1.5, att_anx: 3.5 },
        bioWeights: { B_bullying: 2.0, B_attachment_trauma: 1.5, B_humiliation: 1.2, B_approval_deprivation: 1.5 }
    },
    {
        id: 'c_gain_approval_group',
        label: 'Заслужить одобрение',
        baseLogit: 0.0,
        layer: 'social', domain: 'STATUS',
        preGoalWeights: { power_status: 1.2, care: 0.8, preserve_order: 0.8 }, // mapped group_cohesion -> preserve_order
        metricWeights: { DriveU: 1.0, Shame: 1.8, cop_rescue: 1.2, cop_avoid: -0.6, att_anx: 2.0, is_role_leader: -0.3, is_plot_redemption: 0.8, Reputation: -0.5 },
        bioWeights: { B_leader_exp: 0.8, B_approval_deprivation: 2.0, B_status_loss_history: 1.0 }
    },

    // 4. System / Order
    {
        id: 'c_maintain_order',
        label: 'Поддерживать порядок',
        baseLogit: -0.2,
        layer: 'security', domain: 'ORDER',
        preGoalWeights: { preserve_order: 1.5, control: 1.2, efficiency: 0.5 },
        metricWeights: { ChaosLevel: 2.5, Threat: 1.2, V: 0.6, PlanRobust: 0.8, Habit: 0.8, cop_hyper: 2.2, illus_control: 1.5, black_white: 1.5, FieldSysFormal: 2.0, FieldSysLoyal: 1.5, Stability: 2.0, Leadership: 1.2, FieldWorldRadical: -1.8 },
        bioWeights: { B_raised_in_strict_order: 2.0, B_military_socialization: 2.5, B_exposed_to_chaos: 0.5 }
    },
    {
        id: 'c_obey_legit_auth',
        label: 'Служить Системе',
        baseLogit: 0.2,
        layer: 'security', domain: 'OBEDIENCE',
        preGoalWeights: { preserve_order: 2.8 }, // merged duplicates
        metricWeights: { Agency: -1.2, Stress: 1.2, PlanRobust: -1.2, cop_avoid: 1.2, cop_hyper: 1.2, illus_control: 1.2, FieldSysLoyal: 2.5, FieldSysFormal: 1.5, att_dis: -0.5 },
        bioWeights: { B_military_socialization: 2.0, B_coercion: 1.0, B_raised_in_strict_order: 1.2, B_betrayed_system: -1.0 }
    },
    {
        id: 'c_undermine_unjust_system',
        label: 'Саботировать систему',
        baseLogit: -1.5,
        layer: 'mission', domain: 'CHAOS',
        preGoalWeights: { fix_world: 2.0, chaos_change: 1.8, free_flow: 1.8 }, // merged
        metricWeights: { SystemGap: 3.0, MoralDiss: 1.5, DriveU: 1.2, cop_aggr: 2.0, cop_avoid: -0.8, black_white: 1.5, mistrust: 1.5, catastroph: 0.8, FieldSysLoyal: -2.5, FieldWorldRadical: 2.5, RiskLatent: 1.5, Leadership: 1.2, is_plot_revenge: 1.0, is_role_rebel: 1.0 },
        bioWeights: { B_betrayed_system: 2.8, B_witnessed_injustice: 1.5, B_moral_injury: 1.2, B_political_prisoner: 1.0 }
    },
    {
        id: 'c_increase_status',
        label: 'Повысить статус',
        baseLogit: 0.0,
        layer: 'social', domain: 'STATUS',
        preGoalWeights: { power_status: 2.0, control: 0.5 },
        metricWeights: { DriveU: 1.2, Shame: 1.8, TailRisk: -0.8, cop_aggr: 1.8, cop_rescue: 1.2, Leadership: 2.0, Cruelty: 1.2, AutonomyLatent: 1.2, FieldOthersCare: -1.5, Reputation: 0.5 },
        bioWeights: { B_leader_exp: 1.8, B_status_loss_history: 1.8, B_humiliation: 0.5 }
    },
    {
        id: 'c_preserve_group_safety',
        label: 'Обезопасить группу',
        baseLogit: 0.4,
        layer: 'security', domain: 'CARE',
        preGoalWeights: { care: 1.5, preserve_order: 2.0 }, // merged
        metricWeights: { ThreatToGroup: 3.5, TailRisk: 1.2, Stress: 1.0, cop_rescue: 2.0, threat: 1.8, catastroph: 1.2, is_plot_survival: 1.0, FieldOthersCare: 1.5 },
        bioWeights: { B_group_trauma: 2.0, B_saved_others: 1.5, B_leader_exp: 0.5, B_loss: 1.0 }
    },

    // 5. World / Meaning
    {
        id: 'c_fix_local_injustice',
        label: 'Исправить несправедливость',
        baseLogit: 0.0,
        layer: 'mission', domain: 'JUSTICE',
        preGoalWeights: { fix_world: 2.0, truth: 1.2, care: 0.5 },
        metricWeights: { SystemGap: 2.0, OthersGap: 2.0, MoralDiss: 1.5, Guilt: 1.8, cop_rescue: 1.5, cop_hyper: 0.8, black_white: 1.5, self_blame: 1.2, FieldOthersCare: 1.5, FieldWorldRadical: 1.5 },
        bioWeights: { B_witnessed_injustice: 2.0, B_moral_injury: 1.5, B_betrayed_system: 1.0, B_hero_complex: 1.0 }
    },
    {
        id: 'c_pursue_long_term_project',
        label: 'Реализовать проект',
        baseLogit: 0.2,
        layer: 'mission', domain: 'WORK',
        preGoalWeights: { efficiency: 1.5, truth: 0.8, fix_world: 0.8, preserve_order: 0.5 },
        metricWeights: { Rmargin: 1.8, V: 1.0, PlanRobust: 1.8, WMcap: 1.8, InfoHyg: 1.2, Stress: -1.2, Exhaust: -1.5, cop_avoid: -0.8, cop_aggr: -0.8, cop_hyper: -0.8, is_plot_mission: 1.0, is_role_leader: 0.5 },
        bioWeights: { B_long_term_commitments: 2.5, B_leader_exp: 0.5, B_success: 1.0 }
    },
    {
        id: 'c_seek_truth',
        label: 'Найти истину',
        baseLogit: 0.2,
        layer: 'learn', domain: 'INFO',
        preGoalWeights: { truth: 3.0 }, // merged
        metricWeights: { InfoHyg: 1.8, WMcap: 0.8, DriveU: 1.2, Stress: -0.8, mistrust: 1.2, mindread: 1.2, FieldWorldRadical: 1.2, FieldWorldAcceptance: -0.5 },
        bioWeights: { B_lied_to_history: 2.0, B_identity_threats: 1.0, B_betrayed_system: 0.8 }
    },
    {
        id: 'c_preserve_meaning',
        label: 'Сохранить смысл',
        baseLogit: -0.2,
        layer: 'identity', domain: 'MEANING',
        preGoalWeights: { truth: 1.5, fix_world: 1.2, escape_transcend: 0.8 },
        metricWeights: { MeaningGap: 3.5, MoralDiss: 1.5, cop_avoid: -0.8, cop_rescue: 0.8, cop_hyper: 0.8, is_plot_redemption: 1.0, FieldSelfCoherence: 1.0 },
        bioWeights: { B_existential_crises: 2.0, B_moral_injury: 1.0, B_loss: 0.8 }
    },

    // 6. Escape
    {
        id: 'c_leave_situation',
        label: 'Сбежать (ситуативно)',
        baseLogit: -0.5,
        layer: 'survival', domain: 'ESCAPE',
        preGoalWeights: { escape_transcend: 2.0, control: 1.0 }, // mapped survival -> control
        metricWeights: { Stress: 2.0, TailRisk: 2.0, Rmargin: -1.5, Exhaust: 1.5, cop_avoid: 4.0, threat: 1.5, catastroph: 1.5, FieldSelfSubject: -1.2, att_av: 1.0 },
        bioWeights: { B_exile: 2.0, B_trauma_overwhelm: 1.5, B_captivity: 1.0 }
    },
    {
        id: 'c_dissociate',
        label: 'Уйти в себя',
        baseLogit: -1.5,
        layer: 'survival', domain: 'ESCAPE',
        preGoalWeights: { escape_transcend: 3.0 },
        metricWeights: { Stress: 3.5, Exhaust: 3.0, V: -3.0, Recovery: -2.0, cop_avoid: 2.5, cop_auto: 2.5, MoralDiss: 2.5, Resilience: -3.0, FieldSelfIntegrity: -3.0, ShadowStress: 2.0, ShadowGuilt: 2.0, att_dis: 2.0 },
        bioWeights: { B_dissociation_history: 3.0, B_trauma_overwhelm: 2.8, B_torture: 1.5 }
    },
    {
        id: 'c_find_safe_place',
        label: 'Найти укрытие',
        baseLogit: -0.2,
        layer: 'survival', domain: 'SAFETY',
        preGoalWeights: { escape_transcend: 1.5, care: 1.0, control: 1.5 }, // mapped survival -> control
        metricWeights: { Threat: 3.5, TailRisk: 1.5, Stress: 1.5, cop_avoid: 2.5, cop_rescue: 1.2, att_anx: 1.5 },
        bioWeights: { B_no_safe_place_childhood: 2.0, B_group_trauma: 1.0, B_scarcity: 0.8 }
    }
];

export const V4_TARGETED_GOAL_DEFINITIONS: TargetedGoalDef[] = [
    {
        id: 'c_protect_target',
        labelTemplate: 'Защитить: {target}',
        baseLogit: 0.0,
        layer: 'social', domain: 'CARE',
        preGoalWeights: { care: 3.5, fix_world: 1.2 }, // merged care
        relationalMetricWeights: { Trust: 1.5, Bond: 2.0, Significance: 1.5, Conflict: -1.0 },
        relationalBioWeights: { B_rel_saved: 2.0, B_rel_care_from: 1.5, B_rel_shared_trauma: 1.5, B_rel_devotion: 2.5 }
    },
    {
        id: 'c_obey_target',
        labelTemplate: 'Подчиниться: {target}',
        baseLogit: -0.2,
        layer: 'security', domain: 'OBEDIENCE',
        preGoalWeights: { preserve_order: 4.5 }, // merged preserve_order
        relationalMetricWeights: { Respect: 1.5, Fear: 1.0, Dominance: 1.2, Legitimacy: 1.5 }, 
        relationalBioWeights: { B_rel_obeyed: 2.0, B_rel_controlled_by: 1.5, B_rel_humiliated_by: 0.5, B_rel_devotion: 2.5 }
    },
    {
        id: 'c_please_target',
        labelTemplate: 'Угодить: {target}',
        baseLogit: -0.2,
        layer: 'social', domain: 'STATUS',
        preGoalWeights: { care: 2.7, power_status: 1.2 }, // merged care
        relationalMetricWeights: { Bond: 1.2, Trust: 1.0, Fear: 0.8, Dominance: 0.5 },
        relationalBioWeights: { B_rel_approval_deprivation: 2.0, B_rel_care_from: 1.0, B_rel_betrayed_by: -0.5 }
    },
    {
        id: 'c_dominate_target',
        labelTemplate: 'Доминировать: {target}',
        baseLogit: 0.8,
        layer: 'social', domain: 'POWER',
        preGoalWeights: { power_status: 2.5, control: 1.5, care: -0.5 },
        relationalMetricWeights: { Respect: -1.2, Fear: -1.2, Conflict: 1.0, Dominance: -1.5 }, 
        relationalBioWeights: { B_rel_humiliated_by: 1.5, B_rel_betrayed_by: 1.0, B_rel_obeyed: -0.5 }
    },
    {
        id: 'c_break_with_target',
        labelTemplate: 'Порвать с: {target}',
        baseLogit: -0.8,
        layer: 'social', domain: 'ESCAPE',
        preGoalWeights: { escape_transcend: 2.0, free_flow: 2.7 }, // merged free_flow
        relationalMetricWeights: { Conflict: 2.0, Trust: -2.5, Fear: 0.8, Bond: -0.5 },
        relationalBioWeights: { B_rel_betrayed_by: 2.5, B_rel_humiliated_by: 1.8, B_rel_harmed: 1.5 }
    },
    {
        id: 'c_avoid_target',
        labelTemplate: 'Избегать: {target}',
        baseLogit: -0.2,
        layer: 'survival', domain: 'SAFETY',
        preGoalWeights: { escape_transcend: 1.8, control: 1.0 }, // mapped survival -> control
        relationalMetricWeights: { Fear: 2.5, Conflict: 1.0, Trust: -1.5, Dominance: 1.0 },
        relationalBioWeights: { B_rel_harmed: 2.0, B_rel_controlled_by: 1.5, B_rel_betrayed_by: 1.0 }
    },
    {
        id: 'c_support_target',
        labelTemplate: 'Поддержать: {target}',
        baseLogit: 0.2,
        layer: 'social', domain: 'CARE',
        preGoalWeights: { care: 2.0, preserve_order: 1.2 }, // merged care
        relationalMetricWeights: { Trust: 1.5, Align: 1.5, Bond: 1.0, Conflict: -0.5 },
        relationalBioWeights: { B_rel_saved: 1.2, B_rel_care_from: 1.2, B_rel_shared_trauma: 1.0, B_rel_devotion: 1.5 }
    },
    {
        id: 'c_coordinate_with_target',
        labelTemplate: 'Сотрудничать с: {target}',
        baseLogit: 0.2,
        layer: 'mission', domain: 'ORDER',
        preGoalWeights: { preserve_order: 1.2, efficiency: 1.2, control: 0.5 },
        relationalMetricWeights: { Align: 1.8, Trust: 1.2, Competence: 1.0 },
        relationalBioWeights: { B_rel_obeyed: 0.8, B_rel_shared_trauma: 0.5 }
    }
];
