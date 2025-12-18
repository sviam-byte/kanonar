
// lib/social-events.ts
import { CharacterEntity, SocialEventEntity, EventImpacts, EventEffects } from '../types';
import { getEntityById } from '../data';
import { getNestedValue, setNestedValue } from './param-utils';

const getParam = (p: Record<string, number>, key: string, defaultValue: number = 0.5): number => {
    const value = p[key];
    return typeof value === 'number' ? value : defaultValue;
}
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// ... (Constants socialGoalImpulseMap and coeffs remain the same) ...
const socialGoalImpulseMap: Record<string, { goalId: string, weight: number }[]> = {
    ally: [{ goalId: 'ALLIANCE_MAINTENANCE', weight: 0.6 }],
    deal: [{ goalId: 'BARGAINING_CAMPAIGN', weight: 0.5 }],
    conflict: [{ goalId: 'OPPOSE', weight: 0.7 }],
    aid: [{ goalId: 'TRUST_REPAIR_PROTOCOL', weight: 0.5 }],
    harm: [{ goalId: 'SANCTION_DEFECTOR', weight: 0.6 }],
    info: [{ goalId: 'VOI_SCOUT_EXPERIMENT', weight: 0.4 }],
    defect: [{ goalId: 'SANCTION_DEFECTOR', weight: 0.9 }],
    teach: [{ goalId: 'LEARN_CALIBRATE_MODEL', weight: 0.5 }],
    mentor: [{ goalId: 'LEARN_TRAIN_MENTEE', weight: 0.6 }],
};

const coeffs: Record<string, Record<string, number>> = {
    ally: { kT: 0.20, kR: 0.10, kC: 0.08, kCC: 0.10, kIH: 0.04, kTS: 0.06, kDP: 0.02, kID: 0.02, kTR: -0.02, kRM: 0.03, kIRL: 0.04, kPA: 0.06, kDL: -0.02 },
    deal: { kT: 0.16, kR: 0.12, kC: 0.06, kCC: 0.18, kIH: 0.05, kTS: 0.08, kDP: 0.02, kID: 0.03, kTR: -0.02, kRM: 0.04, kIRL: 0.05, kPA: 0.08, kDL: -0.01 },
    conflict: { kT: -0.18, kR: -0.12, kC: -0.10, kCC: -0.08, kIH: -0.06, kTS: -0.05, kDP: 0.04, kID: -0.02, kTR: 0.06, kRM: -0.05, kIRL: -0.03, kPA: -0.06, kDL: 0.04 },
    aid: { kT: 0.22, kR: 0.10, kC: 0.06, kCC: 0.08, kIH: 0.03, kTS: 0.04, kDP: 0.01, kID: 0.02, kTR: -0.03, kRM: 0.03, kIRL: 0.02, kPA: 0.05, kDL: -0.01 },
    harm: { kT: -0.25, kR: -0.16, kC: -0.12, kCC: -0.12, kIH: -0.08, kTS: -0.06, kDP: 0.05, kID: -0.03, kTR: 0.08, kRM: -0.06, kIRL: -0.04, kPA: -0.08, kDL: 0.06 },
    info: { kT: 0.06, kR: 0.06, kC: 0.02, kCC: 0.04, kIH: 0.10, kTS: 0.10, kDP: 0.06, kID: 0.10, kTR: 0, kRM: 0.01, kIRL: 0.08, kPA: 0.04, kDL: -0.01 },
    ritual: { kT: 0.10, kR: 0.06, kC: 0.06, kCC: 0.10, kIH: 0.02, kTS: 0.06, kDP: 0, kID: 0, kTR: -0.01, kRM: 0.03, kIRL: 0.01, kPA: 0.03, kDL: -0.01 },
    cosign: { kT: 0.14, kR: 0.18, kC: 0.08, kCC: 0.22, kIH: 0.04, kTS: 0.08, kDP: 0.02, kID: 0.03, kTR: -0.02, kRM: 0.05, kIRL: 0.05, kPA: 0.10, kDL: -0.02 },
    defect: { kT: -0.30, kR: -0.22, kC: -0.18, kCC: -0.20, kIH: -0.06, kTS: -0.04, kDP: 0.04, kID: -0.04, kTR: 0.10, kRM: -0.08, kIRL: -0.06, kPA: -0.10, kDL: 0.05 },
    rescue: { kT: 0.24, kR: 0.12, kC: 0.06, kCC: 0.10, kIH: 0.03, kTS: 0.03, kDP: 0.01, kID: 0.02, kTR: -0.04, kRM: 0.04, kIRL: 0.02, kPA: 0.05, kDL: -0.02 },
    teach: { kT: 0.08, kR: 0.06, kC: 0.04, kCC: 0.06, kIH: 0.06, kTS: 0.05, kDP: 0.03, kID: 0.06, kTR: -0.01, kRM: 0.01, kIRL: 0.08, kPA: 0.03, kDL: -0.01 },
    mentor: { kT: 0.12, kR: 0.08, kC: 0.06, kCC: 0.08, kIH: 0.04, kTS: 0.04, kDP: 0.02, kID: 0.04, kTR: -0.01, kRM: 0.02, kIRL: 0.05, kPA: 0.04, kDL: -0.02 },
    public_speech: { kT: 0.06, kR: 0.10, kC: 0.08, kCC: 0.06, kIH: 0.08, kTS: 0.12, kDP: 0.04, kID: 0.10, kTR: 0.02, kRM: 0.02, kIRL: 0.06, kPA: 0.04, kDL: 0 },
    opsec: { kT: 0, kR: 0, kC: 0, kCC: 0, kIH: 0.12, kTS: 0.14, kDP: 0.10, kID: 0.06, kTR: -0.02, kRM: 0.02, kIRL: 0.04, kPA: 0.01, kDL: -0.02 },
    default: { kT: 0, kR: 0, kC: 0, kCC: 0, kIH: 0, kTS: 0, kDP: 0, kID: 0, kTR: 0, kRM: 0, kIRL: 0, kPA: 0, kDL: 0 },
};

