
// lib/archetypes/fitter.ts

import { CharacterEntity, EntityType, Branch } from '../../types';
import { characterSchema } from '../../data/character-schema';
import { getPathAndSchemaKey, setNestedValue } from '../param-utils';
import { getArchetypeData, FUNCTION_NAMES } from '../../data/archetypes';
import { calculateArchetypeMetrics } from './metrics';
import { defaultBody } from '../character-snippet';

const clip = (val: number, min: number, max: number): number => Math.max(min, Math.min(val, max));

const createDefaultCharacter = (): CharacterEntity => {
    const defaultChar: any = {};
    
    // Initialize all top-level blocks
    defaultChar.vector_base = {};
    defaultChar.context = {};
    defaultChar.cognitive = {};
    defaultChar.social = {};
    defaultChar.sector = {};
    defaultChar.repro = {};
    defaultChar.authority = {};
    defaultChar.evidence = {};
    defaultChar.competencies = {};
    defaultChar.state = {};
    defaultChar.memory = {};
    defaultChar.resources = {};
    defaultChar.identity = {};
    defaultChar.observation = {};
    defaultChar.compute = {};

    // Initialize Body with full structure from snippet defaults (prevents crashes in new editor/sim)
    // Deep copy to avoid mutations
    defaultChar.body = JSON.parse(JSON.stringify(defaultBody));

    for (const category in characterSchema) {
        const { pathPrefix } = getPathAndSchemaKey(category);
        for (const key in (characterSchema as any)[category]) {
            const schema = (characterSchema as any)[category][key];
            const fullKey = schema.path || (pathPrefix ? `${pathPrefix}.${key}` : key);
            // Use the midpoint of the defined range as the neutral value
            const midpoint = schema.min + (schema.max - schema.min) / 2;
            setNestedValue(defaultChar, fullKey, midpoint);
        }
    }

    // Override specific values for an idealized baseline state
    // Note: We use setNestedValue for vector_base params, but body params are already set by defaultBody
    // Explicitly setting some acute states to be safe
    setNestedValue(defaultChar, 'body.acute.stress', 0);
    setNestedValue(defaultChar, 'body.acute.fatigue', 0);
    setNestedValue(defaultChar, 'body.acute.moral_injury', 0);
    
    // Set sane non-vector defaults that aren't in the schema
    defaultChar.versionTags = [Branch.Current];
    defaultChar.status = 'published';
    defaultChar.authors = [{ name: "Archetype", role: "Template" }];
    defaultChar.year = "N/A";
    defaultChar.tags = ["archetype"];
    defaultChar.relations = [];
    defaultChar.media = [];
    defaultChar.changelog = [];
    if(defaultChar.context) defaultChar.context.faction = "independent";

    // Initialize properties required for AgentState to prevent runtime errors
    defaultChar.relationships = {};
    defaultChar.historicalEvents = [];
    defaultChar.tom = { self: null, perceived: {} };
    
    // Fill in other potentially missing blocks with defaults
    defaultChar.social.audience_reputation = defaultChar.social.audience_reputation || [{ segment: 'general', score: 50 }];
    defaultChar.social.dag_node_id = defaultChar.social.dag_node_id || 'archetype-node';
    defaultChar.social.causal_liability_share = defaultChar.social.causal_liability_share || 0.1;
    defaultChar.sector.sector_id = defaultChar.sector.sector_id || 'archetype-sector';
    defaultChar.sector.L_star_personal = defaultChar.sector.L_star_personal || 10;
    defaultChar.repro.seed_id = defaultChar.repro.seed_id || 'archetype-seed';

    // Add missing blocks if schema loop didn't cover them.
    if(!defaultChar.authority.signature_weight) {
         defaultChar.authority = {
            signature_weight: { causal: 0.5, topo: 0.5, civic: 0.5, infra: 0.5, memory: 0.5, ethics: 0.5, markets: 0.5 },
            co_sign_threshold: 1,
        };
    }
     if(!defaultChar.identity.sigils) {
        defaultChar.identity = { 
            ...(defaultChar.identity || {}),
            sigils: {},
            oaths: [],
            hard_caps: [],
            sacred_set: [],
            version_gates: [Branch.Current],
        };
    }
    
    // Add dummy fields to satisfy CharacterEntity type, these will be overwritten
    defaultChar.entityId = '';
    defaultChar.type = EntityType.Character;
    defaultChar.title = '';

    return defaultChar as CharacterEntity;
};

