
import { CharacterEntity, EntityType, Branch } from '../../types';

const data: CharacterEntity = {
    entityId: "character-rhea",
    type: EntityType.Character,
    title: "Рея",
    subtitle: "Опекун Контура",
    authors: [{ name: "auto_extract", role: "Source" }],
    year: "432",
    versionTags: [Branch.Current],
    status: "published",
    tags: ["опекун", "инфраструктура", "забота"],
    description: "Хранитель инфраструктуры и процедур. Рея обеспечивает стабильность систем жизнеобеспечения, придерживаясь традиций и проявляя высокую заботу о подопечных. Ориентирована на долгосрочное сохранение и безопасность.",
    relations: [],
    media: [],
    evidenceIds: [],
    changelog: [{ version: "1.0", date: "432 OВ", author: "System", summary: "Initial record creation." }],
    roles: {
        global: ["caretaker"]
    },
    vector_base: {
        // A) Values
        A_Causality_Sanctity: 0.70,
        A_Memory_Fidelity: 0.65,
        A_Reversibility: 0.40,
        A_Legitimacy_Procedure: 0.68,
        A_Safety_Care: 0.90,
        A_Liberty_Autonomy: 0.45,
        A_Justice_Fairness: 0.60,
        A_Power_Sovereignty: 0.35,
        A_Knowledge_Truth: 0.70,
        A_Tradition_Continuity: 0.80,
        A_Transparency_Secrecy: 0.45,
        A_Aesthetic_Meaning: 0.75,

        // B) Cognitive
        B_discount_rate: 0.30,
        B_exploration_rate: 0.35,
        B_tolerance_ambiguity: 0.45,
        B_goal_coherence: 0.80,
        B_cooldown_discipline: 0.75,
        B_decision_temperature: 0.40,

        // C) Social
        C_reciprocity_index: 0.60,
        C_betrayal_cost: 0.85,
        C_reputation_sensitivity: 0.45,
        C_dominance_empathy: 0.30,
        C_coalition_loyalty: 0.75,

        // D) Body/Neuro
        D_fine_motor: 0.80,
        D_stamina_reserve: 0.70,
        D_pain_tolerance: 0.70,
        D_HPA_reactivity: 0.60,
        D_sleep_resilience: 0.60,

        // E) Content
        E_KB_stem: 0.85,
        E_KB_civic: 0.55,
        E_KB_topos: 0.35,
        E_Model_calibration: 0.70,
        E_Skill_repair_topology: 0.75,
        E_Skill_causal_surgery: 0.60,
        E_Skill_chronicle_verify: 0.45,
        E_Skill_diplomacy_negotiation: 0.40,
        E_Skill_ops_fieldcraft: 0.55,
        E_Skill_opsec_hacking: 0.40,
        E_Epi_volume: 0.80,
        E_Epi_recency: 0.80,
        E_Epi_schema_strength: 0.75,

        // F) Dynamics
        F_Plasticity: 0.55,
        F_Value_update_rate: 0.35,
        F_Extinction_rate: 0.45,
        F_Trauma_plasticity: 0.75,
        F_Skill_learning_rate: 0.60,
        F_Forgetting_noise: 0.30,

        // G) Meta
        G_Self_concept_strength: 0.80,
        G_Identity_rigidity: 0.70,
        G_Self_consistency_drive: 0.80,
        G_Metacog_accuracy: 0.65,
        G_Narrative_agency: 0.60,
    },
    identity: {
        version_gates: [Branch.Current],
        hard_caps: [], param_locked: [], locks_source: [],
        oaths: [], sigils: {}, chain_of_command: [],
        clearance_level: 4, // 0.70
        consent_ledger: [], identity_chain_of_custody: [],
        sacred_set: [],
    },
    cognitive: {
        goals: [], core_values: ['забота', 'стабильность'], utility_shape: { risk_aversion: 0.7, discount_rate: 0.3 },
        policy: { kind: "rule", params: { exploration_rate: 0.35, temperature: 0.4 } }, 
        planning_horizon: 30,
        fallback_policy: "maintain_protocol", 
        belief_state: {},
        observation_model: { noise_var: 0.35 }, report_model: { bias: 0, noise_var: 0.45 },
        affective_module: { anger: 10, fear: 40, hope: 50 },
        cognitive_biases: [], counterfactual_skill: 60,
        protocol_fidelity: 80, audit_honesty: 70,
        deception_propensity: 20,
        tolerance_ambiguity: 45,
        goal_coherence: 80,
        shame_guilt_sensitivity: 70,
        compliance_index: 80,
        oversight_pressure: 50,
        cooldown_discipline: 75,
        salience_bias: 30,
        w_goals: {},
    },
    competencies: {
        competence_core: 80, decision_quality: 75, resilience: 75,
        causal_sensitivity: 70, topo_affinity: 60, mandate_literacy: 60,
        specializations: ['инфраструктура', 'ремонт', 'уход'], topo_windows: [],
        OPSEC_literacy: 40,
        deception_skill: 30,
    },
    state: {
        will: 80, loyalty: 80, dark_exposure: 30,
        drift_state: 5, burnout_risk: 0.2,
        backlog_load: 70,
        overload_sensitivity: 30,
    },
    memory: {
        attention: { E: 130, A_star: 140 }, // 0.65 / 0.70
        visibility_zone: 50, memory_write_rights: 2, iris_corridor_width: 50,
        witness_count: 40, mu_M_branch: 0.5, apophenia_debt: 5,
        visibility_lag_days: 1,
        consolidation_rate: 75,
        retrieval_noise: 0.35,
    },
    social: {
        audience_reputation: [{ segment: 'general', score: 65 }],
        dynamic_ties: {}, coalitions: [], commitments: [],
        dag_node_id: 'character-rhea', edges_out: [],
        causal_liability_share: 0.1,
        co_sign_latency: [],
        reciprocity_index: 60,
        betrayal_cost: 85,
        reputation_sensitivity: 45,
    },
    resources: {
        endowments: { attention_hours: 60, tokens: 1200 },
        time_budget_h: 126, // 0.75 * 168
        inventory: [], mandate_power: 50,
        co_sign_network: [],
        risk_budget: { cvar: 55, infra: 70, dark: 25, apophenia: 20 },
        mandate_cooldowns: [],
        risk_budget_cvar: 0.55,
        infra_budget: 0.70,
        dark_quota: 0.25,
    },
    sector: { sector_id: 'sector-infrastructure', L_star_personal: 30 },
    repro: { seed_id: 'character-rhea-seed' },
    body: {
        sex_phenotype: 'typical_female',
        structural: {
            height_cm: 168, mass_kg: 74,
            shoulder_width_cm: 40, pelvis_width_cm: 42,
            limb_lengths: { arm_cm: 60, leg_cm: 77 },
            hand_span_cm: 17, foot_length_cm: 23,
            center_of_mass: { height_rel: 0.53, depth_rel: 0.55 },
            joint_laxity: 0.5
        },
        functional: {
            strength_upper: 0.70, 
            strength_lower: 0.70, 
            explosive_power: 0.65, 
            aerobic_capacity: 0.70,
            recovery_speed: 0.75, 
            strength_endurance_profile: 0.75, 
            injury_risk: { knees: 0.6, ankles: 0.6, lower_back: 0.5, shoulders: 0.4 }
        },
        adipose: { body_fat_percent: 24, metabolic_reserve: 0.70, fat_distribution: 'gynoid' },
        hormonal: {
            has_cyclic_hormones: true, androgen_baseline: 0.3, androgen_circadian_amplitude: 0.1,
            stress_sensitivity: 0.5, sleep_sensitivity: 0.5
        },
        reproductive: { can_be_pregnant: true, is_pregnant: false, fatigue_penalty: 0, heart_rate_increase: 0, injury_risk_increase: 0, emotional_lability: 0 },
        constitution: {
            height_cm: 168, mass_kg: 74,
            strength_max: 0.70, endurance_max: 0.70, dexterity: 0.75,
            vision_acuity: 0.70, hearing_db: 0,
            pain_tolerance: 0.70, cold_heat_tolerance: 0.65,
        },
        capacity: { fine_motor: 0.80, VO2max: 70 },
        reserves: {
            energy_store_kJ: 1400, hydration: 0.70, 
            glycemia_mmol: 5.0, 
            O2_margin: 0.60,
            sleep_homeostat_S: 0.50, circadian_phase_h: 9, sleep_debt_h: 1, 
            immune_tone: 0.65,
        },
        acute: {
            hp: 88, 
            injuries_severity: 10, pain_now: 15, temperature_c: 36.9, tremor: 0.10, reaction_time_ms: 300,
            fatigue: 40, stress: 50, moral_injury: 35,
        },
        regulation: { HPA_axis: 0.60, arousal: 0.55 },
    },
    tom: { self: null, perceived: {} },
    relationships: {},
    goal_graph: { nodes: [], edges: [] },
    authority: {
      signature_weight: { 
          causal: 0.5, topo: 0.5, civic: 0.50, infra: 0.80, 
          memory: 0.5, ethics: 0.5, markets: 0.5, security: 0.40
      },
      co_sign_threshold: 2, // 0.65
    },
    evidence: { witness_pull: 0.60, evidence_quality: 0.75 },
    observation: { noise: 0.35, report_noise: 0.45 },
    context: { 
        age: 42,
        faction: "independent"
    },
    compute: { compute_budget: 65, decision_deadline_s: 2, tom_depth: 2 },
    historicalEvents: [
        {
            id: 'hist-rhea-1', name: 'Детство в элите', t: 0, years_ago: 35, domain: 'comfort',
            tags: ['zero_scarcity', 'high_safety', 'comfort_norm', 'elite_environment'],
            valence: 1, intensity: 0.2, duration_days: 1825, surprise: 0, controllability: 0.8, responsibility_self: 0, secrecy: 'private'
        },
        {
            id: 'hist-rhea-2', name: 'Жизнь по протоколам', t: 0, years_ago: 33, domain: 'socialization',
            tags: ['procedural_over_social', 'role_over_self', 'emotional_constraints'],
            valence: 0, intensity: 0.4, duration_days: 2190, surprise: 0, controllability: 0.1, responsibility_self: 0.3, secrecy: 'private'
        },
        {
            id: 'hist-rhea-3', name: 'Ограниченные контакты', t: 0, years_ago: 31, domain: 'isolation',
            tags: ['controlled_relationships', 'attachment_distortion_elite', 'image_first'],
            valence: -1, intensity: 0.5, duration_days: 2500, surprise: 0, controllability: 0.2, responsibility_self: 0, secrecy: 'private'
        },
        {
            id: 'hist-rhea-4', name: 'Визит в низы (Разрушение фасада)', t: 0, years_ago: 28, domain: 'discovery',
            tags: ['façade_break', 'empathy_trigger', 'injustice_exposure', 'reality_vs_reports'],
            valence: -1, intensity: 0.7, duration_days: 1, surprise: 0.9, controllability: 0, responsibility_self: 0, secrecy: 'private'
        },
        {
            id: 'hist-rhea-5', name: 'Участие в реформе', t: 0, years_ago: 26, domain: 'moral_compromise',
            tags: ['coerced_complicity', 'legitimacy_exploitation', 'political_naivety_loss'],
            valence: -1, intensity: 0.6, duration_days: 700, surprise: 0.3, controllability: 0.4, responsibility_self: 0.6, secrecy: 'public'
        },
        {
            id: 'hist-rhea-6', name: 'Лицо реформ (Ложь)', t: 0, years_ago: 22, domain: 'deception',
            tags: ['symbolic_role', 'instrumentalization', 'identity_erosion'],
            valence: 0, intensity: 0.6, duration_days: 1400, surprise: 0.2, controllability: 0.3, responsibility_self: 0.7, secrecy: 'public'
        },
        {
            id: 'hist-rhea-7', name: 'Подавление бунта', t: 0, years_ago: 21, domain: 'moral_compromise',
            tags: ['moral_compromise', 'institution_pressure', 'public_responsibility', 'collective_punishment_consequence'],
            valence: -1, intensity: 1.0, duration_days: 5, surprise: 0.7, controllability: 0.2, responsibility_self: 0.8, secrecy: 'public',
            trauma: { domain: 'others', severity: 0.8, kind: 'moral_compromise' }
        },
        {
            id: 'hist-rhea-8', name: 'Наблюдение репрессий', t: 0, years_ago: 21, domain: 'guilt',
            tags: ['guilt_persistence', 'moral_dissonance', 'legitimacy_crack'],
            valence: -1, intensity: 0.9, duration_days: 700, surprise: 0, controllability: 0.1, responsibility_self: 0.1, secrecy: 'private'
        },
        {
            id: 'hist-rhea-9', name: 'Внутренняя оппозиция', t: 0, years_ago: 17, domain: 'ideology',
            tags: ['internal_opposition', 'controlled_dissent', 'legitimacy_reconstruction_attempt'],
            valence: 1, intensity: 0.4, duration_days: 1000, surprise: 0, controllability: 0.9, responsibility_self: 1.0, secrecy: 'private'
        }
    ],
};

export default data;