// Хелпер: аккумулировать EventEffects в EventImpacts (без ломки старой логики)
export function accumulateImpactsFromEffects(
  effects: EventEffects | undefined,
  base: EventImpacts
): EventImpacts {
  if (!effects) return base;

  const out: EventImpacts = {
    paramDeltas:   { ...base.paramDeltas },
    paramScales:   { ...base.paramScales },
    relationDeltas:{ ...base.relationDeltas },
    acuteDeltas:   { ...base.acuteDeltas },
    goalActivationDeltas: { ...base.goalActivationDeltas }
  };

  // 1) Тело -> acuteDeltas / paramDeltas
  if (effects.body?.delta_reserves) {
    for (const [k, dv] of Object.entries(effects.body.delta_reserves)) {
      if (dv == null) continue;
      const key = `phys.reserves.${k}`;
      out.acuteDeltas[key] = (out.acuteDeltas[key] ?? 0) + (dv as number);
    }
  }

  // 2) vector_base — долгосрочные сдвиги
  if (effects.vector_base) {
    for (const [axis, dv] of Object.entries(effects.vector_base)) {
      const key = `vector_base.${axis}`;
      out.paramDeltas[key] = (out.paramDeltas[key] ?? 0) + (dv as number);
    }
  }

  // 3) relations
  if (effects.relations?.delta_trust) {
    for (const [pairKey, dv] of Object.entries(effects.relations.delta_trust)) {
      const key = `relations.${pairKey}.trust`;
      out.relationDeltas[key] = (out.relationDeltas[key] ?? 0) + (dv as number);
    }
  }
  if (effects.relations?.delta_bond) {
    for (const [pairKey, dv] of Object.entries(effects.relations.delta_bond)) {
      const key = `relations.${pairKey}.bond`;
      out.relationDeltas[key] = (out.relationDeltas[key] ?? 0) + (dv as number);
    }
  }
  if (effects.relations?.delta_conflict) {
    for (const [pairKey, dv] of Object.entries(effects.relations.delta_conflict)) {
      const key = `relations.${pairKey}.conflict`;
      out.relationDeltas[key] = (out.relationDeltas[key] ?? 0) + (dv as number);
    }
  }

  return out;
}

