// lib/stability.ts
import { FullCharacterMetrics } from "../types";

/**
 * A simplified metrics object for the computeStability function.
 */
interface CharacterMetrics {
    stress: number;      // 0-1
    discipline: number;  // 0-1 (e.g., from latents.SD)
    resources: number;   // 0-1 (e.g., from v42.Recovery_t)
}

/**
 * Computes a simple stability score based on key character metrics.
 * As per the request: "high stress and high riskiness ↓S, high discipline and resources ↑S"
 * @param metrics An object containing normalized stress, discipline, and resource metrics.
 * @returns A stability score between 0 and 1.
 */
export function computeStability(metrics: CharacterMetrics): number {
  const base =
    0.4 * (1 - metrics.stress) +
    0.3 * metrics.discipline +
    0.3 * metrics.resources;
  return Math.max(0, Math.min(1, base));
}
