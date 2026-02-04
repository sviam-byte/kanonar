export type GoalCandidate = { id: string; score: number; lockIn?: number };

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Active-set selection with hysteresis.
 *
 * - prevActive goals get a positive bias proportional to lockIn.
 * - dropping a previously active goal requires it to lose by `margin` (also scaled by lockIn).
 */
export function selectActiveGoalsWithHysteresis(
  candidates: GoalCandidate[],
  prevActive: Set<string>,
  opts?: { topN?: number; margin?: number }
): { active: string[]; debug: any } {
  const topN = Math.max(1, Math.min(8, Number(opts?.topN ?? 3)));
  const baseMargin = Math.max(0, Number(opts?.margin ?? 0.06));

  const rows = candidates
    .map((c) => {
      const lockIn = clamp01(Number(c.lockIn ?? 0));
      const isPrev = prevActive.has(c.id);
      const keepBias = isPrev ? baseMargin * (0.5 + 0.8 * lockIn) : 0;
      const effective = (Number(c.score) || 0) + keepBias;
      return { ...c, lockIn, isPrev, keepBias, effective };
    })
    .sort((a, b) => b.effective - a.effective);

  const picked = rows.slice(0, topN);
  const pickedIds = new Set(picked.map((x) => x.id));

  // Second pass: keep previously active goals unless they are clearly beaten.
  // This prevents “flicker” when scores are very close.
  const kth = picked[picked.length - 1];
  const kthScore = kth ? kth.effective : -Infinity;

  const keptPrev: string[] = [];
  for (const r of rows) {
    if (!r.isPrev) continue;
    if (pickedIds.has(r.id)) {
      keptPrev.push(r.id);
      continue;
    }
    const dropThreshold = kthScore - baseMargin * (0.75 + 0.75 * r.lockIn);
    if (r.effective >= dropThreshold) {
      keptPrev.push(r.id);
      pickedIds.add(r.id);
    }
  }

  // Final active set: picked + keptPrev, still capped by topN (prev can “steal” a slot only if close).
  const finalRows = rows.filter((r) => pickedIds.has(r.id)).sort((a, b) => b.effective - a.effective);
  const active = finalRows.slice(0, topN).map((r) => r.id);

  return {
    active,
    debug: {
      topN,
      baseMargin,
      kthScore,
      rows: rows.map((r) => ({ id: r.id, score: r.score, effective: r.effective, isPrev: r.isPrev, lockIn: r.lockIn })),
      keptPrev,
    },
  };
}
