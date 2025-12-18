
import { AgentState, Action, SocialActionId, ArchetypeMode, ArchetypePhase, SceneMetrics, DistortionProfile, TraumaLoad, MoralDissonance } from '../../types';
import { allArchetypes } from '../../data/archetypes';
import { getNestedValue, setNestedValue } from '../param-utils';
import { getArchetypeBehaviorProfile, computeEffectiveBehaviorProfile, NormKind } from './behavior';
import { METRIC_NAMES } from './metrics';
import { cosSim } from '../math/core';
import { BiographyLatent } from '../biography/lifeGoalsEngine';

// --- Types & Constants ---
const MU_KIND: Record<string, 'primary' | 'shadow'> = {
    'SR': 'primary',
    'OR': 'shadow',
    'SN': 'primary',
    'ON': 'primary',
};

// Validates MU configuration
for(const arch of allArchetypes) {
    if (!MU_KIND[arch.mu]) {
        throw new Error(`Unknown mu kind: ${arch.mu} in archetype ${arch.id}`);
    }
}

// --- Math Helpers ---
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

const ARCH_KEYS = Object.keys(METRIC_NAMES);

// --- Helper: Get Metrics Vector for ID ---
export function getArchetypeMetricValues(archId: string): number[] | null {
    const arch = allArchetypes.find(a => a.id === archId);
    if (!arch) return null;
    // Return values in the order of METRIC_NAMES keys
    return ARCH_KEYS.map(key => arch.metrics[key] ?? 0.5);
}

// --- New Function: Compute Self Archetype Vector based on distortions ---
export function computeSelfArchetypeVector(
  archTrue: number[],
  distortions: DistortionProfile,
  trauma: TraumaLoad,
  moral?: MoralDissonance,
  bio?: BiographyLatent
): number[] {
  if (!archTrue || archTrue.length === 0) return archTrue;

  const { result } = calculateVectorWithExplanations(archTrue, distortions, trauma, moral, bio);
  return result;
}

export function explainSelfVectorShift(
  archTrue: number[],
  distortions: DistortionProfile,
  trauma: TraumaLoad,
  moral?: MoralDissonance,
  bio?: BiographyLatent
): { axis: string, delta: number, reasons: string[] }[] {
    const { explanations, result } = calculateVectorWithExplanations(archTrue, distortions, trauma, moral, bio);
    return explanations.map((reasons, idx) => ({
        axis: ARCH_KEYS[idx],
        delta: result[idx] - archTrue[idx],
        reasons
    })).filter(x => Math.abs(x.delta) > 0.05); // Only return significant shifts
}