// The main fitting function
export const createFittedCharacterFromArchetype = (lambda: string, f: number, mu: string): CharacterEntity | undefined => {
    const archetypeData = getArchetypeData(lambda, f, mu);
    if (!archetypeData) return undefined;

    const metrics = calculateArchetypeMetrics(lambda, f, mu);
    const fittedCharacter = createDefaultCharacter();

    const deviations = {
        AGENCY: metrics.AGENCY - 0.5,
        ACCEPT: metrics.ACCEPT - 0.5,
        RADICAL: metrics.RADICAL - 0.5,
        SCOPE: metrics.SCOPE - 0.5,
        TRUTH: metrics.TRUTH - 0.5,
        CARE: metrics.CARE - 0.5,
        MANIP: metrics.MANIP - 0.5,
        FORMAL: metrics.FORMAL - 0.5,
    };

    const vb = fittedCharacter.vector_base!;
    const scale = 1.0; 

    const applyDeviation = (param: keyof typeof vb, deviation: number, factor = 1.0) => {
        // Use ?? 0.5 to handle cases where a param might not be in the schema with a midpoint
        vb[param] = clip((vb[param] ?? 0.5) + deviation * scale * factor, 0, 1);
    }
    
    // AGENCY
    applyDeviation('G_Narrative_agency', deviations.AGENCY);
    applyDeviation('A_Liberty_Autonomy', deviations.AGENCY);
    
    // ACCEPT
    applyDeviation('A_Legitimacy_Procedure', deviations.ACCEPT);
    applyDeviation('A_Tradition_Continuity', deviations.ACCEPT);

    // RADICAL
    applyDeviation('B_exploration_rate', deviations.RADICAL);
    applyDeviation('F_Value_update_rate', deviations.RADICAL);
    applyDeviation('A_Tradition_Continuity', deviations.RADICAL, -1);

    // SCOPE
    applyDeviation('A_Power_Sovereignty', deviations.SCOPE);

    // TRUTH
    applyDeviation('A_Knowledge_Truth', deviations.TRUTH);
    applyDeviation('A_Memory_Fidelity', deviations.TRUTH);
    applyDeviation('E_Model_calibration', deviations.TRUTH);

    // CARE
    applyDeviation('A_Safety_Care', deviations.CARE);
    applyDeviation('C_dominance_empathy', deviations.CARE, -1);

    // MANIP
    applyDeviation('A_Transparency_Secrecy', deviations.MANIP, -1);

    // FORMAL
    // Reinforces A_Legitimacy_Procedure, already affected by ACCEPT
    vb.A_Legitimacy_Procedure = clip((vb.A_Legitimacy_Procedure ?? 0.5) + deviations.FORMAL * scale * 0.5, 0, 1);
    applyDeviation('E_KB_civic', deviations.FORMAL);

    // Store archetype metrics directly into the vector_base for simulation access
    for (const key in metrics) {
        setNestedValue(fittedCharacter, `vector_base.ARCH_${key}`, metrics[key]);
    }

    // Finalize the character object with archetype info
    fittedCharacter.entityId = `ARCHETYPE::${lambda}-${f}-${mu}`;
    fittedCharacter.type = EntityType.Character;
    fittedCharacter.title = `${FUNCTION_NAMES[f-1]}: ${archetypeData.name}`;
    fittedCharacter.subtitle = `Архетип (${lambda}-${f}-${mu})`;
    fittedCharacter.description = archetypeData.description;

    return fittedCharacter;
}
