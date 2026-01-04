// lib/context/sources/tomDyadAtoms.ts
import type { WorldState, AgentState } from '../../../types';
import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';
import { seedAcquaintanceFromSignals, tierToMag } from '../../social/acquaintance';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

type TomLikeEntry = {
  traits?: {
    trust?: number;
    fear?: number;
    dominance?: number;
    respect?: number;
    conflict?: number;
    bond?: number;
    align?: number;
    uncertainty?: number;
  };
  uncertainty?: number;
};

type TomLikeView = {
  trust?: number;
  threat?: number;
  alignment?: number;
  bond?: number;
  conflict?: number;
  respect?: number;
  dominance?: number;
  uncertainty?: number;
  emotions?: { fear?: number };
};

function extractMetrics(raw: any) {
  if (!raw || typeof raw !== 'object') return null;

  const entry = raw as TomLikeEntry;
  if (entry.traits && typeof entry.traits === 'object') {
    return {
      trust: clamp01(entry.traits.trust ?? 0),
      fear: clamp01(entry.traits.fear ?? 0),
      conflict: clamp01(entry.traits.conflict ?? 0),
      bond: clamp01(entry.traits.bond ?? 0),
      align: clamp01(entry.traits.align ?? 0),
      respect: clamp01(entry.traits.respect ?? 0),
      dominance: clamp01(entry.traits.dominance ?? 0),
      uncertainty: clamp01(entry.traits.uncertainty ?? entry.uncertainty ?? 0),
    };
  }

  const view = raw as TomLikeView;
  if (
    typeof view.trust === 'number' ||
    typeof view.threat === 'number' ||
    typeof view.bond === 'number' ||
    typeof view.conflict === 'number'
  ) {
    return {
      trust: clamp01(view.trust ?? 0),
      fear: clamp01(view.emotions?.fear ?? 0),
      conflict: clamp01(view.conflict ?? (view.threat ?? 0)),
      bond: clamp01(view.bond ?? 0),
      align: clamp01(view.alignment ?? 0),
      respect: clamp01(view.respect ?? 0),
      dominance: clamp01(view.dominance ?? 0),
      uncertainty: clamp01(view.uncertainty ?? 0),
    };
  }

  return null;
}

function getTomRaw(world: WorldState, agent: AgentState, selfId: string, otherId: string) {
  const wTom: any = (world as any)?.tom;
  if (wTom?.views?.[selfId]?.[otherId]) return wTom.views[selfId][otherId];
  if (wTom?.[selfId]?.[otherId]) return wTom[selfId][otherId];

  const aTom: any = (agent as any)?.tom;
  if (aTom?.views?.[selfId]?.[otherId]) return aTom.views[selfId][otherId];
  if (aTom?.views?.[otherId]) return aTom.views[otherId];
  if (aTom?.[selfId]?.[otherId]) return aTom[selfId][otherId];

  return null;
}

function mkDyadAtom(selfId: string, otherId: string, metric: string, magnitude: number, parts: any): ContextAtom {
  return normalizeAtom({
    id: `tom:dyad:${selfId}:${otherId}:${metric}`,
    kind: 'tom_dyad_metric',
    ns: 'tom',
    origin: 'belief',
    source: 'tom',
    magnitude: clamp01(magnitude),
    confidence: 1,
    subject: selfId,
    target: otherId,
    tags: ['tom', 'dyad', metric],
    label: `${metric}:${Math.round(clamp01(magnitude) * 100)}%`,
    trace: { usedAtomIds: [`tom_state:${selfId}:${otherId}`], notes: ['from ToM state'], parts },
  } as any);
}

function mkAcqAtom(selfId: string, otherId: string, name: string, magnitude: number, parts: any): ContextAtom {
  return normalizeAtom({
    id: `rel:acq:${selfId}:${otherId}:${name}`,
    kind: 'acquaintance' as any,
    ns: 'rel' as any,
    origin: 'derived',
    source: 'acquaintance',
    magnitude: clamp01(magnitude),
    confidence: 1,
    subject: selfId,
    target: otherId,
    tags: ['rel', 'acq', name],
    label: `acq.${name}:${Math.round(clamp01(magnitude) * 100)}%`,
    trace: { usedAtomIds: [], notes: ['acquaintance/recognition state'], parts },
  } as any);
}

