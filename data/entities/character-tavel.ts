
import { CharacterEntity, EntityType, Branch } from '../../types';

const data: CharacterEntity = {
    entityId: "character-tavel",
    type: EntityType.Character,
    title: "Тавель",
    subtitle: "Ведущий специалист, Хранитель Протокола",
    authors: [{ name: "auto_extract", role: "Source" }],
    year: "71",
    versionTags: [Branch.PreBorders],
    status: "published",
    tags: ["ученый", "протокол", "репутация", "эксперт"],
    description: "Высококлассный специалист, чья идентичность построена на безупречной репутации и строгом соблюдении протоколов. Она действует, исходя из долгосрочного опыта и выверенных моделей, стремясь к максимальной предсказуемости и контролю. Ее главный драйвер — стремление к самосогласованности, где ее действия должны соответствовать ее образу идеального ученого.",
    relations: [
        { "type": "works_with", "entityId": "character-norr", "entityTitle": "Норр" },
        { "type": "works_with", "entityId": "character-bruni", "entityTitle": "Бруни" }
    ],
    media: [],
    changelog: [{ version: "1.0", date: "71 OВ", author: "System", summary: "Initial record creation." }],
    roles: {
        global: ["advisor", "specialist"]
    },
    vector_base: {
        A_Causality_Sanctity: 0.9, A_Memory_Fidelity: 0.6, A_Reversibility: 0.8, A_Legitimacy_Procedure: 1.0, A_Safety_Care: 0.6, A_Liberty_Autonomy: 0.5, A_Justice_Fairness: 0.7, A_Power_Sovereignty: 0.4, A_Knowledge_Truth: 0.9, A_Tradition_Continuity: 0.7, A_Transparency_Secrecy: 0.3, A_Aesthetic_Meaning: 0.1,
        B_discount_rate: 0.2, B_exploration_rate: 0.6, B_tolerance_ambiguity: 0.4, B_goal_coherence: 0.8, B_cooldown_discipline: 0.9, B_decision_temperature: 0.2,
        C_reciprocity_index: 0.7, C_betrayal_cost: 0.9, C_reputation_sensitivity: 1.0, C_dominance_empathy: 0.3, C_coalition_loyalty: 0.8,
        D_stamina_reserve: 0.6, D_pain_tolerance: 0.5, D_HPA_reactivity: 0.6, D_sleep_resilience: 0.7,
        E_KB_stem: 0.9, E_KB_civic: 0.8, E_KB_topos: 0.2, Model_calibration: 0.9, Skill_repair_topology: 0.0, Skill_causal_surgery: 0.0, Skill_chronicle_verify: 0.7, Skill_diplomacy_negotiation: 0.6, Skill_ops_fieldcraft: 0.0, Skill_opsec_hacking: 0.7, Epi_volume: 0.6, Epi_recency: 0.3, Epi_schema_strength: 0.8,
        F_Plasticity: 0.4, F_Value_update_rate: 0.2, F_Extinction_rate: 0.3, F_Trauma_plasticity: 0.1, Skill_learning_rate: 0.7, F_Forgetting_noise: 0.3,
        G_Self_concept_strength: 0.9, G_Identity_rigidity: 0.8, G_Self_consistency_drive: 1.0, G_Metacog_accuracy: 0.8, G_Narrative_agency: 0.9,
    },
    identity: {
        version_gates: [Branch.PreBorders], hard_caps: [], param_locked: [], locks_source: [], oaths: [], sigils: {}, chain_of_command: [],
        clearance_level: 4, consent_ledger: [], identity_chain_of_custody: [], sacred_set: [],
    },
    cognitive: {
        goals: [], core_values: ['протокол', 'репутация'], utility_shape: { risk_aversion: 0.8, discount_rate: 0.2 },
        policy: { kind: "rule", params: { exploration_rate: 0.1, temperature: 0.2 } }, planning_horizon: 100,
        fallback_policy: "consult_protocol", 
        belief_state: {},
        observation_model: { noise_var: 0.2 }, report_model: { bias: 0, noise_var: 0.1 },
        affective_module: { anger: 30, fear: 40, hope: 60 },
        cognitive_biases: ["availability_heuristic"], counterfactual_skill: 70,
        protocol_fidelity: 100, audit_honesty: 90,
        deception_propensity: 10, tolerance_ambiguity: 40, goal_coherence: 80, shame_guilt_sensitivity: 80, compliance_index: 80, oversight_pressure: 90, cooldown_discipline: 90, salience_bias: 20,
        w_goals: {},
    },
    competencies: {
        competence_core: 90, decision_quality: 85, resilience: 70,
        causal_sensitivity: 50, topo_affinity: 20, mandate_literacy: 90,
        specializations: ['зоология', 'протоколы'], OPSEC_literacy: 70, deception_skill: 20,
    },
    state: {
        will: 80, loyalty: 70, dark_exposure: 20,
        drift_state: 10, burnout_risk: 0.4, backlog_load: 70,
    },
    memory: {
        attention: { E: 60, A_star: 70 },
        visibility_zone: 60, memory_write_rights: 3, iris_corridor_width: 50,
        witness_count: 40, mu_M_branch: 0.7, apophenia_debt: 5,
        visibility_lag_days: 0, consolidation_rate: 80, retrieval_noise: 0.2,
    },
    social: {
        audience_reputation: [{ segment: 'general', score: 80 }],
        dag_node_id: 'character-tavel', reciprocity_index: 70, betrayal_cost: 90, reputation_sensitivity: 100,
        // FIX: Add missing 'causal_liability_share' property
        causal_liability_share: 0.1,
    },
    resources: {
        endowments: { attention_hours: 60, tokens: 1200 }, time_budget_h: 67, inventory: [], mandate_power: 70,
        // FIX: Add missing 'co_sign_network' and 'risk_budget' properties
        co_sign_network: [],
        risk_budget: { cvar: 20, infra: 50, dark: 20, apophenia: 10 },
        risk_budget_cvar: 0.5, infra_budget: 0.6, dark_quota: 0.1,
        mandate_cooldowns: [],
    },
    sector: { sector_id: 'sector-science', L_star_personal: 20 },
    repro: { seed_id: 'character-tavel-seed' },
    body: {
        sex_phenotype: 'typical_female',
        structural: { height_cm: 165, mass_kg: 58, shoulder_width_cm: 40, pelvis_width_cm: 42, limb_lengths: { arm_cm: 60, leg_cm: 75 }, hand_span_cm: 18, foot_length_cm: 23, center_of_mass: { height_rel: 0.53, depth_rel: 0.5 }, joint_laxity: 0.6 },
        functional: { strength_upper: 0.5, strength_lower: 0.5, aerobic_capacity: 0.6, recovery_speed: 0.6, explosive_power: 0.4, strength_endurance_profile: 0.6, injury_risk: { knees: 0.5, ankles: 0.5, lower_back: 0.5, shoulders: 0.5 } },
        adipose: { body_fat_percent: 25, metabolic_reserve: 0.7, fat_distribution: 'gynoid' },
        hormonal: { has_cyclic_hormones: true, androgen_baseline: 0.2, stress_sensitivity: 0.4, sleep_sensitivity: 0.5, androgen_circadian_amplitude: 0.1 },
        reproductive: { can_be_pregnant: true, is_pregnant: false, fatigue_penalty: 0, heart_rate_increase: 0, injury_risk_increase: 0, emotional_lability: 0 },
        constitution: { height_cm: 165, mass_kg: 58, strength_max: 0.5, endurance_max: 0.7, dexterity: 0.7, vision_acuity: 0.8, hearing_db: 0, pain_tolerance: 0.5, cold_heat_tolerance: 0.6 },
        capacity: { fine_motor: 0.8, VO2max: 50 },
        reserves: { energy_store_kJ: 1400, hydration: 0.8, glycemia_mmol: 5.2, O2_margin: 0.6, sleep_homeostat_S: 0.3, circadian_phase_h: 23, sleep_debt_h: 2, immune_tone: 0.8 },
        acute: { hp: 90, injuries_severity: 0, pain_now: 0, temperature_c: 36.7, tremor: 0.0, reaction_time_ms: 220, fatigue: 20, stress: 50, moral_injury: 0 },
        regulation: { HPA_axis: 0.6, arousal: 0.7 },
    },
    tom: { self: null, perceived: {} },
    relationships: {},
    authority: {
      signature_weight: { infra: 0.8, civic: 0.4, diplomacy: 0.3, ops: 0.2, topo: 0.1, causal: 0.5, memory: 0.6, ethics: 0.7, markets: 0.2 },
      co_sign_threshold: 0,
    },
    evidence: { witness_pull: 0.7, evidence_quality: 0.8 },
    observation: { noise: 0.2, report_noise: 0.1 },
    context: { age: 38, faction: 'independent' },
    compute: { compute_budget: 80, decision_deadline_s: 3600, tom_depth: 3 },
    historicalEvents: [],
};

export default data;
