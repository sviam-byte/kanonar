# Workflows (how to add/change things safely)

## A) Adding a new energy channel
1) Add the channel name to the canonical list (single source of truth).
2) Update any per-channel weight vectors w(t) and defaults.
3) Update any UI legends / breakdown renderers.
4) Add unit tests:
   - channel contributes to score
   - trace shows per-channel contribution

Guards:
- Do not silently treat missing channels as 0 without logging (or the agent will “lose” signal).

## B) Adding a new expert/mode (MoE)
1) Implement expert scorer S^{(e)} in isolation.
2) Add routing π_e(x_t) with deterministic behavior under seed.
3) Ensure trace includes: π_e values, selected expert, and expert-specific contributions.
4) Add tests:
   - routing changes with input state as expected
   - same seed reproduces expert choice if stochastic

## C) Changing propagation
1) Decide whether W is directed.
2) Enforce or document normalization rule (row-stochastic or explicit cap).
3) Add tests for boundedness / no crash on empty edges.
4) Update docs/agent/20_MATH_MODEL.md if semantics changed.

## D) Fixing UI graph crashes
Rules:
- Any `.map()` must be guarded if the value can be undefined.
- Any lazy dependency (AFRAME, etc.) must be imported/loaded safely.
- Graph view must render a fallback if data is missing.

## E) Adding knobs (temperature, inertia, thresholds)
1) Add to a typed config schema.
2) Default values must be stable and documented.
3) Add to trace/log output.
4) Add tests that changing the knob changes behavior.

## F) SimKit dual-process / narrative extensions
When changing simulator-only cognition/perception dynamics:
1) Keep simulator coefficients in `lib/config/formulaConfigSim.ts` (`FCS.*`), not in local constants.
2) If decision routing changes (`deliberative`/`degraded`/`reactive`), ensure mode + gate payload are preserved in `action.meta`.
3) Keep post-step updates deterministic and explicit: relation drift, nonverbal observations, beat detection, tension curve.
4) Add/adjust focused tests in `tests/simkit/*` and run full `npm test` to catch cross-pipeline regressions.
