
import { SituationContext, GoalDomainId, PlanningGoalDef } from './types-goals';
import { AgentState, WorldState } from '../types';
import { AffectState } from './emotions/types';

export interface ContextGoalProfile {
  id: string;
  scenarioKinds: string[];  // List of ScenarioKind
  roleTags: string[];       // ['leader', 'guard', 'any', ...]
  domainWeights: Partial<Record<GoalDomainId, number>>;
  when: (ctx: SituationContext) => number; // 0..1
}

export const CONTEXT_PROFILES: ContextGoalProfile[] = [
  {
    id: 'strategic_council.leader',
    scenarioKinds: ['strategic_council'],
    roleTags: ['leader', 'commander'],
    domainWeights: {
      leader_legitimacy: 1.0,
      group_cohesion: 0.8,
      information: 0.6,
      ritual: 0.3,
      obedience: 0.5
    },
    when: (ctx) => 1.0,
  },
  {
    id: 'strategic_council.generic',
    scenarioKinds: ['strategic_council'],
    roleTags: ['any'],
    domainWeights: {
      status: 0.6,
      group_cohesion: 0.5,
      information: 0.5,
      survival: 0.1
    },
    when: (ctx) => 1.0,
  },
  {
    id: 'fight_escape.guard',
    scenarioKinds: ['fight_escape', 'patrol'],
    roleTags: ['guard', 'soldier', 'frontliner'],
    domainWeights: {
      survival: 1.0,
      control: 0.9,
      group_cohesion: 0.6,
      obedience: 0.8
    },
    when: (ctx) => ctx.threatLevel,
  },
  {
    id: 'fight_escape.medic',
    scenarioKinds: ['fight_escape'],
    roleTags: ['medic', 'caretaker'],
    domainWeights: {
      attachment_care: 1.2,
      group_cohesion: 0.8,
      survival: 0.5
    },
    when: (ctx) => ctx.woundedPresent,
  },
  {
    id: 'routine.any',
    scenarioKinds: ['other', 'domestic_scene'],
    roleTags: ['any'],
    domainWeights: {
      rest: 1.0,
      personal_bond: 0.8,
      social: 0.6
    },
    when: (ctx) => Math.max(0, 1 - ctx.threatLevel),
  },

  // --- NEGOTIATION / DIPLOMACY ---
  {
    id: 'negotiation.diplomat',
    scenarioKinds: ['negotiation', 'strategic_council'],
    roleTags: ['diplomat', 'envoy', 'leader', 'any'],
    domainWeights: {
      information: 0.9,
      leader_legitimacy: 0.7,
      group_cohesion: 0.5,
      status: 0.6,
      autonomy: 0.4,
      survival: 0.2
    },
    when: (ctx) => Math.max(0.4, 1 - ctx.threatLevel * 0.6),
  },

  // --- INTERROGATION / INVESTIGATION ---
  {
    id: 'investigation.investigator',
    scenarioKinds: ['investigation', 'other'],
    roleTags: ['investigator', 'detective', 'any'],
    domainWeights: {
      information: 1.1,
      control: 0.6,
      status: 0.3,
      survival: 0.2
    },
    when: (ctx) => Math.max(0.2, ctx.timePressure),
  },

  // --- MEDICAL / CARE ---
  {
    id: 'medical.medic',
    scenarioKinds: ['medical', 'fight_escape', 'other'],
    roleTags: ['medic', 'caretaker', 'any'],
    domainWeights: {
      attachment_care: 1.2,
      group_cohesion: 0.7,
      survival: 0.6,
      information: 0.2
    },
    when: (ctx) => Math.max(ctx.woundedPresent, 0.2),
  },

  // --- STEALTH / INFILTRATION ---
  {
    id: 'stealth.infiltration',
    scenarioKinds: ['stealth', 'patrol', 'other'],
    roleTags: ['scout', 'spy', 'any'],
    domainWeights: {
      survival: 0.9,
      information: 0.7,
      autonomy: 0.6,
      control: 0.4,
      status: 0.1
    },
    when: (ctx) => Math.max(0.2, ctx.threatLevel * 0.7 + ctx.timePressure * 0.6),
  },

  // --- MARKET / TRADE ---
  {
    id: 'market.trader',
    scenarioKinds: ['market', 'other'],
    roleTags: ['trader', 'merchant', 'any'],
    domainWeights: {
      status: 0.6,
      autonomy: 0.5,
      information: 0.4,
      group_cohesion: 0.2,
      survival: 0.2
    },
    when: (ctx) => Math.max(0.2, 1 - ctx.threatLevel),
  },

  // --- REST / RECOVERY ---
  {
    id: 'recovery.rest_focus',
    scenarioKinds: ['domestic_scene', 'other'],
    roleTags: ['any'],
    domainWeights: {
      rest: 1.2,
      personal_bond: 0.6,
      social: 0.4,
      survival: 0.2
    },
    when: (ctx) => Math.max(0.3, 1 - ctx.threatLevel),
  },

  // --- RITUAL / PUBLIC DISPLAY ---
  {
    id: 'ritual.public',
    scenarioKinds: ['ritual', 'strategic_council'],
    roleTags: ['leader', 'priest', 'any'],
    domainWeights: {
      ritual: 1.1,
      leader_legitimacy: 0.9,
      status: 0.8,
      obedience: 0.6,
      group_cohesion: 0.6,
      survival: 0.1
    },
    when: (ctx) => (ctx.isFormal ? 1.0 : 0.6),
  },

  // --- PRISON / COERCION ---
  {
    id: 'coercion.prison',
    scenarioKinds: ['prison', 'interrogation', 'other'],
    roleTags: ['guard', 'jailer', 'any'],
    domainWeights: {
      control: 1.0,
      obedience: 0.8,
      survival: 0.5,
      information: 0.4,
      status: 0.3
    },
    when: (ctx) => Math.max(0.2, ctx.threatLevel),
  },
];