function calculateVectorWithExplanations(
  archTrue: number[],
  distortions: DistortionProfile,
  trauma: TraumaLoad,
  moral?: MoralDissonance,
  bio?: BiographyLatent
): { result: number[], explanations: string[][] } {
  
  const {
    selfBlameBias,
    blackWhiteThinking,
    catastrophizing,
    discountingPositive,
    personalization,
    threatBias,
    trustBias
  } = distortions;

  const tSelf   = trauma.self   ?? 0;
  const tOthers = trauma.others ?? 0;
  const tWorld  = trauma.world  ?? 0;
  const tSystem = trauma.system ?? 0;
  
  // Biography Accumulators (can be > 1, so we use softplus or nonlin logic)
  const bioHelpless = bio ? Math.tanh(bio.traumaSelf / 3) : 0;
  const bioBetrayal = bio ? Math.tanh((bio.betrayalLeader + bio.betrayalPeer) / 3) : 0;
  const bioSystemTrauma = bio ? Math.tanh(bio.traumaSystem / 3) : 0;
  const bioWorldTrauma = bio ? Math.tanh(bio.traumaWorld / 3) : 0;
  const bioStatus = bio ? Math.tanh(bio.leadershipEpisodes / 5) : 0;
  
  const guilt = moral?.guilt ?? 0;
  const shame = moral?.shame ?? 0;
  
  const gapSelf = moral?.valueBehaviorGapSelf ?? 0;
  const gapOthers = moral?.valueBehaviorGapOthers ?? 0;
  const gapSystem = moral?.valueBehaviorGapSystem ?? 0;
  const gapTotal = moral?.valueBehaviorGapTotal ?? 0;

  const result: number[] = [];
  const explanations: string[][] = [];

  archTrue.forEach((v, idx) => {
    const key = ARCH_KEYS[idx] as keyof typeof METRIC_NAMES;
    let s = v;
    const reasons: string[] = [];

    // Helper: "Crush" factor - exponential reduction
    // e^(-2.5 * x) maps 0->1 to 1->0.08 (sharp drop)
    const crush = (factor: number, factorName: string) => {
        const mult = Math.exp(-2.5 * clamp01(factor));
        if (mult < 0.95) {
             reasons.push(`Подавление (${(mult*100).toFixed(0)}%) из-за: ${factorName}`);
             return mult;
        }
        return 1.0;
    };
    
    // Helper: "Flip" factor - inverts around 0.5 if threshold crossed
    const maybeFlip = (val: number, trigger: number, triggerName: string) => {
        if (trigger > 0.6) {
             reasons.push(`Инверсия из-за: ${triggerName} (>0.6)`);
             return 1 - val;
        }
        return val;
    };
    
    // Helper: "Boost" factor
    const boost = (val: number, factor: number, factorName: string) => {
        const add = 0.3 * factor;
        if (add > 0.05) {
             reasons.push(`Усиление (+${add.toFixed(2)}) из-за: ${factorName}`);
             return clamp01(val + add);
        }
        return val;
    };

    if (key === "AGENCY") {
      // Strong suppression from shame/blame/trauma/bioHelpless
      const suppression = 0.4 * selfBlameBias + 0.3 * tSelf + 0.3 * shame + 0.4 * gapSelf + 0.5 * bioHelpless;
      s = v * crush(suppression, "Стыд/Травма Я/Беспомощность");
    }

    if (key === "CARE") {
      // "I am bad/useless" OR "World is dangerous so I stop caring"
      // Also affected by hardening (bioWorldTrauma)
      const suppression = 0.3 * discountingPositive + 0.3 * tOthers + 0.3 * guilt + 0.3 * threatBias + 0.4 * bioWorldTrauma;
      s = v * crush(suppression, "Угроза/Вина/Травма Других");
    }

    if (key === "TRUTH") {
      // Self-deception from gap/shame
      // Flip on extreme distrust
      const distortionLevel = 0.3 * catastrophizing + 0.3 * gapTotal + 0.2 * personalization + 0.2 * shame;
      s = v * crush(distortionLevel, "Искажения/Катастрофизация");
      
      // Extreme distrust flips truth to paranoia/lies
      const paranoiaTrigger = trustBias * 0.6 + bioBetrayal * 0.4;
      s = maybeFlip(s, paranoiaTrigger, "Паранойя/Предательство");
    }

    if (key === "RADICAL") {
      // Black/White thinking + Shame -> Radical Compensation (Flip)
      // Or System Trauma -> Radicalization
      const radicalization = 0.4 * blackWhiteThinking + 0.3 * shame + 0.3 * tWorld + 0.4 * bioSystemTrauma;
      if (radicalization > 0.6) {
          reasons.push('Радикализация: толчок к крайности из-за Ч/Б мышления и травмы системы');
          // Push towards extremes (if low, become high. if high, stay high)
          s = Math.max(s, 0.8); 
      }
    }

    if (key === "ACCEPT") {
      // Rejection of reality due to trauma
      const rejection = 0.4 * catastrophizing + 0.4 * tWorld + 0.3 * tSystem + 0.5 * bioWorldTrauma;
      s = v * crush(rejection, "Отрицание реальности/Травма Мира");
    }

    if (key === "FORMAL") {
      // System Trauma -> Rejection of form
      const rejection = 0.5 * tSystem + 0.5 * gapSystem + 0.5 * bioSystemTrauma;
      s = v * crush(rejection, "Травма Системы/Разрыв ценностей");
    }
    
    if (key === "SCOPE") {
        // Status experience boosts scope perception
        if (bioStatus > 0.5) s = boost(s, bioStatus, "Опыт лидерства");
        // Helplessness reduces it
        if (bioHelpless > 0.5) s = v * crush(bioHelpless, "Выученная беспомощность");
    }
    
    // TRUTH/MANIP linkage (handled via logic usually but can be implicit)
    if (key === "MANIP") {
         // High threat bias + low agency -> Manipulative survival
         if (threatBias > 0.6 && (tSelf + bioHelpless) > 0.5) {
             s = boost(s, 0.5, "Угроза + Слабость (Манипуляция выживания)");
         }
    }

    result.push(Math.min(1, Math.max(0, s)));
    explanations.push(reasons);
  });

  return { result, explanations };
}

