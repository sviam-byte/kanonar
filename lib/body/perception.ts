

import { AgentContextFrame, TomRelationView } from '../../types';
import { BodyState, SelfBodyModel, PerceivedBodyState, BodyAwarenessParams } from '../../types';
import { gaussian } from '../util/gaussian';

function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

function randomGaussian(mean: number, stdDev: number): number {
  return mean + gaussian() * stdDev;
}

/**
 * Extracts the ground truth body state from the agent's context frame.
 */
export function getTrueBodyState(frame: AgentContextFrame): BodyState {
  const hp = frame.how.physical.hp;
  const stamina = frame.how.physical.stamina;

  const pain = clamp01((100 - hp) / 100); // Simple heuristic: lower hp -> higher pain
  const mobility = frame.how.physical.canMove ? 1 - pain * 0.7 : 0;

  const isBleeding = hp < 70; // Temporary heuristic
  const isConscious = hp > 0 && (frame.how.affect.arousal > -0.9); // Heuristic

  return {
    hp,
    stamina,
    pain,
    mobility,
    isBleeding,
    isConscious,
  };
}

/**
 * Computes the agent's subjective perception of their own body.
 * Accounts for interoception accuracy, denial (underestimation), and catastrophizing (overestimation).
 */
export function computeSelfBodyModel(
  frame: AgentContextFrame,
  trueBody: BodyState,
  traits: BodyAwarenessParams
): SelfBodyModel {
  const { interoceptionAccuracy, denialTrait, catastrophizingTrait } = traits;

  // 1. Base noisy estimation via interoception
  // Higher accuracy -> lower noise
  const noiseScale = 1 - interoceptionAccuracy;

  const hpNoise = randomGaussian(0, 10 * noiseScale); // +/- 10 HP noise at low accuracy
  let hpSelf = clamp(0, 100, trueBody.hp + hpNoise);

  // 2. Cognitive Distortions
  // Denial pushes assessment to "better", Catastrophizing to "worse"
  const netBias = catastrophizingTrait - denialTrait; // >0: worse, <0: better

  // Note: if hp is actually high, denial doesn't do much (can't go >100).
  // If hp is low, denial pushes it up.
  // Bias application:
  // If netBias is positive (catastrophizing), we perceive lower HP (worse state).
  // If netBias is negative (denial), we perceive higher HP (better state).
  // Wait, prompt logic: "denial: тянет оценку к 'лучше, чем есть'".
  // So denial should ADD to HP if it's low.
  // "catastrophizing: к 'хуже, чем есть'".
  // So catastrophizing should SUBTRACT from HP.
  
  // Correction: 
  // denialTrait -> +HP bias
  // catastrophizingTrait -> -HP bias
  
  const cognitiveHpShift = denialTrait * 15 - catastrophizingTrait * 15;
  hpSelf = clamp(0, 100, hpSelf + cognitiveHpShift);

  // Pain perception
  const basePain = trueBody.pain;
  const painNoise = randomGaussian(0, 0.1 * noiseScale);
  // Catastrophizing amplifies pain, Denial suppresses it
  const cognitivePainShift = catastrophizingTrait * 0.2 - denialTrait * 0.2;
  
  let painSelf = clamp01(basePain + painNoise + cognitivePainShift);

  // Stamina self-perception: influenced by arousal (adrenaline masking fatigue)
  // Higher arousal makes one feel more energetic (higher stamina) temporarily
  const staminaSelf = clamp01(
    frame.how.physical.stamina / 100 + frame.how.affect.arousal * 0.2
  );

  // Mobility self-perception
  const mobilitySelf = clamp01(1 - painSelf * 0.7 - (100 - hpSelf) / 150);

  const isSeverelyWoundedSelf = hpSelf < 40 || painSelf > 0.7;
  const isCombatCapableSelf = hpSelf > 30 && mobilitySelf > 0.4;

  return {
    hpSelf,
    staminaSelf,
    painSelf,
    mobilitySelf,
    isSeverelyWoundedSelf,
    isCombatCapableSelf,
    biasHp: hpSelf - trueBody.hp,
    biasPain: painSelf - trueBody.pain,
    denialLevel: denialTrait,
    hypochondriaLevel: catastrophizingTrait,
  };
}

/**
 * Computes how the source agent perceives the target agent's body state.
 * Depends on visibility (distance) and relational biases (ToM).
 */
export function computePerceivedBodyStateForTarget(
  sourceFrame: AgentContextFrame, // Observer
  targetFrame: AgentContextFrame, // Observed
  relation: TomRelationView | null,
  traits: BodyAwarenessParams
): PerceivedBodyState {
  const trueBody = getTrueBodyState(targetFrame);

  // 1. Observability based on distance
  const nb = sourceFrame.what.nearbyAgents.find(n => n.id === targetFrame.who.agentId);
  const distanceNorm = nb?.distanceNorm ?? 1;
  const visibility = 1 - clamp01(distanceNorm); // 0..1 (1 is close)

  // Observer's capability to judge bodies
  const baseAccuracy = 0.3 + 0.5 * traits.interoceptionAccuracy + 0.2 * visibility;
  const noiseScale = 1 - clamp01(baseAccuracy);

  const hpNoise = randomGaussian(0, 15 * noiseScale);
  let hpEstimate = clamp(0, 100, trueBody.hp + hpNoise);

  // 2. Emotional / Relational Bias
  // If we care about them (affection) or fear them (threat), we might dramatize/monitor closely.
  // If we despise them or conflict, we might neglect or wishful thinking (they are weak).
  
  const affection = relation?.affection ?? 0;
  const fear = relation?.threat ?? 0;
  const careFactor = clamp01((affection + fear) / 2); // Intensity of concern

  // High care + High catastrophizing -> Dramatization (They look worse than they are)
  const dramatizationBias = careFactor * traits.catastrophizingTrait * 15;
  
  // Low care + High denial -> Neglect (They are fine / I don't care)
  const neglectBias = (1 - careFactor) * traits.denialTrait * 10;

  // Dramatization lowers estimated HP (worse condition). Neglect raises it (better condition).
  hpEstimate = clamp(0, 100, hpEstimate - dramatizationBias + neglectBias);

  // Pain estimation
  const painEstimate = clamp01(
    trueBody.pain +
    randomGaussian(0, 0.3 * noiseScale) +
    (dramatizationBias / 100) // Dramatization increases perceived pain
  );

  const staminaEstimate = clamp01(
    (targetFrame.how.physical.stamina / 100) +
    randomGaussian(0, 0.2 * noiseScale)
  );

  const mobilityEstimate = clamp01(
    trueBody.mobility +
    randomGaussian(0, 0.2 * noiseScale)
  );

  const isSeverelyWounded = hpEstimate < 40 || painEstimate > 0.7;
  const isCombatCapable = hpEstimate > 30 && mobilityEstimate > 0.4;

  return {
    targetId: targetFrame.who.agentId,
    hpEstimate,
    staminaEstimate: staminaEstimate * 100,
    painEstimate,
    mobilityEstimate,
    isSeverelyWounded,
    isCombatCapable,
    confidence: clamp01(baseAccuracy),
  };
}
