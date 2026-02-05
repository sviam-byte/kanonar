import type { ContextAtom } from '../context/v2/types';
import { clamp01 } from '../util/math';
import { normalizeAtom } from '../context/v2/infer';
import { getCtx, sanitizeUsed } from '../context/layers';
import { buildAtomGraph } from '../graph/atomGraph';
import { buildSignalField } from './signalField';
import { propagateAtomEnergy } from '../graph/atomEnergy';
import { getAgentChannelCurve, type EnergyChannel } from '../agents/energyProfiles';
import { curve01Param } from '../utils/curves';
import { selectMode } from './modes';
import { selectActiveGoalsWithHysteresis } from './selectActive';
import { initGoalState, updateGoalState, type GoalState } from './goalState';
import { computeDomainProgressDeltasFromAtoms } from './outcomes';

type GoalDomain =
  | 'safety'
  | 'control'
  | 'affiliation'
  | 'status'
  | 'exploration'
  | 'order'
  | 'rest'
  | 'wealth';

type DomainChannelWeights = Record<GoalDomain, Record<EnergyChannel, number>>;

// Conservative default mapping: which energy channels should “feed” which goals.
// Values are weights (not required to sum to 1).
const DOMAIN_CHANNEL_WEIGHTS: DomainChannelWeights = {
  safety: { threat: 1.25, uncertainty: 0.35, norm: 0.1, attachment: 0, resource: 0.1, status: 0, curiosity: 0, base: 0 },
  control: { threat: 0.55, uncertainty: 0.65, norm: 0.15, attachment: 0, resource: 0.25, status: 0.1, curiosity: 0.05, base: 0 },
  affiliation: { threat: 0, uncertainty: 0.1, norm: 0.25, attachment: 1.2, resource: 0.1, status: 0.15, curiosity: 0, base: 0 },
  status: { threat: 0.05, uncertainty: 0.1, norm: 0.75, attachment: 0.1, resource: 0.1, status: 1.15, curiosity: 0, base: 0 },
  // exploration is inhibited by threat/norm/resource pressure
  exploration: { threat: -0.9, uncertainty: 0.45, norm: -0.35, attachment: 0, resource: -0.25, status: 0.05, curiosity: 1.25, base: 0.1 },
  order: { threat: 0.25, uncertainty: 0.15, norm: 0.95, attachment: 0.05, resource: 0.15, status: 0.2, curiosity: 0, base: 0 },
  rest: { threat: 0, uncertainty: 0, norm: 0.05, attachment: 0.05, resource: 1.35, status: 0, curiosity: 0, base: 0.1 },
  wealth: { threat: 0.05, uncertainty: 0.1, norm: 0.25, attachment: 0, resource: 0.85, status: 0.35, curiosity: 0.05, base: 0 },
};

function clampPos(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, x);
}

function get(atoms: ContextAtom[], id: string, def: number): number {
  const a = atoms.find(x => (x as any)?.id === id) as any;
  if (!a) return def;
  const v = Number(a.magnitude);
  return Number.isFinite(v) ? v : def;
}

function getAny(atoms: ContextAtom[], ids: string[], def: number): number {
  for (const id of ids) {
    const v = get(atoms, id, NaN);
    if (Number.isFinite(v)) return v;
  }
  return def;
}

function getPrio(atoms: ContextAtom[], selfId: string, axis: string, def = 0.5): number {
  // ctx:prio:* are personal weights (0..1). def=0.5 means neutral.
  return get(atoms, `ctx:prio:${axis}:${selfId}`, def);
}

function amplifyByPrio(x: number, prio: number): number {
  // prio in [0..1]. 0.5 -> k=1 (no change). Higher prio amplifies deviation from 0.5.
  const p = clamp01(prio);
  const k = 0.6 + 0.8 * p; // 0.6..1.4
  return clamp01(0.5 + (x - 0.5) * k);
}

