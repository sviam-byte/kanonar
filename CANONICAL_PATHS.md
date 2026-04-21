# CANONICAL PATHS

This file maps execution responsibilities to concrete modules.  
If behavior and UI disagree, **these paths win** unless explicitly superseded by updated canonical docs.

## 1) Context + pipeline path

1. Context types and normalization contracts:
   - `lib/context/v2/types.ts`
   - `lib/context/v2/infer.ts`
2. Pipeline orchestration:
   - `lib/goal-lab/pipeline/runPipelineV1.ts`
   - supporting stage files under `lib/goal-lab/pipeline/*`
3. Pipeline contract docs:
   - `docs/PIPELINE.md`
   - `docs/IDS_AND_NAMESPACES.md`

## 2) Decision path (goal → utility → action)

1. Candidate assembly and modifiers:
   - `lib/decision/actionCandidateUtils.ts`
   - `lib/decision/actionProjection.ts`
   - `lib/decision/costModel.ts`
2. Final choice mechanics:
   - `lib/decision/decide.ts`
3. Goal sources:
   - `lib/goals/*`

## 3) Variability + reproducibility path

1. Deterministic RNG/noise channels:
   - `lib/core/noise.ts`
2. Selection variability controls:
   - `lib/decision/decide.ts`
3. Temporal behavior controls:
   - `lib/simkit/*`
4. Repro contract:
   - `docs/REPRO.md`

## 4) Explainability/provenance path

1. Trace-carrying atom contracts:
   - `lib/context/v2/types.ts`
2. Explainability specification:
   - `docs/EXPLAINABILITY.md`
3. Decision trace assembly:
   - `lib/decision/*`

## 5) Formula/coefficients control plane

- Canonical coefficient registry:
  - `lib/config/formulaConfig.ts`
- Policy:
  - no new hidden scoring coefficients in pipeline stages outside FormulaConfig.

## 6) Tests by behavior surface

- Pipeline behavior: `tests/pipeline/*`
- Decision behavior: `tests/decision/*`
- Simulation/runtime behavior: `tests/simkit/*`
- Lens/context behavior: `tests/lens/*`
