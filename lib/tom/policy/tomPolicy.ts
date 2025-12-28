// lib/tom/policy/tomPolicy.ts
// Principled policy layer:
// - Belief update in log-odds space (add evidence as LLR-like terms)
// - Mode (System-2 intensity) via approximate Value-of-Information vs time/pressure cost
// - Actions via Expected Utility + softmax to probabilities
import { ContextAtom } from '../../context/v2/types';
import { normalizeAtom } from '../../context/v2/infer';
import { clamp01, entropy01, invLogit, logit, sigmoid, softmax } from './decisionMath';

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function dyadEffId(selfId: string, otherId: string, metric: string) {
  return `tom:effective:dyad:${selfId}:${otherId}:${metric}`;
}

function relId(selfId: string, otherId: string, k: string) {
  return `rel:base:${selfId}:${otherId}:${k}`;
}

function mkAtom(
  selfId: string,
  otherId: string,
  id: string,
  magnitude: number,
  label: string,
  usedAtomIds: string[],
  parts: any
): ContextAtom {
  return normalizeAtom({
    id,
    kind: 'tom_policy',
    ns: 'tom',
    origin: 'derived',
    source: 'tom_policy',
    magnitude: clamp01(magnitude),
    confidence: 1,
    subject: selfId,
    target: otherId,
    tags: ['tom', 'policy'],
    label,
    trace: { usedAtomIds: Array.from(new Set(usedAtomIds.filter(Boolean))), parts }
  } as any) as any;
}

