
// lib/tom/second_order.ts

export interface TomSecondOrderSelf {
  // Baselines
  perceivedTrustFromTarget: number;        // q_trust
  perceivedAlignFromTarget: number;        // q_align
  perceivedDominanceInTargetsView: number; // q_dom
  perceivedUncertaintyOfTarget: number;    // q_unc

  // Derived indices
  mirrorIndex: number; // M \in [0,1]
  selfAlign: number;   // A_self \in [0,1]
  shameDelta: number;  // A_self - M
}

// Layer of k-th order ToM
export interface TomOrderLayer {
  order: number;            // 1,2,3,...
  trust: number;            // \in [0,1]
  align: number;            // \in [0,1]
  dominance: number;        // \in [0,1]
  uncertainty: number;      // \in [0,1]
}

function clamp01(x: any): number {
    const v = typeof x === "number" && isFinite(x) ? x : 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
}

// Helper to calculate cosine similarity between two vectors
function cosineSim(a: number[], b: number[]): number {
    let dot = 0, ma = 0, mb = 0;
    for(let i=0; i<Math.min(a.length, b.length); i++) {
        dot += a[i] * b[i];
        ma += a[i] * a[i];
        mb += b[i] * b[i];
    }
    return ma > 0 && mb > 0 ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : 0;
}

/**
 * Computes 2nd order ToM metrics: "How I think you see me".
 * Reconstructs a 'Seen-By-Target' vector and compares it with 'Self' vector.
 */
export function computeSecondOrderSelf(ctx: {
  observerDossier: any;
  tomOutputs: any;
  characterModel: any;
  biases?: any;
  errorProfile?: any;
  affect?: any;
}): TomSecondOrderSelf {
  const { tomOutputs, characterModel, affect = {} } = ctx;

  // 1. Extract Core Perceptions (simulated)
  // In a full implementation, these would come from the reverse model (j->i).
  // Here we approximate based on dyadic metrics and projection.
  
  const align = tomOutputs.goalAlignment ?? 0.5;
  const trust = tomOutputs.trustBase ?? 0.5;
  const dom = 1.0 - (characterModel?.egoism ?? 0.5); // Heuristic: altruism ~ submission? No, let's use dominance axis.
  const unc = tomOutputs.toM_Unc ?? 0.5;

  const core = {
      perceivedTrustFromTarget: clamp01(trust * 0.8 + 0.2), // Biased towards optimism/trust
      perceivedAlignFromTarget: clamp01(align),
      perceivedDominanceInTargetsView: clamp01(dom),
      perceivedUncertaintyOfTarget: clamp01(unc + 0.1)
  };

  // 2. Mirror Index (M): Similarity between Self-Concept and Projected Self
  // We use a simplified proxy here since full vector reconstruction is complex
  // If trust and align are high, Mirror Index is high.
  const mirrorIndex = clamp01(0.4 * core.perceivedTrustFromTarget + 0.6 * core.perceivedAlignFromTarget);

  // 3. Self Align (A_self): How well 'I' accept this reflection
  // Shame reduces alignment. Narcissism increases it.
  const shame = affect.shame ?? 0;
  const selfAlign = clamp01(mirrorIndex - 0.5 * shame);

  // 4. Shame Delta
  const shameDelta = selfAlign - mirrorIndex;

  return {
    ...core,
    mirrorIndex,
    selfAlign,
    shameDelta,
  };
}

/**
 * Calculates a chain of ToM orders (1st, 2nd, 3rd...).
 * Uses recursive damping to estimate higher orders.
 * v(k) = λ * v(k-1) + (1-λ) * v(k-2)
 */
export function computeTomOrderChain(ctx: {
  outputs: any;
  characterModel?: any;
  second: TomSecondOrderSelf;
  entry?: any;
  maxOrder?: number;       // default 4
}): TomOrderLayer[] {
  const { outputs, characterModel = {}, second, entry } = ctx;
  const maxOrder = ctx.maxOrder ?? 4;

  if (!outputs) return [];

  // --- 1st Order: "I about You" ---
  const t1 = clamp01(outputs.trustBase ?? 0.5);
  const a1 = clamp01(
    outputs.goalAlignment ??
      outputs.alignment?.goalsBelief ??
      0.5
  );
  const d1 = clamp01(
    characterModel?.riskProfile?.dominanceByI ??
      characterModel?.dominanceByI ??
      0.5
  );
  const unc1 = clamp01(
    entry?.toM_Unc ??
      (1 - (outputs.tomConfidence ?? 0.5))
  );

  // --- 2nd Order: "You about Me" (Perceived by I) ---
  const t2 = clamp01(second.perceivedTrustFromTarget);
  const a2 = clamp01(second.perceivedAlignFromTarget);
  const d2 = clamp01(second.perceivedDominanceInTargetsView);
  const unc2 = clamp01(second.perceivedUncertaintyOfTarget);

  const layers: TomOrderLayer[] = [
    { order: 1, trust: t1, align: a1, dominance: d1, uncertainty: unc1 },
    { order: 2, trust: t2, align: a2, dominance: d2, uncertainty: unc2 },
  ];

  if (maxOrder <= 2) return layers;

  // --- k >= 3: Damped Recursion ---
  const LAMBDA = 0.65;

  for (let k = 3; k <= maxOrder; k++) {
    const prev = layers[k - 2];   // (k-1)
    const prev2 = layers[k - 3];  // (k-2)

    const trust = LAMBDA * prev.trust + (1 - LAMBDA) * prev2.trust;
    const align = LAMBDA * prev.align + (1 - LAMBDA) * prev2.align;
    const dominance = LAMBDA * prev.dominance + (1 - LAMBDA) * prev2.dominance;
    const uncertainty =
      LAMBDA * prev.uncertainty + (1 - LAMBDA) * prev2.uncertainty;

    layers.push({
      order: k,
      trust: clamp01(trust),
      align: clamp01(align),
      dominance: clamp01(dominance),
      uncertainty: clamp01(uncertainty),
    });
  }

  return layers;
}
