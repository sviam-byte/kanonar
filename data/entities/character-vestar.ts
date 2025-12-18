
import { CharacterEntity, EntityType, Branch } from '../../types';
import { defaultBody } from '../../lib/character-snippet';

const data: CharacterEntity = {
    entityId: "character-vestar",
    type: EntityType.Character,
    title: "Вестар",
    subtitle: "Призрак",
    authors: [{ name: "auto_extract", role: "Source" }],
    year: "431",
    versionTags: [Branch.Current],
    status: "published",
    tags: ["shadow", "mystery"],
    description: "Таинственная фигура, наблюдающая из тени.",
    relations: [],
    media: [],
    evidenceIds: [],
    vector_base: {
        A_Transparency_Secrecy: 0.9,
        G_Narrative_agency: 0.6,
        B_exploration_rate: 0.7
    },
    body: JSON.parse(JSON.stringify(defaultBody)),
    identity: {
        version_gates: [Branch.Current],
        hard_caps: [],
        oaths: [],
        sigils: {},
        chain_of_command: [],
        clearance_level: 0,
        consent_ledger: [],
        identity_chain_of_custody: [],
        sacred_set: [],
        param_locked: [], // Added
        locks_source: [] // Added
    },
    cognitive: { goals: [], core_values: [], utility_shape: { risk_aversion: 0.5 }, policy: { kind: 'rule', params: {} }, planning_horizon: 10, fallback_policy: 'wait', belief_state: {}, observation_model: { noise_var: 0.1 }, report_model: { bias: 0, noise_var: 0.1 }, affective_module: { anger: 0, fear: 0, hope: 0 }, cognitive_biases: [], counterfactual_skill: 50 },
    social: { audience_reputation: [], dag_node_id: 'character-vestar', causal_liability_share: 0.1 },
    sector: { sector_id: 'sector-default', L_star_personal: 0 },
    repro: { seed_id: 'vestar-seed' },
    authority: { signature_weight: { causal: 0.5, topo: 0.5, civic: 0.5, infra: 0.5, memory: 0.5, ethics: 0.5, markets: 0.5 }, co_sign_threshold: 1 },
    evidence: { witness_pull: 0.5, evidence_quality: 0.5 },
    observation: { noise: 0.1, report_noise: 0.1 },
    compute: { compute_budget: 100, decision_deadline_s: 1, tom_depth: 2 },
    state: { will: 50, loyalty: 50, dark_exposure: 50, drift_state: 15, burnout_risk: 0 },
    memory: { attention: { E: 150, A_star: 150 }, visibility_zone: 10, memory_write_rights: 0, iris_corridor_width: 50, witness_count: 0, mu_M_branch: 0.5, apophenia_debt: 0 },
    resources: { endowments: { attention_hours: 40, tokens: 0 }, time_budget_h: 50, inventory: [], mandate_power: 0, co_sign_network: [], risk_budget: { cvar: 0.3, infra: 0.3, dark: 0.6, apophenia: 0 }, infra_budget: 0.3, dark_quota: 0.6 },
    competencies: { competence_core: 50, decision_quality: 50, resilience: 50, causal_sensitivity: 50, topo_affinity: 50, mandate_literacy: 50, specializations: [] },
    tom: { self: null, perceived: {} },
    relationships: {},
    historicalEvents: []
};

export default data;