// ---------------------------------
// Goal memory (GoalLab / UI recompute)
// ---------------------------------
// This is a lightweight in-memory state used to stabilize goals between recomputations.
// For simulation (server/runtime), you will likely want to persist these in world/agent state.
const __PREV_ACTIVE__: Map<string, Set<string>> = new Map();
const __GOAL_STATE__: Map<string, Record<string, GoalState>> = new Map();
const __GOAL_TICK__: Map<string, number> = new Map();

function nextTick(selfId: string): number {
  const t = (__GOAL_TICK__.get(selfId) ?? 0) + 1;
  __GOAL_TICK__.set(selfId, t);
  return t;
}

function readGoalStateMap(selfId: string): Record<string, GoalState> {
  return __GOAL_STATE__.get(selfId) || {};
}

function writeGoalStateMap(selfId: string, next: Record<string, GoalState>) {
  __GOAL_STATE__.set(selfId, next);
}

function mkGoalAtom(selfId: string, domain: GoalDomain, v: number, usedAtomIds: string[], parts: any, tags: string[] = []) {
  const id = `goal:domain:${domain}:${selfId}`;
  return normalizeAtom({
    id,
    ns: 'goal' as any,
    kind: 'goal_domain',
    origin: 'derived',
    source: 'deriveGoalEcology',
    code: `goal.domain.${domain}`,
    subject: selfId,
    magnitude: clamp01(v),
    confidence: 1,
    tags: ['goal', 'domain', domain, ...tags],
    label: `goal.${domain}:${Math.round(clamp01(v) * 100)}%`,
    trace: {
      usedAtomIds: sanitizeUsed(id, usedAtomIds),
      notes: ['goal ecology from drivers + context'],
      parts
    }
  } as any);
}

function mkActiveGoal(selfId: string, domain: GoalDomain, v: number, usedAtomIds: string[], parts: any) {
  const id = `goal:active:${domain}:${selfId}`;
  return normalizeAtom({
    id,
    ns: 'goal' as any,
    kind: 'goal_active',
    origin: 'derived',
    source: 'selectActiveGoals',
    code: `goal.domain.${domain}`,
    subject: selfId,
    magnitude: clamp01(v),
    confidence: 1,
    tags: ['goal', 'active', domain],
    label: `active.${domain}:${Math.round(clamp01(v) * 100)}%`,
    trace: {
      usedAtomIds: sanitizeUsed(id, usedAtomIds),
      notes: ['top goals selection'],
      parts
    }
  } as any);
}

function mkModeAtom(selfId: string, mode: string, weights: any, usedAtomIds: string[], parts: any) {
  const id = `goal:mode:${selfId}`;
  return normalizeAtom({
    id,
    ns: 'goal' as any,
    kind: 'goal_mode',
    origin: 'derived',
    source: 'selectMode',
    subject: selfId,
    magnitude: clamp01(Number(weights?.[mode] ?? 1)),
    confidence: 1,
    code: 'goal.mode',
    tags: ['goal', 'mode', String(mode)],
    label: `mode.${mode}`,
    meta: { mode, weights },
    trace: {
      usedAtomIds: sanitizeUsed(id, usedAtomIds),
      notes: ['mixture-of-experts mode selection'],
      parts
    }
  } as any);
}

function mkGoalStateAtom(selfId: string, domain: GoalDomain, st: GoalState, usedAtomIds: string[], parts: any) {
  const id = `goal:state:${domain}:${selfId}`;
  return normalizeAtom({
    id,
    ns: 'goal' as any,
    kind: 'goal_state',
    origin: 'derived',
    source: 'updateGoalState',
    subject: selfId,
    magnitude: clamp01(parts?.activation ?? 0),
    confidence: 1,
    code: `goal.state.${domain}`,
    tags: ['goal', 'state', domain],
    label: `state.${domain}`,
    meta: { state: st },
    trace: {
      usedAtomIds: sanitizeUsed(id, usedAtomIds),
      notes: ['goal state (tension/lockIn/fatigue/progress)'],
      parts
    }
  } as any);
}

/**
 * Derive goal ecology atoms from existing atoms.
 * Safe: if drv:* are missing, falls back to ctx/emotions (still deterministic).
 */
