
import type { TomDyadReport } from "./types";
import { clamp01 } from "./types";

/**
 * Legacy relation view.
 * Matching fields expected by the rest of the application (e.g. FullAgentContext.tom.relations).
 */
export interface LegacyTomRelationView {
  targetId: string; // Renamed from otherId to match existing TomRelationView
  trust: number;
  threat: number;
  attachment: number;
  closeness: number;
  dominance: number; // Often 0..1 in legacy, but sometimes -1..1. We will map carefully.
  respect: number;
  support?: number; // Optional in legacy
  predictability?: number;
  align: number; // Renamed from alignment
  confidence?: number;
  affection: number; // Required now

  // optional: context hints you might already have
  publicExposure?: number;
  normPressure?: number;
  surveillance?: number;
  privacy?: number;
  
  // Extended fields for UI
  roleTag?: string;
  label?: string;
}

export function toLegacyTomRelationView(r: TomDyadReport): LegacyTomRelationView {
  return {
    targetId: r.otherId,
    trust: r.state.trust,
    threat: r.state.threat,
    attachment: r.state.attachment,
    closeness: r.state.attachment, // Using attachment as closeness proxy
    dominance: r.state.dominance, // Keep as is, consumer handles range
    respect: r.state.respect,
    support: r.state.support,
    predictability: r.state.predictability,
    align: r.state.alignment,
    confidence: r.confidence.overall,
    publicExposure: r.norms.publicExposure,
    normPressure: r.norms.normPressure,
    surveillance: r.norms.surveillance,
    privacy: r.norms.privacy,
    affection: r.dyadicAffect.feltTenderness, // Map affection
  };
}

export function fromLegacyTomRelationView(
  selfId: string,
  otherId: string,
  timestamp: number,
  legacy: Partial<LegacyTomRelationView>
): Pick<TomDyadReport, "selfId" | "otherId" | "timestamp" | "state" | "confidence" | "norms"> {
  return {
    selfId,
    otherId,
    timestamp,
    state: {
      trust: clamp01(legacy.trust ?? 0.5),
      threat: clamp01(legacy.threat ?? 0.2),
      support: clamp01(legacy.support ?? 0.5),
      attachment: clamp01(legacy.attachment ?? 0.4),
      respect: clamp01(legacy.respect ?? 0.5),
      dominance: clamp01(legacy.dominance ?? 0.3),
      predictability: clamp01(legacy.predictability ?? 0.5),
      alignment: clamp01(legacy.align ?? 0.5),
    },
    confidence: {
      trust: clamp01(legacy.confidence ?? 0.6),
      threat: clamp01(legacy.confidence ?? 0.6),
      support: clamp01(legacy.confidence ?? 0.6),
      attachment: clamp01(legacy.confidence ?? 0.6),
      respect: clamp01(legacy.confidence ?? 0.6),
      dominance: clamp01(legacy.confidence ?? 0.6),
      predictability: clamp01(legacy.confidence ?? 0.6),
      alignment: clamp01(legacy.confidence ?? 0.6),
      overall: clamp01(legacy.confidence ?? 0.6),
    },
    norms: {
      publicExposure: clamp01(legacy.publicExposure ?? 0.3),
      normPressure: clamp01(legacy.normPressure ?? 0.3),
      surveillance: clamp01(legacy.surveillance ?? 0.3),
      privacy: clamp01(legacy.privacy ?? 0.5),
    },
  };
}
