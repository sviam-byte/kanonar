// lib/dilemma/compiler.ts
//
// Step 1: compileAgent — raw character → effective runtime snapshot.
// Step 2: compileDyad  — two compiled agents → asymmetric pair state.
//
// This keeps v2 dilemma scoring deterministic and auditable.

import type { AgentState, V42Metrics, Relationship, TomEntry, TomBeliefTraits } from '../../types';
import type { CompiledAgent, CompiledDyad, UtilityWeights } from './types';
import { flattenObject } from '../param-utils';
import { calculateLatentsAndQuickStates } from '../metrics/latentsQuick';
import { calculateV42Metrics, normalizeParamsForV42 } from '../character-metrics-v4.2';
import { clamp01 } from '../util/math';

const ALL_AXES = [
  'A_Safety_Care', 'A_Power_Sovereignty', 'A_Liberty_Autonomy',
  'A_Knowledge_Truth', 'A_Tradition_Continuity', 'A_Legitimacy_Procedure',
  'A_Justice_Fairness', 'A_Transparency_Secrecy', 'A_Causality_Sanctity',
  'A_Reversibility', 'A_Memory_Fidelity', 'A_Aesthetic_Meaning',
  'B_decision_temperature', 'B_goal_coherence', 'B_discount_rate',
  'B_exploration_rate', 'B_tolerance_ambiguity', 'B_cooldown_discipline',
  'C_reciprocity_index', 'C_betrayal_cost', 'C_coalition_loyalty',
  'C_reputation_sensitivity', 'C_dominance_empathy',
  'D_fine_motor', 'D_stamina_reserve', 'D_pain_tolerance',
  'D_HPA_reactivity', 'D_sleep_resilience',
  'E_KB_stem', 'E_KB_civic', 'E_KB_topos',
  'E_Model_calibration', 'E_Skill_repair_topology', 'E_Skill_causal_surgery',
  'E_Skill_chronicle_verify', 'E_Skill_diplomacy_negotiation',
  'E_Skill_ops_fieldcraft', 'E_Skill_opsec_hacking',
  'E_Epi_volume', 'E_Epi_recency', 'E_Epi_schema_strength',
  'F_Plasticity', 'F_Value_update_rate', 'F_Extinction_rate',
  'F_Trauma_plasticity', 'F_Skill_learning_rate', 'F_Forgetting_noise',
  'G_Self_concept_strength', 'G_Identity_rigidity', 'G_Self_consistency_drive',
  'G_Metacog_accuracy', 'G_Narrative_agency',
] as const;

function readState(agent: AgentState, key: string, fb = 50): number {
  const val = Number((agent as any).state?.[key]);
  return Number.isFinite(val) ? val : fb;
}

function readAcute(agent: AgentState, key: string, fb = 0): number {
  const val = Number((agent as any).body?.acute?.[key]);
  return Number.isFinite(val) ? val : fb;
}

function readCognitive(agent: AgentState, key: string, fb: any = 0): any {
  return (agent as any).cognitive?.[key] ?? fb;
}

function computeAgentConfidence(agent: AgentState, filledAxes: number): number {
  const axesCoverage = filledAxes / ALL_AXES.length;
  const hasEvents = ((agent as any).historicalEvents ?? []).length > 0 ? 1 : 0;
  const hasGoals = Object.keys((agent as any).cognitive?.w_goals ?? {}).length > 0 ? 1 : 0;
  const hasState = (agent as any).state?.will !== undefined ? 1 : 0;
  return clamp01(0.4 * axesCoverage + 0.2 * hasEvents + 0.2 * hasGoals + 0.2 * hasState);
}