export function calculateSocialEventImpacts(
  character: CharacterEntity, 
  allEvents: SocialEventEntity[],
  flatParams: Record<string, number>
): EventImpacts {
    const relevantEvents = allEvents.filter(e => e.actorId === character.entityId || e.targetId === character.entityId);

    if (relevantEvents.length === 0) {
        return { paramDeltas: {}, paramScales: {}, goalActivationDeltas: {}, acuteDeltas: {}, relationDeltas: {} };
    }

    let impacts: EventImpacts = { paramDeltas: {}, paramScales: {}, goalActivationDeltas: {}, acuteDeltas: {}, relationDeltas: {} };

    const TAU_SOCIAL = 180; // Decay for social impulses in days

    for (const event of relevantEvents) {
        // New: Accumulate structured effects if present
        if (event.effects) {
            impacts = accumulateImpactsFromEffects(event.effects, impacts);
        }

        // Legacy calculation logic
        const isActor = event.actorId === character.entityId;
        const isTarget = event.targetId === character.entityId;
        if (!isActor && !isTarget) continue;

        const w_s = { private: 1.0, ingroup: 1.6, public: 2.3 }[event.scope];
        const eventAgeDays = (Date.now() - event.t) / (1000 * 60 * 60 * 24);
        const reliab = event.veracity * Math.exp(-(event.delay_days ?? eventAgeDays) / TAU_SOCIAL);
        
        const J_base = event.polarity * event.intensity * w_s * reliab;
        
        const k = coeffs[event.domain] || coeffs.default;
        const J = J_base;

        if (isActor) {
             impacts.acuteDeltas['stress'] = (impacts.acuteDeltas['stress'] || 0) + J_base * 5 * (k.kTR ?? 0);
        }

        const otherPartyId = isActor ? event.targetId : event.actorId;
        
        if (isTarget || isActor) {
            const trustPath = `social.dynamic_ties.${otherPartyId}.trust`;
            const currentTrust = getNestedValue(character, trustPath) ?? 0.5;
            const expectedPolarity = (currentTrust - 0.5) * 2; 
            const surprise = event.polarity - expectedPolarity;
            const eta = 0.2; 
            const deltaTrust = eta * surprise * event.intensity * reliab;
            
            impacts.paramDeltas[trustPath] = (impacts.paramDeltas[trustPath] || 0) + deltaTrust;
        }

        impacts.paramDeltas['social.audience_reputation.0.score'] = (impacts.paramDeltas['social.audience_reputation.0.score'] || 0) + k.kR * J_base * 5;
        impacts.paramDeltas['vector_base.C_coalition_loyalty'] = (impacts.paramDeltas['vector_base.C_coalition_loyalty'] || 0) + k.kC * J;
        impacts.paramDeltas['vector_base.G_Self_consistency_drive'] = (impacts.paramDeltas['vector_base.G_Self_consistency_drive'] || 0) + k.kCC * J; 
        impacts.paramDeltas['vector_base.E_Skill_opsec_hacking'] = (impacts.paramDeltas['vector_base.E_Skill_opsec_hacking'] || 0) + k.kIH * J;
        
        if (isActor) {
            impacts.paramDeltas['vector_base.A_Transparency_Secrecy'] = (impacts.paramDeltas['vector_base.A_Transparency_Secrecy'] || 0) + k.kTS * J;
            impacts.paramDeltas['vector_base.E_Skill_opsec_hacking'] = (impacts.paramDeltas['vector_base.E_Skill_opsec_hacking'] || 0) + k.kDP * J;
        }

        if (isActor) {
             const impulses = socialGoalImpulseMap[event.domain] || [];
             for (const impulse of impulses) {
                 const goalKey = impulse.goalId;
                 impacts.goalActivationDeltas[goalKey] = (impacts.goalActivationDeltas[goalKey] || 0) + impulse.weight * event.intensity * event.polarity * reliab;
             }
        }
    }

    return impacts;
}
