export interface SeirPayload {
  N: number;
  params: {
    beta0: number;
    sigma: number;
    gamma: number;
    h_rate: number;
  };
  controls: {
    t: number;
    kind: 'lockdown';
    eff: number;
  }[];
  days: number;
}

export interface SeirState {
  S: number;
  E: number;
  I: number;
  R: number;
  H: number;
}

export function createInitialSeirState(payload: SeirPayload): SeirState {
  return {
    S: payload.N - 1,
    E: 1,
    I: 0,
    R: 0,
    H: 0,
  };
}

export function runSeirStep(
  currentState: SeirState,
  payload: SeirPayload,
  day: number
): SeirState {
  const { N, params, controls } = payload;
  const { S, E, I } = currentState;

  let beta = params.beta0;
  controls.forEach(c => {
    if (day >= c.t && c.kind === 'lockdown') {
      beta *= (1 - c.eff);
    }
  });

  const newInfections = (beta * S * I) / N;
  const newExposedToInfected = params.sigma * E;
  const newRecoveries = params.gamma * I;
  
  const nextS = Math.max(0, S - newInfections);
  const nextE = Math.max(0, E + newInfections - newExposedToInfected);
  const nextI = Math.max(0, I + newExposedToInfected - newRecoveries);
  const nextR = Math.max(0, currentState.R + newRecoveries);
  const nextH = nextI * params.h_rate;

  return {
    S: nextS,
    E: nextE,
    I: nextI,
    R: nextR,
    H: nextH,
  };
}
