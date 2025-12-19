
import { AffectState } from '../emotions/types';

export type AnyObj = Record<string, any>;
export const clamp01 = (x: any, fb = 0) => {
  const v = Number(x);
  if (!Number.isFinite(v)) return fb;
  return Math.max(0, Math.min(1, v));
};

const ensureObj = (x: any): AnyObj => (x && typeof x === "object" ? x : {});

export function normalizeAffectState(raw: any): AffectState {
  const a: any = ensureObj(raw);
  
  a.e = ensureObj(a.e);
  a.regulation = ensureObj(a.regulation);
  a.moral = ensureObj(a.moral);

  // --- fatigue/exhaustion aliasing ---
  const fatigue = a.fatigue ?? a.exhaustion ?? a.e?.exhaustion ?? a.e?.fatigue;
  if (fatigue != null) {
    a.fatigue = clamp01(fatigue);
    // keep alias for dyad panels / older code paths
    a.exhaustion = a.exhaustion != null ? clamp01(a.exhaustion) : a.fatigue;
    // if someone stuffed it into e
    if (a.e.exhaustion == null) a.e.exhaustion = a.exhaustion;
    if (a.e.fatigue == null) a.e.fatigue = a.fatigue;
  }

  // --- hope canonicalization: keep in e.hope, mirror to top-level ---
  const hope = a.e?.hope ?? a.hope;
  if (hope != null) {
    a.e.hope = clamp01(hope);
    a.hope = a.hope != null ? clamp01(a.hope) : a.e.hope;
  }

  // --- moral block sync ---
  const guilt = a.e?.guilt ?? a.moral?.guilt;
  const shame = a.e?.shame ?? a.moral?.shame;
  if (guilt != null) {
    a.e.guilt = clamp01(guilt);
    a.moral.guilt = a.e.guilt;
  }
  if (shame != null) {
    a.e.shame = clamp01(shame);
    a.moral.shame = a.e.shame;
  }

  // --- legacy convenience fields ---
  // Ensure we don't treat 'trust' as top-level AffectState property in types, but map it to trustBaseline
  if (a.e.trust != null) a.trustBaseline = clamp01(a.e.trust);
  if (a.trustBaseline != null) a.e.trust = clamp01(a.trustBaseline);
  
  // Other emotions: treat a.e.* as canonical and mirror it to top-level.
  // This avoids a common failure mode where top-level defaults to 0 while a.e carries the real values.
  for (const k of ["fear", "anger", "sadness", "joy", "disgust", "pride", "attachment", "loneliness", "curiosity"] as const) {
    if (a.e[k] != null) {
      a.e[k] = clamp01(a.e[k]);
      a[k] = a.e[k];
      continue;
    }
    if (a[k] != null) {
      a[k] = clamp01(a[k]);
      a.e[k] = a[k];
    }
  }
  
  // base scalars
  if (a.valence != null) a.valence = Number(a.valence);
  if (a.arousal != null) a.arousal = clamp01(a.arousal);
  if (a.control != null) a.control = clamp01(a.control);
  if (a.stress != null) a.stress = clamp01(a.stress);
  if (a.dissociation != null) a.dissociation = clamp01(a.dissociation);
  if (a.stability != null) a.stability = clamp01(a.stability);

  // Defaults for required fields
  if (a.valence === undefined) a.valence = 0;
  if (a.arousal === undefined) a.arousal = 0;
  if (a.control === undefined) a.control = 0;
  if (a.stress === undefined) a.stress = 0;
  if (a.fatigue === undefined) a.fatigue = 0;
  if (a.dissociation === undefined) a.dissociation = 0;
  if (a.stability === undefined) a.stability = 0;
  if (a.updatedAtTick === undefined) a.updatedAtTick = 0;
  
  if (a.fear === undefined) a.fear = 0;
  if (a.anger === undefined) a.anger = 0;
  if (a.shame === undefined) a.shame = 0;
  if (a.trustBaseline === undefined) a.trustBaseline = 0.5;

  return a as AffectState;
}
