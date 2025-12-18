// lib/psych/system1.ts

/**
 * Calculates the weight of System 1 (archetypal, instinctual thinking) based on stress.
 * The weight, alpha, is calculated using a sigmoid function, causing a sharp shift
 * from rational (System 2) to archetypal (System 1) behavior as stress crosses a threshold.
 * @param stress A normalized stress value from 0 to 1.
 * @returns A weight 'alpha' from 0 to 1, where 0 is pure System 2 and 1 is pure System 1.
 */
export function system1Weight(stress: number): number {
  const k = 10;     // 'k' controls the sharpness of the transition.
  const theta = 0.6; // 'theta' is the stress threshold where the switch happens.
  
  // Sigmoid function: α = σ(k * (stress - θ))
  return 1 / (1 + Math.exp(-k * (stress - theta)));
}
