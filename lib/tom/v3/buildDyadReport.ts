
import type {
  TomDyadReport,
  TomBeliefState,
  TomDecomposition,
  TomNormativeContext,
  TomDyadicAffect,
  DomainKey,
  TomStateKey,
  TomActionCat,
} from "./types";
import { clamp01 } from "./types";
import { emitTomAtoms } from "./emitAtoms";

export interface TomBuildInput {
  selfId: string;
  otherId: string;
  timestamp: number;

  // context
  domains: Partial<Record<DomainKey, number>>;
  norms: TomNormativeContext;

  // affect of self (global mood for now, can extend to dyad-specific)
  selfAffect: Partial<Record<"fear" | "anger" | "shame" | "pride" | "intimacy", number>>;

  // evidence from scene (already atomized upstream)
  evidence: Array<{ key: string; val: number }>;

  // baseline prior (from long-term relation store)
  prior: Partial<TomBeliefState>;
}

function topActionsFromState(state: TomBeliefState): Array<{ action: TomActionCat; p: number }> {
  // cheap, deterministic heuristic
  const pSupport = clamp01(0.5 * state.support + 0.3 * state.trust + 0.2 * state.attachment);
  const pThreaten = clamp01(0.6 * state.threat + 0.2 * state.dominance + 0.2 * (1 - state.trust));
  const pCommand = clamp01(0.6 * state.dominance + 0.2 * state.respect + 0.2 * state.alignment);
  const pWithdraw = clamp01(0.6 * state.threat + 0.2 * (1 - state.predictability) + 0.2 * (1 - state.attachment));
  const pComfort = clamp01(0.5 * state.attachment + 0.3 * state.trust + 0.2 * (1 - state.threat));

  const raw = [
    { action: "support" as const, p: pSupport },
    { action: "threaten" as const, p: pThreaten },
    { action: "command" as const, p: pCommand },
    { action: "withdraw" as const, p: pWithdraw },
    { action: "comfort" as const, p: pComfort },
  ];

  // normalize to sum<=1 (soft-ish)
  const s = raw.reduce((acc, x) => acc + x.p, 0) || 1;
  const normed = raw.map(x => ({ ...x, p: x.p / s }));
  normed.sort((a, b) => b.p - a.p);
  return normed.slice(0, 3);
}

function dec(
  prior: number,
  contextBias: number,
  affectBias: number,
  evidenceUpdate: number,
  contributors: TomDecomposition["contributors"]
): TomDecomposition {
  const final = clamp01(prior + contextBias + affectBias + evidenceUpdate);
  return { prior, contextBias, affectBias, evidenceUpdate, final, contributors };
}