export function computeSelfGap(agent: AgentState): number {
  const a = agent.identity.arch_true;
  const b = agent.identity.arch_self;
  if (!a || !b || a.length !== b.length) return 0;
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  if (na === 0 || nb === 0) return 0;
  const cos = dot / (na * nb);
  return 1 - clamp01((cos + 1) / 2); // 0..1
}


function computeArchetypeSim(
  agent: AgentState,
  arch: typeof allArchetypes[0],
  usePerceived = false
): number {
  let num = 0;
  let den = 0;

  for (const key of Object.keys(arch.metrics)) {
      let agentVal = 0.5;
      if (usePerceived && agent.archetype?.self.perceivedAxes) {
          agentVal = agent.archetype.self.perceivedAxes[key] ?? 0.5;
      } else {
          agentVal = getNestedValue(agent, `vector_base.ARCH_${key}`) ?? 0.5;
      }
      
      const archVal = arch.metrics[key] ?? 0.5;
      const diff = Math.abs(agentVal - archVal);
      const score = 1 - diff;
      
      num += score;
      den += 1;
  }

  return den === 0 ? 0.5 : num / den;
}

function computeArchetypeConflict(a: typeof allArchetypes[0], b: typeof allArchetypes[0]): number {
    let num = 0;
    let den = 0;
    const keys = new Set([...Object.keys(a.metrics), ...Object.keys(b.metrics)]);
    
    for (const key of keys) {
        const va = a.metrics[key] ?? 0.5;
        const vb = b.metrics[key] ?? 0.5;
        num += Math.abs(va - vb);
        den += 1;
    }
    return den === 0 ? 0 : num / den;
}

function computeArchetypeMixture(
  agent: AgentState,
  usePerceived = false,
  beta = 4
): { mixture: Record<string, number>; sims: Record<string, number> } {
  const sims: Record<string, number> = {};
  const scores: number[] = [];
  
  for (const arch of allArchetypes) {
    const sim = computeArchetypeSim(agent, arch, usePerceived);
    sims[arch.id] = sim;
    // Boost score based on experience history if available
    const historyBonus = (agent.archetype?.history[arch.id] ?? 0) * 0.1;
    scores.push(beta * (sim + historyBonus));
  }

  const maxScore = Math.max(...scores);
  const exps = scores.map(s => Math.exp(s - maxScore));
  const sumExp = exps.reduce((a: number, b: number) => a + b, 0);

  const mixture: Record<string, number> = {};
  allArchetypes.forEach((arch, idx) => {
    mixture[arch.id] = exps[idx] / sumExp;
  });

  return { mixture, sims };
}

// --- Perception & Context Helpers ---

function computeCrisisLevel(agent: AgentState): number {
    const S = (agent.S ?? 50) / 100;
    const stress = (agent.body.acute.stress ?? 0) / 100;
    const trauma = (agent.body.acute.moral_injury ?? 0) / 100;
    
    const viabilityPenalty = agent.archetype ? (1 - agent.archetype.viability) * 0.5 : 0;

    return clamp01(0.4 * (1 - S) + 0.3 * trauma + 0.2 * stress + viabilityPenalty);
}

function getIdentityPriorForArchetype(archId: string, agent: AgentState): number {
    const arch = allArchetypes.find(a => a.id === archId);
    if (!arch) return 0;

    const roles = agent.roles?.global || [];
    let prior = 0;

    if (roles.includes('commander')) {
        if (arch.mu === 'SN') prior += 0.5;
        if (arch.mu === 'SR') prior += 0.3;
        if (arch.mu === 'OR') prior -= 0.5;
    }
    if (roles.includes('advisor')) {
        if (arch.mu === 'ON') prior += 0.5;
        if (arch.mu === 'SN') prior += 0.3;
    }
    if (roles.includes('operative')) {
        if (arch.mu === 'ON') prior += 0.4;
        if (arch.mu === 'SR') prior += 0.3;
    }
    return clamp01(prior); 
}

