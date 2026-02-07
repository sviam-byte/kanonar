# Testing & validation

## Minimal validation (always)
Run the fastest checks available in the repo; typical set:
- typecheck
- unit tests
- build

Because scripts differ, discover via:
- cat package.json | rg -n "\"scripts\"|test|typecheck|build|lint"

Common commands (if present):
- npm test / pnpm test
- npm run typecheck
- npm run build
- npm run lint

## Determinism checks (recommended)
If the system has seed/temperature:
1) Run twice with the same seed ⇒ identical selected goal and energies.
2) Run with different seeds ⇒ behavior differs within expected envelope.

## Propagation safety checks
Add tests that assert:
- Empty graph does not crash.
- Missing edges/nodes do not crash.
- Energy does not become NaN/Infinity.

## UI smoke checks
If there is a dev server:
- ensure DecisionGraph view loads without console errors
- ensure lazy deps (AFRAME) don’t crash on first render
