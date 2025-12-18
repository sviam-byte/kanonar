
// lib/tom/update.traits.ts

import {
  TomState,
  WorldState,
  SocialActionId,
  TomBeliefTraits,
  TomEntry,
  AgentState,
} from "../../types";
import { clamp } from "../util/math";
import { TRUST_ALPHA, EVENT_INTENSITY } from "../social/tuning";
import { socialActions } from "../../data/actions-social";

export interface TraitUpdateContext {
  effectiveIntensity: number;
  baseValence: number;
}

interface EventFeatures {
  isSupport: number;     
  isHarm: number;         
  isBetrayal: number;     
  isHierarchical: number; 
  success: number;        
  intensity: number;      
}

function extractFeatures(
  actionId: SocialActionId,
  success: number,
  intensity: number = 0.5
): EventFeatures {
  const action = socialActions.find(a => a.id === actionId);
  const tags: string[] = action?.tags ?? [];

  const isSupport =
    tags.includes("support") || tags.includes("help") || tags.includes("protect")
      ? 1
      : 0;
  const isHarm =
    tags.includes("harm") ||
    tags.includes("attack") ||
    tags.includes("punish")
      ? 1
      : 0;
  const isBetrayal =
    tags.includes("betrayal") ||
    tags.includes("deceive") ||
    tags.includes("lie")
      ? 1
      : 0;
  const isHierarchical =
    tags.includes("order") ||
    tags.includes("command") ||
    tags.includes("leadership")
      ? 1
      : 0;

  return {
    isSupport,
    isHarm,
    isBetrayal,
    isHierarchical,
    success: clamp(success, -1, 1),
    intensity: clamp(intensity, 0, 1),
  };
}

const TRAIT_UPDATE_MODELS: Record<
  keyof TomBeliefTraits,
  Partial<Record<keyof EventFeatures, number>>
> = {
  trust: { isSupport: +0.6, isHarm: -0.8, isBetrayal: -1.2, success: +0.2 },
  bond: { isSupport: +0.7, isHarm: -0.4, isBetrayal: -0.5 },
  conflict: { isHarm: +0.7, isBetrayal: +0.5, isSupport: -0.2 },
  competence: { success: +0.5 },
  align: {},
  dominance: { isHierarchical: +0.4, success: +0.1 },
  reliability: { isSupport: +0.4, isBetrayal: -0.8 },
  obedience: { isHierarchical: +0.3 },
  uncertainty: {},
  vulnerability: {},
  respect: {},
  fear: { isHarm: +0.8, isHierarchical: +0.2 }, // Added fear logic
};

function computeTraitDeltas(
  features: EventFeatures
): Partial<TomBeliefTraits> {
  const deltas: Partial<TomBeliefTraits> = {};
  (Object.keys(TRAIT_UPDATE_MODELS) as (keyof TomBeliefTraits)[]).forEach(
    (traitKey) => {
      const model = TRAIT_UPDATE_MODELS[traitKey];
      if (!model) return;
      let sum = 0;
      (Object.keys(model) as (keyof EventFeatures)[]).forEach((fKey) => {
        const w = model[fKey]!;
        sum += w * (features[fKey] ?? 0);
      });
      if (Math.abs(sum) > 1e-6) {
        deltas[traitKey] = sum;
      }
    }
  );
  return deltas;
}

export interface TraitObservation {
  observerId: string;
  targetId: string;
  actionId: SocialActionId;
  success: number; // [-1,1]
  world: WorldState;
}

export function updateTomTraits(
    tom: TomState, 
    obs: TraitObservation,
    ctx?: TraitUpdateContext
) {
  const { observerId, targetId, actionId, success, world } = obs;
  if (!tom[observerId]) tom[observerId] = {};
  let entry: TomEntry | undefined = tom[observerId][targetId];

  if (!entry) {
    entry = tom[observerId][targetId] = {
      goals: { goalIds: [], weights: [] },
      traits: {
        trust: 0.5, align: 0.5, bond: 0.1, competence: 0.5, dominance: 0.5,
        reliability: 0.5, obedience: 0.5, uncertainty: 0.8, conflict: 0.1,
        respect: 0.5, fear: 0.1 // Init missing traits
      },
      uncertainty: 0.8,
      lastUpdatedTick: world.tick ?? 0,
      lastInteractionTick: world.tick ?? 0,
    } as TomEntry;
  }

  const oldTraits: TomBeliefTraits = { ...entry.traits };

  let intensity = ctx?.effectiveIntensity;
  if (intensity === undefined) {
      const intensityTag: keyof typeof EVENT_INTENSITY = "medium";
      intensity = EVENT_INTENSITY[intensityTag] ?? 0.5;
  }

  const features = extractFeatures(actionId, success, intensity);
  const deltas = computeTraitDeltas(features);

  const traits: TomBeliefTraits = { ...entry.traits };
  let magnitude = 0;

  (Object.keys(deltas) as (keyof TomBeliefTraits)[]).forEach((tKey) => {
    if (tKey === "uncertainty") return;
    const delta = deltas[tKey]!;
    const alpha = TRUST_ALPHA * features.intensity;
    const prev = traits[tKey] ?? 0.5;
    const next = clamp(prev + alpha * delta, 0, 1);
    traits[tKey] = next;
    magnitude += Math.abs(next - prev);
  });

  const prevUnc = entry.uncertainty ?? 0.8;
  const infoGain = clamp(magnitude, 0, 1);
  const UNC_ALPHA = 0.25;
  const newUnc = clamp(
    prevUnc * (1 - UNC_ALPHA) + (1 - infoGain) * UNC_ALPHA,
    0,
    1
  );

  const prevCount = entry.evidenceCount ?? 0;
  entry.evidenceCount = prevCount + 1;

  entry.traits = traits;
  entry.uncertainty = newUnc;
  entry.lastInteractionTick = world.tick ?? entry.lastInteractionTick ?? 0;
  entry.lastUpdatedTick = world.tick ?? entry.lastUpdatedTick ?? 0;

  const deltaOut: Partial<TomBeliefTraits> = {};
  if (Math.abs(traits.trust - oldTraits.trust) > 1e-4) {
    deltaOut.trust = traits.trust - oldTraits.trust;
  }

  return { traitDelta: deltaOut };
}
