
import {
  AtomId,
  ContextAtomsState,
  FactAtom,
  OfferAtom,
  CommitmentAtom,
  PlanAtom,
  StoryTime,
  Id,
  GoalId,
} from '../../types';

function genAtomId(prefix: string, t: StoryTime): AtomId {
  return `${prefix}:${t}:${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyContextAtoms(): ContextAtomsState {
  return {
    facts: [],
    offers: [],
    commitments: [],
    plans: [],
  };
}

// --- FACTS ---

export function addFact(
  atoms: ContextAtomsState,
  params: Omit<FactAtom, 'id' | 'kind'> & { id?: AtomId }
): ContextAtomsState {
  const id = params.id ?? genAtomId('fact', params.createdTick);
  const fact: FactAtom = {
    ...params,
    id,
    kind: 'fact',
  };
  return {
    ...atoms,
    facts: [...atoms.facts, fact],
  };
}

export function addSimpleFact(
  atoms: ContextAtomsState,
  createdTick: StoryTime,
  predicate: string,
  value: any,
  confidence: number,
  subjectId?: Id,
  objectId?: Id,
  sourceId?: Id
): ContextAtomsState {
  return addFact(atoms, {
    createdTick,
    expiresAt: undefined,
    predicate, // Use predicate for legacy, mapped to prop in type def if needed. Actually prop is required.
    prop: predicate, // Ensure prop is set
    value,
    confidence,
    subjectId,
    objectId,
    sourceId,
    tags: [],
    scope: 'shared',
    source: 'system',
    label: predicate,
  });
}

// --- OFFERS ---

export function addOffer(
  atoms: ContextAtomsState,
  createdTick: StoryTime,
  fromId: Id,
  toId: Id,
  description: string,
  goalId?: GoalId,
  deadline?: StoryTime
): ContextAtomsState {
  const offer: OfferAtom = {
    id: genAtomId('offer', createdTick),
    kind: 'offer',
    offerKind: 'generic',
    createdTick,
    expiresAt: deadline,
    fromId,
    toId: toId, // targetId in OfferAtom
    targetId: toId, // Alias
    goalId,
    description,
    status: 'open',
    tags: [],
    scope: 'shared',
    source: 'action',
    confidence: 1.0, // Default confidence
  };
  return {
    ...atoms,
    offers: [...atoms.offers, offer],
  };
}

// --- COMMITMENTS ---

export function addCommitment(
  atoms: ContextAtomsState,
  createdTick: StoryTime,
  fromId: Id,
  toId: Id,
  description: string,
  goalId: GoalId | undefined,
  strength: number
): ContextAtomsState {
  const commitment: CommitmentAtom = {
    id: genAtomId('commit', createdTick),
    kind: 'commitment',
    commitmentKind: 'generic',
    createdTick,
    fromId,
    toId,
    description,
    goalId,
    strength: Math.max(0, Math.min(1, strength)),
    status: 'active',
    tags: [],
    scope: 'shared',
    source: 'action',
    confidence: 1.0, // Default confidence
    expiresAt: undefined,
  };
  return {
    ...atoms,
    commitments: [...atoms.commitments, commitment],
  };
}

export function updateCommitmentStatus(
  atoms: ContextAtomsState,
  id: AtomId,
  status: CommitmentAtom['status']
): ContextAtomsState {
  return {
    ...atoms,
    commitments: atoms.commitments.map((c) =>
      c.id === id ? { ...c, status } : c
    ),
  };
}

// --- PLANS ---

export function addPlan(
  atoms: ContextAtomsState,
  createdTick: StoryTime,
  ownerId: Id,
  goalId: GoalId | undefined,
  steps: string[]
): ContextAtomsState {
  const plan: PlanAtom = {
    id: genAtomId('plan', createdTick),
    kind: 'plan',
    planId: `plan-${createdTick}`,
    createdTick,
    fromId: ownerId,
    ownerId,
    goalId,
    steps: steps.map(s => ({ actionId: s })),
    status: 'active',
    tags: [],
    scope: 'shared',
    source: 'action',
    confidence: 1.0, // Default confidence
    expiresAt: undefined
  };
  return {
    ...atoms,
    plans: [...atoms.plans, plan],
  };
}

export function updatePlanStatus(
  atoms: ContextAtomsState,
  id: AtomId,
  status: PlanAtom['status']
): ContextAtomsState {
  return {
    ...atoms,
    plans: atoms.plans.map((p) =>
      p.id === id ? { ...p, status } : p
    ),
  };
}

// --- GC / ЧИСТКА ---

export function gcExpiredAtoms(
  atoms: ContextAtomsState,
  now: StoryTime
): ContextAtomsState {
  // Use explicit checks for each type to satisfy TS
  return {
    facts: atoms.facts.filter(a => !a.expiresAt || a.expiresAt > now),
    offers: atoms.offers.filter(a => !a.expiresAt || a.expiresAt > now),
    commitments: atoms.commitments.filter(c => (!c.expiresAt || c.expiresAt > now) && (!c.dueTick || c.dueTick > now)),
    plans: atoms.plans.filter(p => !p.expiresAt || p.expiresAt > now),
  };
}
