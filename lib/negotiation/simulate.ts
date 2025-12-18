import seedrandom from 'seedrandom';
import { EntityParams, Counterparty, Mission, NegotiationMetrics } from '../../types';
import { u1, u2 } from './utilities';

function cvar(sortedLosses: number[], q: number): number {
  const n = Math.max(1, Math.floor(q * sortedLosses.length));
  // We want the tail of largest losses
  const tail = sortedLosses.slice(-n);
  if (tail.length === 0) return 0;
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

export function simulateNegotiation(char: EntityParams, cp: Counterparty, mission: Mission, runs = 256): NegotiationMetrics {
  const results = [];
  const charBatna = 0; // Assuming a base BATNA

  for (let r = 0; r < runs; r++) {
    const rng = seedrandom(String(r));
    let x = 50, t = 0, scandal = false, accepted = false;
    let U1 = 0, U2 = 0, time = mission.deadlineDays;
    
    const delta1 = Math.min(0.99, 0.8 + 0.002 * (char.will ?? 50) - 0.002 * (char.fatigue ?? 20));
    const delta2 = Math.min(0.99, cp.discountDelta);

    for (t = 0; t < mission.deadlineDays; t++) {
      // Character's offer moves towards an assumed Nash equilibrium (e.g., 80)
      const step = 2 + 0.2 * t; // urgency increases
      x += Math.sign(80 - x) * step + 3 * (rng() - 0.5);
      x = Math.max(0, Math.min(100, x));

      // Hazard event risk
      const lam = 0.01 + 0.0005 * (char.stress ?? 40) + 0.0005 * (char.Vsigma ?? 30) + 0.0005 * (char.public_scrutiny ? 20 : 0);
      if (rng() < 1 - Math.exp(-lam)) {
        scandal = true;
        break;
      }

      // Evaluation and acceptance by counterparty
      U1 = u1(char, x, mission);
      U2 = u2(cp, x, mission);
      const U2_discounted = Math.pow(delta2, t) * U2;
      const pAcc = 1 / (1 + Math.exp(-0.05 * (U2_discounted - cp.batna)));
      
      if (rng() < pAcc && U1 >= charBatna) {
        accepted = true;
        time = t;
        break;
      }
    }
    
    const finalU1 = accepted ? Math.pow(delta1, time) * u1(char, x, mission) : charBatna;
    const dealValue = finalU1;
    const loss = scandal ? 30 : (accepted ? 0 : 10);
    results.push({ accepted, dealValue, time, scandal, loss });
  }

  // Aggregate metrics
  const dealProb = results.filter(r => r.accepted).length / runs;
  const expectedDealValue = results.reduce((a, b) => a + b.dealValue, 0) / runs;
  const scandalProb = results.filter(r => r.scandal).length / runs;
  const timeToDealAvg = results.filter(r => r.accepted).reduce((a, b) => a + b.time, 0) / Math.max(1, results.filter(r => r.accepted).length);

  const losses = results.map(r => r.loss).sort((a, b) => a - b);
  const cvar10 = cvar(losses, 0.9); // CVaR for the 10% worst outcomes

  // Post-mission effects (simplified linear model)
  const dPv = 20 * dealProb - 15 * scandalProb;
  const dV = 10 * scandalProb + 0.1 * (char.accountability ?? 50) - 5 * dealProb;
  const dS7 = 0.5 * dPv - 0.4 * dV;
  const dS30 = 0.3 * dPv - 0.5 * dV;

  return {
    dealProb, expectedDealValue, cvar10, timeToDealAvg, scandalProb,
    postDelta: { pv: dPv, vsigma: dV, stress: 10 * (1 - dealProb) + 20 * scandalProb, S7: dS7, S30: dS30 },
    simulationRuns: results
  };
}