// Hard Gating: Is the goal applicable in this context?
export function isGoalApplicable(goal: PlanningGoalDef, ctx: SituationContext): boolean {
  const domainIds = goal.domains.map(d => d.domain);

  // Example: Survival goals are dormant in safe rituals unless threat spikes
  if (domainIds.includes('survival')) {
    if (ctx.scenarioKind === 'ritual' && ctx.threatLevel < 0.2) {
      return false;
    }
  }

  // Example: Leader legitimacy irrelevant in private (unless formal)
  if (domainIds.includes('leader_legitimacy')) {
    if (ctx.isPrivate && !ctx.isFormal) {
      return false;
    }
  }
  
  // Example: Care goals require someone to care for (implied) or generic social context
  if (domainIds.includes('attachment_care')) {
      // Always applicable if defined, but context weight might be low
  }

  return true;
}

// Aggregates domain weights based on active context profiles
export function aggregateDomainContextWeights(
  profiles: ContextGoalProfile[],
  ctx: SituationContext,
  roleId: string,
): Record<GoalDomainId, number> {
  const out: Record<GoalDomainId, number> = {} as any;

  for (const profile of profiles) {
    // Check scenario match (simple string inclusion or wildcard)
    if (!profile.scenarioKinds.includes(ctx.scenarioKind)) continue;
    
    // Check role match
    const roleMatches = profile.roleTags.includes('any') || profile.roleTags.some(tag => roleId.includes(tag));

    if (!roleMatches) {
      continue;
    }

    const w = profile.when(ctx);
    if (w <= 0) continue;

    for (const [dom, val] of Object.entries(profile.domainWeights)) {
      const d = dom as GoalDomainId;
      out[d] = (out[d] ?? 0) + w * (val ?? 0);
    }
  }

  // --- affect modulation (optional) ---
  const aff = (ctx as any).affect as AffectState | undefined;
  if (aff) {
    const fear = aff.e.fear ?? 0;
    const anger = aff.e.anger ?? 0;
    const shame = aff.e.shame ?? 0;
    const trust = aff.e.trust ?? 0;
    const attach = aff.e.attachment ?? 0;
    const diss = aff.dissociation ?? 0;

    // Adjust domain weights based on emotions
    const boost = (d: GoalDomainId, v: number) => { out[d] = (out[d] ?? 0) + v; };

    if (fear > 0.1) {
        boost('survival', 0.9 * fear);
        boost('control', 0.6 * fear);
        boost('information', 0.4 * fear); // Vigilance
    }
    if (anger > 0.1) {
        boost('status', 0.7 * anger); // Confrontation
        boost('control', 0.7 * anger);
        boost('survival', 0.4 * anger);
    }
    if (shame > 0.1) {
        boost('leader_legitimacy', 0.8 * shame); // Restore face
        boost('obedience', 0.6 * shame);
    }
    if (trust > 0.1 || attach > 0.1) {
        const bondStrength = (trust + attach) / 2;
        boost('personal_bond', 0.6 * bondStrength);
        boost('attachment_care', 0.6 * bondStrength);
        boost('group_cohesion', 0.4 * bondStrength);
    }
    if (diss > 0.1) {
        // Dissociation reduces ability to execute complex goals, effectively lowering weights
        // Here we simulate by reducing active engagement domains
        const damp = 1 - 0.5 * diss;
        boost('status', -0.5 * diss);
        boost('leader_legitimacy', -0.5 * diss);
    }
  }

  return out;
}