export function extractTomDyadAtoms(args: {
  world: WorldState;
  agent: AgentState;
  selfId: string;
  otherAgentIds: string[];
}): { dyadAtoms: ContextAtom[]; relHintAtoms: ContextAtom[] } {
  const { world, agent, selfId, otherAgentIds } = args;
  const dyadAtoms: ContextAtom[] = [];
  const relHintAtoms: ContextAtom[] = [];

  for (const otherId of otherAgentIds) {
    if (!otherId || otherId === selfId) continue;

    const raw = getTomRaw(world, agent, selfId, otherId);
    const m = extractMetrics(raw);
    if (!m) continue;

    // Acquaintance/recognition: seed & use it to reduce uncertainty for known targets.
    const acq = seedAcquaintanceFromSignals({ world, agent, otherId });
    const acqTierMag = tierToMag(acq?.tier ?? 'unknown');
    const idc = clamp01((acq as any)?.idConfidence ?? 0);
    const fam = clamp01((acq as any)?.familiarity ?? 0);

    // Uncertainty should go DOWN with recognition. Keep some floor to avoid overconfidence.
    const unc0 = clamp01(m.uncertainty);
    const uncAdj = clamp01(unc0 * (1 - 0.60 * acqTierMag) * (1 - 0.35 * idc) * (1 - 0.25 * fam));
    m.uncertainty = Math.max(0.02, uncAdj);

    const threat = clamp01(0.55 * m.conflict + 0.25 * m.fear + 0.20 * (1 - m.trust));
    const intimacy = clamp01(0.65 * m.bond + 0.35 * m.trust);
    const support = clamp01((0.55 * m.trust + 0.45 * m.bond) * (1 - threat));

    dyadAtoms.push(
      mkDyadAtom(selfId, otherId, 'trust', m.trust, m),
      mkDyadAtom(selfId, otherId, 'threat', threat, { ...m, threat }),
      mkDyadAtom(selfId, otherId, 'intimacy', intimacy, { ...m, intimacy }),
      mkDyadAtom(selfId, otherId, 'alignment', m.align, m),
      mkDyadAtom(selfId, otherId, 'respect', m.respect, m),
      mkDyadAtom(selfId, otherId, 'dominance', m.dominance, m),
      mkDyadAtom(selfId, otherId, 'uncertainty', m.uncertainty, m),
      mkDyadAtom(selfId, otherId, 'support', support, { ...m, threat, support }),
    );

    // Expose acquaintance in atoms for debugging/UI.
    relHintAtoms.push(
      mkAcqAtom(selfId, otherId, 'tier', acqTierMag, { tier: acq?.tier, tierMag: acqTierMag }),
      mkAcqAtom(selfId, otherId, 'idConfidence', idc, { idConfidence: idc }),
      mkAcqAtom(selfId, otherId, 'familiarity', fam, { familiarity: fam }),
    );

    const isFriend = m.trust >= 0.75 && m.bond >= 0.55 && threat <= 0.35;
    const isEnemy = threat >= 0.70 && m.trust <= 0.35;
    // Romance/partner hint: high intimacy + low threat.
    const isLover = intimacy >= 0.78 && m.bond >= 0.70 && m.trust >= 0.60 && threat <= 0.40;

    if (isFriend) {
      relHintAtoms.push(normalizeAtom({
        id: `rel:tag:${selfId}:${otherId}:friend`,
        kind: 'rel_tag',
        ns: 'rel',
        origin: 'belief',
        source: 'tom',
        magnitude: 1,
        confidence: 0.7,
        subject: selfId,
        target: otherId,
        tags: ['rel', 'tag', 'friend', 'tom_hint'],
        trace: { usedAtomIds: [`tom_state:${selfId}:${otherId}`], notes: ['trust+bond high'], parts: { trust: m.trust, bond: m.bond, threat } },
      } as any));
    }

    if (isLover) {
      relHintAtoms.push(normalizeAtom({
        id: `rel:tag:${selfId}:${otherId}:lover`,
        kind: 'rel_tag',
        ns: 'rel',
        origin: 'belief',
        source: 'tom',
        magnitude: 1,
        confidence: 0.75,
        subject: selfId,
        target: otherId,
        tags: ['rel', 'tag', 'lover', 'tom_hint'],
        trace: {
          usedAtomIds: [`tom_state:${selfId}:${otherId}`],
          notes: ['intimacy high'],
          parts: { trust: m.trust, bond: m.bond, intimacy, threat },
        },
      } as any));
    }

    if (isEnemy) {
      relHintAtoms.push(normalizeAtom({
        id: `rel:tag:${selfId}:${otherId}:enemy`,
        kind: 'rel_tag',
        ns: 'rel',
        origin: 'belief',
        source: 'tom',
        magnitude: 1,
        confidence: 0.7,
        subject: selfId,
        target: otherId,
        tags: ['rel', 'tag', 'enemy', 'tom_hint'],
        trace: { usedAtomIds: [`tom_state:${selfId}:${otherId}`], notes: ['threat high'], parts: { trust: m.trust, threat } },
      } as any));
    }
  }

  return { dyadAtoms, relHintAtoms };
}
