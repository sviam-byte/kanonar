
// lib/tom/tomContextBridge.ts
import { clamp01 } from "../threat/threatStack";

export type ContextNorms = {
  privacy: number;         // 0..1
  surveillance: number;    // 0..1
  governance: "hierarchical" | "egalitarian" | "anarchy";
  danger: number;          // 0..1 env-level
  intimacy: number;        // 0..1
};

export type TomEvidence = {
  aggression: number; // -1..+1 (где + = агрессия наблюдалась)
  care: number;       // -1..+1
  oath_kept: number;  // -1..+1
};

export type TomPrior = {
  trust: number;    // 0..1
  threat: number;   // 0..1
  predictability: number; // 0..1
  dominance: number; // 0..1
  alignment: number; // 0..1
};

export type TomUpdateOut = {
  trust: number;
  threat: number;
  confidence: number;
  why: string[];
};

// Делает то, что у тебя уже частично есть в decomposition,
// но (1) вводит “контекстные множители” и (2) фиксирует шкалы.
export function updateTomDyad(
  prior: TomPrior,
  norms: ContextNorms,
  ev: TomEvidence,
  affect: { fear: number; anger: number; shame: number },
  params?: Partial<{
    wContextIntimacyToTrust: number;
    wContextDangerToThreat: number;
    wGovernanceToThreat: number;
    wSurveillanceToThreat: number;
    wEvidenceAggressionToThreat: number;
    wEvidenceCareToTrust: number;
    wEvidenceOathToTrust: number;
    wAffectFearToThreat: number;
  }>
): TomUpdateOut {
  const p = {
    wContextIntimacyToTrust: 0.18,
    wContextDangerToThreat: 0.22,
    wGovernanceToThreat: 0.08,
    wSurveillanceToThreat: 0.06,
    wEvidenceAggressionToThreat: 0.10,
    wEvidenceCareToTrust: 0.08,
    wEvidenceOathToTrust: 0.06,
    wAffectFearToThreat: 0.10,
    ...params
  };

  const why: string[] = [];

  const govThreat =
    norms.governance === "hierarchical" ? 0.12 :
    norms.governance === "egalitarian" ? 0.04 : 0.18;

  const trust =
    clamp01(
      prior.trust +
      p.wContextIntimacyToTrust * norms.intimacy +
      p.wEvidenceCareToTrust * (ev.care) +
      p.wEvidenceOathToTrust * (ev.oath_kept)
    );

  const threat =
    clamp01(
      prior.threat +
      p.wContextDangerToThreat * norms.danger +
      p.wGovernanceToThreat * govThreat +
      p.wSurveillanceToThreat * norms.surveillance +
      p.wEvidenceAggressionToThreat * Math.max(0, ev.aggression) +
      p.wAffectFearToThreat * affect.fear
    );

  // confidence: минимум — от “адекватности данных”, максимум — от стабильности контекста
  const confidence = clamp01(0.25 + 0.35 * prior.predictability + 0.25 * (1 - norms.surveillance) + 0.15 * norms.privacy);

  why.push(`trust=${trust.toFixed(3)} threat=${threat.toFixed(3)} conf=${confidence.toFixed(3)} (gov=${norms.governance} danger=${norms.danger.toFixed(2)} intim=${norms.intimacy.toFixed(2)} surv=${norms.surveillance.toFixed(2)})`);

  return { trust, threat, confidence, why };
}
