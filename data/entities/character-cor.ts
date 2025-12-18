
import { CharacterEntity, EntityType, Branch } from '../../types';

const data: CharacterEntity = {
    entityId: "character-cor",
    type: EntityType.Character,
    title: "Кор",
    subtitle: "Силовой Комиссар",
    authors: [{ name: "auto_extract", role: "Source" }],
    year: "432",
    versionTags: [Branch.Current],
    status: "published",
    tags: ["силовик", "тень", "безопасность"],
    description: "Ветеран теневых операций, обеспечивающий безопасность через силу и контроль. Обладает высоким болевым порогом и устойчивостью к темному воздействию, но низкой эмпатией. Специализируется на жестких решениях.",
    relations: [],
    media: [],
    evidenceIds: [],
    changelog: [{ version: "1.0", date: "432 OВ", author: "System", summary: "Initial record creation." }],
    roles: {
        global: ["enforcer", "security"]
    },
    vector_base: {
        // A) Values
        A_Causality_Sanctity: 0.65,
        A_Memory_Fidelity: 0.55,
        A_Reversibility: 0.30,
        A_Legitimacy_Procedure: 0.75,
        A_Safety_Care: 0.30,
        A_Liberty_Autonomy: 0.40,
        A_Justice_Fairness: 0.55,
        A_Power_Sovereignty: 0.80,
        A_Knowledge_Truth: 0.55,
        A_Tradition_Continuity: 0.80,
        A_Transparency_Secrecy: 0.35,
        A_Aesthetic_Meaning: 0.50,

        // B) Cognitive
        B_discount_rate: 0.35,
        B_exploration_rate: 0.25,
        B_tolerance_ambiguity: 0.30,
        B_goal_coherence: 0.80,
        B_cooldown_discipline: 0.80,
        B_decision_temperature: 0.45,

        // C) Social
        C_reciprocity_index: 0.45,
        C_betrayal_cost: 0.90,
        C_reputation_sensitivity: 0.60,
        C_dominance_empathy: 0.80,
        C_coalition_loyalty: 0.90,

        // D) Body/Neuro
        D_fine_motor: 0.60,
        D_stamina_reserve: 0.85,
        D_pain_tolerance: 0.90,
        D_HPA_reactivity: 0.75,
        D_sleep_resilience: 0.75,

        // E) Content
        E_KB_stem: 0.60,
        E_KB_civic: 0.55,
        E_KB_topos: 0.30,
        E_Model_calibration: 0.50,
        E_Skill_repair_topology: 0.30,
        E_Skill_causal_surgery: 0.40,
        E_Skill_chronicle_verify: 0.30,
        E_Skill_diplomacy_negotiation: 0.25,
        E_Skill_ops_fieldcraft: 0.85,
        E_Skill_opsec_hacking: 0.60,
        E_Epi_volume: 0.85,
        E_Epi_recency: 0.85,
        E_Epi_schema_strength: 0.80,

        // F) Dynamics
        F_Plasticity: 0.45,
        F_Value_update_rate: 0.30,
        F_Extinction_rate: 0.35,
        F_Trauma_plasticity: 0.80,
        F_Skill_learning_rate: 0.55,
        F_Forgetting_noise: 0.30,

        // G) Meta
        G_Self_concept_strength: 0.90,
        G_Identity_rigidity: 0.80,
        G_Self_consistency_drive: 0.85,
        G_Metacog_accuracy: 0.55,
        G_Narrative_agency: 0.60,
    },
    identity: {
        version_gates: [Branch.Current],
        hard_caps: [], param_locked: [], locks_source: [],
        oaths: [], sigils: { sword: true }, chain_of_command: [],
        clearance_level: 4, // 0.80
        consent_ledger: [], identity_chain_of_custody: [],
        sacred_set: [],
    },
    cognitive: {
        goals: [], core_values: ['порядок', 'сила'], utility_shape: { risk_aversion: 0.3, discount_rate: 0.35 },
        policy: { kind: "rule", params: { exploration_rate: 0.25, temperature: 0.45 } }, 
        planning_horizon: 10,
        fallback_policy: "enforce", 
        belief_state: {},
        observation_model: { noise_var: 0.45 }, report_model: { bias: 0, noise_var: 0.50 },
        affective_module: { anger: 60, fear: 20, hope: 20 },
        cognitive_biases: [], counterfactual_skill: 40,
        protocol_fidelity: 80, audit_honesty: 60,
        deception_propensity: 40,
        tolerance_ambiguity: 30,
        goal_coherence: 80,
        shame_guilt_sensitivity: 30,
        compliance_index: 90,
        oversight_pressure: 70,
        cooldown_discipline: 80,
        salience_bias: 70,
        w_goals: {},
    },
    competencies: {
        competence_core: 85, decision_quality: 80, resilience: 90,
        causal_sensitivity: 65, topo_affinity: 40, mandate_literacy: 60,
        specializations: ['безопасность', 'силовые операции', 'допрос'], topo_windows: [],
        OPSEC_literacy: 60,
        deception_skill: 40,
    },
    state: {
        will: 85, loyalty: 90, dark_exposure: 70,
        drift_state: 20, burnout_risk: 0.4,
        backlog_load: 55,
        overload_sensitivity: 20,
    },
    memory: {
        attention: { E: 120, A_star: 110 }, // 0.60 / 0.55
        visibility_zone: 60, memory_write_rights: 3, iris_corridor_width: 50,
        witness_count: 20, mu_M_branch: 0.5, apophenia_debt: 10,
        visibility_lag_days: 2,
        consolidation_rate: 80,
        retrieval_noise: 0.40,
    },
    social: {
        audience_reputation: [{ segment: 'general', score: 40 }],
        dynamic_ties: {}, coalitions: [], commitments: [],
        dag_node_id: 'character-cor', edges_out: [],
        causal_liability_share: 0.2,
        co_sign_latency: [],
        reciprocity_index: 45,
        betrayal_cost: 90,
        reputation_sensitivity: 60,
    },
    resources: {
        endowments: { attention_hours: 84, tokens: 1000 },
        time_budget_h: 84, // 0.50
        inventory: [], mandate_power: 70,
        co_sign_network: [],
        risk_budget: { cvar: 80, infra: 50, dark: 60, apophenia: 20 },
        mandate_cooldowns: [],
        risk_budget_cvar: 0.80,
        infra_budget: 0.50,
        dark_quota: 0.65,
        dose: 0.70,
    },
    sector: { sector_id: 'sector-security', L_star_personal: 15 },
    repro: { seed_id: 'character-cor-seed' },
    body: {
        sex_phenotype: 'typical_male',
        structural: {
            height_cm: 182, mass_kg: 90,
            shoulder_width_cm: 46, pelvis_width_cm: 38,
            limb_lengths: { arm_cm: 68, leg_cm: 88 },
            hand_span_cm: 21, foot_length_cm: 29,
            center_of_mass: { height_rel: 0.56, depth_rel: 0.5 },
            joint_laxity: 0.4
        },
        functional: {
            strength_upper: 0.85, strength_lower: 0.85, 
            explosive_power: 0.80, aerobic_capacity: 0.75,
            recovery_speed: 0.80, strength_endurance_profile: 0.85,
            injury_risk: { knees: 0.4, ankles: 0.4, lower_back: 0.5, shoulders: 0.5 }
        },
        adipose: { body_fat_percent: 16, metabolic_reserve: 0.60, fat_distribution: 'android' },
        hormonal: {
            has_cyclic_hormones: false, androgen_baseline: 0.8, androgen_circadian_amplitude: 0.2,
            stress_sensitivity: 0.3, sleep_sensitivity: 0.4
        },
        reproductive: { can_be_pregnant: false, is_pregnant: false, fatigue_penalty: 0, heart_rate_increase: 0, injury_risk_increase: 0, emotional_lability: 0 },
        constitution: {
            height_cm: 182, mass_kg: 90,
            strength_max: 0.85, endurance_max: 0.80, dexterity: 0.65,
            vision_acuity: 0.75, hearing_db: 0, // partial loss implied in description, kept numerical
            pain_tolerance: 0.90, cold_heat_tolerance: 0.70,
        },
        capacity: { fine_motor: 0.60, VO2max: 80 },
        reserves: {
            energy_store_kJ: 1600, hydration: 0.60, 
            glycemia_mmol: 5.0, 
            O2_margin: 0.70,
            sleep_homeostat_S: 0.45, circadian_phase_h: 11, sleep_debt_h: 2, 
            immune_tone: 0.60,
        },
        acute: {
            hp: 85, 
            injuries_severity: 25, pain_now: 25, temperature_c: 37.0, tremor: 0.15, reaction_time_ms: 240,
            fatigue: 45, stress: 55, moral_injury: 70,
        },
        regulation: { HPA_axis: 0.75, arousal: 0.60 },
    },
    tom: { self: null, perceived: {} },
    relationships: {},
    goal_graph: { nodes: [], edges: [] },
    authority: {
      signature_weight: { 
          causal: 0.5, topo: 0.5, civic: 0.40, infra: 0.35, 
          memory: 0.5, ethics: 0.5, markets: 0.5, security: 0.85 
      },
      co_sign_threshold: 1, // 0.40
    },
    evidence: { witness_pull: 0.65, evidence_quality: 0.55 },
    observation: { noise: 0.45, report_noise: 0.50 },
    context: { 
        age: 45,
        faction: "royal_guard"
    },
    compute: { compute_budget: 55, decision_deadline_s: 0.5, tom_depth: 2 },
    historicalEvents: [],
};

export default data;