function computePerceivedAxes(agent: AgentState): Record<string, number> {
    const perceived: Record<string, number> = {};
    // Use self-vector if available (which includes distortions)
    const archSelf = agent.identity?.arch_self;
    
    if (archSelf && archSelf.length === ARCH_KEYS.length) {
        ARCH_KEYS.forEach((key, idx) => {
             perceived[key] = archSelf[idx];
        });
    } else {
        // Fallback to noisy perception of actual
        const selfConcept = (getNestedValue(agent, 'vector_base.G_Self_concept_strength') ?? 0.5);
        const bias = 1 - selfConcept; 
        for (const key of ARCH_KEYS) {
            const actual = getNestedValue(agent, `vector_base.ARCH_${key}`) ?? 0.5;
            const noise = (agent.rngChannels.perceive.nextFloat() - 0.5) * bias * 0.4;
            perceived[key] = clamp01(actual + noise);
        }
    }
    return perceived;
}

function checkArchetypeViability(agent: AgentState, sceneMetrics?: SceneMetrics): number {
    if (!agent.archetype) return 1;
    const actualId = agent.archetype.actualId;
    const arch = allArchetypes.find(a => a.id === actualId);
    if (!arch) return 1;
    if (!sceneMetrics) return 1;

    const { threat, discipline, legitimacy } = sceneMetrics;

    if (arch.mu === 'SN') {
        return clamp01(0.5 * (discipline / 100) + 0.5 * (legitimacy / 100));
    }
    if (arch.mu === 'SR') {
        return clamp01(0.6 * (threat / 100) + 0.4 * (1 - discipline / 100));
    }
    if (arch.mu === 'ON') {
        return clamp01(discipline / 100);
    }
    if (arch.mu === 'OR') {
        return clamp01(1 - discipline / 100);
    }
    
    return 0.5;
}

function updateArchetypePhase(agent: AgentState) {
    if (!agent.archetype) return;
    
    const stress = (agent.body.acute.stress ?? 0) / 100;
    
    const t = agent.trauma || { self: 0, others: 0, world: 0, system: 0 };
    const maxDomainTrauma = Math.max(t.self, t.others, t.world, t.system);

    const viability = agent.archetype.viability;
    const lambda = agent.archetype.shadowActivation;

    const misread = (agent as any).tomStats?.misreadCount ?? 0;
    const correct = (agent as any).tomStats?.correctReadCount ?? 0;
    const epistemicStress = Math.max(0, Math.min(1, misread * 0.1 - correct * 0.05));

    let nextPhase: ArchetypePhase = agent.archetype.phase;

    if (nextPhase === 'normal') {
        if (stress > 0.6 || viability < 0.4 || epistemicStress > 0.4 || maxDomainTrauma > 0.3) nextPhase = 'strain';
    } else if (nextPhase === 'strain') {
        if (stress < 0.4 && viability > 0.6 && epistemicStress < 0.2 && maxDomainTrauma < 0.2) nextPhase = 'normal'; 
        if (maxDomainTrauma > 0.6 || stress > 0.9 || epistemicStress > 0.7) nextPhase = 'break';
    } else if (nextPhase === 'break') {
        if (lambda > 0.8) nextPhase = 'radical';
        if (stress < 0.3 && maxDomainTrauma > 0.8) nextPhase = 'post';
    } else if (nextPhase === 'radical') {
        if (lambda < 0.4) nextPhase = 'post';
    } else if (nextPhase === 'post') {
        const integration = agent.traumaIntegration?.processedFraction ?? 0;
        if (integration > 0.5 && stress < 0.2) nextPhase = 'normal'; 
    }

    agent.archetype.phase = nextPhase;
}


// --- Update Logic ---

function updateActualArchetype(agent: AgentState) {
    const { mixture, sims } = computeArchetypeMixture(agent, false);
    
    let bestId = allArchetypes[0].id;
    let bestWeight = -Infinity;
    
    for (const arch of allArchetypes) {
        if ((mixture[arch.id] ?? 0) > bestWeight) {
            bestWeight = mixture[arch.id];
            bestId = arch.id;
        }
    }
    
    if (!agent.archetype) agent.archetype = { self: {}, history: {}, currentMode: 'default', phase: 'normal', viability: 1 } as any;
    agent.archetype!.mixture = mixture;
    agent.archetype!.actualId = bestId;
    agent.archetype!.actualFit = sims[bestId] ?? 0;
    
    return sims;
}

