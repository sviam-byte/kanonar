
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { getCtx, pickCtxId } from '../context/layers';
import { Possibility } from '../possibilities/catalog';
import { computeActionCost } from './costModel';
import { gatePossibility } from './gating';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function get(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function getGoalDomain(atoms: ContextAtom[], selfId: string, domain: string, def = NaN): number {
  return get(atoms, `goal:domain:${domain}:${selfId}`, def);
}

function actionDomainHint(actionId: string): string | null {
  // Minimal, safe heuristic mapping; can be expanded later without breaking.
  const id = String(actionId || '');
  if (id.includes('escape') || id.includes('hide') || id.includes('defend')) return 'safety';
  if (id.includes('restore') || id.includes('repair') || id.includes('stabilize')) return 'control';
  if (id.includes('talk') || id.includes('help') || id.includes('assist') || id.includes('comfort')) return 'affiliation';
  if (id.includes('report') || id.includes('comply') || id.includes('challenge') || id.includes('present')) return 'status';
  if (id.includes('investigate') || id.includes('search') || id.includes('explore')) return 'exploration';
  if (id.includes('organize') || id.includes('plan') || id.includes('protocol')) return 'order';
  if (id.includes('rest') || id.includes('sleep') || id.includes('pause')) return 'rest';
  if (id.includes('trade') || id.includes('buy') || id.includes('sell')) return 'wealth';
  return null;
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
  const goalWeightAlpha = 0.15; // small, safe influence; keeps legacy behavior dominant if goals are imperfect.

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
  const targetId = (p as any)?.targetId;
  const hazardBetween = targetId ? clamp01(get(atoms, `world:map:hazardBetween:${selfId}:${targetId}`, 0)) : 0;
  const allyHazardBetween = targetId ? clamp01(get(atoms, `soc:allyHazardBetween:${selfId}:${targetId}`, 0)) : 0;
  const enemyHazardBetween = targetId ? clamp01(get(atoms, `soc:enemyHazardBetween:${selfId}:${targetId}`, 0)) : 0;

  let pref = 0;
  const prefParts: Record<string, number> = {};
  if (p.id.startsWith('exit:escape')) pref += 0.25 * fear + 0.10 * threatFinal;
  if (p.id.startsWith('aff:hide'))   pref += 0.20 * fear;
  if (p.id.startsWith('aff:talk')) {
    pref += 0.10 * shame - 0.10 * fear - 0.20 * hazardBetween;
    prefParts.hazardBetween = -0.20 * hazardBetween;
  }
  if (p.id.startsWith('aff:attack')) {
    pref += 0.20 * anger + 0.10 * resolve - 0.25 * shame - 0.25 * enemyHazardBetween - 0.10 * hazardBetween;
    prefParts.enemyHazardBetween = -0.25 * enemyHazardBetween;
    prefParts.hazardBetween = (prefParts.hazardBetween ?? 0) + -0.10 * hazardBetween;
  }
  if (p.id.startsWith('off:help')) {
    pref += 0.20 * care - 0.10 * fear - 0.35 * allyHazardBetween - 0.15 * hazardBetween;
    prefParts.allyHazardBetween = -0.35 * allyHazardBetween;
    prefParts.hazardBetween = (prefParts.hazardBetween ?? 0) + -0.15 * hazardBetween;
  }

  // Protocol: if strict, prefer talk over attack
  const protocol = get(atoms, `ctx:proceduralStrict:${selfId}`, get(atoms, `norm:proceduralStrict:${selfId}`, 0));
  if (p.id.startsWith('aff:talk')) pref += 0.15 * protocol;
  if (p.id.startsWith('aff:attack')) pref += -0.40 * protocol;

  const availability = clamp01(p.magnitude);
  const raw = clamp01(availability * (1 - cost) + pref);
  const dom = actionDomainHint(p.id);
  const g = dom ? getGoalDomain(atoms, selfId, dom, NaN) : NaN;
  const goalBoost = Number.isFinite(g) ? goalWeightAlpha * clamp01(g) : 0;
  const withGoal = clamp01(raw + goalBoost);
  
  const allowedScore = gate.allowed ? withGoal : 0;

  const usedAtomIds = [
    ...(p.trace?.usedAtomIds || []),
    ...costUsedAtomIds,
    ...(goalBoost > 0 && dom ? [`goal:domain:${dom}:${selfId}`] : []),
    ...(dangerCtx.id ? [dangerCtx.id] : pickCtxId('danger', selfId)),
    ...(targetId ? [
      `world:map:hazardBetween:${selfId}:${targetId}`,
      `soc:allyHazardBetween:${selfId}:${targetId}`,
      `soc:enemyHazardBetween:${selfId}:${targetId}`
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
          goalBoost,
          goalDomain: dom ?? null,
          goalAlpha: goalWeightAlpha,
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
        goalBoost,
        goalDomain: dom ?? null,
        goalAlpha: goalWeightAlpha
      },
      blockedBy: gate.blockedBy
    },
    atoms: actionAtoms,
    p
  };
}