// Converts aggregated domain weights into a base weight for each goal
export function buildContextGoalVector(
  domainWeights: Record<GoalDomainId, number>,
  goals: PlanningGoalDef[],
  ctx: SituationContext,
): number[] {
  const result: number[] = [];
  for (const g of goals) {
    let w = 0;
    for (const { domain, weight } of g.domains) {
      const dw = domainWeights[domain] ?? 0;
      w += weight * dw;
    }
    result.push(Math.max(0, w));
  }
  return result;
}

export function softplus(x: number): number {
  return Math.log(1 + Math.exp(x));
}

// Scene urgency modifier for goal deficits
export function sceneUrgency(goal: PlanningGoalDef, ctx: SituationContext): number {
  const domains = goal.domains.map(d => d.domain);

  if (domains.includes('survival')) {
    if (ctx.scenarioKind === 'fight_escape') return 1.0;
    return 0.2;
  }

  if (domains.includes('rest')) {
    if (ctx.scenarioKind === 'fight_escape') return 0.0;
    return 0.8;
  }

  if (domains.includes('attachment_care')) {
      if (ctx.woundedPresent > 0) return 1.0;
      return 0.3;
  }

  return 0.5;
}

export function buildSituationContext(agent: AgentState, world: WorldState): SituationContext {
  const scene = world.scene?.metrics;
  
  // Map WorldState to ScenarioKind
  let kind: any = 'other';
  const sId = world.scenario?.id || '';
  if (sId.includes('council')) kind = 'strategic_council';
  else if (sId.includes('rescue') || sId.includes('evac')) kind = 'fight_escape';
  else if (sId.includes('training')) kind = 'patrol';
  
  const threat = scene ? scene.threat / 100 : 0;
  const timer = scene?.timer ?? 100;
  const timePressure = Math.max(0, 1 - timer / 200);
  
  const wounded = (scene?.wounded_total ?? 0) > (scene?.wounded_evacuated ?? 0) + (scene?.wounded_dead ?? 0) ? 1.0 : 0.0;
  const leaderPresent = !!world.leadership.currentLeaderId;

  return {
    scenarioKind: kind,
    stage: world.scene?.currentPhaseId || 'default',
    threatLevel: threat,
    timePressure,
    woundedPresent: wounded,
    leaderPresent,
    isFormal: kind === 'strategic_council',
    isPrivate: false, // Needs richer world state to determine
    crowdSize: world.agents.length,
    roleId: agent.effectiveRole || 'any',
    z: {},
    affect: agent.affect // Attach agent affect if available for weighting logic
  } as any;
}