function updateShadowArchetype(agent: AgentState, sims: Record<string, number>) {
    const actualId = agent.archetype!.actualId;
    const actual = allArchetypes.find(a => a.id === actualId);
    if (!actual) return;

    let bestShadowId: string | null = null;
    let bestScore = -1;
    const MIN_SIM = 0.3;
    const MIN_CONFLICT = 0.4;

    for (const arch of allArchetypes) {
        if (arch.id === actualId) continue;
        const isShadowKind = MU_KIND[arch.mu] === 'shadow'; 
        const sim = sims[arch.id] ?? 0;
        if (sim < MIN_SIM) continue;
        const conflict = computeArchetypeConflict(actual, arch);
        if (conflict < MIN_CONFLICT) continue;
        let score = sim * conflict;
        if (isShadowKind) score *= 1.5;
        if (score > bestScore) {
            bestScore = score;
            bestShadowId = arch.id;
        }
    }
    agent.archetype!.shadowId = bestShadowId;
    agent.archetype!.shadowFit = bestShadowId ? (sims[bestShadowId] ?? 0) : 0;
}

function computeSelfArchetype(agent: AgentState) {
    const perceivedAxes = computePerceivedAxes(agent);
    if (!agent.archetype!.self) agent.archetype!.self = {} as any;
    agent.archetype!.self.perceivedAxes = perceivedAxes;

    const { sims: simsPerceived } = computeArchetypeMixture(agent, true); 
    const { sims: simsReal } = computeArchetypeMixture(agent, false);
    const crisis = computeCrisisLevel(agent);
    
    const scores: Record<string, number> = {};
    let maxScore = -Infinity;
    
    const BETA_SELF = 3;
    const GAMMA_PRIOR = 1.5;
    const DELTA_CRISIS = 2.0;

    for (const arch of allArchetypes) {
        const simSelf = simsPerceived[arch.id] ?? 0;
        const simReal = simsReal[arch.id] ?? 0;
        const prior = getIdentityPriorForArchetype(arch.id, agent);
        const score = BETA_SELF * simSelf + GAMMA_PRIOR * prior - DELTA_CRISIS * crisis * simReal;
        scores[arch.id] = score;
        if (score > maxScore) maxScore = score;
    }
    
    const exps: Record<string, number> = {};
    let sumExp = 0;
    for (const arch of allArchetypes) {
        const e = Math.exp(scores[arch.id] - maxScore);
        exps[arch.id] = e;
        sumExp += e;
    }
    
    const selfMixture: Record<string, number> = {};
    let bestId = allArchetypes[0].id;
    let bestProb = -Infinity;
    for (const arch of allArchetypes) {
        const prob = exps[arch.id] / sumExp;
        selfMixture[arch.id] = prob;
        if (scores[arch.id] > bestProb) { 
            bestProb = scores[arch.id];
            bestId = arch.id;
        }
    }
    agent.archetype!.self.selfMixture = selfMixture;
    agent.archetype!.self.selfId = bestId;
    agent.archetype!.self.selfConfidence = selfMixture[bestId];
}

function computeSelfShadowArchetype(agent: AgentState, realSims: Record<string, number>) {
    const selfId = agent.archetype!.self.selfId;
    const actualId = agent.archetype!.actualId;
    const selfArch = allArchetypes.find(a => a.id === selfId);
    if (!selfArch) return;

    const selfMix = agent.archetype!.self.selfMixture;
    let bestId: string | null = null;
    let bestScore = 0;
    
    const MIN_REAL_SIM = 0.3;
    const MIN_CONFLICT = 0.4;

    for (const arch of allArchetypes) {
        if (arch.id === selfId || arch.id === actualId) continue;
        const simReal = realSims[arch.id] ?? 0;
        if (simReal < MIN_REAL_SIM) continue;
        const conflict = computeArchetypeConflict(selfArch, arch);
        if (conflict < MIN_CONFLICT) continue;
        const selfWeight = selfMix[arch.id] ?? 0;
        const score = simReal * conflict * (1 - selfWeight);
        if (score > bestScore) {
            bestScore = score;
            bestId = arch.id;
        }
    }
    agent.archetype!.self.selfShadowId = bestId;
    agent.archetype!.self.selfShadowWeight = bestScore;
}

