// lib/affect/synthesizeFromMind.ts
import type { AffectState } from './types';

const num = (v: any, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp11 = (x: number) => Math.max(-1, Math.min(1, x));

/**
 * Build a coherent AffectState from (contextMind + appraisal + derived indices).
 * Goal: make affect axes non-zero and consistent with emotion/appraisal.
 */
export function synthesizeAffectFromMind(contextMind: any, fallbackAffect?: Partial<AffectState> | null): AffectState {
  const app = contextMind?.appraisal || {};
  const der = contextMind?.derived || {};

  // Arousal primarily driven by threat + uncertainty + public exposure.
  const arousal =
    0.55 * clamp01(num(der.threatIndex, clamp01(num(app.threat, 0)))) +
    0.35 * clamp01(num(app.uncertainty, 0)) +
    0.10 * clamp01(num(app.publicExposure, 0));

  // Control damped by threat and uncertainty.
  const controlBase = clamp01(num(app.controllability, 0.5));
  const control = clamp01(controlBase * (1 - 0.35 * clamp01(num(der.threatIndex, num(app.threat, 0)))) * (1 - 0.25 * clamp01(num(app.uncertainty, 0))));

  // Valence = safety/support/reparability minus threat/loss.
  const safety = clamp01(num(der.safetyIndex, 0.5));
  const support = clamp01(num(der.supportIndex, 0));
  const threat = clamp01(num(der.threatIndex, clamp01(num(app.threat, 0))));
  const loss = clamp01(num(app.loss, 0));
  const repar = clamp01(num(app.reparability, 0));
  const valence = clamp11((0.55 * safety + 0.20 * support + 0.15 * repar) - (0.55 * threat + 0.25 * loss));

  // Stress from arousal plus social pressures.
  const stress = clamp01(
    0.70 * clamp01(arousal) +
    0.15 * clamp01(num(app.normViolation, 0)) +
    0.15 * clamp01(num(app.publicExposure, 0))
  );

  const fatigue = clamp01(num((fallbackAffect as any)?.fatigue, 0.25 * stress));
  const dissociation = clamp01(num((fallbackAffect as any)?.dissociation, 0.25 * clamp01(num(app.uncertainty, 0)) + 0.10 * stress));

  // Discrete emotions from emotionAtoms/top-level fields.
  const e: Record<string, number> = {};
  const atoms = Array.isArray(der?.emotionAtoms)
    ? der.emotionAtoms
    : Array.isArray(contextMind?.emotionAtoms)
      ? contextMind.emotionAtoms
      : null;
  if (atoms) {
    for (const it of atoms) {
      const k = String(it?.emotion ?? it?.kind ?? '').toLowerCase();
      const v = clamp01(num(it?.intensity, num(it?.magnitude, 0)));
      if (k) e[k] = Math.max(e[k] ?? 0, v);
    }
  }
  for (const k of ['fear', 'anger', 'shame', 'joy', 'sadness', 'disgust', 'pride', 'curiosity', 'attachment', 'loneliness']) {
    const v = clamp01(num(contextMind?.[k], num((fallbackAffect as any)?.[k], 0)));
    if (v > 0) e[k] = Math.max(e[k] ?? 0, v);
  }

  return {
    valence,
    arousal: clamp01(arousal),
    control,
    stress,
    fatigue,
    dissociation,
    e,
  } as any;
}

