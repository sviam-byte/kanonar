
import { CharacterEntity, EntityType, Branch } from '../../types';

const data: CharacterEntity = {
    entityId: "character-bruni",
    type: EntityType.Character,
    title: "Бруни",
    subtitle: "Системный Хакер, Решатель",
    authors: [{ name: "auto_extract", role: "Source" }],
    year: "71",
    versionTags: [Branch.PreBorders],
    status: "published",
    tags: ["исследователь", "хакер", "эвристика", "пластичность"],
    description: "Энергичный и неортодоксальный исследователь, который мыслит как «хакер» систем. Он получает удовольствие от решения нерешаемых задач и поиска парадоксов, не заботясь о долгосрочной стратегии или протоколах. Его сила — в чрезвычайно высокой пластичности, быстрой обучаемости и способности находить нестандартные решения.",
    relations: [
        { "type": "works_with", "entityId": "character-norr", "entityTitle": "Норр" },
        { "type": "works_with", "entityId": "character-tavel", "entityTitle": "Тавель" }
    ],
    media: [],
    changelog: [{ version: "1.0", date: "71 OВ", author: "System", summary: "Initial record creation." }],
    roles: {
        global: ["operative", "advisor"]
    },
    vector_base: {
        A_Causality_Sanctity: 0.5, A_Memory_Fidelity: 0.4, A_Reversibility: 0.5, A_Legitimacy_Procedure: 0.1, A_Safety_Care: 0.4, A_Liberty_Autonomy: 0.9, A_Justice_Fairness: 0.5, A_Power_Sovereignty: 0.3, A_Knowledge_Truth: 0.7, A_Tradition_Continuity: 0.2, A_Transparency_Secrecy: 0.4, A_Aesthetic_Meaning: 0.7,
        B_discount_rate: 0.6, B_exploration_rate: 0.9, B_tolerance_ambiguity: 0.8, B_goal_coherence: 0.6, B_cooldown_discipline: 0.3, B_decision_temperature: 0.8,
        C_reciprocity_index: 0.8, C_betrayal_cost: 0.6, C_reputation_sensitivity: 0.2, C_dominance_empathy: 0.6, C_coalition_loyalty: 0.8,
        D_stamina_reserve: 0.7, D_pain_tolerance: 0.6, D_HPA_reactivity: 0.3, D_sleep_resilience: 0.8,
        E_KB_stem: 0.8, E_KB_civic: 0.5, E_KB_topos: 0.4, Model_calibration: 0.6, Skill_repair_topology: 0.0, Skill_causal_surgery: 0.0, Skill_chronicle_verify: 0.4, Skill_diplomacy_negotiation: 0.8, Skill_ops_fieldcraft: 0.0, Skill_opsec_hacking: 0.6, Epi_volume: 0.7, Epi_recency: 0.5, Epi_schema_strength: 0.3,
        F_Plasticity: 0.9, F_Value_update_rate: 0.7, F_Extinction_rate: 0.8, F_Trauma_plasticity: 0.2, F_Skill_learning_rate: 0.9, F_Forgetting_noise: 0.4,
        G_Self_concept_strength: 0.8, G_Identity_rigidity: 0.2, G_Self_consistency_drive: 0.4, G_Metacog_accuracy: 0.7, G_Narrative_agency: 0.5,
    },
    identity: {
        version_gates: [Branch.PreBorders], hard_caps: [], param_locked: [], locks_source: [], oaths: [], sigils: {}, chain_of_command: [],
        clearance_level: 3, consent_ledger: [], identity_chain_of_custody: [], sacred_set: [],
    },
    cognitive: {
        goals: [], core_values: ['интерес', 'решение'], utility_shape: { risk_aversion: 0.2, discount_rate: 0.6 },
        policy: { kind: "rule", params: { exploration_rate: 0.9, temperature: 0.8 } }, planning_horizon: 5,
        fallback_policy: "find_exploit", 
        belief_state: {},
        observation_model: { noise_var: 0.4 }, report_model: { bias: 0, noise_var: 0.3 },
        affective_module: { anger: 20, fear: 30, hope: 80 },
        cognitive_biases: ["overconfidence"], counterfactual_skill: 85,
        protocol_fidelity: 10, audit_honesty: 60,
        deception_propensity: 50, tolerance_ambiguity: 80, goal_coherence: 60, shame_guilt_sensitivity: 20, compliance_index: 20, oversight_pressure: 30, cooldown_discipline: 30, salience_bias: 60,
        w_goals: {},
    },
    competencies: {
        competence_core: 85, decision_quality: 75, resilience: 80,
        causal_sensitivity: 30, topo_affinity: 40, mandate_literacy: 50,
        specializations: ['энтомология', 'эвристика'], OPSEC_literacy: 60, deception_skill: 60,
    },
    state: {
        will: 85, loyalty: 50, dark_exposure: 10,
        drift_state: 5, burnout_risk: 0.2, backlog_load: 60,
    },
    memory: {
        attention: { E: 40, A_star: 40 },
        visibility_zone: 50, memory_write_rights: 2, iris_corridor_width: 60,
        witness_count: 20, mu_M_branch: 0.4, apophenia_debt: 20,
        visibility_lag_days: 0, consolidation_rate: 60, retrieval_noise: 0.3,
    },
    social: {
        audience_reputation: [{ segment: 'general', score: 60 }],
        dag_node_id: 'character-bruni', reciprocity_index: 80, betrayal_cost: 60, reputation_sensitivity: 20,
        // FIX: Add missing 'causal_liability_share' property
        causal_liability_share: 0.15,
    },
    resources: {
        endowments: { attention_hours: 50, tokens: 800 }, time_budget_h: 58, inventory: [], mandate_power: 40,
        // FIX: Add missing 'co_sign_network' and 'risk_budget' properties
        co_sign_network: [],
        risk_budget: { cvar: 60, infra: 30, dark: 40, apophenia: 50 },
        risk_budget_cvar: 0.8, infra_budget: 0.4, dark_quota: 0.1,
        mandate_cooldowns: [],
    },
    sector: { sector_id: 'sector-research', L_star_personal: 15 },
    repro: { seed_id: 'character-bruni-seed' },
    body: {
        sex_phenotype: 'typical_male',
        structural: { height_cm: 182, mass_kg: 75, shoulder_width_cm: 44, pelvis_width_cm: 38, limb_lengths: { arm_cm: 62, leg_cm: 82 }, hand_span_cm: 20, foot_length_cm: 27, center_of_mass: { height_rel: 0.55, depth_rel: 0.5 }, joint_laxity: 0.5 },
        functional: { strength_upper: 0.6, strength_lower: 0.6, aerobic_capacity: 0.6, recovery_speed: 0.7, explosive_power: 0.6, strength_endurance_profile: 0.6, injury_risk: { knees: 0.5, ankles: 0.5, lower_back: 0.5, shoulders: 0.5 } },
        adipose: { body_fat_percent: 16, metabolic_reserve: 0.6, fat_distribution: 'android' },
        hormonal: { has_cyclic_hormones: false, androgen_baseline: 0.7, stress_sensitivity: 0.7, sleep_sensitivity: 0.7, androgen_circadian_amplitude: 0.1 },
        reproductive: { can_be_pregnant: false, is_pregnant: false, fatigue_penalty: 0, heart_rate_increase: 0, injury_risk_increase: 0, emotional_lability: 0 },
        constitution: { height_cm: 182, mass_kg: 75, strength_max: 0.6, endurance_max: 0.8, dexterity: 0.5, vision_acuity: 0.7, hearing_db: 0, pain_tolerance: 0.6, cold_heat_tolerance: 0.7 },
        capacity: { fine_motor: 0.6, VO2max: 55 },
        reserves: { energy_store_kJ: 1600, hydration: 0.7, glycemia_mmol: 4.8, O2_margin: 0.7, sleep_homeostat_S: 0.2, circadian_phase_h: 22, sleep_debt_h: 0, immune_tone: 0.7 },
        acute: { hp: 100, injuries_severity: 0, pain_now: 0, temperature_c: 36.6, tremor: 0.0, reaction_time_ms: 200, fatigue: 10, stress: 30, moral_injury: 0 },
        regulation: { HPA_axis: 0.3, arousal: 0.8 },
    },
    tom: { self: null, perceived: {} },
    relationships: {},
    authority: {
      signature_weight: { infra: 0.5, civic: 0.2, diplomacy: 0.7, ops: 0.1, topo: 0.2, causal: 0.3, memory: 0.4, ethics: 0.5, markets: 0.3 },
      co_sign_threshold: 1,
    },
    evidence: { witness_pull: 0.5, evidence_quality: 0.6 },
    observation: { noise: 0.4, report_noise: 0.3 },
    context: { age: 36, faction: 'independent' },
    compute: { compute_budget: 90, decision_deadline_s: 3600, tom_depth: 4 },
    historicalEvents: [],
};

export default data;
