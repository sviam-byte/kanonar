import type { ContextAtom } from '../context/v2/types';

export type GoalEvidence = {
  goalId: string;
  evidenceAtomIds: string[];
  features: Record<string, number>;
  notes: string[];
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function get01(atoms: ContextAtom[], id: string, d = 0): number {
  const a = atoms.find(x => x?.id === id);
  const v = typeof a?.magnitude === 'number' ? a.magnitude : d;
  return clamp01(v);
}

function pickExisting(atoms: ContextAtom[], ids: string[]): string[] {
  const set = new Set(atoms.map(a => a.id));
  return ids.filter(id => set.has(id));
}

export function buildGoalEvidence(args: {
  goalId: string;
  selfId: string;
  atoms: ContextAtom[];
  domain?: string;
  kind?: string;
}): GoalEvidence {
  const { goalId, selfId, atoms } = args;
  const domain = (args.domain ?? '').toLowerCase();
  const kind = (args.kind ?? '').toLowerCase();

  const baseCandidates = [
    `goal:pre:${selfId}:safety`,
    `goal:pre:${selfId}:social`,
    `goal:pre:${selfId}:resource`,
    `goal:pre:${selfId}:explore`,
    `goal:pre:${selfId}:bonding`,
    `goal:pre:${selfId}:dominance`,
    `ctx:danger:${selfId}`,
    `ctx:surveillance:${selfId}`,
    `ctx:publicness:${selfId}`,
    `ctx:normPressure:${selfId}`,
    `ctx:crowd:${selfId}`,
    `ctx:timePressure:${selfId}`,
    `ctx:scarcity:${selfId}`,
    `ctx:grief:${selfId}`,
    `threat:final:${selfId}`,
    `threat:affect_boost:${selfId}`,
    `affect:fear:${selfId}`,
    `affect:arousal:${selfId}`,
    `affect:anger:${selfId}`,
    `affect:shame:${selfId}`,
    `affect:valence:${selfId}`,
  ];

  const safety = [
    `ctx:danger:${selfId}`, `threat:final:${selfId}`, `affect:fear:${selfId}`, `ctx:surveillance:${selfId}`,
  ];
  const social = [
    `ctx:normPressure:${selfId}`, `ctx:publicness:${selfId}`, `ctx:crowd:${selfId}`, `affect:shame:${selfId}`,
  ];
  const explore = [
    `ctx:uncertainty:${selfId}`, `ctx:publicness:${selfId}`, `affect:arousal:${selfId}`, `affect:valence:${selfId}`,
  ];
  const resource = [
    `ctx:scarcity:${selfId}`, `ctx:timePressure:${selfId}`, `ctx:danger:${selfId}`,
  ];

  let extra: string[] = [];
  const notes: string[] = [];

  if (domain.includes('safety') || kind.includes('avoid') || kind.includes('escape')) {
    extra = safety;
    notes.push('mapped to safety axes');
  } else if (domain.includes('social') || kind.includes('status') || kind.includes('impress') || kind.includes('comply')) {
    extra = social;
    notes.push('mapped to social axes');
  } else if (domain.includes('explore') || kind.includes('learn') || kind.includes('curiosity')) {
    extra = explore;
    notes.push('mapped to exploration axes');
  } else if (domain.includes('resource') || kind.includes('acquire') || kind.includes('consume')) {
    extra = resource;
    notes.push('mapped to resource axes');
  } else {
    notes.push('mapped to default axes');
  }

  const evidenceAtomIds = pickExisting(atoms, [...baseCandidates, ...extra]);

  const features: Record<string, number> = {};
  for (const id of evidenceAtomIds) features[id] = get01(atoms, id, 0);

  return { goalId, evidenceAtomIds, features, notes };
}
