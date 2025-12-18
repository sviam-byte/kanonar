export interface InfluenceState {
  S: number; // Susceptible
  I: number; // Infected
  R: number; // Recovered
}

export function createInitialInfluenceState(N: number, seeds: number): InfluenceState {
  return {
    S: N - seeds,
    I: seeds,
    R: 0,
  };
}

export function runInfluenceStep(
  currentState: InfluenceState,
  N: number,
  beta: number,
  gamma: number,
): InfluenceState {
  const { S, I, R } = currentState;

  const newInfections = (beta * S * I) / N;
  const newRecoveries = gamma * I;

  const nextS = Math.max(0, S - newInfections);
  const nextI = Math.max(0, I + newInfections - newRecoveries);
  const nextR = Math.max(0, R + newRecoveries);

  // Ensure total population remains constant
  const total = nextS + nextI + nextR;
  if (Math.abs(total - N) > 1e-6) {
      const scale = N / total;
      return { S: nextS * scale, I: nextI * scale, R: nextR * scale };
  }
  
  return { S: nextS, I: nextI, R: nextR };
}
