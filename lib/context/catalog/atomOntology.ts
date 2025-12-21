// lib/context/catalog/atomOntology.ts
// Canonical description of "what atoms exist" in GoalLab.
// This is intended to be exhaustive at the *family / grammar* level.
// Concrete atoms are obtained by instantiating placeholders (<selfId>, <otherId>, etc).

export type AtomCardinality =
  | 'global'
  | 'perSelf'
  | 'perDyad'
  | 'perSelfPerLocation'
  | 'perSelfPerGoal'
  | 'perSelfPerEvent'
  | 'parametric';

export type AtomFamily = {
  familyId: string;
  idPattern: string;
  ns: string;
  kindExamples: string[];
  producedBy: string[];
  consumedBy: string[];
  description: string;
  cardinality: AtomCardinality;
};

export const CTX_AXIS_IDS = [
  'danger','intimacy','hierarchy','publicness','normPressure','surveillance',
  'scarcity','timePressure','uncertainty','legitimacy','secrecy','grief','pain'
] as const;

export const CTX_AUX_IDS = ['proceduralStrict','cover','escape'] as const;

export const THREAT_CHANNELS = [
  'envDanger','visibilityBad','coverLack','crowding','nearbyCount','nearbyTrustMean',
  'nearbyHostileMean','hierarchyPressure','surveillance','timePressure','woundedPressure',
  'goalBlock','paranoia','trauma','exhaustion','dissociation','experience'
] as const;

export const ATOM_ONTOLOGY: AtomFamily[] = [
  {
    familyId: 'world/location',
    idPattern: 'world:loc:<metric>:<selfId>',
    ns: 'world',
    kindExamples: ['world_loc_fact'],
    producedBy: ['lib/context/pipeline/worldFacts.ts'],
    consumedBy: ['lib/context/axes/deriveAxes.ts','lib/threat/threatStack.ts'],
    description: 'Факты о текущей локации агента.',
    cardinality: 'perSelf'
  },
  {
    familyId: 'ctx/axis',
    idPattern: 'ctx:<axis>:<selfId>   (axis ∈ CTX_AXIS_IDS)',
    ns: 'ctx',
    kindExamples: ['ctx_axis'],
    producedBy: ['lib/context/axes/deriveAxes.ts'],
    consumedBy: ['lib/threat/*','lib/decision/*','lib/cost/*','lib/engine/*'],
    description: 'Нормализованные оси контекста 0..1.',
    cardinality: 'perSelf'
  },
  {
    familyId: 'ctx/aux',
    idPattern: 'ctx:<aux>:<selfId>   (aux ∈ CTX_AUX_IDS)',
    ns: 'ctx',
    kindExamples: ['ctx_aux'],
    producedBy: ['lib/context/axes/deriveAxes.ts'],
    consumedBy: ['lib/context/possibilities/*','lib/decision/*','lib/cost/model.ts'],
    description: 'Контекстные сигналы для action/possibility моделей.',
    cardinality: 'perSelf'
  },
  {
    familyId: 'threat/final',
    idPattern: 'threat:final:<selfId>',
    ns: 'threat',
    kindExamples: ['threat_total'],
    producedBy: ['lib/threat/*'],
    consumedBy: ['lib/engine/*','lib/decision/*','lib/cost/*'],
    description: 'Итоговая угроза 0..1.',
    cardinality: 'perSelf'
  },
  // (в файле у меня список шире: world/map/feat/obs/rel/event/cap/access/tom/belief/aff/con/cost/dec/banner)
];
