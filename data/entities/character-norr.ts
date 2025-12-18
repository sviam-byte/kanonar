
import { CharacterEntity, EntityType, Branch } from '../../types';

const data: CharacterEntity = {
    entityId: "character-norr",
    type: EntityType.Character,
    title: "Норр",
    subtitle: "Биоинженер",
    authors: [{ name: "auto_extract", role: "Source" }],
    year: "71",
    versionTags: [Branch.PreBorders],
    status: "published",
    tags: ["биоинженер", "одержимость", "МКЕ", "травма"],
    description: "Гениальный, но одержимый биоинженер, чья личность и цели полностью подчинены травме от потери созданного им существа — «кошки» (МКЕ). Его реальность искажена, он воспринимает мир как поломку, которую нужно исправить, вернув всё в состояние «рядом-тепло-безопасно». Несмотря на высокий интеллект в своей узкой сфере, он социально дезадаптирован, иррационален в личных вопросах и страдает от хронического стресса и недосыпа.",
    relations: [{ "type": "is_creator_of", "entityId": "obj-comfort-unit-001", "entityTitle": "Мобильная Комфорт-Единица (МКЕ)" }],
    media: [],
    changelog: [{ version: "1.0", date: "71 OВ", author: "System", summary: "Initial record creation." }],
    roles: {
        global: ["specialist", "operative"]
    },
    vector_base: {
        A_Causality_Sanctity: 0.7, A_Memory_Fidelity: 0.9, A_Reversibility: 0.3, A_Legitimacy_Procedure: 0.2, A_Safety_Care: 0.8, A_Liberty_Autonomy: 0.6, A_Justice_Fairness: 0.5, A_Power_Sovereignty: 0.2, A_Knowledge_Truth: 0.8, A_Tradition_Continuity: 0.9, A_Transparency_Secrecy: 0.1, A_Aesthetic_Meaning: 0.9,
        B_discount_rate: 0.8, B_exploration_rate: 0.3, B_tolerance_ambiguity: 0.2, B_goal_coherence: 1.0, B_cooldown_discipline: 0.4, B_decision_temperature: 0.7,
        C_reciprocity_index: 0.6, C_betrayal_cost: 0.7, C_reputation_sensitivity: 0.3, C_dominance_empathy: 0.8, C_coalition_loyalty: 0.9,
        D_stamina_reserve: 0.5, D_pain_tolerance: 0.4, D_HPA_reactivity: 0.8, D_sleep_resilience: 0.2,
        E_KB_stem: 0.9, E_KB_civic: 0.3, E_KB_topos: 0.1, Model_calibration: 0.8, Skill_repair_topology: 0.0, Skill_causal_surgery: 0.0, Skill_chronicle_verify: 0.1, Skill_diplomacy_negotiation: 0.4, Skill_ops_fieldcraft: 0.0, Skill_opsec_hacking: 0.3, Epi_volume: 0.5, Epi_recency: 0.9, Epi_schema_strength: 1.0,
        F_Plasticity: 0.3, F_Value_update_rate: 0.1, F_Extinction_rate: 0.2, F_Trauma_plasticity: 0.9, Skill_learning_rate: 0.4, F_Forgetting_noise: 0.5,
        G_Self_concept_strength: 0.6, G_Identity_rigidity: 0.8, G_Self_consistency_drive: 0.9, G_Metacog_accuracy: 0.4, G_Narrative_agency: 0.7,
    },
    identity: {
        version_gates: [Branch.PreBorders], hard_caps: [], param_locked: [], locks_source: [], oaths: [], sigils: {}, chain_of_command: [],
        clearance_level: 3, consent_ledger: [], identity_chain_of_custody: [], sacred_set: [],
    },
    cognitive: {
        goals: [], core_values: ['кошка', 'безопасность'], utility_shape: { risk_aversion: 0.6, discount_rate: 0.8 },
        policy: { kind: "rule", params: { exploration_rate: 0.3, temperature: 0.7 } }, planning_horizon: 3,
        fallback_policy: "bring_it_back", 
        belief_state: {},
        observation_model: { noise_var: 0.1 }, report_model: { bias: 0, noise_var: 0.1 },
        affective_module: { anger: 50, fear: 70, hope: 90 },
        cognitive_biases: ["confirmation_bias"], counterfactual_skill: 40,
        protocol_fidelity: 20, audit_honesty: 50,
        deception_propensity: 30, tolerance_ambiguity: 20, goal_coherence: 100, shame_guilt_sensitivity: 70, compliance_index: 30, oversight_pressure: 10, cooldown_discipline: 40, salience_bias: 90,
        w_goals: {},
    },
    competencies: {
        competence_core: 90, decision_quality: 30, resilience: 40,
        causal_sensitivity: 20, topo_affinity: 10, mandate_literacy: 30,
        specializations: ['биоинженерия', 'синтез'], OPSEC_literacy: 30, deception_skill: 30,
    },
    state: {
        will: 70, loyalty: 40, dark_exposure: 10,
        drift_state: 25, burnout_risk: 0.9, backlog_load: 80,
    },
    memory: {
        attention: { E: 10, A_star: 10 },
        visibility_zone: 20, memory_write_rights: 1, iris_corridor_width: 10,
        witness_count: 5, mu_M_branch: 0.5, apophenia_debt: 15,
        visibility_lag_days: 0, consolidation_rate: 50, retrieval_noise: 0.3,
    },
    social: {
        audience_reputation: [{ segment: 'general', score: 30 }],
        dag_node_id: 'character-norr', reciprocity_index: 60, betrayal_cost: 70, reputation_sensitivity: 30,
        // FIX: Add missing 'causal_liability_share' property
        causal_liability_share: 0.05,
    },
    resources: {
        endowments: { attention_hours: 80, tokens: 200 }, time_budget_h: 72, inventory: [], mandate_power: 30,
        // FIX: Add missing 'co_sign_network' and 'risk_budget' properties
        co_sign_network: [],
        risk_budget: { cvar: 40, infra: 20, dark: 10, apophenia: 30 },
        risk_budget_cvar: 0.2, infra_budget: 0.3, dark_quota: 0.0,
        mandate_cooldowns: [],
    },
    sector: { sector_id: 'sector-default', L_star_personal: 10 },
    repro: { seed_id: 'character-norr-seed' },
    body: {
        sex_phenotype: 'typical_male',
        structural: { height_cm: 178, mass_kg: 68, shoulder_width_cm: 42, pelvis_width_cm: 38, limb_lengths: { arm_cm: 60, leg_cm: 80 }, hand_span_cm: 20, foot_length_cm: 26, center_of_mass: { height_rel: 0.55, depth_rel: 0.5 }, joint_laxity: 0.5 },
        functional: { strength_upper: 0.4, strength_lower: 0.4, aerobic_capacity: 0.5, recovery_speed: 0.5, explosive_power: 0.5, strength_endurance_profile: 0.5, injury_risk: { knees: 0.5, ankles: 0.5, lower_back: 0.5, shoulders: 0.5 } },
        adipose: { body_fat_percent: 16, metabolic_reserve: 0.6, fat_distribution: 'android' },
        hormonal: { has_cyclic_hormones: false, androgen_baseline: 0.7, stress_sensitivity: 0.7, sleep_sensitivity: 0.7, androgen_circadian_amplitude: 0.1 },
        reproductive: { can_be_pregnant: false, is_pregnant: false, fatigue_penalty: 0, heart_rate_increase: 0, injury_risk_increase: 0, emotional_lability: 0 },
        constitution: { height_cm: 178, mass_kg: 68, strength_max: 0.4, endurance_max: 0.5, dexterity: 0.6, vision_acuity: 0.9, hearing_db: 0, pain_tolerance: 0.4, cold_heat_tolerance: 0.5 },
        capacity: { fine_motor: 0.9, VO2max: 45 },
        reserves: { energy_store_kJ: 1000, hydration: 0.6, glycemia_mmol: 4.0, O2_margin: 0.5, sleep_homeostat_S: 0.8, circadian_phase_h: 4, sleep_debt_h: 30, immune_tone: 0.4 },
        acute: { hp: 80, injuries_severity: 0, pain_now: 10, temperature_c: 36.6, tremor: 0.1, reaction_time_ms: 250, fatigue: 90, stress: 80, moral_injury: 20 },
        regulation: { HPA_axis: 0.8, arousal: 0.4 },
    },
    tom: { self: null, perceived: {} },
    relationships: {},
    authority: {
      signature_weight: { infra: 0.6, civic: 0.1, diplomacy: 0.2, ops: 0.0, topo: 0.0, causal: 0.1, memory: 0.1, ethics: 0.1, markets: 0.1 },
      co_sign_threshold: 1,
    },
    evidence: { witness_pull: 0.2, evidence_quality: 0.9 },
    observation: { noise: 0.1, report_noise: 0.1 },
    context: { age: 35, faction: 'independent' },
    compute: { compute_budget: 70, decision_deadline_s: 3600, tom_depth: 2 },
    historicalEvents: [{
        id: 'personal-loss-mke', name: 'Потеря МКЕ', t: 0, years_ago: 0.1, domain: 'trauma',
        tags: ['loss', 'failure'], valence: -1, intensity: 1.0, duration_days: 1, surprise: 0.9,
        controllability: 0.1, responsibility_self: 0.8, secrecy: 'private',
    }],
};

export default data;