export function compileAgent(agent: AgentState): CompiledAgent {
  const id = agent.entityId ?? (agent as any).id ?? 'unknown';

  const axes: Record<string, number> = {};
  let filledAxes = 0;
  for (const k of ALL_AXES) {
    const raw = Number((agent as any).vector_base?.[k]);
    if (Number.isFinite(raw)) {
      axes[k] = clamp01(raw);
      filledAxes++;
    } else {
      axes[k] = 0.5;
    }
  }

  const flat = flattenObject(agent);
  const { latents } = calculateLatentsAndQuickStates(flat);
  const normParams = normalizeParamsForV42(flat);
  const v42 = calculateV42Metrics(normParams, latents, 0);

  const cognitive = {
    fallbackPolicy: readCognitive(agent, 'fallback_policy', 'wait') as string,
    planningHorizon: readCognitive(agent, 'planning_horizon', 10) as number,
    deceptionPropensity: readCognitive(agent, 'deception_propensity', 50) as number,
    shameGuiltSensitivity: readCognitive(agent, 'shame_guilt_sensitivity', 50) as number,
    wGoals: readCognitive(agent, 'w_goals', {}) as Record<string, number>,
  };

  const state = {
    will: readState(agent, 'will', 50),
    loyalty: readState(agent, 'loyalty', 50),
    darkExposure: readState(agent, 'dark_exposure', 0),
    driftState: readState(agent, 'drift_state', 15),
    burnoutRisk: Number((agent as any).state?.burnout_risk ?? 0),
    backlogLoad: readState(agent, 'backlog_load', 50),
    overloadSensitivity: readState(agent, 'overload_sensitivity', 50),
  };

  const acute = {
    stress: readAcute(agent, 'stress', 0),
    fatigue: readAcute(agent, 'fatigue', 0),
    moralInjury: readAcute(agent, 'moral_injury', 0),
    pain: readAcute(agent, 'pain_now', 0),
    arousal: Number((agent as any).body?.regulation?.arousal ?? 0.5),
  };

  const roles = ((agent as any).roles?.global ?? []) as string[];
  const roleRelations = ((agent as any).roles?.relations ?? []) as { other_id: string; role: string }[];
  const clearance = Number((agent as any).identity?.clearance_level ?? 0);
  const confidence = computeAgentConfidence(agent, filledAxes);
  const weights = deriveWeights(axes, state, cognitive, v42);

  const charTemp = axes.B_decision_temperature ?? 0.5;
  const stressPenalty = (acute.stress / 100) * 0.3;
  const fatiguePenalty = (acute.fatigue / 100) * 0.15;
  const effectiveTemperature = 0.3 + 1.4 * charTemp + stressPenalty + fatiguePenalty;

  return {
    id,
    v42,
    latents,
    axes,
    cognitive,
    state,
    acute,
    weights,
    effectiveTemperature,
    roles,
    roleRelations: roleRelations.map((r) => ({ otherId: r.other_id, role: r.role })),
    clearance,
    confidence,
  };
}

function deriveWeights(
  axes: Record<string, number>,
  state: CompiledAgent['state'],
  _cognitive: CompiledAgent['cognitive'],
  v42: V42Metrics,
): UtilityWeights {
  const gc = axes.B_goal_coherence ?? 0.5;
  const burnout = state.burnoutRisk;
  const will01 = state.will / 100;

  const wG = clamp01(0.4 * gc * (1 - burnout * 0.5) + 0.2 * will01 + 0.1);
  const reciprocity = axes.C_reciprocity_index ?? 0.5;
  const empathy = axes.C_dominance_empathy ?? 0.5;
  const bond = axes.A_Safety_Care ?? 0.5;
  const wR = clamp01(0.35 * reciprocity + 0.25 * empathy + 0.2 * bond + 0.1);

  const selfConsist = axes.G_Self_consistency_drive ?? 0.5;
  const idRigid = axes.G_Identity_rigidity ?? 0.5;
  const selfConcept = axes.G_Self_concept_strength ?? 0.5;
  const wI = clamp01(0.4 * selfConsist + 0.3 * idRigid + 0.15 * selfConcept + 0.05);

  const legProc = axes.A_Legitimacy_Procedure ?? 0.5;
  const civicK = axes.E_KB_civic ?? 0.5;
  const loyalty01 = state.loyalty / 100;
  const wL = clamp01(0.35 * legProc + 0.25 * civicK + 0.2 * loyalty01 + 0.1);

  const stress01 = Math.min(1, v42.ExhaustRisk_t + burnout);
  const safetyCare = axes.A_Safety_Care ?? 0.5;
  const wS = clamp01(0.3 * (1 - will01) + 0.25 * stress01 + 0.2 * safetyCare + 0.1);

  const repSens = axes.C_reputation_sensitivity ?? 0.5;
  const wM = clamp01(0.4 * repSens + 0.3 * selfConcept + 0.1);

  const dark01 = state.darkExposure / 100;
  const wX = clamp01(
    0.3 * (axes.C_betrayal_cost ?? 0.5)
    + 0.2 * (1 - dark01)
    + 0.2 * (1 - (axes.B_exploration_rate ?? 0.5))
    + 0.1,
  );

  return { wG, wR, wI, wL, wS, wM, wX };
}

