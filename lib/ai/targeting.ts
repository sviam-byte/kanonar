import { WorldState } from "../types";

export interface TargetCandidate {
  id: string;
  score: number;
}

/**
 * Выбор таргета под цель.
 * Важно: по умолчанию никогда не выбираем selfId как таргет
 * (только если явно allowSelf = true).
 */
export function chooseBestTarget(
  world: WorldState,
  selfId: string,
  candidates: TargetCandidate[],
  options: { allowSelf?: boolean } = {}
): string | null {
  const allowSelf = !!options.allowSelf;

  const filtered = candidates.filter((c) => {
    if (!allowSelf && c.id === selfId) return false;
    return true;
  });

  if (!filtered.length) return null;

  filtered.sort((a, b) => b.score - a.score);
  return filtered[0].id;
}
