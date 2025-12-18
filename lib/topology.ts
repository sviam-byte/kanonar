// src/lib/topology.ts

/**
 * Calculates a topological score based on a persistence barcode.
 * The score is a weighted sum of the "persistence" (lifetime) of topological features.
 * Longer-lived features (especially in higher dimensions) contribute more to the score.
 *
 * @param barcode An array of [birth, death, dimension] tuples.
 * @returns A numeric score, normalized to a 0-100 scale.
 */
export function scoreTopology(barcode: Array<[number, number, number]>): number {
  if (!barcode || barcode.length === 0) {
    return 0;
  }

  const weights: { [key: number]: number } = {
    0: 1.0, // Connected components (H0)
    1: 1.5, // Loops/tunnels (H1)
    2: 2.0, // Voids/cavities (H2)
  };

  let rawScore = 0;
  for (const bar of barcode) {
    const [birth, death, dim] = bar;
    const persistence = death - birth;
    const weight = weights[dim] || 1.0;

    if (persistence > 0 && persistence !== Infinity) {
      rawScore += persistence * weight;
    }
  }

  // Normalize the score. This is a simple scaling factor found by experimentation.
  // In a real scenario, this would be based on the expected range of scores.
  const normalizationFactor = 50; 
  const normalizedScore = (rawScore / normalizationFactor) * 100;

  return Math.max(0, Math.min(100, normalizedScore));
}