export function updateArchetypeState(agent: AgentState, tick: number, sceneMetrics?: SceneMetrics) {
    if (!agent.trauma) agent.trauma = { self: 0, others: 0, world: 0, system: 0 };
    
    if (!agent.archetype) agent.archetype = { self: {}, history: {}, currentMode: 'default', phase: 'normal', viability: 1 } as any;

    const realSims = updateActualArchetype(agent);
    updateShadowArchetype(agent, realSims);
    computeSelfArchetype(agent);
    computeSelfShadowArchetype(agent, realSims);
    
    agent.archetype!.viability = checkArchetypeViability(agent, sceneMetrics);
    updateArchetypePhase(agent);

    const crisis = computeCrisisLevel(agent);
    const actual = allArchetypes.find(a => a.id === agent.archetype!.actualId);
    const self = allArchetypes.find(a => a.id === agent.archetype!.self.selfId);
    const mismatch = (actual && self) ? computeArchetypeConflict(actual, self) : 0;
    
    const alpha = -2.0 + 4.0 * crisis + 2.0 * mismatch;
    agent.archetype!.shadowActivation = sigmoid(alpha);
}


// --- Feedback & Action ---

function getActionShadowAlignment(action: Action): Record<NormKind, number> {
    const violation: Record<NormKind, number> = { harm: 0, procedure: 0, betrayal: 0 };
    const id = action.id as SocialActionId;
    if (['attack', 'intimidate'].includes(id)) violation.harm = 1.0;
    if (['refuse_order', 'challenge_leader', 'deceive', 'blame_other', 'gossip'].includes(id)) violation.procedure = 1.0;
    if (id === 'form_subgroup') violation.procedure = 0.8;
    if (['deceive', 'blame_other', 'sow_dissent'].includes(id)) violation.betrayal = 1.0;
    return violation;
}

function estimateShadowMatchForAction(agent: AgentState, action: Action): number {
    if (!agent.archetype || !agent.archetype.shadowId) return 0;
    const shadowProfile = getArchetypeBehaviorProfile(agent.archetype.shadowId);
    const kind = action.id as SocialActionId;

    const prefShadow = shadowProfile.socialActionPreference[kind] ?? 1.0;
    const prefScore = clamp01((prefShadow - 0.5));

    const violations = getActionShadowAlignment(action);
    let normShadowBonus = 0;
    let totalViolations = 0;

    for (const n of ['harm', 'procedure', 'betrayal'] as NormKind[]) {
        const val = violations[n];
        if (val > 0) {
            totalViolations += val;
            const scale = shadowProfile.normPenaltyScale[n] ?? 1.0;
            if (scale < 1.0) {
                normShadowBonus += val * (1.0 - scale);
            }
        }
    }
    const normScore = totalViolations > 0 ? clamp01(normShadowBonus / totalViolations) : 0;
    return 0.6 * prefScore + 0.4 * normScore;
}

export function updateArchetypeFromAction(agent: AgentState, action: Action) {
    if (!agent.archetype) return;
    
    const shadowMatch = estimateShadowMatchForAction(agent, action);
    const lambda = agent.archetype.shadowActivation;
    
    const learningRate = 0.05;
    const deltaLambda = learningRate * (shadowMatch - 0.3);
    const newLambda = clamp01(lambda + deltaLambda);
    agent.archetype.shadowActivation = newLambda;

    if (agent.archetype.shadowId && shadowMatch > 0.6 && newLambda > 0.6) {
        const mix = agent.archetype.mixture;
        const shiftAmount = 0.02;
        let stolen = 0;
        for (const id in mix) {
            if (id === agent.archetype.shadowId) continue;
            const d = Math.min(mix[id], shiftAmount * mix[id]);
            mix[id] -= d;
            stolen += d;
        }
        mix[agent.archetype.shadowId] = (mix[agent.archetype.shadowId] ?? 0) + stolen;
    }
}

export function updateArchetypeExperience(agent: AgentState, action: Action, success: number) {
    if (!agent.archetype || success <= 0.2) return;

    const kind = action.id as SocialActionId;
    
    const preferredArchs = allArchetypes.filter(arch => {
        const prof = getArchetypeBehaviorProfile(arch.id);
        return (prof.socialActionPreference[kind] ?? 1.0) > 1.2;
    });

    const hist = agent.archetype.history;
    for(const arch of preferredArchs) {
        hist[arch.id] = (hist[arch.id] || 0) + 1;
    }
}