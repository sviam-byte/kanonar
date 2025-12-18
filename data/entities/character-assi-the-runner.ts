
import { CharacterEntity, EntityType, Branch } from '../../types';

const data: CharacterEntity = {
    entityId: "assi-the-runner",
    type: EntityType.Character,
    title: "Асси",
    subtitle: "Асси, курьер-контрабандист",
    authors: [{ name: "auto_extract", role: "Source" }],
    year: "410",
    versionTags: [Branch.Current],
    status: "published",
    tags: ["курьер", "контрабанда", "нижние туннели", "прагматизм"],
    description: "Прагматичный бегунок нижних туннелей. Вне политики, ценит анонимность и сделку. Быстрая, язвительная, с сетью теневых каналов.",
    relations: [],
    media: [],
    evidenceIds: [],
    changelog: [{ version: "1.0", date: "410 OВ", author: "System", summary: "Initial record creation." }],
    vector_base: {
        A_Causality_Sanctity: 0.4,
        A_Memory_Fidelity: 0.5,
        A_Reversibility: 0.6,
        A_Legitimacy_Procedure: 0.2,
        A_Safety_Care: 0.5,
        A_Liberty_Autonomy: 0.9,
        A_Justice_Fairness: 0.4,
        A_Power_Sovereignty: 0.7,
        A_Knowledge_Truth: 0.6,
        A_Tradition_Continuity: 0.2,
        A_Transparency_Secrecy: 0.2,
        A_Aesthetic_Meaning: 0.3,
        B_discount_rate: 0.7,
        B_exploration_rate: 0.6,
        B_tolerance_ambiguity: 0.8,
        B_goal_coherence: 0.9,
        B_cooldown_discipline: 0.6,
        B_decision_temperature: 0.6,
        C_reciprocity_index: 0.9,
        C_betrayal_cost: 0.4,
        C_reputation_sensitivity: 0.1,
        C_dominance_empathy: 0.6,
        C_coalition_loyalty: 0.5,
        D_fine_motor: 0.8,
        D_stamina_reserve: 0.9,
        D_pain_tolerance: 0.7,
        D_HPA_reactivity: 0.5,
        D_sleep_resilience: 0.8,
        E_KB_stem: 0.3,
        E_KB_civic: 0.2,
        E_KB_topos: 0.4,
        E_Model_calibration: 0.6,
        E_Skill_repair_topology: 0.4,
        E_Skill_causal_surgery: 0.3,
        E_Skill_chronicle_verify: 0.5,
        E_Skill_diplomacy_negotiation: 0.7,
        E_Skill_ops_fieldcraft: 0.9,
        E_Skill_opsec_hacking: 0.9,
        E_Epi_volume: 0.7,
        E_Epi_recency: 0.8,
        E_Epi_schema_strength: 0.7,
        F_Plasticity: 0.6,
        F_Value_update_rate: 0.4,
        F_Extinction_rate: 0.5,
        F_Trauma_plasticity: 0.4,
        F_Skill_learning_rate: 0.7,
        F_Forgetting_noise: 0.3,
        G_Self_concept_strength: 0.7,
        G_Identity_rigidity: 0.4,
        G_Self_consistency_drive: 0.8,
        G_Metacog_accuracy: 0.7,
        G_Narrative_agency: 0.5,
    },
    identity: {
        version_gates: [Branch.Current],
        hard_caps: [], param_locked: [], locks_source: [],
        oaths: [], sigils: {}, chain_of_command: [],
        clearance_level: 1,
        consent_ledger: [], identity_chain_of_custody: [],
        sacred_set: [],
    },
    cognitive: {
        goals: [], core_values: ['сделка', 'анонимность'], utility_shape: { risk_aversion: 0.6, discount_rate: 0.6 },
        policy: { kind: "rule", params: { exploration_rate: 0.3, temperature: 0.6 } }, planning_horizon: 5,
        fallback_policy: "disappear", 
        belief_state: {},
        observation_model: { noise_var: 0.1 }, report_model: { bias: 0, noise_var: 0.1 },
        affective_module: { anger: 30, fear: 30, hope: 40 },
        cognitive_biases: [], counterfactual_skill: 50,
        protocol_fidelity: 20, audit_honesty: 40,
        deception_propensity: 70,
        tolerance_ambiguity: 70,
        goal_coherence: 80,
        shame_guilt_sensitivity: 30,
        compliance_index: 10,
        oversight_pressure: 20,
        cooldown_discipline: 60,
        salience_bias: 40,
        w_goals: { "complete_delivery": 0.9, "stay_anonymous": 0.95 },
    },
    competencies: {
        competence_core: 70, decision_quality: 70, resilience: 60,
        causal_sensitivity: 80, topo_affinity: 55, mandate_literacy: 20,
        specializations: ['навигация', 'скрытность'], topo_windows: [],
        OPSEC_literacy: 90,
        deception_skill: 80,
    },
    state: {
        will: 60, loyalty: 30, dark_exposure: 50,
        drift_state: 15, burnout_risk: 0.4,
        backlog_load: 50,
        overload_sensitivity: 40,
    },
    memory: {
        attention: { E: 150, A_star: 150 },
        visibility_zone: 50, memory_write_rights: 0, iris_corridor_width: 40,
        witness_count: 30, mu_M_branch: 0.5, apophenia_debt: 10,
        visibility_lag_days: 1,
        consolidation_rate: 50,
        retrieval_noise: 20,
    },
    social: {
        audience_reputation: [{ segment: 'general', score: 40 }],
        dynamic_ties: {}, coalitions: [], commitments: [],
        dag_node_id: 'assi-the-runner', edges_out: [],
        causal_liability_share: 0.05,
        reciprocity_index: 80,
        betrayal_cost: 50,
        reputation_sensitivity: 20,
    },
    resources: {
        endowments: { attention_hours: 40, tokens: 500 }, time_budget_h: 50,
        inventory: [], mandate_power: 0,
        co_sign_network: [],
        risk_budget: { cvar: 40, infra: 20, dark: 50, apophenia: 20 },
        mandate_cooldowns: [],
        infra_budget: 0.2,
        dark_quota: 0.5,
        risk_budget_cvar: 0.4,
    },
    sector: {
        sector_id: 'sector-default', L_star_personal: 10,
    },
    repro: {
        seed_id: 'assi-the-runner-seed',
    },
    body: {
        sex_phenotype: 'typical_female',
        structural: { height_cm: 168, mass_kg: 58, shoulder_width_cm: 40, pelvis_width_cm: 44, limb_lengths: { arm_cm: 60, leg_cm: 78 }, hand_span_cm: 18, foot_length_cm: 24, center_of_mass: { height_rel: 0.53, depth_rel: 0.55 }, joint_laxity: 0.6 },
        functional: { strength_upper: 0.6, strength_lower: 0.6, aerobic_capacity: 0.9, recovery_speed: 0.8, explosive_power: 0.5, strength_endurance_profile: 0.7, injury_risk: { knees: 0.7, ankles: 0.6, lower_back: 0.5, shoulders: 0.4 } },
        adipose: { body_fat_percent: 20, metabolic_reserve: 0.6, fat_distribution: 'gynoid' },
        hormonal: { has_cyclic_hormones: true, androgen_baseline: 0.3, stress_sensitivity: 0.4, sleep_sensitivity: 0.5, androgen_circadian_amplitude: 0.1, baseline_testosterone: 0.3, baseline_estrogen: 0.8 },
        reproductive: { can_be_pregnant: true, is_pregnant: false, fatigue_penalty: 0, heart_rate_increase: 0, injury_risk_increase: 0, emotional_lability: 0 },
        constitution: {
            height_cm: 168, mass_kg: 58, strength_max: 0.6,
            endurance_max: 0.9, dexterity: 0.95, vision_acuity: 1.2, hearing_db: -5,
            pain_tolerance: 0.7, cold_heat_tolerance: 0.6
        },
        capacity: {
            fine_motor: 0.7, VO2max: 65
        },
        reserves: {
            energy_store_kJ: 1200, hydration: 0.9, glycemia_mmol: 5.2, O2_margin: 0.95,
            sleep_homeostat_S: 0.3, circadian_phase_h: 4, sleep_debt_h: 2, immune_tone: 0.75
        },
        acute: {
            hp: 95, injuries_severity: 0, pain_now: 0, temperature_c: 36.8, tremor: 0.05,
            reaction_time_ms: 260, fatigue: 40, stress: 40, moral_injury: 15
        },
        regulation: { 
            HPA_axis: 0.35, arousal: 0.7
        },
    },
    tom: {
        self: null,
        perceived: {}
    },
    relationships: {},
    goal_graph: {
        nodes: [],
        edges: []
    },
    authority: {
      signature_weight: { causal: 0.5, topo: 0.4, civic: 0.2, infra: 0.5, memory: 0.5, ethics: 0.5, markets: 0.5 },
      co_sign_threshold: 1,
    },
    evidence: {
        witness_pull: 0.3,
        evidence_quality: 0.3,
    },
    observation: {
        noise: 0.25,
        report_noise: 0.35,
    },
    context: {
        age: 29,
        faction: "independent",
    },
    compute: {
      compute_budget: 100,
      decision_deadline_s: 1,
      tom_depth: 2,
    },
    historicalEvents: [
        {
            id: 'bio_friend_gideon',
            name: "Подружилась с Гидеоном",
            t: 0,
            years_ago: 3,
            domain: "bonding",
            tags: ["friend", "trust", "mentor", "social"],
            valence: 1.0,
            intensity: 0.6,
            duration_days: 1000,
            surprise: 0.0,
            controllability: 1.0,
            responsibility_self: 1.0,
            secrecy: "private",
            participants: ["master-gideon"],
            lifeGoalWeights: { maintain_bonds: 0.8, seek_information: 0.4 }
        },
        {
            id: 'hist-assi-1', name: 'Лимиты ресурсов (детство)', t: 0, years_ago: 22, domain: 'scarcity',
            tags: ['scarcity_mild', 'infrastructure_strain', 'resource_quota'], 
            valence: -1, intensity: 0.3, duration_days: 1825, surprise: 0, controllability: 0, responsibility_self: 0, secrecy: 'public'
        },
        {
            id: 'hist-assi-2', name: 'Отключения (детство)', t: 0, years_ago: 21, domain: 'scarcity',
            tags: ['scarcity_energy', 'mild_threat', 'control_by_environment'],
            valence: -1, intensity: 0.4, duration_days: 1000, surprise: 0.4, controllability: 0, responsibility_self: 0, secrecy: 'public'
        },
        {
            id: 'hist-assi-3', name: 'Разговоры о квотах', t: 0, years_ago: 22, domain: 'education',
            tags: ['early_tech_socialization', 'institutional_reliance', 'anxiety_ambient'],
            valence: -1, intensity: 0.2, duration_days: 1825, surprise: 0, controllability: 0, responsibility_self: 0, secrecy: 'private'
        },
        {
            id: 'hist-assi-4', name: 'Посещение диспетчерской', t: 0, years_ago: 20, domain: 'education',
            tags: ['exposure_control_rooms', 'order_logic', 'procedural_norms'],
            valence: 1, intensity: 0.3, duration_days: 1, surprise: 0.6, controllability: 0, responsibility_self: 0, secrecy: 'private'
        },
        {
            id: 'hist-assi-5', name: 'Обучение системному анализу', t: 0, years_ago: 15, domain: 'training',
            tags: ['analytic_training', 'optimization_frame', 'system_loyalty'],
            valence: 1, intensity: 0.4, duration_days: 1800, surprise: 0, controllability: 0.8, responsibility_self: 0.7, secrecy: 'public'
        },
        {
            id: 'hist-assi-6', name: 'Кража учебного проекта', t: 0, years_ago: 16, domain: 'betrayal_experienced',
            tags: ['peer_betrayal', 'trust_break', 'social_insecurity'],
            valence: -1, intensity: 0.5, duration_days: 30, surprise: 0.8, controllability: 0.2, responsibility_self: 0.1, secrecy: 'ingroup'
        },
        {
            id: 'hist-assi-7', name: 'Конфликт лояльности к наставнику', t: 0, years_ago: 14, domain: 'betrayal_experienced',
            tags: ['asymmetric_dependence', 'authority_ambivalence', 'loyalty_conflict'],
            valence: -1, intensity: 0.6, duration_days: 700, surprise: 0.3, controllability: 0.1, responsibility_self: 0.2, secrecy: 'private'
        },
        {
            id: 'hist-assi-8', name: 'Работа: мониторинг', t: 0, years_ago: 11, domain: 'service',
            tags: ['system_responsibility', 'control_norm', 'low_trust_people', 'trust_data'],
            valence: 0, intensity: 0.3, duration_days: 700, surprise: 0, controllability: 0.9, responsibility_self: 0.8, secrecy: 'public'
        },
        {
            id: 'hist-assi-9', name: 'Смертельное решение (Сбой)', t: 0, years_ago: 10, domain: 'moral_compromise',
            tags: ['system_failure', 'life_or_death_decision', 'utilitarian_choice', 'moral_burden', 'trauma'],
            valence: -1, intensity: 1.0, duration_days: 1, surprise: 0.9, controllability: 0.5, responsibility_self: 1.0, secrecy: 'ingroup',
            trauma: { domain: 'self', severity: 0.9, kind: 'mass_casualties' }
        },
        {
            id: 'hist-assi-10', name: 'Карьерный рост', t: 0, years_ago: 5, domain: 'achievement',
            tags: ['reward_for_rationality', 'hypercontrol_normalization', 'emotional_suppression'],
            valence: 1, intensity: 0.5, duration_days: 1000, surprise: 0.1, controllability: 0.9, responsibility_self: 1.0, secrecy: 'public'
        }
    ],
};

export default data;
