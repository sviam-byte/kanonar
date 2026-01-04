import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { clamp01 } from '../util/math';
import { GOAL_DEFS } from './space';

function getMag(atoms: ContextAtom[], id: string, fb = 0): number {
  const a = atoms.find(x => (x as any)?.id === id) as any;
  const v = Number(a?.magnitude);
  return Number.isFinite(v) ? v : fb;
}

function uniq(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

/**
 * Маппинг доменов GOAL_DEFS (survival/control/...) -> домены goal:domain:* (safety/control/affiliation/...).
 * Это мост “больших целей” к текущей goal-ecology.
 */
function mapGoalDefDomainToEcology(domain: string): string | null {
  const d = String(domain || '');

  if (d === 'survival') return 'safety';
  if (d === 'control') return 'control';
  if (d === 'rest') return 'rest';
  if (d === 'information') return 'exploration';

  // социальные домены -> affiliation
  if (d === 'group_cohesion' || d === 'attachment_care' || d === 'personal_bond' || d === 'social') return 'affiliation';

  // статус/лицо/подчинение/самовыражение/автономия/легитимность -> status (пока так, дальше можно разделить)
  if (d === 'status' || d === 'leader_legitimacy' || d === 'obedience' || d === 'self_expression' || d === 'autonomy') return 'status';

  // ритуал/трансценденция/“порядок” -> order (как прокси)
  if (d === 'ritual' || d === 'self_transcendence' || d === 'other') return 'order';

  return null;
}

function mk(selfId: string, goalId: string, v: number, usedAtomIds: string[], parts: any, kind: 'goal_plan' | 'goal_active'): ContextAtom {
  const id =
    kind === 'goal_plan'
      ? `goal:plan:${selfId}:${goalId}`
      : `goal:activeGoal:${selfId}:${goalId}`;

  return normalizeAtom({
    id,
    ns: 'goal' as any,
    kind,
    origin: 'derived',
    source: kind === 'goal_plan' ? 'derivePlanningGoals' : 'selectActivePlanningGoals',
    subject: selfId,
    magnitude: clamp01(v),
    confidence: 1,
    tags: ['goal', kind === 'goal_plan' ? 'plan' : 'active', goalId],
    label: kind === 'goal_plan'
      ? `plan.${goalId}:${Math.round(clamp01(v) * 100)}%`
      : `activeGoal.${goalId}:${Math.round(clamp01(v) * 100)}%`,
    trace: { usedAtomIds: uniq(usedAtomIds), notes: [], parts }
  } as any);
}

/**
 * Плановые цели из GOAL_DEFS, строго из атомов goal:domain:* (единство атомов).
 * Никакого world/agent чтения: только atoms.
 */
export function derivePlanningGoalAtoms(selfId: string, atoms: ContextAtom[], opts?: { topN?: number }) {
  const topN = Math.max(1, Math.min(7, Number(opts?.topN ?? 5)));

  const scored: { goalId: string; v: number; used: string[]; parts: any }[] = [];

  for (const [goalId, def] of Object.entries(GOAL_DEFS)) {
    const domains = Array.isArray((def as any)?.domains) ? (def as any).domains : [];
    const used: string[] = [];
    let sum = 0;
    let n = 0;

    const contrib: Record<string, number> = {};
    for (const dom of domains) {
      const eco = mapGoalDefDomainToEcology(dom);
      if (!eco) continue;

      const atomId = `goal:domain:${eco}:${selfId}`;
      const m = getMag(atoms, atomId, NaN);
      if (!Number.isFinite(m)) continue;

      used.push(atomId);
      sum += clamp01(m);
      n += 1;
      contrib[eco] = (contrib[eco] ?? 0) + clamp01(m);
    }

    // лёгкая лидерская поправка (если есть атом роли; если нет — 0)
    const roleLeader = getMag(atoms, `role:isLeader:${selfId}`, 0);
    const leaderBias = Number((def as any)?.leaderBias ?? 0);
    const bias = clamp01(0.5 + 0.5 * roleLeader) * leaderBias; // мягко, без взрывов

    const base = n > 0 ? (sum / n) : 0.15;
    const v = clamp01(base + 0.25 * bias);

    scored.push({
      goalId,
      v,
      used,
      parts: { base, nDomains: n, contrib, roleLeader, leaderBias, bias }
    });
  }

  const planAtoms = scored.map(s => mk(selfId, s.goalId, s.v, s.used, s.parts, 'goal_plan'));
  const top = [...scored].sort((a, b) => b.v - a.v).slice(0, topN);
  const activeAtoms = top.map(s =>
    mk(selfId, s.goalId, s.v, [`goal:plan:${selfId}:${s.goalId}`], { fromPlan: true, score: s.v }, 'goal_active')
  );

  return { atoms: [...planAtoms, ...activeAtoms], top: top.map(x => ({ goalId: x.goalId, v: x.v })) };
}