export function deriveGoalAtoms(selfId: string, atoms: ContextAtom[], opts?: { topN?: number }) {
  const topN = Math.max(1, Math.min(5, Number(opts?.topN ?? 3)));

  // Drivers (preferred)
  const drvSafety = getAny(atoms, [`drv:safetyNeed:${selfId}`, `drv:safety:${selfId}`], NaN);
  const drvControl = getAny(atoms, [`drv:controlNeed:${selfId}`, `drv:control:${selfId}`], NaN);
  const drvAff = getAny(atoms, [`drv:affiliationNeed:${selfId}`, `drv:affiliation:${selfId}`], NaN);
  const drvStatus = getAny(atoms, [`drv:statusNeed:${selfId}`, `drv:status:${selfId}`], NaN);
  const drvRest = getAny(atoms, [`drv:restNeed:${selfId}`, `drv:rest:${selfId}`], NaN);
  const drvCur = getAny(atoms, [`drv:curiosityNeed:${selfId}`, `drv:curiosity:${selfId}`], NaN);

  // Context fallbacks
  const danger = getCtx(atoms, selfId, 'danger', 0);
  const controlCtx = getCtx(atoms, selfId, 'control', 0);
  const publicness = getCtx(atoms, selfId, 'publicness', 0);
  const normP = getCtx(atoms, selfId, 'normPressure', 0);
  const unc = getCtx(atoms, selfId, 'uncertainty', 0);

  // Context priorities (personal weights)
  const prioDanger = getPrio(atoms, selfId, 'danger', 0.5);
  const prioControl = getPrio(atoms, selfId, 'control', 0.5);
  const prioPublic = getPrio(atoms, selfId, 'publicness', 0.5);
  const prioNorm = getPrio(atoms, selfId, 'normPressure', 0.5);
  const prioUnc = getPrio(atoms, selfId, 'uncertainty', 0.5);
  const fatigue = getAny(atoms, [`cap:fatigue:${selfId}`, `world:body:fatigue:${selfId}`], 0);

  // Very light “life weights” (optional). If absent -> 0.5 neutral.
  const lifeSafety = getAny(atoms, [`goal:lifeDomain:safety:${selfId}`], 0.5);
  const lifeAff = getAny(atoms, [`goal:lifeDomain:affiliation:${selfId}`], 0.5);
  const lifeStatus = getAny(atoms, [`goal:lifeDomain:status:${selfId}`], 0.5);
  const lifeExplore = getAny(atoms, [`goal:lifeDomain:exploration:${selfId}`], 0.5);
  const lifeOrder = getAny(atoms, [`goal:lifeDomain:order:${selfId}`], 0.5);

  const usedCommon = [
    danger.id || '',
    controlCtx.id || '',
    unc.id || '',
    normP.id || '',
    `ctx:prio:danger:${selfId}`,
    `ctx:prio:control:${selfId}`,
    `ctx:prio:publicness:${selfId}`,
    `ctx:prio:normPressure:${selfId}`,
    `ctx:prio:uncertainty:${selfId}`,
    `cap:fatigue:${selfId}`
  ].filter(Boolean);

  // Apply personal priorities as a lens on ctx magnitudes (does not change world, only weighting).
  const dangerW = amplifyByPrio(danger.magnitude, prioDanger);
  const controlW = amplifyByPrio(controlCtx.magnitude, prioControl);
  const publicW = amplifyByPrio(publicness.magnitude, prioPublic);
  const normW = amplifyByPrio(normP.magnitude, prioNorm);
  const uncW = amplifyByPrio(unc.magnitude, prioUnc);

  const ecology: { domain: GoalDomain; v: number; used: string[]; parts: any }[] = [];

  // Safety: threat + drvSafety (if exists) blended with lifeSafety.
  {
    const base = clamp01(0.60 * dangerW + 0.40 * (Number.isFinite(drvSafety) ? drvSafety : 0));
    const v = clamp01(0.55 * base + 0.45 * lifeSafety);
    ecology.push({
      domain: 'safety',
      v,
      used: [...usedCommon, `drv:safetyNeed:${selfId}`, `goal:lifeDomain:safety:${selfId}`],
      parts: {
        danger: danger.magnitude,
        dangerW,
        prioDanger,
        dangerLayer: danger.layer,
        drvSafety: Number.isFinite(drvSafety) ? drvSafety : null,
        lifeSafety,
        base
      }
    });
  }

  // Control: (1-control) + drvControl
  {
    const lack = clamp01(1 - controlW);
    const base = clamp01(0.60 * lack + 0.40 * (Number.isFinite(drvControl) ? drvControl : 0));
    const v = clamp01(0.55 * base + 0.45 * lifeOrder);
    ecology.push({
      domain: 'control',
      v,
      used: [...usedCommon, `drv:controlNeed:${selfId}`, `goal:lifeDomain:order:${selfId}`],
      parts: {
        lackControl: lack,
        control: controlCtx.magnitude,
        controlW,
        prioControl,
        controlLayer: controlCtx.layer,
        drvControl: Number.isFinite(drvControl) ? drvControl : null,
        lifeOrder,
        base
      }
    });
  }

  // Affiliation: drvAff + inverse public/hostility proxies (soft)
  {
    const base = clamp01(0.55 * (Number.isFinite(drvAff) ? drvAff : 0) + 0.45 * (1 - danger.magnitude));
    const v = clamp01(0.55 * base + 0.45 * lifeAff);
    ecology.push({
      domain: 'affiliation',
      v,
      used: [...usedCommon, `drv:affiliationNeed:${selfId}`, `goal:lifeDomain:affiliation:${selfId}`],
      parts: { drvAff: Number.isFinite(drvAff) ? drvAff : null, danger: danger.magnitude, dangerLayer: danger.layer, lifeAff, base }
    });
  }

  // Status: norm/public + drvStatus
  {
    const base = clamp01(0.55 * clamp01(publicW + normW) + 0.45 * (Number.isFinite(drvStatus) ? drvStatus : 0));
    const v = clamp01(0.55 * base + 0.45 * lifeStatus);
    ecology.push({
      domain: 'status',
      v,
      used: [...usedCommon, `drv:statusNeed:${selfId}`, `goal:lifeDomain:status:${selfId}`],
      parts: {
        publicness: publicness.magnitude,
        publicW,
        prioPublic,
        publicnessLayer: publicness.layer,
        normPressure: normP.magnitude,
        normW,
        prioNorm,
        normPressureLayer: normP.layer,
        drvStatus: Number.isFinite(drvStatus) ? drvStatus : null,
        lifeStatus,
        base
      }
    });
  }

  // Exploration: uncertainty + drvCur + lifeExplore
  {
    const base = clamp01(0.55 * uncW + 0.45 * (Number.isFinite(drvCur) ? drvCur : 0));
    const v = clamp01(0.55 * base + 0.45 * lifeExplore);
    ecology.push({
      domain: 'exploration',
      v,
      used: [...usedCommon, `drv:curiosityNeed:${selfId}`, `goal:lifeDomain:exploration:${selfId}`],
      parts: {
        uncertainty: unc.magnitude,
        uncW,
        prioUnc,
        uncertaintyLayer: unc.layer,
        drvCur: Number.isFinite(drvCur) ? drvCur : null,
        lifeExplore,
        base
      }
    });
  }

  // Order: (1-chaos proxy) + lifeOrder (we reuse ctxControl as a proxy for order)
  {
    const base = clamp01(0.60 * controlW + 0.40 * lifeOrder);
    const v = clamp01(base);
    ecology.push({
      domain: 'order',
      v,
      used: [...usedCommon, `goal:lifeDomain:order:${selfId}`],
      parts: { control: controlCtx.magnitude, controlW, prioControl, controlLayer: controlCtx.layer, lifeOrder, base }
    });
  }

  // Rest: fatigue + drvRest
  {
    const base = clamp01(0.60 * fatigue + 0.40 * (Number.isFinite(drvRest) ? drvRest : 0));
    const v = clamp01(base);
    ecology.push({
      domain: 'rest',
      v,
      used: [...usedCommon, `drv:restNeed:${selfId}`],
      parts: { fatigue, drvRest: Number.isFinite(drvRest) ? drvRest : null, base }
    });
  }

  // Wealth: placeholder (kept at neutral until you define econ signals)
  {
    const v = 0.30;
    ecology.push({
      domain: 'wealth',
      v,
      used: [],
      parts: { note: 'placeholder until econ quarks are defined' }
    });
  }

  // FeltField (raw-ish) from current context; used for mode gating.
  const feltField = {
    threat: dangerW,
    uncertainty: uncW,
    norm: normW,
    attachment: clamp01(1 - dangerW) * 0.7 + clamp01(1 - uncW) * 0.3,
    resource: clamp01(fatigue),
    status: clamp01(0.5 * publicW + 0.5 * normW),
    curiosity: clamp01(0.6 * uncW + 0.4 * (1 - dangerW)),
    base: 0.5,
  } as any;

  const modeSel = selectMode(feltField as any);

  // Mode gating: bias domains based on mode mixture (Mixture-of-Experts).
  const W = modeSel.weights;
  const domainBias = (d: GoalDomain) => {
    switch (d) {
      case 'safety': return 1.0 * W.threat_mode + 0.25 * W.resource_mode;
      case 'control': return 0.35 * W.threat_mode + 0.25 * W.resource_mode + 0.15 * W.social_mode;
      case 'affiliation': return 0.25 * W.social_mode + 0.85 * W.care_mode;
      case 'status': return 0.95 * W.social_mode;
      case 'exploration': return 1.0 * W.explore_mode;
      case 'order': return 0.25 * W.social_mode + 0.25 * W.resource_mode + 0.20 * W.threat_mode;
      case 'rest': return 0.85 * W.resource_mode;
      case 'wealth': return 0.55 * W.resource_mode + 0.15 * W.social_mode;
      default: return 0.2;
    }
  };

  // Read previous state (GoalLab memory).
  const tick = nextTick(selfId);
  const prevActive = __PREV_ACTIVE__.get(selfId) || new Set<string>();
  const prevStates = readGoalStateMap(selfId);

  // Apply bias + mild anti-fatigue to each domain.
  for (const e of ecology) {
    const bias = clamp01(domainBias(e.domain));
    const st = prevStates[e.domain] || initGoalState();
    const boost = clamp01(0.7 + 0.6 * bias);
    const antiFatigue = clamp01(1 - 0.35 * st.fatigue);
    e.v = clamp01(e.v * boost * antiFatigue);
    (e.parts as any).mode = modeSel.mode;
    (e.parts as any).modeWeights = W;
    (e.parts as any).bias = bias;
    (e.parts as any).boost = boost;
    (e.parts as any).antiFatigue = antiFatigue;
    (e.parts as any).prevState = st;
  }

  // ------------------------------------------------------------
  // Energy-based refinement: E_goal[channel] via AtomGraph spread
  // ------------------------------------------------------------
  // This makes goal scoring match the target architecture:
  // score(goal) ≈ Σ_channel w_domain[channel] * E_goal[channel]
  // We keep it as a *refinement* over the existing base score to stay stable.
  {
    const provisionalGoals = ecology.map((e) => mkGoalAtom(selfId, e.domain, e.v, e.used, e.parts, ['provisional']));
    const atomsForGraph = [...atoms, ...provisionalGoals];
    const g = buildAtomGraph(atomsForGraph, { includeIsolated: false });
    const field = buildSignalField(selfId, atomsForGraph);

    const energy = propagateAtomEnergy(g, atomsForGraph, field, {
      steps: 6,
      decay: 0.25,
      topK: 10,
      atomWeightFn: (ch, a) => {
        // Apply agent-specific channel curve at the *source* level.
        const curve = getAgentChannelCurve(selfId, ch, undefined);
        const m = clamp01(Number((a as any)?.magnitude ?? 0));
        const c = clamp01(Number((a as any)?.confidence ?? 1));
        return curve01Param(m * c, curve);
      },
    });

    const channels = Object.keys(field.channels || {}) as EnergyChannel[];

    for (const e of ecology) {
      const goalId = `goal:domain:${e.domain}:${selfId}`;
      const w = DOMAIN_CHANNEL_WEIGHTS[e.domain];

      let raw = 0;
      const byChannel: Record<string, number> = {};
      for (const ch of channels) {
        const Eg = Number((energy.nodeEnergyByChannel as any)?.[ch]?.[goalId] ?? 0);
        const ww = Number((w as any)?.[ch] ?? 0);
        const contrib = clampPos(Eg) * (Number.isFinite(ww) ? ww : 0);
        byChannel[ch] = Eg;
        raw += contrib;
      }

      // Squash signed raw score to 0..1 (0.5 = neutral).
      // raw > 0 => supports domain; raw < 0 => suppresses domain.
      const energyScore = 0.5 + 0.5 * Math.tanh(raw);
      const blended = clamp01(0.60 * e.v + 0.40 * energyScore);
      e.v = blended;
      (e.parts as any).energy = {
        score: energyScore,
        raw,
        byChannel,
        weights: w,
      };
      // Keep attribution only for debug; it is potentially heavy.
      (e.parts as any).energyAttribution = {
        threat: (energy.attributionByChannel as any)?.threat?.[goalId] ?? [],
        uncertainty: (energy.attributionByChannel as any)?.uncertainty?.[goalId] ?? [],
      };
    }
  }

  const modeAtom = mkModeAtom(selfId, modeSel.mode, W, usedCommon, { feltField, logits: modeSel.logits });

  const goalAtoms = ecology.map(e => mkGoalAtom(selfId, e.domain, e.v, [...e.used, modeAtom.id], e.parts));

  // Active goals: hysteretic top-N (prevents flicker).
  const candidates = ecology.map((e) => ({ id: e.domain, score: e.v, lockIn: clamp01(prevStates[e.domain]?.lockIn ?? 0) }));
  const pick = selectActiveGoalsWithHysteresis(candidates, prevActive, { topN, margin: 0.07 });
  const activeDomains = pick.active as GoalDomain[];

  const active = activeDomains.map((d) => {
    const e = ecology.find((x) => x.domain === d)!;
    return mkActiveGoal(selfId, d, e.v, [`goal:domain:${d}:${selfId}`, modeAtom.id], { fromDomain: d, score: e.v, mode: modeSel.mode, pick: pick.debug });
  });

  // Update & emit goal-state atoms (tension/lockIn/fatigue/progress).
  const nextStates: Record<string, GoalState> = { ...prevStates };
  const stateAtoms: ContextAtom[] = [];

  // Compute progress deltas from the current atom-frame (events/outcomes bridge).
  // This intentionally keeps the loop “atom-native”: world→events→atoms→goalState.
  const progressDeltas = computeDomainProgressDeltasFromAtoms({ atoms, selfId });

  for (const e of ecology) {
    const isActive = activeDomains.includes(e.domain);
    const prev = prevStates[e.domain] || null;
    const progressDelta = Number((progressDeltas as any)?.[e.domain] ?? 0);
    const st = updateGoalState(prev, { active: isActive, activation: isActive ? e.v : 0, tick, progressDelta });
    nextStates[e.domain] = st;
    stateAtoms.push(
      mkGoalStateAtom(selfId, e.domain, st, [`goal:domain:${e.domain}:${selfId}`, modeAtom.id], { activation: e.v, active: isActive, tick, mode: modeSel.mode, progressDelta })
    );
  }

  // Commit memory for next recomputation.
  __PREV_ACTIVE__.set(selfId, new Set(activeDomains));
  writeGoalStateMap(selfId, nextStates);

  return { atoms: [...goalAtoms, ...active, modeAtom, ...stateAtoms] };
}
