
// lib/context/catalog/atomCatalog.ts
import { AtomNamespace, AtomOrigin, ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

export type AtomSpec = {
  idPrefix?: string;        // e.g., "rel:label:" or "ctx:"
  kind?: string;            // if kind must be fixed
  ns: AtomNamespace;
  defaultOrigin?: AtomOrigin;
  magnitudeRange?: [number, number]; // default [0,1]
  confidenceRange?: [number, number]; // default [0,1]
  require?: Array<keyof ContextAtom>; // required fields
  tagsAny?: string[];       // match if any tag present
  tagsAll?: string[];       // match if all tags present
  description?: string;

  // --- UI template support ---
  uiTitle?: string;
  uiGroup?: string; // e.g. "Context", "Threat", "ToM", "Manual"
  uiFields?: Array<{
    key: string;
    label: string;
    type: 'text' | 'number';
    placeholder?: string;
    defaultValue?: any;
  }>;

  // Build helpers (if defined, catalog can build atoms automatically)
  buildId?: (args: Record<string, any>) => string;
  buildKind?: (args: Record<string, any>) => string;
  buildLabel?: (args: Record<string, any>) => string;
  defaultMagnitude?: number; // 0..1
  defaultConfidence?: number; // 0..1
};

export function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// MVP Catalog
export const ATOM_CATALOG: AtomSpec[] = [
  // World Facts
  {
    idPrefix: 'world:',
    ns: 'world',
    defaultOrigin: 'world',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Canonical world facts (tick/location/map metrics).'
  },

  // Trace Atoms (Slow State)
  {
    idPrefix: 'trace:',
    ns: 'self',
    defaultOrigin: 'world',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Slow integrator states (stressLoad, traumaPriming, trustClimate).'
  },
  
  // Normalized Features
  {
    idPrefix: 'feat:',
    ns: 'feat' as any, // New namespace
    defaultOrigin: 'world',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Normalized features (character/location/scene) after mods.'
  },

  // Cost
  {
    idPrefix: 'cost:',
    ns: 'cost' as any,
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Action cost atoms (scalarized 0..1, plus vector in meta).'
  },
  // Affordance
  {
    idPrefix: 'aff:',
    ns: 'aff' as any,
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Affordance atoms and banners.'
  },
  // Constraint
  {
    idPrefix: 'con:',
    ns: 'con' as any,
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Constraint atoms.'
  },
  // Capability
  {
    idPrefix: 'cap:',
    ns: 'cap' as any,
    defaultOrigin: 'world',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Agent capabilities (keys, clearance, roles).'
  },
  // Access
  {
    idPrefix: 'access:',
    ns: 'access' as any,
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Access control decisions (enter/open/weapon/etc).'
  },
  
  // Observations
  {
    idPrefix: 'obs:',
    ns: 'obs',
    defaultOrigin: 'obs',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Observation atoms (agent-specific, with confidence).'
  },
  
  // Beliefs
  {
    idPrefix: 'belief:',
    ns: 'obs',                 // Can be 'tom' or 'obs', using 'obs' to group with epistemic
    defaultOrigin: 'profile', // Derived from profile/memory
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Belief atoms (agent belief state; may differ from world).',
    uiTitle: 'Belief atom (belief:...)',
    uiGroup: 'Epistemic',
    uiFields: [
      { key: 'tail', label: 'tail (e.g. norm:surveillance or scene:crowd)', type: 'text', defaultValue: 'norm:surveillance' },
      { key: 'magnitude', label: 'magnitude 0..1', type: 'number', defaultValue: 0.5 },
      { key: 'label', label: 'label', type: 'text', defaultValue: 'Manual belief' }
    ],
    buildId: (a) => `belief:${String(a.tail || 'norm:surveillance')}`,
    buildKind: () => 'belief_value',
    buildLabel: (a) => String(a.label || 'Manual belief'),
    defaultMagnitude: 0.5,
    defaultConfidence: 1
  },
  
  // Belief Banner (Rumor Generator)
  {
    idPrefix: 'belief:banner',
    ns: 'obs',
    defaultOrigin: 'belief',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Belief summary banner.'
  },

  // Event Evidence
  {
    idPrefix: 'event:',
    ns: 'event',
    defaultOrigin: 'world',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'World events as evidence atoms.'
  },

  // Threat Evidence from Beliefs
  {
    idPrefix: 'threat:belief:',
    ns: 'threat',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Threat evidence atoms indicating belief usage.'
  },

  // Summaries / Banners
  {
    idPrefix: 'ctx:banner',
    ns: 'ctx',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Context summary banner.'
  },
  {
    idPrefix: 'threat:banner',
    ns: 'threat',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Threat summary banner.'
  },
  {
    idPrefix: 'emo:banner',
    ns: 'emo',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Emotion summary banner.'
  },
  {
    idPrefix: 'tom:banner:',
    ns: 'tom',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Per-target ToM summary banner.'
  },

  // Context axis
  {
    idPrefix: 'ctx:',
    ns: 'ctx',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Context axis (derived).',
    uiTitle: 'Context axis (ctx:*)',
    uiGroup: 'Context',
    uiFields: [
      { key: 'axis', label: 'axis (danger, crowd, escape, ...)', type: 'text', defaultValue: 'danger' },
      { key: 'magnitude', label: 'magnitude 0..1', type: 'number', defaultValue: 0.5 },
      { key: 'label', label: 'label', type: 'text', defaultValue: 'Manual ctx axis' }
    ],
    buildId: (a) => `ctx:${String(a.axis || 'danger')}`,
    buildKind: () => 'ctx_axis',
    buildLabel: (a) => String(a.label || 'Manual ctx axis'),
    defaultMagnitude: 0.5,
    defaultConfidence: 1
  },

  // Threat atoms
  {
    idPrefix: 'threat:',
    ns: 'threat',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Threat channel/delta/final.',
    uiTitle: 'Threat value (threat:*)',
    uiGroup: 'Threat',
    uiFields: [
      { key: 'tail', label: 'id tail (final, ch:env, delta:paranoia, ...)', type: 'text', defaultValue: 'final' },
      { key: 'magnitude', label: 'magnitude 0..1', type: 'number', defaultValue: 0.5 },
      { key: 'label', label: 'label', type: 'text', defaultValue: 'Manual threat' }
    ],
    buildId: (a) => `threat:${String(a.tail || 'final')}`,
    buildKind: () => 'threat_value',
    buildLabel: (a) => String(a.label || 'Manual threat'),
    defaultMagnitude: 0.5,
    defaultConfidence: 1
  },
  
  // ToM Context Bias
  {
    idPrefix: 'tom:ctx:bias:',
    ns: 'tom',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'ToM contextual bias derived from beliefs/uncertainty.'
  },
  
  // ToM Prior Applied
  {
    idPrefix: 'tom:priorApplied:',
    ns: 'tom',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'ToM atoms after applying social relation priors.'
  },

  // ToM dyads
  {
    idPrefix: 'tom:dyad:',
    ns: 'tom',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'ToM dyad metric (trust/threat/intimacy/etc).',
    uiTitle: 'ToM dyad (tom:dyad:...)',
    uiGroup: 'ToM',
    uiFields: [
      { key: 'me', label: 'me id', type: 'text', defaultValue: 'me' },
      { key: 'other', label: 'other id', type: 'text', defaultValue: 'other' },
      { key: 'metric', label: 'metric (trust/threat/intimacy)', type: 'text', defaultValue: 'trust' },
      { key: 'magnitude', label: 'magnitude 0..1', type: 'number', defaultValue: 0.5 }
    ],
    buildId: (a) => `tom:dyad:${String(a.me)}:${String(a.other)}:${String(a.metric || 'trust')}`,
    buildKind: () => 'tom_dyad_metric',
    buildLabel: (a) => `ToM ${String(a.metric || 'trust')} (${String(a.other)})`,
    defaultMagnitude: 0.5,
    defaultConfidence: 1
  },

  // Relationship label (Memory / Slow) - Legacy
  {
    idPrefix: 'rel:label:',
    ns: 'rel',
    defaultOrigin: 'memory',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Social relationship atoms (slow memory, not ToM).'
  },
  
  // Relationship BASE (New)
  {
    idPrefix: 'rel:base:',
    ns: 'rel',
    defaultOrigin: 'world',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Base social relations (closeness/loyalty/hostility/etc).'
  },
  
  // Relationship TAG (New)
  {
    idPrefix: 'rel:tag:',
    ns: 'rel',
    defaultOrigin: 'world',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Relationship boolean tags (friend/lover/enemy/etc).'
  },

  // Relationship score
  {
    idPrefix: 'rel:score:',
    ns: 'tom',
    defaultOrigin: 'profile',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Relationship score (friendship/romance/devotion/harm/betrayal/obedience).',
    uiTitle: 'Relationship score (rel:score:...)',
    uiGroup: 'Social',
    uiFields: [
      { key: 'me', label: 'me id', type: 'text', defaultValue: 'me' },
      { key: 'other', label: 'other id', type: 'text', defaultValue: 'other' },
      { key: 'scoreKey', label: 'score key (friendship/romance/devotion/harm/betrayal/obedience)', type: 'text', defaultValue: 'friendship' },
      { key: 'magnitude', label: 'magnitude 0..1', type: 'number', defaultValue: 0.6 }
    ],
    buildId: (a) => `rel:score:${String(a.scoreKey || 'friendship')}:${String(a.me)}:${String(a.other)}`,
    buildKind: () => 'relationship_score',
    buildLabel: (a) => `Rel score: ${String(a.scoreKey || 'friendship')}`,
    defaultMagnitude: 0.6,
    defaultConfidence: 1
  },

  // emotions
  {
    idPrefix: 'emo:',
    ns: 'emo',
    defaultOrigin: 'derived',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Emotion/affect output atom.'
  },
  // raw emotion atoms often use 'emotion' kind but ID structure varies, checking kind
  {
    kind: 'emotion',
    ns: 'emo',
    defaultOrigin: 'self',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Raw emotion atom.'
  },

  // map/cell
  {
    idPrefix: 'cell:',
    ns: 'map',
    defaultOrigin: 'world',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Local cell metric (danger/cover/visibility/etc).'
  },
  {
    idPrefix: 'nav_',
    ns: 'map',
    defaultOrigin: 'world',
    magnitudeRange: [0, 1],
  },
  {
    idPrefix: 'loc:',
    ns: 'scene' as any,
    defaultOrigin: 'world',
    magnitudeRange: [0, 1],
    description: 'Location access atoms (public/locked/etc).'
  },

  // Manual generic (fallback)
  {
    idPrefix: 'manual:',
    ns: 'misc',
    defaultOrigin: 'override',
    magnitudeRange: [0, 1],
    require: ['id', 'kind', 'magnitude', 'source'],
    description: 'Manual override atom (GoalLab).',
    uiTitle: 'Manual generic (manual:...)',
    uiGroup: 'Manual',
    uiFields: [
      { key: 'id', label: 'id (start with manual:)', type: 'text', defaultValue: 'manual:custom' },
      { key: 'kind', label: 'kind', type: 'text', defaultValue: 'manual' },
      { key: 'magnitude', label: 'magnitude 0..1', type: 'number', defaultValue: 0.5 },
      { key: 'label', label: 'label', type: 'text', defaultValue: 'Custom atom' }
    ],
    buildId: (a) => String(a.id || 'manual:custom'),
    buildKind: (a) => String(a.kind || 'manual'),
    buildLabel: (a) => String(a.label || 'Custom atom'),
    defaultMagnitude: 0.5,
    defaultConfidence: 1
  },
];

export function matchAtomSpec(atom: { id?: string; kind?: string; tags?: string[]; source?: string; ns?: any }) {
  for (const spec of ATOM_CATALOG) {
    if (spec.idPrefix && atom.id?.startsWith(spec.idPrefix)) return { spec };
    if (spec.kind && atom.kind === spec.kind) return { spec };
  }
  return null;
}
