
import type { TomDyadReport, TomInterpretationAtom } from "./types";
import { clamp01 } from "./types";

function mkId(parts: Array<string | number | undefined | null>): string {
  return parts.filter(Boolean).join(":");
}

export function emitTomAtoms(report: TomDyadReport): TomInterpretationAtom[] {
  const t = report.timestamp;
  const i = report.selfId;
  const j = report.otherId;

  const trust = report.state.trust;
  const threat = report.state.threat;
  const support = report.state.support;
  const dominance = report.state.dominance;

  const publicMask = clamp01(report.norms.publicExposure * 0.6 + report.norms.normPressure * 0.4);
  const socialRisk = clamp01(report.norms.publicExposure * 0.5 + report.norms.surveillance * 0.5);
  const safeToBeVulnerable = clamp01((trust * (1 - threat)) * report.norms.privacy);
  const needDeescalation = clamp01(threat * (1 - trust) * (0.5 + report.norms.normPressure * 0.5));

  const conf = report.confidence.overall;

  const atoms: TomInterpretationAtom[] = [
    {
      id: mkId(["tom", "threat", i, j]),
      kind: "tom_perceived_threat",
      source: "tom",
      magnitude: clamp01(threat),
      confidence: conf,
      relatedAgentId: j,
      timestamp: t,
      label: "perceived_threat",
    },
    {
      id: mkId(["tom", "support", i, j]),
      kind: "tom_expected_support",
      source: "tom",
      magnitude: clamp01(support),
      confidence: conf,
      relatedAgentId: j,
      timestamp: t,
      label: "expected_support",
    },
    {
      id: mkId(["tom", "control", i, j]),
      kind: "tom_perceived_control",
      source: "tom",
      magnitude: clamp01(dominance),
      confidence: conf,
      relatedAgentId: j,
      timestamp: t,
      label: "perceived_control",
    },
    {
      id: mkId(["tom", "public_mask", i, j]),
      kind: "tom_public_mask",
      source: "tom",
      magnitude: publicMask,
      confidence: conf,
      relatedAgentId: j,
      timestamp: t,
      label: "signals_may_be_role",
    },
    {
      id: mkId(["tom", "social_risk", i, j]),
      kind: "tom_social_risk",
      source: "tom",
      magnitude: socialRisk,
      confidence: conf,
      relatedAgentId: j,
      timestamp: t,
      label: "social_risk",
    },
    {
      id: mkId(["tom", "safe_vulnerable", i, j]),
      kind: "tom_safe_to_be_vulnerable",
      source: "tom",
      magnitude: safeToBeVulnerable,
      confidence: conf,
      relatedAgentId: j,
      timestamp: t,
      label: "safe_to_be_vulnerable",
    },
    {
      id: mkId(["tom", "need_deescalation", i, j]),
      kind: "tom_need_deescalation",
      source: "tom",
      magnitude: needDeescalation,
      confidence: conf,
      relatedAgentId: j,
      timestamp: t,
      label: "need_deescalation",
    },
    {
      id: mkId(["tom", "confidence", i, j]),
      kind: "tom_confidence",
      source: "tom",
      magnitude: conf,
      confidence: conf,
      relatedAgentId: j,
      timestamp: t,
      label: "confidence",
    },
  ];

  // Intent atoms: help vs harm as complementary projections
  const intentHelp = clamp01(0.6 * trust + 0.4 * support);
  const intentHarm = clamp01(0.7 * threat + 0.3 * (1 - trust));

  atoms.push(
    {
      id: mkId(["tom", "intent_help", i, j]),
      kind: "tom_perceived_intent_help",
      source: "tom",
      magnitude: intentHelp,
      confidence: conf,
      relatedAgentId: j,
      timestamp: t,
      label: "intent_help",
    },
    {
      id: mkId(["tom", "intent_harm", i, j]),
      kind: "tom_perceived_intent_harm",
      source: "tom",
      magnitude: intentHarm,
      confidence: conf,
      relatedAgentId: j,
      timestamp: t,
      label: "intent_harm",
    }
  );

  return atoms;
}
