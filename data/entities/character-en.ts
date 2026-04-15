
import { CharacterEntity, EntityType, Branch } from '../../types';
import { defaultBody } from '../../lib/character-snippet';

// Эн — стёртый персонаж. Существует только как связь, как объект памяти Тамира.
// Файл минимален, потому что Эн в мире больше нет — но entityId нужен для relationship graph.

const data: CharacterEntity = {
    entityId: "character-en",
    type: EntityType.Character,
    title: "Эн",
    subtitle: "Стёртая",
    authors: [{ name: "auto_extract", role: "Source" }],
    year: "430",
    versionTags: [Branch.Current],
    status: "published",
    tags: ["стирание", "утрата", "СМСБ", "призрак"],
    description: "Эн больше не существует. Она была стёрта — не убита, не изгнана, а именно стёрта: институциональная процедура, после которой мир ведёт себя так, будто её никогда не было. Единственное доказательство, что она существовала — записная книжка Тамира с 250 ежедневными верификациями. Этот файл существует как узел для связей, а не как действующий агент.",
    relations: [
        { type: "was_bonded_to", entityId: "character-tamir", entityTitle: "Тамир" },
    ],
    media: [],
    evidenceIds: [],
    vector_base: {
        A_Safety_Care: 0.8,
        A_Knowledge_Truth: 0.7,
        A_Memory_Fidelity: 0.6,
        A_Aesthetic_Meaning: 0.7,
        C_dominance_empathy: 0.8,
        C_reciprocity_index: 0.7,
        G_Narrative_agency: 0.3,
    },
    body: JSON.parse(JSON.stringify(defaultBody)),
    identity: {
        version_gates: [Branch.Current], hard_caps: [], param_locked: [], locks_source: [],
        oaths: [], sigils: {}, chain_of_command: [],
        clearance_level: 0,
        consent_ledger: [], identity_chain_of_custody: [],
        sacred_set: [],
        self_concept: "Стёрта",
    },
    cognitive: {
        goals: [], core_values: [], utility_shape: { risk_aversion: 0.5 },
        policy: { kind: 'rule', params: {} }, planning_horizon: 0,
        fallback_policy: 'none',
        belief_state: {}, observation_model: { noise_var: 1.0 }, report_model: { bias: 0, noise_var: 1.0 },
        affective_module: { anger: 0, fear: 0, hope: 0 }, cognitive_biases: [], counterfactual_skill: 0,
        w_goals: {},
    },
    state: { will: 0, loyalty: 0, dark_exposure: 0, drift_state: 0, burnout_risk: 0 },
    social: { audience_reputation: [], dag_node_id: 'character-en', causal_liability_share: 0 },
    sector: { sector_id: 'sector-erased', L_star_personal: 0 },
    repro: { seed_id: 'en-seed' },
    authority: { signature_weight: { causal: 0, topo: 0, civic: 0, infra: 0, memory: 0, ethics: 0, markets: 0 }, co_sign_threshold: 99 },
    evidence: { witness_pull: 0, evidence_quality: 0 },
    observation: { noise: 1.0, report_noise: 1.0 },
    compute: { compute_budget: 0, decision_deadline_s: 0, tom_depth: 0 },
    memory: { attention: { E: 0, A_star: 0 }, visibility_zone: 0, memory_write_rights: 0, iris_corridor_width: 0, witness_count: 0, mu_M_branch: 0, apophenia_debt: 0 },
    resources: { endowments: { attention_hours: 0, tokens: 0 }, time_budget_h: 0, inventory: [], mandate_power: 0, co_sign_network: [], risk_budget: { cvar: 0, infra: 0, dark: 0, apophenia: 0 }, infra_budget: 0, dark_quota: 0 },
    competencies: { competence_core: 0, decision_quality: 0, resilience: 0, causal_sensitivity: 0, topo_affinity: 0, mandate_literacy: 0, specializations: [] },
    tom: { self: null, perceived: {} },
    relationships: {},
    historicalEvents: [
        {
            id: 'en-erasure', name: 'Стирание', t: 0, years_ago: 1,
            domain: 'erasure', tags: ['erasure', 'institutional_violence', 'SMSB'],
            valence: -1, intensity: 1.0, duration_days: 1, surprise: 0,
            controllability: 0, responsibility_self: 0, secrecy: 'classified',
        },
    ],
};
export default data;
