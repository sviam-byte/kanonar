
import { CharacterEntity, EntityType, Branch } from '../../types';

const data: CharacterEntity = {
    entityId: "deicide-mentor",
    type: EntityType.Character,
    title: "Старкад",
    subtitle: "Наставник Деицида",
    authors: [{ name: "auto_extract", role: "Source" }],
    year: "410",
    versionTags: [Branch.Current],
    status: "published",
    tags: ["ветеран", "выживание", "Вечный Город", "полевой опыт"],
    description: "Бывший военный, переживший худшее. Циник-прагматик, учит выживанию без романтики. Говорит рублено, презирает пропаганду.",
    relations: [],
    media: [],
    evidenceIds: [],
    changelog: [{ version: "1.0", date: "410 OВ", author: "System", summary: "Initial record creation." }],
    roles: {
        global: ["advisor", "operative"]
    },
    vector_base: {
        A_Causality_Sanctity: 0.7,
        A_Memory_Fidelity: 0.8,
        A_Reversibility: 0.3,
        A_Legitimacy_Procedure: 0.4,
        A_Safety_Care: 0.7,
        A_Liberty_Autonomy: 0.6,
        A_Justice_Fairness: 0.5,
        A_Power_Sovereignty: 0.8,
        A_Knowledge_Truth: 0.8,
        A_Tradition_Continuity: 0.5,
        A_Transparency_Secrecy: 0.2,
        A_Aesthetic_Meaning: 0.2,
        B_discount_rate: 0.4,
        B_exploration_rate: 0.3,
        B_tolerance_ambiguity: 0.9,
        B_goal_coherence: 0.8,
        B_cooldown_discipline: 0.7,
        B_decision_temperature: 0.4,
        C_reciprocity_index: 0.7,
        C_betrayal_cost: 0.5,
        C_reputation_sensitivity: 0.1,
        C_dominance_empathy: 0.8,
        C_coalition_loyalty: 0.6,
        D_fine_motor: 0.6,
        D_stamina_reserve: 0.8,
        D_pain_tolerance: 0.9,
        D_HPA_reactivity: 0.6,
        D_sleep_resilience: 0.7,
        E_KB_stem: 0.7,
        E_KB_civic: 0.4,
        E_KB_topos: 0.3,
        E_Model_calibration: 0.7,
        E_Skill_repair_topology: 0.5,
        E_Skill_causal_surgery: 0.6,
        E_Skill_chronicle_verify: 0.7,
        E_Skill_diplomacy_negotiation: 0.4,
        E_Skill_ops_fieldcraft: 0.9,
        E_Skill_opsec_hacking: 0.8,
        E_Epi_volume: 0.9,
        E_Epi_recency: 0.7,
        E_Epi_schema_strength: 0.8,
        F_Plasticity: 0.3,
        F_Value_update_rate: 0.2,
        F_Extinction_rate: 0.6,
        F_Trauma_plasticity: 0.8,
        F_Skill_learning_rate: 0.4,
        F_Forgetting_noise: 0.4,
        G_Self_concept_strength: 0.8,
        G_Identity_rigidity: 0.7,
        G_Self_consistency_drive: 0.6,
        G_Metacog_accuracy: 0.8,
        G_Narrative_agency: 0.5,
    },
    identity: {
        version_gates: [Branch.Current],
        hard_caps: [], param_locked: [], locks_source: [],
        oaths: [], sigils: {}, chain_of_command: [],
        clearance_level: 2,
        consent_ledger: [], identity_chain_of_custody: [],
        sacred_set: [{ act: 'survive', obj: 'at_all_costs' }], // Fixed
    },
    cognitive: {
        goals: [], core_values: ['выживание', 'честность'], utility_shape: { risk_aversion: 0.4, discount_rate: 0.3 },
        policy: { kind: "rule", params: { exploration_rate: 0.2, temperature: 0.5 } }, planning_horizon: 10,
        fallback_policy: "survive", 
        belief_state: {},
        observation_model: { noise_var: 0.1 }, report_model: { bias: 0, noise_var: 0.1 },
        affective_module: { anger: 30, fear: 30, hope: 40 },
        cognitive_biases: [], counterfactual_skill: 50,
        protocol_fidelity: 40, audit_honesty: 50,
        deception_propensity: 20,
        tolerance_ambiguity: 80,
        goal_coherence: 70,
        shame_guilt_sensitivity: 20,
        compliance_index: 30,
        oversight_pressure: 10,
        cooldown_discipline: 70,
        salience_bias: 60,
        w_goals: { "survive": 1.0 },
    },
    competencies: {
        competence_core: 75, decision_quality: 80, resilience: 90,
        causal_sensitivity: 90, topo_affinity: 70, mandate_literacy: 40,
        specializations: ['выживание', 'тактика'], topo_windows: [],
        OPSEC_literacy: 80,
        deception_skill: 40,
    },
    state: {
        will: 85, loyalty: 40, dark_exposure: 60,
        drift_state: 15, burnout_risk: 0.4,
        backlog_load: 20,
        overload_sensitivity: 50,
    },
    memory: {
        attention: { E: 150, A_star: 150 },
        visibility_zone: 30, memory_write_rights: 3, iris_corridor_width: 20,
        witness_count: 30, mu_M_branch: 0.5, apophenia_debt: 10,
        visibility_lag_days: 3,
        consolidation_rate: 70,
        retrieval_noise: 0.3,
    },
    social: {
        audience_reputation: [{ segment: 'general', score: 60 }],
        dynamic_ties: {}, coalitions: [], commitments: [],
        dag_node_id: 'deicide-mentor', edges_out: [],
        causal_liability_share: 0.05,
        co_sign_latency: [],
        reciprocity_index: 70,
        betrayal_cost: 60,
        reputation_sensitivity: 10,
    },
    resources: {
        endowments: { attention_hours: 40, tokens: 500 },
        time_budget_h: 50,
        inventory: [], mandate_power: 10,
        co_sign_network: [],
        risk_budget: { cvar: 30, infra: 30, dark: 60, apophenia: 20 },
        mandate_cooldowns: [],
        risk_budget_cvar: 0.3,
        infra_budget: 0.3,
        dark_quota: 0.6,
    },
    sector: {
        sector_id: 'sector-default', L_star_personal: 10,
    },
    repro: {
        seed_id: 'deicide-mentor-seed',
    },
    body: {
        sex_phenotype: 'typical_male',
        structural: { height_cm: 180, mass_kg: 80, shoulder_width_cm: 48, pelvis_width_cm: 36, limb_lengths: { arm_cm: 64, leg_cm: 84 }, hand_span_cm: 21, foot_length_cm: 27, center_of_mass: { height_rel: 0.56, depth_rel: 0.5 }, joint_laxity: 0.4 },
        functional: { strength_upper: 0.7, strength_lower: 0.8, aerobic_capacity: 0.8, recovery_speed: 0.7, explosive_power: 0.7, strength_endurance_profile: 0.6, injury_risk: { knees: 0.5, ankles: 0.5, lower_back: 0.6, shoulders: 0.6 } },
        adipose: { body_fat_percent: 16, metabolic_reserve: 0.5, fat_distribution: 'android' },
        hormonal: { has_cyclic_hormones: false, androgen_baseline: 0.7, stress_sensitivity: 0.5, sleep_sensitivity: 0.6, androgen_circadian_amplitude: 0.2, baseline_testosterone: 0.8, baseline_estrogen: 0.3 },
        reproductive: { can_be_pregnant: false, is_pregnant: false, fatigue_penalty: 0, heart_rate_increase: 0, injury_risk_increase: 0, emotional_lability: 0 },
        constitution: {
            height_cm: 180, mass_kg: 80,
            strength_max: 0.7, endurance_max: 0.8, dexterity: 0.6,
            vision_acuity: 0.8, hearing_db: 10,
            pain_tolerance: 0.9, cold_heat_tolerance: 0.7,
        },
        capacity: {
            fine_motor: 0.5, VO2max: 50,
        },
        reserves: {
            energy_store_kJ: 1500, hydration: 0.8, 
            glycemia_mmol: 4.8, 
            O2_margin: 0.8,
            sleep_homeostat_S: 0.6, circadian_phase_h: 23, sleep_debt_h: 5, 
            immune_tone: 0.6,
        },
        acute: {
            hp: 90,
            injuries_severity: 10, pain_now: 5, temperature_c: 36.7, tremor: 0.1, reaction_time_ms: 340,
            fatigue: 40, stress: 35, moral_injury: 25,
        },
        regulation: { HPA_axis: 0.5, arousal: 0.45, },
    },
    tom: {
        self: null,
        perceived: {}
    },
    relationships: {},
    goal_graph: {
        nodes: [
          { id: "survive", origin: "personal", type: "terminal", tau: 365, ownership: "individual" }
        ],
        edges: []
    },
    authority: {
      signature_weight: { causal: 0.5, topo: 0.3, civic: 0.4, infra: 0.5, memory: 0.5, ethics: 0.5, markets: 0.5 },
      co_sign_threshold: 1,
    },
    evidence: {
        witness_pull: 0.4,
        evidence_quality: 0.6,
    },
    observation: {
        noise: 0.2,
        report_noise: 0.2,
    },
    context: {
        age: 58,
        faction: "independent",
    },
    compute: {
      compute_budget: 100,
      decision_deadline_s: 1,
      tom_depth: 2,
    },
    historicalEvents: [
        {
            id: 'hist-starkad-1', name: 'Жизнь в осаде', t: 0, years_ago: 50, domain: 'crisis',
            tags: ['high_threat', 'chronic_scarcity', 'military_presence', 'fear_norm'],
            valence: -1, intensity: 0.7, duration_days: 1825, surprise: 0, controllability: 0, responsibility_self: 0, secrecy: 'public'
        },
        {
            id: 'hist-starkad-2', name: 'Смерть отца на линии', t: 0, years_ago: 50, domain: 'loss',
            tags: ['family_loss_war', 'grief', 'anger_seed', 'institution_failure'],
            valence: -1, intensity: 0.8, duration_days: 1, surprise: 0.9, controllability: 0, responsibility_self: 0, secrecy: 'private'
        },
        {
            id: 'hist-starkad-3', name: 'Эмоциональное выгорание матери', t: 0, years_ago: 49, domain: 'neglect',
            tags: ['emotional_neglect', 'insecure_attachment', 'parental_collapse'],
            valence: -1, intensity: 0.6, duration_days: 2000, surprise: 0, controllability: 0, responsibility_self: 0, secrecy: 'private'
        },
        {
            id: 'hist-starkad-4', name: 'Уличные драки', t: 0, years_ago: 45, domain: 'violence',
            tags: ['peer_violence', 'risk_normalization', 'body_defense_learning'],
            valence: 0, intensity: 0.5, duration_days: 1500, surprise: 0.2, controllability: 0.6, responsibility_self: 0.8, secrecy: 'public'
        },
        {
            id: 'hist-starkad-5', name: 'Чёрный рынок', t: 0, years_ago: 44, domain: 'crime',
            tags: ['informal_economy', 'illicit_survival', 'institution_distrust'],
            valence: 0, intensity: 0.5, duration_days: 1500, surprise: 0.1, controllability: 0.7, responsibility_self: 0.9, secrecy: 'ingroup'
        },
        {
            id: 'hist-starkad-6', name: 'Рекрутинг', t: 0, years_ago: 42, domain: 'training',
            tags: ['early_militarization', 'violent_socialization', 'reward_for_risk'],
            valence: 0, intensity: 0.6, duration_days: 700, surprise: 0.2, controllability: 0.3, responsibility_self: 0.5, secrecy: 'public'
        },
        {
            id: 'hist-starkad-7', name: 'Зачистки внутренних банд', t: 0, years_ago: 40, domain: 'service',
            tags: ['state_violence', 'moral_ambiguity', 'institution_hypocrisy', 'loyalty_shift_group_over_state'],
            valence: -1, intensity: 0.8, duration_days: 1000, surprise: 0, controllability: 0.8, responsibility_self: 0.8, secrecy: 'private'
        },
        {
            id: 'hist-starkad-8', name: 'Брошены командованием', t: 0, years_ago: 39, domain: 'betrayal_by_leader',
            tags: ['betrayal_by_command', 'combat_trauma', 'group_survival_bond', 'institution_collapse', 'hypervigilance'],
            valence: -1, intensity: 1.0, duration_days: 7, surprise: 0.9, controllability: 0, responsibility_self: 0, secrecy: 'private',
            trauma: { domain: 'system', severity: 1.0, kind: 'betrayal_by_leader' }
        },
        {
            id: 'hist-starkad-9', name: 'Спасение товарищей под огнём', t: 0, years_ago: 39, domain: 'heroism',
            tags: ['self_sacrifice', 'heroic_bonding', 'identity_fused_with_group'],
            valence: 1, intensity: 0.9, duration_days: 1, surprise: 0.5, controllability: 1.0, responsibility_self: 1.0, secrecy: 'ingroup'
        },
        {
            id: 'hist-starkad-10', name: 'Признание в низах', t: 0, years_ago: 33, domain: 'status',
            tags: ['subcultural_status', 'institution_distrust', 'moral_pragmatism'],
            valence: 1, intensity: 0.4, duration_days: 1500, surprise: 0, controllability: 1.0, responsibility_self: 1.0, secrecy: 'public'
        }
    ],
};

export default data;
