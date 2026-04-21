# DOMAIN MAP (module ownership by responsibility)

Purpose: provide fast routing for agents so patches land in the correct layer.

## Core decision/control domains

- **Context contracts and inference**
  - `lib/context/v2/types.ts`
  - `lib/context/v2/infer.ts`
- **Pipeline execution/stages**
  - `lib/goal-lab/pipeline/*`
- **Decision engine**
  - `lib/decision/*`
- **Goal catalog + goal-context shaping**
  - `lib/goals/*`
- **Formula configuration (global knobs)**
  - `lib/config/formulaConfig.ts`
- **Deterministic noise / RNG channels**
  - `lib/core/noise.ts`
- **Simulation temporal controls**
  - `lib/simkit/*`

## World / behavior extensions

- World state and entities: `lib/world/*`
- Dilemmas and scenario pressure: `lib/dilemma/*`
- Theory-of-mind and social reasoning: `lib/tom/*`, `lib/social/*`
- Data inputs: `data/*`

## Integration/UI domains (non-canonical for behavior)

- UI components: `components/*`
- Page/routes orchestration: `pages/*`
- Client hooks/integration: `hooks/*`

## Ownership conventions

- Behavior changes should start in canonical core domains.
- UI/integration layers consume domain contracts; they should not define canonical semantics.
- New scoring coefficients in pipeline/decision belong in `lib/config/formulaConfig.ts`.