export function compileDyad(
  from: CompiledAgent,
  to: CompiledAgent,
  agentA: AgentState,
  _agentB: AgentState,
): CompiledDyad {
  const rawRel = agentA.relationships?.[to.id] as Partial<Relationship> | undefined;
  const rel: Relationship = {
    trust: clamp01(Number(rawRel?.trust ?? 0.5)),
    align: clamp01(Number(rawRel?.align ?? 0.5)),
    respect: clamp01(Number(rawRel?.respect ?? 0.5)),
    fear: clamp01(Number(rawRel?.fear ?? 0)),
    bond: clamp01(Number(rawRel?.bond ?? 0.1)),
    conflict: clamp01(Number(rawRel?.conflict ?? 0.1)),
    history: rawRel?.history ?? [],
  };

  const tomState = (agentA as any).tom;
  let tomTraits: Partial<TomBeliefTraits> = {};
  let soTrust = 0.5;
  let soAlign = 0.5;
  let soDom = 0.5;

  if (tomState) {
    const entry: Partial<TomEntry> | null =
      tomState?.[from.id]?.[to.id] ?? tomState?.views?.[from.id]?.[to.id] ?? null;
    if (entry?.traits) tomTraits = { ...entry.traits };
    if (entry?.secondOrderSelf) {
      soTrust = entry.secondOrderSelf.perceivedTrustFromTarget ?? 0.5;
      soAlign = entry.secondOrderSelf.perceivedAlignFromTarget ?? 0.5;
      soDom = entry.secondOrderSelf.perceivedDominanceInTargetsView ?? 0.5;
    }
  }

  const shame = (from.cognitive.shameGuiltSensitivity ?? 50) / 100;
  const mirrorIndex = clamp01(0.4 * soTrust + 0.6 * soAlign);
  const selfAlign = clamp01(mirrorIndex - 0.5 * shame);
  const shameDelta = selfAlign - mirrorIndex;

  const powerA = from.axes.A_Power_Sovereignty ?? 0.5;
  const powerB = to.axes.A_Power_Sovereignty ?? 0.5;
  const clearanceDelta = (from.clearance - to.clearance) / 5;
  const powerAsymmetry = clamp01(0.5 + 0.3 * (powerA - powerB) + 0.2 * clearanceDelta) * 2 - 1;

  const eventsA = (agentA as any).historicalEvents ?? [];
  const sharedCount = eventsA.filter((e: any) => {
    const participants: string[] = e.participants ?? [];
    const targetId = e.payload?.targetId ?? e.payload?.otherId;
    return participants.includes(to.id) || targetId === to.id;
  }).length;
  const sharedHistoryDensity = clamp01(sharedCount / 5);

  const dyadConfidence = clamp01(
    0.3 * from.confidence
    + 0.3 * to.confidence
    + 0.2 * sharedHistoryDensity
    + 0.2 * (Object.keys(tomTraits).length > 0 ? 1 : 0),
  );

  return {
    fromId: from.id,
    toId: to.id,
    rel,
    tom: tomTraits,
    secondOrder: {
      perceivedTrust: soTrust,
      perceivedAlign: soAlign,
      perceivedDominance: soDom,
      mirrorIndex,
      shameDelta,
    },
    powerAsymmetry,
    sharedHistoryDensity,
    confidence: dyadConfidence,
  };
}
