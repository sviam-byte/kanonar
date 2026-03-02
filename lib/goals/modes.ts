import { clamp01 } from '../util/math';
import { FC } from '../config/formulaConfig';
import type { EnergyChannel } from '../agents/energyProfiles';

export type GoalMode = 'threat_mode' | 'social_mode' | 'explore_mode' | 'resource_mode' | 'care_mode';

export type FeltField = Record<EnergyChannel, number>;

export type ModeWeights = Record<GoalMode, number>;

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
export function selectMode(felt: Partial<FeltField>, opts?: { temperature?: number; careSignal?: number }): { mode: GoalMode; weights: ModeWeights; logits: Record<GoalMode, number> } {
  const f = (ch: EnergyChannel) => clamp01(Number((felt as any)?.[ch] ?? 0));

  const threat = f('threat');
  const uncertainty = f('uncertainty');
  const norm = f('norm');
  const attachment = f('attachment');
  const resource = f('resource');
  const status = f('status');
  const curiosity = f('curiosity');
  const careSignal = clamp01(Number(opts?.careSignal ?? 0));

  // Logits are not probabilities; they are “mode pressures”.
  const lg = FC.mode.logits;
  const logits: Record<GoalMode, number> = {
    threat_mode: lg.threat.threat * threat + lg.threat.uncertainty * uncertainty + lg.threat.norm * norm - lg.threat.curiosityPenalty * curiosity,
    social_mode: lg.social.norm * norm + lg.social.status * status + lg.social.attachment * attachment - lg.social.threatPenalty * threat,
    explore_mode: lg.explore.curiosity * curiosity + lg.explore.uncertainty * uncertainty - lg.explore.threatPenalty * threat - lg.explore.normPenalty * norm,
    resource_mode: lg.resource.resource * resource + lg.resource.threat * threat + lg.resource.uncertainty * uncertainty - lg.resource.curiosityPenalty * curiosity,
    care_mode: lg.care.attachment * attachment - lg.care.threatPenalty * threat - lg.care.normPenalty * norm + lg.care.careSignal * careSignal,
  };

  const weightsRaw = softmax(logits as any, opts?.temperature ?? FC.mode.temperature);
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
