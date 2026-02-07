import type { ContextAtom } from '../context/v2/types';
import type { Possibility } from '../possibilities/catalog';
import { arr } from '../utils/arr';
import { ActionCandidate } from './actionCandidate';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function keyFromPossibilityId(id: string): string {
  const parts = String(id || '').split(':');
  return parts[1] || parts[0] || '';
}

function buildGoalEnergyMap(atoms: ContextAtom[], selfId: string): Record<string, number> {
  const out: Record<string, number> = {};
  const activePrefix = `util:activeGoal:${selfId}:`;
  for (const a of atoms) {
    if (!a?.id?.startsWith(activePrefix)) continue;
    const goalId = a.id.slice(activePrefix.length);
    out[goalId] = clamp01(Number((a as any)?.magnitude ?? 0));
  }

  if (Object.keys(out).length) return out;

  // Fallback: use domain goal atoms if util:* is missing.
  const domainPrefix = `goal:domain:`;
  for (const a of atoms) {
    if (!a?.id?.startsWith(domainPrefix)) continue;
    const parts = a.id.split(':');
    const domain = parts[2];
    const owner = parts[3];
    if (!domain || owner !== selfId) continue;
    out[domain] = clamp01(Number((a as any)?.magnitude ?? 0));
  }

  return out;
}

function buildDeltaGoals(
  atoms: ContextAtom[],
  selfId: string,
  actionKey: string,
  fallbackDelta: number,
  goalEnergy: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  const allowPrefix = `util:hint:allow:`;

  for (const a of atoms) {
    if (!a?.id?.startsWith(allowPrefix)) continue;
    const parts = a.id.split(':');
    const goalId = parts[3];
    const key = parts[4];
    if (!goalId || !key || key !== actionKey) continue;
    out[goalId] = clamp01(Number((a as any)?.magnitude ?? 0));
  }

  if (Object.keys(out).length) return out;

  // Fallback: tie the action to the most active goal when no hints exist.
  const topGoal = Object.entries(goalEnergy)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topGoal) out[topGoal] = clamp01(fallbackDelta);
  return out;
}

function buildSupportAtoms(atoms: ContextAtom[], p: Possibility): ContextAtom[] {
  const usedIds = arr<string>((p as any)?.trace?.usedAtomIds);
  if (!usedIds.length) return [];
  const byId = new Map(atoms.map((a) => [a.id, a]));
  return usedIds.map((id) => byId.get(id)).filter(Boolean) as ContextAtom[];
}

/**
 * Convert Possibilities into ActionCandidates using util:* hints when available.
 * This keeps the Action layer traceable without reading goal:* atoms directly.
 */
export function buildActionCandidates(args: {
  selfId: string;
  atoms: ContextAtom[];
  possibilities: Possibility[];
}): { actions: ActionCandidate[]; goalEnergy: Record<string, number> } {
  const actions: ActionCandidate[] = [];
  const goalEnergy = buildGoalEnergyMap(args.atoms, args.selfId);

  for (const p of arr<Possibility>(args.possibilities)) {
    const key = keyFromPossibilityId(p.id);
    const deltaGoals = buildDeltaGoals(
      args.atoms,
      args.selfId,
      key,
      Number((p as any)?.magnitude ?? 0),
      goalEnergy
    );

    actions.push({
      id: String(p.id),
      kind: key,
      actorId: args.selfId,
      targetId: (p as any)?.targetId ?? null,
      targetNodeId: (p as any)?.targetNodeId ?? null,
      deltaGoals,
      cost: Number((p as any)?.meta?.cost ?? 0),
      confidence: clamp01(Number((p as any)?.confidence ?? 1)),
      supportAtoms: buildSupportAtoms(args.atoms, p),
      payload: (p as any)?.meta?.payload ?? undefined,
    });
  }

  return { actions, goalEnergy };
}