export function buildDyadReport(input: TomBuildInput): TomDyadReport {
  const { selfId, otherId, timestamp, domains, norms, selfAffect, evidence, prior } = input;

  const dDanger = clamp01(domains.danger ?? 0);
  const dIntimacy = clamp01(domains.intimacy ?? 0);
  const dHierarchy = clamp01(domains.hierarchy ?? 0);
  const dSurv = clamp01(domains.surveillance ?? norms.surveillance ?? 0);
  const dNorm = clamp01(domains.normPressure ?? norms.normPressure ?? 0);

  const fear = clamp01(selfAffect.fear ?? 0);
  const anger = clamp01(selfAffect.anger ?? 0);
  const shame = clamp01(selfAffect.shame ?? 0);
  const intimacy = clamp01(selfAffect.intimacy ?? 0);

  // Evidence (toy): sum relevant signals; replace with your real feature model.
  const ev = new Map(evidence.map(e => [e.key, e.val]));
  const oathKept = clamp01(ev.get("oath_kept") ?? 0);
  const aggression = clamp01(ev.get("aggression") ?? 0);
  const care = clamp01(ev.get("care") ?? 0);

  // Build per-key decompositions (minimal but debuggable)
  const decomp: Record<TomStateKey, TomDecomposition> = {} as any;

  // TRUST
  {
    const p = clamp01(prior.trust ?? 0.5);
    const ctx = (+0.25 * dIntimacy) + (-0.15 * dSurv) + (-0.10 * dDanger);
    const aff = (+0.15 * intimacy) + (-0.25 * fear) + (-0.10 * anger);
    const evi = (+0.25 * oathKept) + (+0.20 * care) + (-0.20 * aggression);
    decomp.trust = dec(p, ctx, aff, evi, [
      { kind: "context", key: "intimacy", weight: +0.25 * dIntimacy },
      { kind: "context", key: "surveillance", weight: -0.15 * dSurv },
      { kind: "context", key: "danger", weight: -0.10 * dDanger },
      { kind: "affect", key: "intimacy", weight: +0.15 * intimacy },
      { kind: "affect", key: "fear", weight: -0.25 * fear },
      { kind: "affect", key: "anger", weight: -0.10 * anger },
      { kind: "evidence", key: "oath_kept", weight: +0.25 * oathKept },
      { kind: "evidence", key: "care", weight: +0.20 * care },
      { kind: "evidence", key: "aggression", weight: -0.20 * aggression },
    ]);
  }

  // THREAT
  {
    const p = clamp01(prior.threat ?? 0.2);
    const ctx = (+0.35 * dDanger) + (+0.15 * dHierarchy) + (+0.10 * dSurv);
    const aff = (+0.35 * fear) + (+0.15 * anger) + (+0.15 * shame);
    const evi = (+0.30 * aggression) + (-0.20 * care) + (-0.10 * oathKept);
    decomp.threat = dec(p, ctx, aff, evi, [
      { kind: "context", key: "danger", weight: +0.35 * dDanger },
      { kind: "context", key: "hierarchy", weight: +0.15 * dHierarchy },
      { kind: "context", key: "surveillance", weight: +0.10 * dSurv },
      { kind: "affect", key: "fear", weight: +0.35 * fear },
      { kind: "affect", key: "anger", weight: +0.15 * anger },
      { kind: "affect", key: "shame", weight: +0.15 * shame },
      { kind: "evidence", key: "aggression", weight: +0.30 * aggression },
      { kind: "evidence", key: "care", weight: -0.20 * care },
      { kind: "evidence", key: "oath_kept", weight: -0.10 * oathKept },
    ]);
  }

  // SUPPORT / ATTACHMENT / RESPECT / DOMINANCE / PREDICTABILITY / ALIGNMENT (минимальные)
  const mkSimple = (key: TomStateKey, base: number, ctx: number, aff: number, evi: number) => {
    decomp[key] = dec(base, ctx, aff, evi, []);
  };

  mkSimple("support",
    clamp01(prior.support ?? 0.5),
    clamp01(+0.20 * dIntimacy - 0.10 * dDanger),
    clamp01(+0.10 * intimacy - 0.15 * fear),
    clamp01(+0.25 * care + 0.10 * oathKept - 0.15 * aggression)
  );

  mkSimple("attachment",
    clamp01(prior.attachment ?? 0.4),
    clamp01(+0.25 * dIntimacy - 0.10 * dNorm),
    clamp01(+0.25 * intimacy - 0.10 * anger),
    clamp01(+0.15 * care - 0.10 * aggression)
  );

  mkSimple("respect",
    clamp01(prior.respect ?? 0.5),
    clamp01(+0.35 * dHierarchy + 0.10 * dNorm),
    clamp01(-0.10 * anger),
    clamp01(+0.05 * oathKept)
  );

  mkSimple("dominance",
    clamp01(prior.dominance ?? 0.3),
    clamp01(+0.30 * dHierarchy + 0.10 * dSurv),
    clamp01(+0.10 * fear),
    clamp01(+0.20 * aggression)
  );

  mkSimple("predictability",
    clamp01(prior.predictability ?? 0.5),
    clamp01(+0.10 * dNorm - 0.10 * dDanger),
    clamp01(-0.10 * fear),
    clamp01(+0.10 * oathKept)
  );

  mkSimple("alignment",
    clamp01(prior.alignment ?? 0.5),
    clamp01(+0.10 * dNorm + 0.10 * dIntimacy),
    clamp01(+0.05 * intimacy - 0.05 * anger),
    clamp01(+0.10 * oathKept)
  );

  const state = {
    trust: decomp.trust.final,
    threat: decomp.threat.final,
    support: decomp.support.final,
    attachment: decomp.attachment.final,
    respect: decomp.respect.final,
    dominance: decomp.dominance.final,
    predictability: decomp.predictability.final,
    alignment: decomp.alignment.final,
  };

  // Confidence: penalize public mask + norm pressure + lack of evidence
  const evidenceMass = clamp01((oathKept + care + aggression) / 3);
  const overall = clamp01(0.65 * evidenceMass + 0.35 * (1 - clamp01(norms.publicExposure * 0.6 + dNorm * 0.4)));

  const confidence = {
    trust: overall,
    threat: overall,
    support: overall,
    attachment: overall,
    respect: overall,
    dominance: overall,
    predictability: overall,
    alignment: overall,
    overall,
    dataAdequacy: evidenceMass,
  };

  const dyadicAffect: TomDyadicAffect = {
    feltSafety: clamp01(state.trust * (1 - state.threat) * norms.privacy),
    feltFear: clamp01(state.threat * (0.5 + fear * 0.5)),
    feltShame: clamp01(dSurv * dNorm * (0.5 + shame * 0.5)),
    feltAnger: clamp01(state.threat * (0.3 + anger * 0.7)),
    feltTenderness: clamp01(state.attachment * (0.5 + intimacy * 0.5) * (1 - state.threat)),
  };

  const report: TomDyadReport = {
    selfId,
    otherId,
    timestamp,
    domains,
    norms,
    state,
    confidence,
    decomposition: decomp,
    prediction: { top: topActionsFromState(state) },
    dyadicAffect,
    atoms: [], // filled below
  };

  report.atoms = emitTomAtoms(report);
  return report;
}
