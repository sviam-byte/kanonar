import type { ContextAtom } from '../context/v2/types';
import { clamp01 } from '../util/math';
import { normalizeAtom } from '../context/v2/infer';
import { getCtx, sanitizeUsed } from '../context/layers';

type GoalDomain =
  | 'safety'
  | 'control'
  | 'affiliation'
  | 'status'
  | 'exploration'
  | 'order'
  | 'rest'
  | 'wealth';

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

function mkGoalAtom(selfId: string, domain: GoalDomain, v: number, usedAtomIds: string[], parts: any, tags: string[] = []) {
  const id = `goal:domain:${domain}:${selfId}`;
  return normalizeAtom({
    id,
    ns: 'goal' as any,
    kind: 'goal_domain',
    origin: 'derived',
    source: 'deriveGoalEcology',
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
    `cap:fatigue:${selfId}`
  ].filter(Boolean);

  const ecology: { domain: GoalDomain; v: number; used: string[]; parts: any }[] = [];

  // Safety: threat + drvSafety (if exists) blended with lifeSafety.
  {
    const base = clamp01(0.60 * danger.magnitude + 0.40 * (Number.isFinite(drvSafety) ? drvSafety : 0));
    const v = clamp01(0.55 * base + 0.45 * lifeSafety);
    ecology.push({
      domain: 'safety',
      v,
      used: [...usedCommon, `drv:safetyNeed:${selfId}`, `goal:lifeDomain:safety:${selfId}`],
      parts: { danger: danger.magnitude, dangerLayer: danger.layer, drvSafety: Number.isFinite(drvSafety) ? drvSafety : null, lifeSafety, base }
    });
  }

  // Control: (1-control) + drvControl
  {
    const lack = clamp01(1 - controlCtx.magnitude);
    const base = clamp01(0.60 * lack + 0.40 * (Number.isFinite(drvControl) ? drvControl : 0));
    const v = clamp01(0.55 * base + 0.45 * lifeOrder);
    ecology.push({
      domain: 'control',
      v,
      used: [...usedCommon, `drv:controlNeed:${selfId}`, `goal:lifeDomain:order:${selfId}`],
      parts: { lackControl: lack, controlLayer: controlCtx.layer, drvControl: Number.isFinite(drvControl) ? drvControl : null, lifeOrder, base }
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
    const base = clamp01(0.55 * clamp01(publicness.magnitude + normP.magnitude) + 0.45 * (Number.isFinite(drvStatus) ? drvStatus : 0));
    const v = clamp01(0.55 * base + 0.45 * lifeStatus);
    ecology.push({
      domain: 'status',
      v,
      used: [...usedCommon, `drv:statusNeed:${selfId}`, `goal:lifeDomain:status:${selfId}`],
      parts: { publicness: publicness.magnitude, publicnessLayer: publicness.layer, normPressure: normP.magnitude, normPressureLayer: normP.layer, drvStatus: Number.isFinite(drvStatus) ? drvStatus : null, lifeStatus, base }
    });
  }

  // Exploration: uncertainty + drvCur + lifeExplore
  {
    const base = clamp01(0.55 * unc.magnitude + 0.45 * (Number.isFinite(drvCur) ? drvCur : 0));
    const v = clamp01(0.55 * base + 0.45 * lifeExplore);
    ecology.push({
      domain: 'exploration',
      v,
      used: [...usedCommon, `drv:curiosityNeed:${selfId}`, `goal:lifeDomain:exploration:${selfId}`],
      parts: { uncertainty: unc.magnitude, uncertaintyLayer: unc.layer, drvCur: Number.isFinite(drvCur) ? drvCur : null, lifeExplore, base }
    });
  }

  // Order: (1-chaos proxy) + lifeOrder (we reuse ctxControl as a proxy for order)
  {
    const base = clamp01(0.60 * controlCtx.magnitude + 0.40 * lifeOrder);
    const v = clamp01(base);
    ecology.push({
      domain: 'order',
      v,
      used: [...usedCommon, `goal:lifeDomain:order:${selfId}`],
      parts: { control: controlCtx.magnitude, controlLayer: controlCtx.layer, lifeOrder, base }
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

  const goalAtoms = ecology.map(e => mkGoalAtom(selfId, e.domain, e.v, e.used, e.parts));

  // Active goals: top-N by v
  const sorted = [...ecology].sort((a, b) => b.v - a.v);
  const active = sorted.slice(0, topN).map(e =>
    mkActiveGoal(selfId, e.domain, e.v, [`goal:domain:${e.domain}:${selfId}`], { fromDomain: e.domain, score: e.v })
  );

  return { atoms: [...goalAtoms, ...active] };
}
