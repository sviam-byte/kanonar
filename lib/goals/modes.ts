import type { EnergyChannel } from '../agents/energyProfiles';

export type GoalMode = 'threat_mode' | 'social_mode' | 'explore_mode' | 'resource_mode' | 'care_mode';

export type FeltField = Record<EnergyChannel, number>;

export type ModeWeights = Record<GoalMode, number>;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function softmax(scores: Record<string, number>, temperature = 1): Record<string, number> {
  const T = Math.max(1e-6, Number(temperature) || 1);
  const keys = Object.keys(scores);
  if (keys.length === 0) return {};
  const max = Math.max(...keys.map((k) => scores[k]));
  const exps = keys.map((k) => Math.exp((scores[k] - max) / T));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  const out: Record<string, number> = {};
  for (let i = 0; i < keys.length; i++) out[keys[i]] = exps[i] / sum;
  return out;
}

/**
 * Mixture-of-Experts “mode” selection from felt energy channels.
 * This is intentionally lightweight: it is a gating layer that biases downstream goal scoring.
 */
export function selectMode(felt: Partial<FeltField>, opts?: { temperature?: number }): { mode: GoalMode; weights: ModeWeights; logits: Record<GoalMode, number> } {
  const f = (ch: EnergyChannel) => clamp01(Number((felt as any)?.[ch] ?? 0));

  const threat = f('threat');
  const uncertainty = f('uncertainty');
  const norm = f('norm');
  const attachment = f('attachment');
  const resource = f('resource');
  const status = f('status');
  const curiosity = f('curiosity');

  // Logits are not probabilities; they are “mode pressures”.
  const logits: Record<GoalMode, number> = {
    threat_mode: 1.25 * threat + 0.35 * uncertainty + 0.15 * norm - 0.35 * curiosity,
    social_mode: 0.95 * norm + 0.85 * status + 0.25 * attachment - 0.25 * threat,
    explore_mode: 1.15 * curiosity + 0.45 * uncertainty - 0.85 * threat - 0.25 * norm,
    resource_mode: 1.2 * resource + 0.25 * threat + 0.15 * uncertainty - 0.25 * curiosity,
    care_mode: 1.25 * attachment - 0.35 * threat - 0.15 * norm,
  };

  const weightsRaw = softmax(logits as any, opts?.temperature ?? 0.8);
  const weights: ModeWeights = {
    threat_mode: clamp01(weightsRaw.threat_mode ?? 0),
    social_mode: clamp01(weightsRaw.social_mode ?? 0),
    explore_mode: clamp01(weightsRaw.explore_mode ?? 0),
    resource_mode: clamp01(weightsRaw.resource_mode ?? 0),
    care_mode: clamp01(weightsRaw.care_mode ?? 0),
  };

  let best: GoalMode = 'threat_mode';
  let bestV = -Infinity;
  (Object.keys(weights) as GoalMode[]).forEach((m) => {
    const v = weights[m];
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  });

  return { mode: best, weights, logits };
}
