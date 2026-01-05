
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { getCtx, pickCtxId } from '../context/layers';
import { Possibility } from '../possibilities/catalog';
import { computeActionCost } from './costModel';
import { gatePossibility } from './gating';
import { arr } from '../utils/arr';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function get(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function getActionKey(possibility: Possibility): string {
  // Normalize action key. Many places use `key`, `actionKey`, or `kind`.
  return String((possibility as any)?.actionKey || (possibility as any)?.key || (possibility as any)?.kind || possibility?.id || '').trim();
}

function actionDomainHint(actionId: string): string | null {
  // Minimal, safe heuristic mapping; can be expanded later without breaking.
  const id = String(actionId || '');
  if (id.includes('escape') || id.includes('hide') || id.includes('defend')) return 'safety';
  if (id.includes('restore') || id.includes('repair') || id.includes('stabilize')) return 'control';
  if (id.includes('talk') || id.includes('help') || id.includes('assist') || id.includes('comfort')) return 'affiliation';
  if (id.includes('report') || id.includes('comply') || id.includes('challenge') || id.includes('present')) return 'status';
  if (id.includes('investigate') || id.includes('search') || id.includes('explore')) return 'exploration';
  if (id.includes('organize') || id.includes('plan') || id.includes('protocol') || id.includes('monologue') || id.includes('reflect')) {
    return 'order';
  }
  if (id.includes('rest') || id.includes('sleep') || id.includes('pause')) return 'rest';
  if (id.includes('trade') || id.includes('buy') || id.includes('sell')) return 'wealth';
  return null;
}

function actionDomainHintWeight(p: Possibility, domain: string): number {
  // Conservative heuristic: 1 if action maps to the domain; otherwise 0.
  const hint = actionDomainHint(p.id);
  return hint === domain ? 1 : 0;
}

function getActiveGoalDomains(atoms: ContextAtom[], selfId: string) {
  // deriveGoalAtoms emits goal:active:<domain>:<selfId> with magnitude = activation.
  const prefix = 'goal:active:';
  const res: Array<{ id: string; domain: string; mag: number }> = [];
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith(prefix)) continue;
    const parts = id.split(':');
    // goal:active:<domain>:<selfId>
    const domain = parts[2] || '';
    const sid = parts[3] || '';
    if (!domain || sid !== selfId) continue;
    res.push({ id, domain, mag: clamp01(get(atoms, id, 0)) });
  }
  return res;
}

function getPlanGoalSupport(atoms: ContextAtom[], selfId: string, actionKey: string) {
  // Plan goals:
  // - goal:activeGoal:<selfId>:<goalId> magnitude = activation
  // - goal:hint:allow:<goalId>:<actionKey> magnitude = 1
  const activePrefix = `goal:activeGoal:${selfId}:`;
  const allowPrefix = 'goal:hint:allow:';
  const allowIds = new Set<string>();
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith(allowPrefix)) continue;
    // goal:hint:allow:<goalId>:<actionKey>
    const parts = id.split(':');
    const gid = parts[3] || '';
    const ak = parts[4] || '';
    if (gid && ak && ak === actionKey) allowIds.add(gid);
  }
  let support = 0;
  const used: string[] = [];
  const partsOut: any[] = [];
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith(activePrefix)) continue;
    const goalId = id.slice(activePrefix.length);
    if (!allowIds.has(goalId)) continue;
    const m = clamp01(get(atoms, id, 0));
    support += m;
    used.push(id);
    used.push(`goal:hint:allow:${goalId}:${actionKey}`);
    partsOut.push({ goalId, active: m, link: 1 });
  }
  return { support: clamp01(support), usedAtomIds: used, parts: partsOut };
}

export type ScoredAction = {
  id: string;
  label: string;
  score: number;
  allowed: boolean;
  cost: number;
  why: { usedAtomIds: string[]; parts: any; blockedBy?: string[] };
  atoms: ContextAtom[];
  p: Possibility;
};