export function buildTomPolicyLayer(atoms: ContextAtom[], selfId: string): { atoms: ContextAtom[] } {
  const out: ContextAtom[] = [];

  // ---------- Context (self) ----------
  const danger = clamp01(getMag(atoms, `ctx:danger:${selfId}`, 0));
  const crowd = clamp01(getMag(atoms, `ctx:crowd:${selfId}`, 0));
  const publicness = clamp01(getMag(atoms, `ctx:publicness:${selfId}`, 0));
  const surveillance = clamp01(getMag(atoms, `ctx:surveillance:${selfId}`, 0));
  const normPressure = clamp01(getMag(atoms, `ctx:normPressure:${selfId}`, 0));
  const uncertaintyCtx = clamp01(getMag(atoms, `ctx:uncertainty:${selfId}`, 0));

  // Stakes ~ how costly a wrong move is (danger + surveillance/publicness/normPressure add social stakes)
  const stakes = clamp01(0.55 * danger + 0.20 * surveillance + 0.15 * publicness + 0.10 * normPressure);
  // Time/pressure cost ~ less compute available (danger + crowd + normPressure)
  const timePressure = clamp01(0.55 * danger + 0.30 * crowd + 0.15 * normPressure);

  // Approximate VOI: uncertainty * stakes  (if you're uncertain and stakes are high -> worth System-2)
  const voi = clamp01(uncertaintyCtx * stakes);
  // Compute-cost proxy: timePressure
  // Mode is sigmoid(k*(VOI - cost)), k tuned for smoothness (not a heuristic threshold; it is a monotone transform)
  const k = 6.0;
  const S2 = clamp01(sigmoid(k * (voi - timePressure)));

  out.push(normalizeAtom({
    id: `tom:mode:${selfId}`,
    kind: 'tom_policy',
    ns: 'tom',
    origin: 'derived',
    source: 'tom_policy',
    magnitude: S2,
    confidence: 1,
    subject: selfId,
    target: selfId,
    tags: ['tom', 'policy'],
    label: S2 >= 0.55 ? 'System-2' : 'System-1',
    trace: {
      usedAtomIds: [
        `ctx:danger:${selfId}`,
        `ctx:crowd:${selfId}`,
        `ctx:publicness:${selfId}`,
        `ctx:surveillance:${selfId}`,
        `ctx:normPressure:${selfId}`,
        `ctx:uncertainty:${selfId}`,
      ],
      parts: { danger, crowd, publicness, surveillance, normPressure, uncertaintyCtx, stakes, timePressure, voi, S2 }
    }
  } as any));

  // ---------- dyad list ----------
  const eff = atoms.filter(a => typeof a.id === 'string' && a.id.startsWith(`tom:effective:dyad:${selfId}:`));
  const otherIds = Array.from(new Set(eff.map(a => String((a as any)?.target || a.id.split(':')[4] || '')))).filter(Boolean);

  for (const otherId of otherIds) {
    // Effective dyad metrics (already "contexted" where applicable)
    const trust = clamp01(getMag(atoms, dyadEffId(selfId, otherId, 'trust'), 0));
    const threat = clamp01(getMag(atoms, dyadEffId(selfId, otherId, 'threat'), 0));
    const support = clamp01(getMag(atoms, dyadEffId(selfId, otherId, 'support'), 0));
    const intimacy = clamp01(getMag(atoms, dyadEffId(selfId, otherId, 'intimacy'), 0));
    const respect = clamp01(getMag(atoms, dyadEffId(selfId, otherId, 'respect'), 0));
    const dominance = clamp01(getMag(atoms, dyadEffId(selfId, otherId, 'dominance'), 0));
    const alignment = clamp01(getMag(atoms, dyadEffId(selfId, otherId, 'alignment'), 0));
    const dyadUnc = clamp01(getMag(atoms, dyadEffId(selfId, otherId, 'uncertainty'), uncertaintyCtx));

    // Relation base (priors / memory)
    const relCloseness = clamp01(getMag(atoms, relId(selfId, otherId, 'closeness'), 0));
    const relLoyalty = clamp01(getMag(atoms, relId(selfId, otherId, 'loyalty'), 0));
    const relHostility = clamp01(getMag(atoms, relId(selfId, otherId, 'hostility'), 0));
    const relDependency = clamp01(getMag(atoms, relId(selfId, otherId, 'dependency'), 0));
    const relAuthority = clamp01(getMag(atoms, relId(selfId, otherId, 'authority'), 0));

    // ---------- Bayes-ish predictions in log-odds space ----------
    // We treat some metrics as evidence about latent “benevolence/helpfulness” and “harmfulness”.
    // Update rule: logit(posterior) = logit(prior) + precision * Σ (w_i * centered_feature_i)
    //
    // Precision decreases with uncertainty (less reliable belief), increases with S2 (more careful inference).
    // This is not a heuristic threshold; it's a principled way to downweight evidence under uncertainty.
    const precision = clamp01(0.25 + 0.55 * S2 + 0.20 * (1 - dyadUnc));

    // prior beliefs (from relation memory; if absent -> neutral 0.5)
    const priorHelp = clamp01(0.50 + 0.30 * relLoyalty + 0.20 * relCloseness - 0.35 * relHostility);
    const priorHarm = clamp01(0.10 + 0.60 * relHostility + 0.10 * (1 - relCloseness));
    const priorTruth = clamp01(0.50 + 0.25 * relLoyalty + 0.15 * relAuthority - 0.20 * relHostility);

    // centered features in [-1..1]
    const c = (x: number) => (2 * clamp01(x) - 1);
    const evHelp = (
      1.20 * c(support) +
      0.90 * c(alignment) +
      0.70 * c(trust) +
      0.30 * c(intimacy) -
      1.10 * c(threat)
    );
    const evHarm = (
      1.20 * c(threat) +
      0.60 * c(relHostility) +
      0.30 * c(danger) -
      0.70 * c(trust) -
      0.40 * c(support)
    );
    const evTruth = (
      1.00 * c(trust) +
      0.60 * c(respect) +
      0.40 * c(alignment) -
      0.60 * c(normPressure) -
      0.35 * c(surveillance) -
      0.30 * c(publicness)
    );

    const postHelp = invLogit(logit(priorHelp) + precision * evHelp);
    const postHarm = invLogit(logit(priorHarm) + precision * evHarm);
    const postTruth = invLogit(logit(priorTruth) + precision * evTruth);

    // Stability: inverse of uncertainty + some volatility under crowd/danger
    const postStability = clamp01(1 - dyadUnc - 0.15 * crowd - 0.10 * danger);
    // Escalation: harm + context pressure (public/crowd increases escalation channel)
    const postEscalation = clamp01(postHarm * (0.65 + 0.20 * danger + 0.15 * crowd));

    const usedBase = [
      `tom:mode:${selfId}`,
      dyadEffId(selfId, otherId, 'trust'),
      dyadEffId(selfId, otherId, 'threat'),
      dyadEffId(selfId, otherId, 'support'),
      dyadEffId(selfId, otherId, 'intimacy'),
      dyadEffId(selfId, otherId, 'respect'),
      dyadEffId(selfId, otherId, 'dominance'),
      dyadEffId(selfId, otherId, 'alignment'),
      dyadEffId(selfId, otherId, 'uncertainty'),
      relId(selfId, otherId, 'closeness'),
      relId(selfId, otherId, 'loyalty'),
      relId(selfId, otherId, 'hostility'),
      relId(selfId, otherId, 'dependency'),
      relId(selfId, otherId, 'authority'),
      `ctx:danger:${selfId}`,
      `ctx:crowd:${selfId}`,
      `ctx:publicness:${selfId}`,
      `ctx:surveillance:${selfId}`,
      `ctx:normPressure:${selfId}`,
      `ctx:uncertainty:${selfId}`,
    ];

    out.push(mkAtom(selfId, otherId, `tom:predict:${selfId}:${otherId}:help`, postHelp, `P(help)=${Math.round(postHelp * 100)}%`, usedBase, {
      priorHelp, precision, evHelp, postHelp, inputs: { trust, threat, support, intimacy, alignment }
    }));
    out.push(mkAtom(selfId, otherId, `tom:predict:${selfId}:${otherId}:harm`, postHarm, `P(harm)=${Math.round(postHarm * 100)}%`, usedBase, {
      priorHarm, precision, evHarm, postHarm, inputs: { trust, threat, support, relHostility, danger }
    }));
    out.push(mkAtom(selfId, otherId, `tom:predict:${selfId}:${otherId}:truth`, postTruth, `P(truth)=${Math.round(postTruth * 100)}%`, usedBase, {
      priorTruth, precision, evTruth, postTruth, inputs: { trust, respect, alignment, normPressure, publicness, surveillance }
    }));
    out.push(mkAtom(selfId, otherId, `tom:predict:${selfId}:${otherId}:stability`, postStability, `stability=${Math.round(postStability * 100)}%`, usedBase, {
      dyadUnc, danger, crowd, postStability
    }));
    out.push(mkAtom(selfId, otherId, `tom:predict:${selfId}:${otherId}:escalation`, postEscalation, `escalation=${Math.round(postEscalation * 100)}%`, usedBase, {
      postHarm, danger, crowd, postEscalation
    }));

    // ---------- Attitude as steady-state summary (derived from posteriors) ----------
    // Approach/avoid are policy-relevant “value signs” rather than emotions.
    const attApproach = clamp01(0.55 * postHelp + 0.25 * postTruth + 0.20 * intimacy - 0.55 * postHarm);
    const attAvoid = clamp01(0.65 * postHarm + 0.20 * (1 - postStability) + 0.15 * danger);
    const attCare = clamp01(0.40 * support + 0.25 * intimacy + 0.20 * relLoyalty + 0.15 * (1 - postHarm));
    const attHostility = clamp01(0.55 * relHostility + 0.30 * postHarm - 0.20 * postTruth);

    out.push(mkAtom(selfId, otherId, `tom:att:${selfId}:${otherId}:approach`, attApproach, `approach=${Math.round(attApproach * 100)}%`, usedBase, { attApproach }));
    out.push(mkAtom(selfId, otherId, `tom:att:${selfId}:${otherId}:avoid`, attAvoid, `avoid=${Math.round(attAvoid * 100)}%`, usedBase, { attAvoid }));
    out.push(mkAtom(selfId, otherId, `tom:att:${selfId}:${otherId}:respect`, respect, `respect=${Math.round(respect * 100)}%`, usedBase, { respect }));
    out.push(mkAtom(selfId, otherId, `tom:att:${selfId}:${otherId}:care`, attCare, `care=${Math.round(attCare * 100)}%`, usedBase, { attCare }));
    out.push(mkAtom(selfId, otherId, `tom:att:${selfId}:${otherId}:hostility`, attHostility, `hostility=${Math.round(attHostility * 100)}%`, usedBase, { attHostility }));

    // ---------- Action policy: Expected Utility ----------
    // We compute EU of each action with simple utility model:
    // EU = Σ_outcomes P(outcome | action) * U(outcome, context)
    // Then policy π(a) ∝ exp(EU / τ), where τ depends on System-2 (more S2 -> lower τ -> sharper/more decisive).

    // Utilities (context-sensitive):
    // - Helping is valuable if other helps back and low harm risk; costly under danger.
    // - Sharing info valuable if truth is high and surveillance/publicness low.
    const U_help = (1 - danger) * 0.8 + (1 - normPressure) * 0.2;
    const U_harmed = -(0.8 * danger + 0.2); // more dangerous -> being harmed is worse
    const U_info = (1 - surveillance) * (1 - publicness) * 0.9;
    const U_escal = -(0.6 * danger + 0.4 * crowd);
    const U_boundary = 0.35 + 0.35 * normPressure + 0.30 * publicness;

    // Outcome probabilities per action (not heuristic “scores”; they are explicit assumptions):
    // assist: success if other helps and doesn't harm
    const P_assist_success = clamp01(postHelp * (1 - postHarm));
    const P_assist_harm = clamp01(postHarm);

    // share_info: info value if other truthful AND low surveillance/publicness (otherwise penalty)
    const P_share_value = clamp01(postTruth);
    const P_share_cost = clamp01(surveillance * 0.6 + publicness * 0.4);

    // negotiate: reduces escalation if alignment & truth; increases if harm/high hostility
    const P_neg_deesc = clamp01(0.55 * alignment + 0.25 * postTruth + 0.20 * S2);
    const P_neg_escal = clamp01(0.45 * postHarm + 0.35 * attHostility + 0.20 * (1 - postStability));

    // monitor: reduces harm via info gain; value depends on uncertainty (entropy)
    const H_harm = entropy01(postHarm);
    const VOI_monitor = clamp01((H_harm / Math.log(2)) * stakes); // normalize by log2

    // avoid: reduces harm exposure, cost is lost help/benefit
    const P_avoid_safety = clamp01(postHarm);

    // set_boundary: reduces escalation, with social utility under norm/public
    const P_bound_reduce = clamp01(0.55 * postHarm + 0.25 * normPressure + 0.20 * publicness);

    // confront: can reduce harm if dominance high, but increases escalation under public/crowd
    const P_conf_win = clamp01(0.55 * dominance + 0.25 * respect + 0.20 * (1 - postStability));
    const P_conf_escal = clamp01(0.55 * publicness + 0.25 * crowd + 0.20 * postHarm);

    // defer: postpones; value under uncertainty, but risk under harm
    const P_defer_good = clamp01(dyadUnc);
    const P_defer_bad = clamp01(postHarm * (0.6 + 0.4 * danger));

    // EU computations
    const EU_assist = P_assist_success * U_help + P_assist_harm * U_harmed;
    const EU_share = P_share_value * U_info - P_share_cost * (0.4 + 0.6 * surveillance);
    const EU_negotiate = P_neg_deesc * (0.35 + 0.45 * (1 - danger)) + P_neg_escal * U_escal;
    const EU_monitor = VOI_monitor * (0.35 + 0.65 * (1 - timePressure)) - 0.15 * crowd;
    const EU_avoid = P_avoid_safety * (0.25 + 0.75 * danger) - 0.30 * postHelp;
    const EU_boundary = P_bound_reduce * U_boundary + 0.10 * (1 - postEscalation);
    const EU_confront = P_conf_win * (0.20 + 0.60 * dominance) + P_conf_escal * U_escal;
    const EU_defer = P_defer_good * (0.25 + 0.55 * S2) - P_defer_bad * (0.30 + 0.70 * danger);

    const actions = [
      { key: 'assist', EU: EU_assist },
      { key: 'share_info', EU: EU_share },
      { key: 'negotiate', EU: EU_negotiate },
      { key: 'monitor', EU: EU_monitor },
      { key: 'avoid', EU: EU_avoid },
      { key: 'set_boundary', EU: EU_boundary },
      { key: 'confront', EU: EU_confront },
      { key: 'defer', EU: EU_defer },
    ];

    // Temperature: System-2 -> lower temperature (more deterministic); System-1 -> higher (more stochastic)
    const tau = 0.70 - 0.45 * S2; // in [0.25..0.70]
    const pis = softmax(actions.map(a => a.EU), tau);

    // Emit willingness to help (as probability) derived from policy mass on prosocial actions
    const idx = (k: string) => actions.findIndex(a => a.key === k);
    const pProsocial = clamp01((pis[idx('assist')] || 0) + (pis[idx('share_info')] || 0) + (pis[idx('negotiate')] || 0));
    out.push(mkAtom(selfId, otherId, `tom:help:${selfId}:${otherId}:willingness`, pProsocial, `help(w)=${Math.round(pProsocial * 100)}%`, usedBase, {
      tau, pProsocial, policy: actions.map((a, i) => ({ a: a.key, EU: a.EU, p: pis[i] }))
    }));

    // Emit actions: both EU and policy prob
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const p = pis[i] ?? 0;
      out.push(mkAtom(selfId, otherId, `tom:afford:${selfId}:${otherId}:action:${a.key}:EU`, sigmoid(a.EU), `EU~${a.EU.toFixed(2)}`, usedBase, {
        EU: a.EU, tau
      }));
      out.push(mkAtom(selfId, otherId, `tom:afford:${selfId}:${otherId}:action:${a.key}`, p, `π(${a.key})=${Math.round(p * 100)}%`, usedBase, {
        EU: a.EU, tau, p
      }));
    }
  }

  return { atoms: out };
}
