
// lib/context/epistemic/perceptionProfile.ts

export type PerceptionProfile = {
  sightRange: number;        // grid cells
  hearingRange: number;
  baseNoise: number;         // 0..1
  focus: number;             // 0..1 (agent attentiveness)
  panicPenalty: number;      // 0..1 (how much arousal reduces quality)
};

export function defaultPerceptionProfile(): PerceptionProfile {
  return {
    sightRange: 8,
    hearingRange: 10,
    baseNoise: 0.15,
    focus: 0.6,
    panicPenalty: 0.4,
  };
}

export function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// Unified score for observation quality (0..1)
export function computeInfoAdequacy(args: {
  visibility?: number;  // 0..1 (local lighting/cover)
  crowd?: number;       // 0..1 (crowding obscures vision)
  chaos?: number;       // 0..1 (environmental chaos)
  arousal?: number;     // 0..1 (internal state)
  profile?: PerceptionProfile;
}) {
  const p = args.profile ?? defaultPerceptionProfile();
  const vis = clamp01(args.visibility ?? 1);
  const crowd = clamp01(args.crowd ?? 0);
  const chaos = clamp01(args.chaos ?? 0);
  const arousal = clamp01(args.arousal ?? 0);

  // Penalty grows with crowd, chaos, and panic
  const penalty = (0.35 * crowd + 0.35 * chaos + p.panicPenalty * arousal);
  
  // Quality = visibility * focus_efficiency * (1 - penalty)
  const quality = clamp01(vis * (p.focus * (1 - p.baseNoise)) * (1 - penalty));

  return {
    quality,
    parts: { vis, crowd, chaos, arousal, focus: p.focus, baseNoise: p.baseNoise, penalty }
  };
}