// MVP: score = availability*(1-cost) + context preference
export function scorePossibility(args: {
  selfId: string;
  atoms: ContextAtom[];
  p: Possibility;
}): ScoredAction {
  const { selfId, atoms, p } = args;
  const actionKey = getActionKey(p);
  const targetId = (p as any)?.targetId ?? null;

  // ---- traits (individual differences) ----
  const trParanoia = clamp01(get(atoms, `feat:char:${selfId}:trait.paranoia`, 0.5));
  const trSafety = clamp01(get(atoms, `feat:char:${selfId}:trait.safety`, 0.5));
  const trPowerDrive = clamp01(get(atoms, `feat:char:${selfId}:trait.powerDrive`, 0.4));
  const trCare = clamp01(get(atoms, `feat:char:${selfId}:trait.care`, 0.4));
  const trTruthNeed = clamp01(get(atoms, `feat:char:${selfId}:trait.truthNeed`, 0.4));
  const trAutonomy = clamp01(get(atoms, `feat:char:${selfId}:trait.autonomy`, 0.4));
  const trOrder = clamp01(get(atoms, `feat:char:${selfId}:trait.order`, 0.4));
  const trNormSens = clamp01(get(atoms, `feat:char:${selfId}:trait.normSensitivity`, 0.5));

  const gate = gatePossibility({ atoms, p });
  const { cost, parts, usedAtomIds: costUsedAtomIds } = computeActionCost({ selfId, atoms, p });

  // Basic preference: if threat high, prefer escape/hide
  const dangerCtx = getCtx(atoms, selfId, 'danger', 0);
  const threatFinal = get(atoms, `threat:final:${selfId}`, get(atoms, 'threat:final', dangerCtx.magnitude));
  const fear = get(atoms, `emo:fear:${selfId}`, 0);
  const anger = get(atoms, `emo:anger:${selfId}`, 0);
  const shame = get(atoms, `emo:shame:${selfId}`, 0);
  const resolve = get(atoms, `emo:resolve:${selfId}`, 0);
  const care = get(atoms, `emo:care:${selfId}`, 0);
  const hazardBetween = targetId ? clamp01(get(atoms, `world:map:hazardBetween:${selfId}:${targetId}`, 0)) : 0;
  const allyHazardBetween = targetId ? clamp01(get(atoms, `soc:allyHazardBetween:${selfId}:${targetId}`, 0)) : 0;
  const enemyHazardBetween = targetId ? clamp01(get(atoms, `soc:enemyHazardBetween:${selfId}:${targetId}`, 0)) : 0;
  const recentHarmByTarget = targetId ? clamp01(get(atoms, `soc:recentHarmBy:${targetId}:${selfId}`, 0)) : 0;
  const recentHelpByTarget = targetId ? clamp01(get(atoms, `soc:recentHelpBy:${targetId}:${selfId}`, 0)) : 0;

  let pref = 0;
  const prefParts: Record<string, number> = {};

  // ---- trait modulation by action family ----
  // Make the same context produce different choices for different characters.
  if (String(p.id).startsWith('exit:escape') || String(p.id).startsWith('aff:hide') || String(p.id).startsWith('aff:avoid')) {
    const dv = 0.25 * trSafety + 0.22 * trParanoia - 0.18 * trPowerDrive;
    pref += dv;
    prefParts.traits_defensive = dv;
  }
  if (String(p.id).startsWith('aff:talk') || String(p.id).startsWith('aff:share_secret')) {
    const dv = 0.22 * trCare - 0.22 * trParanoia - 0.12 * trSafety + 0.10 * trAutonomy;
    pref += dv;
    prefParts.traits_social = dv;
  }
  if (String(p.id).startsWith('aff:ask_info') || String(p.id).startsWith('cog:investigate') || String(p.id).startsWith('cog:probe')) {
    const dv = 0.28 * trTruthNeed + 0.12 * trAutonomy - 0.12 * trParanoia;
    pref += dv;
    prefParts.traits_epistemic = dv;
  }
  if (String(p.id).startsWith('off:help') || String(p.id).startsWith('aff:help')) {
    const dv = 0.35 * trCare - 0.10 * trSafety - 0.10 * trParanoia;
    pref += dv;
    prefParts.traits_help = dv;
  }
  if (String(p.id).startsWith('aff:attack') || String(p.id).startsWith('aff:confront') || String(p.id).startsWith('aff:threaten')) {
    const dv = 0.30 * trPowerDrive + 0.10 * trAutonomy - 0.25 * trOrder - 0.20 * trNormSens - 0.15 * trCare;
    pref += dv;
    prefParts.traits_aggressive = dv;
  }
  if (String(p.id).startsWith('cog:wait') || String(p.id).startsWith('aff:rest')) {
    const dv = 0.18 * trOrder + 0.12 * trSafety - 0.10 * trAutonomy;
    pref += dv;
    prefParts.traits_passive = dv;
  }
  if (p.id.startsWith('exit:escape')) pref += 0.25 * fear + 0.10 * threatFinal;
  if (p.id.startsWith('aff:hide'))   pref += 0.20 * fear;
  if (p.id.startsWith('aff:talk')) {
    pref += 0.10 * shame - 0.10 * fear - 0.20 * hazardBetween;
    prefParts.hazardBetween = -0.20 * hazardBetween;
    // If target recently harmed me, talking is less attractive; if helped — more attractive.
    pref += -0.30 * recentHarmByTarget + 0.18 * recentHelpByTarget;
    prefParts.recentHarmByTarget = -0.30 * recentHarmByTarget;
    prefParts.recentHelpByTarget = 0.18 * recentHelpByTarget;
  }
  if (p.id.startsWith('aff:attack')) {
    pref += 0.20 * anger + 0.10 * resolve - 0.25 * shame - 0.25 * enemyHazardBetween - 0.10 * hazardBetween;
    prefParts.enemyHazardBetween = -0.25 * enemyHazardBetween;
    prefParts.hazardBetween = (prefParts.hazardBetween ?? 0) + -0.10 * hazardBetween;
    // Retaliation signal (bounded later by protocol).
    pref += 0.22 * recentHarmByTarget - 0.12 * recentHelpByTarget;
    prefParts.recentHarmByTarget = (prefParts.recentHarmByTarget ?? 0) + 0.22 * recentHarmByTarget;
    prefParts.recentHelpByTarget = (prefParts.recentHelpByTarget ?? 0) + -0.12 * recentHelpByTarget;
  }
  if (p.id.startsWith('off:help')) {
    pref += 0.20 * care - 0.10 * fear - 0.35 * allyHazardBetween - 0.15 * hazardBetween;
    prefParts.allyHazardBetween = -0.35 * allyHazardBetween;
    prefParts.hazardBetween = (prefParts.hazardBetween ?? 0) + -0.15 * hazardBetween;
    // Helping someone who harmed me is harder.
    pref += -0.25 * recentHarmByTarget + 0.20 * recentHelpByTarget;
    prefParts.recentHarmByTarget = (prefParts.recentHarmByTarget ?? 0) + -0.25 * recentHarmByTarget;
    prefParts.recentHelpByTarget = (prefParts.recentHelpByTarget ?? 0) + 0.20 * recentHelpByTarget;
  }
  if (p.id.startsWith('cog:monologue')) {
    const unc = clamp01(get(atoms, `ctx:uncertainty:${selfId}`, 0));
    pref += 0.15 * unc + 0.05 * shame - 0.10 * threatFinal;
    prefParts.uncertainty = 0.15 * unc;
  }

  // Protocol: if strict, prefer talk over attack
  const protocol = get(atoms, `ctx:proceduralStrict:${selfId}`, get(atoms, `norm:proceduralStrict:${selfId}`, 0));
  if (p.id.startsWith('aff:talk')) pref += 0.15 * protocol;
  if (p.id.startsWith('aff:attack')) pref += -0.40 * protocol;

  const availability = clamp01(p.magnitude);
  const raw = clamp01(availability * (1 - cost) + pref);

  // ---- GOALS: additive utility layer (bounded & explainable) ----
  // 1) Domain-level active goals: reward actions that match domain hints.
  let goalDomainBoost = 0;
  const goalDomainParts: any[] = [];
  const goalDomainUsed: string[] = [];
  const activeDomains = getActiveGoalDomains(atoms, selfId);
  for (const g of activeDomains) {
    const hint = actionDomainHintWeight(p, g.domain);
    if (!Number.isFinite(hint) || hint === 0) continue;
    const contrib = g.mag * hint;
    goalDomainBoost += contrib;
    goalDomainUsed.push(g.id);
    goalDomainParts.push({ domain: g.domain, active: g.mag, hint, contrib });
  }
  // 2) Plan-goal support: active plan goals that explicitly allow this action.
  const plan = getPlanGoalSupport(atoms, selfId, actionKey);
  const planBoost = 0.65 * plan.support; // bounded; weight chosen to matter but not dominate.

  const goalUtilityRaw = goalDomainBoost + planBoost;
  const goalUtility = clamp01(0.5 + 0.5 * Math.tanh(goalUtilityRaw)); // squashing to [0..1]

  // Mix with base utility (keep conservative to avoid goal dominance).
  const mixedUtility = clamp01(0.80 * raw + 0.20 * goalUtility);

  const allowedScore = gate.allowed ? mixedUtility : 0;

  const usedAtomIds = [
    ...(p.trace?.usedAtomIds || []),
    ...costUsedAtomIds,
    ...goalDomainUsed,
    ...arr(plan.usedAtomIds),
    `feat:char:${selfId}:trait.paranoia`,
    `feat:char:${selfId}:trait.safety`,
    `feat:char:${selfId}:trait.powerDrive`,
    `feat:char:${selfId}:trait.care`,
    `feat:char:${selfId}:trait.truthNeed`,
    `feat:char:${selfId}:trait.autonomy`,
    `feat:char:${selfId}:trait.order`,
    `feat:char:${selfId}:trait.normSensitivity`,
    ...(dangerCtx.id ? [dangerCtx.id] : pickCtxId('danger', selfId)),
    ...(targetId ? [
      `world:map:hazardBetween:${selfId}:${targetId}`,
      `soc:allyHazardBetween:${selfId}:${targetId}`,
      `soc:enemyHazardBetween:${selfId}:${targetId}`,
      `soc:recentHarmBy:${targetId}:${selfId}`,
      `soc:recentHelpBy:${targetId}:${selfId}`
    ] : [])
  ].filter(id => atoms.some(a => a?.id === id));

  const actionAtoms: ContextAtom[] = [
    normalizeAtom({
      id: `action:utility:${selfId}:${p.id}`,
      ns: 'action',
      kind: 'utility',
      origin: 'derived',
      source: 'decision_score',
      subject: selfId,
      magnitude: clamp01(allowedScore),
      confidence: 1,
      label: `utility:${p.id}=${allowedScore.toFixed(3)}`,
      trace: {
        usedAtomIds,
        notes: ['action utility from goals + risk + norms'],
        parts: {
          availability,
          pref,
          prefParts,
          costParts: parts,
          raw,
          goalUtility,
          goalDomainBoost,
          planBoost,
          goalUtilityRaw,
          goalDomainParts,
          planParts: plan.parts,
          danger: dangerCtx.magnitude,
          dangerLayer: dangerCtx.layer,
          allowed: gate.allowed,
        }
      }
    } as any)
  ];

  return {
    id: `act:${p.id}`,
    label: p.label,
    score: allowedScore,
    allowed: gate.allowed,
    cost,
    why: {
      usedAtomIds,
      parts: {
        availability,
        pref,
        prefParts,
        costParts: parts,
        raw,
        goalUtility,
        goalDomainBoost,
        planBoost,
        goalUtilityRaw,
        goalDomainParts,
        planParts: plan.parts
      },
      blockedBy: gate.blockedBy
    },
    atoms: actionAtoms,
    p
  };
}
