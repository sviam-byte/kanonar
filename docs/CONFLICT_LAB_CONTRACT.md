# Conflict Lab Contract

## Project Goal

Conflict Lab is not a catalog of visual conflict cards. It is a deterministic
nonlinear conflict dynamics simulator.

The formal mathematical contract is `docs/CONFLICT_LAB_MATH_SPEC.md`. This
contract is the execution discipline for implementing that model.

The core object is a transition function:

```text
state[t + 1] = F(state[t], parameters, activeMechanic)
```

The same initial state, parameters, and active mechanic must produce the same
trajectory. Any chaos or sensitivity should come from deterministic nonlinear
feedback, thresholds, memory, and state coupling, not from hidden randomness.

If stochastic behavior is needed, it must be isolated behind an explicit seeded
mode and surfaced in trace/telemetry.

## Agent Execution Prompt

When an agent works on Conflict Lab, it must treat this section as an execution
contract.

First classify the task:

1. contract/docs only;
2. mechanic kernel;
3. agent utility or memory;
4. system dynamics or trajectory analysis;
5. UI visualization.

Then follow the required order:

```text
mathematical model -> domain types -> pure engine -> tests -> UI
```

Stop conditions:

- If a requested "new mechanic" can only be implemented as a renamed action
  pool, reject it as a mechanic and mark it as a preset candidate.
- If the domain layer cannot express roles, phases, observation, payoff,
  transition, and validation, refactor that layer before adding more presets.
- If the user asks for UI first, implement only display/wiring for already
  existing domain behavior; do not invent rules in React.
- If typecheck, lint if configured, or relevant tests cannot pass, report the
  blocker instead of claiming completion.

Use the existing repo layout. Do not invent a parallel `src/domain` tree unless
the migration plan explicitly requires it. Current Conflict Lab code lives
primarily in `lib/dilemma/*`, `components/conflict/*`, and `tests/dilemma/*`.

## Code Discipline Contract

Do not implement Conflict Lab features by "just making it work".

Every change must preserve:

- strict TypeScript correctness;
- explicit domain types;
- separation between domain logic, simulation engine, presets, and UI;
- deterministic, inspectable transition logic;
- provenance and trace data for derived choices and outcomes;
- UI resilience without moving domain rules into React components.

Forbidden in Conflict Lab core logic:

- `any` or untyped object blobs as domain models;
- `Record<string, unknown>` as a substitute for a mechanic model;
- stringly typed mechanic names where a union is needed;
- broad `try/catch` that hides invalid state;
- silent fallback to another mechanic, default resolution, or random action;
- weakening types to silence the compiler;
- duplicated mechanic logic hidden in UI components;
- new mechanics that are only labels, cards, or action-weight presets.

A task is not complete unless typecheck, lint if configured, and relevant tests
pass. If validation cannot run or cannot pass, report the blocker explicitly.

## Mechanic Architecture

Do not represent different conflict mechanics as merely different action labels.

Each mechanic must have an explicit mechanic kernel with:

- mechanic kind;
- roles;
- phases;
- available actions per role and phase;
- observation model;
- payoff function;
- state transition function;
- validation rules;
- tests for expected behavior.

Required separation:

```text
character psychology != mechanic rules != UI preset != state transition
```

The character utility model may score valid actions. It must not decide which
actions are legal, which phase the game is in, what information is visible, or
how payoff/transition rules work.

For every new mechanic, document what mathematically distinguishes it from the
others. If a proposed mechanic is only a renamed action pool with different
weights, reject it or mark it as a preset, not a new mechanic.

Current repo reality: `lib/dilemma/mechanics.ts` currently defines
`MechanicTemplate` entries with `actionPool` and `payoffVs`. Treat that as a
transitional catalog, not the final mechanic-kernel architecture.

## Type Discipline

Use strict TypeScript domain modeling.

Prefer:

- discriminated unions for mechanic kinds;
- explicit exported return types;
- branded ids for player, action, and mechanic ids when useful;
- readonly config objects where mutation is not intended;
- exhaustive switch checks via `assertNever`;
- separate types for config, runtime state, action, observation, result, and
  validation error.

Avoid:

- optional fields that are required for some mechanic kinds;
- shared mega-types where most fields are invalid for most mechanics;
- unvalidated JSON-shaped configs;
- casts such as `as Something` only to silence TypeScript;
- `// @ts-ignore` or `// @ts-expect-error` without a documented unavoidable
  reason.

A type is good only if it prevents invalid mechanic states from being
represented or makes them explicit.

## Domain Invariants

Before writing mechanic code, identify the invariants of the mechanic.

Examples:

- ultimatum: responder cannot accept before proposer has made an offer;
- ultimatum: rejected offer gives zero material payoff to both sides;
- signaling: receiver cannot observe hidden type directly unless the mechanic
  allows it;
- authority: subject cannot issue authority-only commands;
- simultaneous dilemma: both players choose before resolution;
- resource split: shares must sum to 1;
- trust exchange: betrayal must be possible but not forced;
- volunteer dilemma: if nobody volunteers, collective failure must occur.

Encode invariants in types where possible. Otherwise encode them in validation
functions and tests. Never rely only on UI disabling to enforce domain rules.

## Error Handling

Do not hide domain errors with broad `try/catch`.

Expected domain failures should use Result-like values:

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Use Result-like returns for invalid action, invalid phase, invalid role, invalid
split, invalid config, and impossible user-requested transitions. Throw only for
programmer errors that should be impossible after validation.

Allowed `try/catch` belongs at system boundaries:

- parsing JSON;
- reading external files;
- unsafe user input boundaries;
- persistence/localStorage boundaries.

The domain engine must be deterministic and must not depend on exceptions for
normal control flow.

## New Mechanic Protocol

When implementing a new mechanic, follow this order:

1. Define the mathematical structure in plain text: players, roles, phases,
   information visibility, action space, payoff rule, state transition, and
   edge cases.
2. Define TypeScript types: mechanic config, mechanic state, action union,
   observation, result, and validation errors.
3. Implement pure domain functions:
   - `getAvailableActions`;
   - `validateAction`;
   - `resolveMechanic`;
   - `applyTransition`;
   - `getObservationForPlayer`.
4. Add React-independent unit tests for valid paths, invalid phase/action, role
   restriction, payoff correctness, transition correctness, hidden information,
   and determinism.
5. Only then connect the mechanic to presets or UI.

Do not start from UI cards, labels, or visual preset data.

## Testing Discipline

Every mechanic must have unit tests independent of React.

Minimum required tests per mechanic:

- available actions depend on role and phase;
- invalid action is rejected;
- payoff matches the formal rule;
- state transition updates only intended fields;
- hidden information remains hidden where required;
- deterministic fixtures produce deterministic outcomes.

For stochastic behavior:

- inject RNG;
- seed RNG in tests;
- never call `Math.random()` directly inside domain logic.

If a mechanic has no tests, it is not considered implemented.

## Self-Review Checklist

Before reporting completion, review the diff against these questions:

1. Did I add real mechanic structure, or only new labels?
2. Are roles and phases represented in types?
3. Can invalid states be represented? If yes, why is that acceptable?
4. Is any domain logic hidden in React?
5. Did I add or update tests for behavior changes?
6. Did I avoid `any`, broad `try/catch`, silent fallback, and type weakening?
7. Does `npm run typecheck` pass?
8. Does lint pass if configured?
9. Do relevant tests pass?
10. Did I document what mathematically distinguishes the mechanic?

If any answer is bad, fix it before final response or report the blocker.
