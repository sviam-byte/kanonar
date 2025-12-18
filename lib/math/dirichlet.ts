import { RNG } from "../core/noise";

/**
 * Generates a random sample from a Gamma distribution.
 * Uses Marsaglia and Tsang's method for k >= 1.
 * @param k - Shape parameter (alpha).
 * @param theta - Scale parameter (beta). Defaults to 1.
 * @param rng - The random number generator instance.
 * @returns A random number from the Gamma(k, theta) distribution.
 */
export function gammaSample(k: number, theta: number = 1.0, rng: RNG): number {
  if (k <= 0) return 0;
  // Marsaglia and Tsang's method for k >= 1
  if (k < 1) {
    // For k < 1, use Ahrens and Dieter's method
    const u = rng.nextFloat();
    return gammaSample(1 + k, theta, rng) * Math.pow(u, 1 / k);
  }

  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  let x: number, v: number;

  while (true) {
    do {
      x = rng.nextGaussian();
      v = 1 + c * x;
    } while (v <= 0);
    
    v = v * v * v;
    const u = rng.nextFloat();

    if (u < 1 - 0.0331 * x * x * x * x) {
      return theta * d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return theta * d * v;
    }
  }
}

/**
 * Generates a random sample from a Dirichlet distribution.
 * @param alpha - An array of concentration parameters.
 * @param rng - The random number generator instance.
 * @returns A random vector from the Dirichlet(alpha) distribution.
 */
export function dirichletSample(alpha: number[], rng: RNG): number[] {
  const samples = alpha.map(a => gammaSample(a, 1.0, rng));
  const sum = samples.reduce((acc, val) => acc + val, 0);

  if (sum === 0) {
    // Handle the edge case where all samples are zero.
    // This happens if all alpha parameters are <= 0.
    // Return a uniform distribution.
    const n = alpha.length;
    if (n === 0) return [];
    return new Array(n).fill(1 / n);
  }

  return samples.map(s => s / sum);
}