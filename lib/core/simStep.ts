// lib/core/simStep.ts
// Minimal explicit time-step record used to make simulation / pipeline transitions inspectable.

export type SimStep = {
  /** Discrete tick index (integer). */
  t: number;
  /** Time delta for this step (arbitrary units). */
  dt: number;
  /** Run-level seed used for deterministic RNG wiring. */
  seed: number | string;
  /** Optional event payloads applied/observed at this step. */
  events: any[];
};

export function makeSimStep(args: { t: number; dt?: number; seed?: number | string; events?: any[] }): SimStep {
  return {
    t: Number(args.t ?? 0),
    dt: Number(args.dt ?? 1),
    seed: (args.seed ?? 0) as any,
    events: Array.isArray(args.events) ? args.events : [],
  };
}
