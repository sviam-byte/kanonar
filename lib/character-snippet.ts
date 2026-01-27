
import {
  CharacterEntity,
  EntityType,
  Branch,
  PersonalEvent,
} from '../types';
import { defaultFemaleBody } from './body.presets';

let __tempIdCounter = 0;

export interface EncodedCharacterPayloadV1 {
  v: 'kanonar4-char-v1';
  meta: {
    id?: string;
    title?: string;
    subtitle?: string;
    tags?: string[];
  };
  vector_base: Record<string, number>;           // 44 axes
  body: any;                                     // partial body
  identity: {
    oaths?: any[];
    sacred_set?: any[];
    taboos?: string[];                           // optional, helper for UI
    raw_identity?: any;                          // optional full identity block
  };
  // New System Block to persist extended state
  system?: {
      resources?: any;
      authority?: any;
      evidence?: any;
      observation?: any;
      compute?: any;
      state?: any;         // Legacy state fields like loyalty, dark_exposure
      memory?: any;        // Legacy memory fields like attention
      competencies?: any;  // Legacy competencies like topo_affinity
  };
  legacy?: {
    historicalEvents?: PersonalEvent[];
  };
}

const SNIPPET_PREFIX = 'KANONAR4-CHAR::v1::';

// --- Browser-safe Base64URL utilities ---
function toBase64Url(json: string): string {
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

// --- Defaults to prevent simulation crashes ---

export const defaultBody = {
  // Static Model (from preset)
  ...defaultFemaleBody,
  
  // Legacy/Dynamic State Fallbacks
  constitution: {
    ...defaultFemaleBody.structural,
    strength_max: defaultFemaleBody.functional.strength_upper,
    endurance_max: defaultFemaleBody.functional.aerobic_capacity,
    dexterity: 0.5,
    vision_acuity: 0.5,
    hearing_db: 0,
    pain_tolerance: 0.5,
    cold_heat_tolerance: 0.5,
  },
  capacity: {
    fine_motor: 0.5,
    VO2max: 50,
  },
  reserves: {
    energy_reserve_kcal: 1200,
    energy_store_kJ: 1200, 
    hydration: 0.7,
    glycemia_mmol: 5,
    oxygen_reserve: 0.9, 
    O2_margin: 0.7, 
    sleep_homeostat_S: 0.5,
    circadian_phase_hours: 12, 
    circadian_phase_h: 12, 
    sleep_debt: 0, 
    sleep_debt_h: 0, 
    immune_tone: 0.5, 
  },
  acute: {
    hp: 100,
    injury_severity: 0, 
    injuries_severity: 0, 
    pain_current: 0, 
    pain_now: 0, 
    temperature_C: 36.6, 
    temperature_c: 36.6, 
    tremor: 0,
    reaction_time_ms: 250,
    fatigue: 0.2,
    stress_level: 0.2, 
    stress: 0.2, 
    moral_trauma: 0, 
    moral_injury: 0, 
  },
  regulation: {
    hpa_axis_activity: 0.5, 
    HPA_axis: 0.5, 
    arousal: 0.5,
  },
};

export const defaultIdentity = {
  version_gates: [Branch.Current],
  hard_caps: [],
  param_locked: [],
  locks_source: [],
  oaths: [],
  sigils: {},
  chain_of_command: [],
  clearance_level: 1,
  consent_ledger: [],
  identity_chain_of_custody: [],
  sacred_set: [],
};

export function encodeCharacterToSnippet(
  ch: {
    meta: { id?: string; title?: string; subtitle?: string; tags?: string[] };
    vector_base: Record<string, number>;
    body?: any;
    identity?: any;
    oaths?: any[];
    sacred_set?: any[];
    taboos?: string[];
    events?: PersonalEvent[];
    // Allow passing system blocks directly or attached to 'ch'
    resources?: any;
    authority?: any;
    evidence?: any;
    observation?: any;
    compute?: any;
    state?: any;
    memory?: any;
    competencies?: any;
  }
): string {
  const payload: EncodedCharacterPayloadV1 = {
    v: 'kanonar4-char-v1',
    meta: ch.meta,
    vector_base: ch.vector_base,
    body: ch.body ?? defaultBody,
    identity: {
      oaths: ch.oaths ?? ch.identity?.oaths ?? [],
      sacred_set: ch.sacred_set ?? ch.identity?.sacred_set ?? [],
      taboos: ch.taboos,
      raw_identity: ch.identity ?? defaultIdentity,
    },
    system: {
        resources: ch.resources,
        authority: ch.authority,
        evidence: ch.evidence,
        observation: ch.observation,
        compute: ch.compute,
        state: ch.state,
        memory: ch.memory,
        competencies: ch.competencies
    },
    legacy: {
      historicalEvents: ch.events ?? [],
    },
  };

  const json = JSON.stringify(payload);
  const b64url = toBase64Url(json);
  return SNIPPET_PREFIX + b64url;
}

export function decodeSnippetToCharacter(snippet: string): CharacterEntity {
  if (!snippet.startsWith('KANONAR4-CHAR::')) {
    throw new Error('Некорректный формат кода: отсутствует префикс KANONAR4-CHAR');
  }
  
  if (!snippet.startsWith(SNIPPET_PREFIX)) {
      throw new Error('Неподдерживаемая версия кода (ожидается v1)');
  }

  const b64url = snippet.slice(SNIPPET_PREFIX.length).trim();
  let payload: EncodedCharacterPayloadV1;
  
  try {
      const json = fromBase64Url(b64url);
      payload = JSON.parse(json) as EncodedCharacterPayloadV1;
  } catch (e) {
      throw new Error('Ошибка декодирования Base64 или парсинга JSON');
  }

  if (payload.v !== 'kanonar4-char-v1') {
    throw new Error(`Неверная версия внутри payload: ${payload.v}`);
  }

  const id = payload.meta.id || `temp-${Date.now()}-${(__tempIdCounter++).toString(36)}`;
  const title = payload.meta.title || 'Временный персонаж';

  const identityRaw = payload.identity.raw_identity ?? defaultIdentity;
  const sys = payload.system || {};

  // Construct full CharacterEntity with defaults for missing parts
  const entity: CharacterEntity = {
    entityId: id,
    type: EntityType.Character,
    title,
    subtitle: payload.meta.subtitle ?? '',
    authors: [{ name: 'user', role: 'Custom' }],
    year: 'temp',
    versionTags: [Branch.Current],
    status: 'draft',
    tags: payload.meta.tags ?? ['temp-character'],
    description: 'Временный персонаж, импортированный через код.',
    relations: [],
    media: [],
    evidenceIds: [],
    vector_base: payload.vector_base,
    body: {
      ...defaultBody,
      ...(payload.body ?? {}),
      structural: { ...defaultBody.structural, ...(payload.body?.structural ?? {}) },
      functional: { ...defaultBody.functional, ...(payload.body?.functional ?? {}) },
      adipose: { ...defaultBody.adipose, ...(payload.body?.adipose ?? {}) },
      hormonal: { ...defaultBody.hormonal, ...(payload.body?.hormonal ?? {}) },
      reproductive: { ...defaultBody.reproductive, ...(payload.body?.reproductive ?? {}) },
      acute: { ...defaultBody.acute, ...(payload.body?.acute ?? {}) },
      reserves: { ...defaultBody.reserves, ...(payload.body?.reserves ?? {}) },
      regulation: { ...defaultBody.regulation, ...(payload.body?.regulation ?? {}) },
      constitution: { ...defaultBody.constitution, ...(payload.body?.constitution ?? {}) },
      capacity: { ...defaultBody.capacity, ...(payload.body?.capacity ?? {}) },
    },
    identity: {
      ...defaultIdentity,
      ...identityRaw,
      oaths: payload.identity.oaths ?? identityRaw.oaths ?? [],
      sacred_set: payload.identity.sacred_set ?? identityRaw.sacred_set ?? [],
    },
    historicalEvents: payload.legacy?.historicalEvents ?? [],
    
    // Populate system blocks from payload if available, else defaults
    cognitive: { 
        goals: [], core_values: [], utility_shape: { risk_aversion: 0.5 }, 
        policy: { kind: 'rule', params: {} }, planning_horizon: 10, fallback_policy: 'wait',
        belief_state: {}, observation_model: { noise_var: 0.1 }, report_model: { bias: 0, noise_var: 0.1 },
        affective_module: { anger: 0, fear: 0, hope: 0 }, cognitive_biases: [], counterfactual_skill: 50
    },
    
    competencies: sys.competencies ?? { 
        competence_core: 50, decision_quality: 50, resilience: 50, causal_sensitivity: 50, 
        topo_affinity: 50, mandate_literacy: 50, specializations: [] 
    },
    
    state: sys.state ?? { will: 50, loyalty: 50, dark_exposure: 0, drift_state: 15, burnout_risk: 0 },
    
    memory: sys.memory ?? { 
        attention: { E: 150, A_star: 150 }, visibility_zone: 50, memory_write_rights: 1, 
        iris_corridor_width: 50, witness_count: 0, mu_M_branch: 0.5, apophenia_debt: 0 
    },
    
    resources: sys.resources ?? { 
        endowments: { attention_hours: 40, tokens: 0 }, time_budget_h: 50, inventory: [], 
        mandate_power: 0, co_sign_network: [], risk_budget: { cvar: 0.3, infra: 0.3, dark: 0.6, apophenia: 0 },
        infra_budget: 0.3, dark_quota: 0.6 
    },
    
    authority: sys.authority ?? { signature_weight: { causal: 0.5, topo: 0.5, civic: 0.5, infra: 0.5, memory: 0.5, ethics: 0.5, markets: 0.5 }, co_sign_threshold: 1 },
    
    evidence: sys.evidence ?? { witness_pull: 0.5, evidence_quality: 0.5 },
    
    observation: sys.observation ?? { noise: 0.1, report_noise: 0.1 },
    
    compute: sys.compute ?? { compute_budget: 100, decision_deadline_s: 1, tom_depth: 2 },
    
    // Context defaults
    social: { audience_reputation: [], dag_node_id: id, causal_liability_share: 0.1 },
    sector: { sector_id: 'sector-default', L_star_personal: 0 },
    repro: { seed_id: `seed-${id}` },
    context: { age: 30 },
    relationships: {},
    tom: { self: null, perceived: {} }
  };

  return entity;
}
