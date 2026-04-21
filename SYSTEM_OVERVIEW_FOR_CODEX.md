# SYSTEM OVERVIEW FOR CODEX (Canonical Control Plane)

This file is the **single entry point** for agents and humans who need to modify Kanonar safely.

Priority order for truth recovery:
1. `SYSTEM_OVERVIEW_FOR_CODEX.md` (this file)
2. `CANONICAL_PATHS.md`
3. `STATUS_MAP.md`
4. `TRUST_MAP.md`
5. `DOMAIN_MAP.md`
6. `SYSTEM_OVERVIEW_FOR_CODEX.manifest.json` (machine-readable mirror)

---

## 1) What is canonical

Canonical model docs:
- `docs/PIPELINE.md`
- `docs/INVARIANTS.md`
- `docs/IDS_AND_NAMESPACES.md`
- `docs/EXPLAINABILITY.md`
- `docs/REPRO.md`
- `docs/agents/00_README.md`

Canonical implementation surfaces:
- Pipeline runtime: `lib/goal-lab/pipeline/*`
- Context contracts: `lib/context/v2/*`
- Decision runtime: `lib/decision/*`
- Formula knobs: `lib/config/formulaConfig.ts`
- Deterministic noise/RNG: `lib/core/noise.ts`
- Goal catalog + context shaping: `lib/goals/*`

---

## 2) Canonical execution path (high-level)

1. Scenario/world/personality inputs are normalized into context atoms.
2. Pipeline stages produce and refine hypotheses/goal-related atoms (`S0…S*`).
3. Final context namespace is consumed by decision system.
4. Decision system builds action candidates and computes utility/cost tradeoffs.
5. Selection uses deterministic variability controls (seeded RNG, tie handling, temperature).
6. Runtime/simkit applies behavior memory, cooldown, stale cleanup, and iteration effects.

Detailed file mapping is specified in `CANONICAL_PATHS.md`.

---

## 3) Non-negotiable invariants (do not break)

- Determinism:
  - No hidden randomness in core logic.
  - Reproducible outputs for the same seed + config.
- Explainability / traceability:
  - Do not silently drop provenance (`usedAtomIds`, trace parts, notes, modifier traces).
- Stage discipline:
  - Respect pipeline stage contracts and allowed namespace transitions.
- Namespace discipline:
  - Post-S3 consumers should use `ctx:final:*` (except explicit/documented fallbacks).
- Energy/scoring semantics:
  - Mass/score propagation must remain explicit and auditable.
- Safety:
  - Guard UI-facing transforms against undefined collections.
  - Validate boundary payloads (API/model/view transitions).

Source contracts for invariants:
- `docs/INVARIANTS.md`
- `docs/PIPELINE.md`
- `docs/EXPLAINABILITY.md`
- `docs/REPRO.md`

---

## 4) Variability ownership

Canonical variability modules:
- RNG channels / seeded noise: `lib/core/noise.ts`
- Action selection variability (Gumbel/temperature/tie rules): `lib/decision/decide.ts`
- Repetition decay / novelty relief: `lib/decision/actionCandidateUtils.ts`
- Cooldown, stale cleanup, behavior memory: `lib/simkit/*`

Hard rule:
- Never introduce `Math.random()` into core scoring/selection paths.

---

## 5) Legacy / compat boundaries

Use `STATUS_MAP.md` for strict status labels:
- `canonical`: current source of truth.
- `compat`: compatibility layer; allowed but not canonical for new semantics.
- `legacy`: old behavior retained for migration/runtime tolerance.
- `archive`: historical/reference only.

Do not promote compat/legacy behavior to canon silently.

---

## 6) Patch protocol for agents

When changing behavior:
1. Confirm affected canonical stage/domain in `CANONICAL_PATHS.md`.
2. Verify invariant impact before coding.
3. Update tests in relevant domain folders.
4. If invariant or stage contract changes, update docs (`docs/PIPELINE.md`, `docs/INVARIANTS.md`).
5. Explicitly call out contract drift if docs/tests/impl disagree.

When changing docs/comments only:
- No test run required by local agent policy.

---

## 7) Anti-trust list (do not treat as sole source of truth)

- `archive/*`
- UI-heavy integration files as domain canon by default:
  - `components/*`
  - `pages/*`
- Giant compatibility hubs without canonical status confirmation:
  - `types.ts`
  - `components/GoalSandbox/GoalSandbox.tsx`

Use `TRUST_MAP.md` for full confidence mapping.
