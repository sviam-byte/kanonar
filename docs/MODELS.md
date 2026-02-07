# Models (lens, energy, goals) — v69

This file summarizes the mathematical models used in Goal Lab and the correctness criteria
that tests should enforce.

Sources of truth:
- lens: `lib/context/lens/characterLens.ts` (`modulate`)
- energy propagation: `lib/graph/atomEnergy.ts` (`propagateAtomEnergy`)
- goal derivation/projection: `lib/goals/goalAtoms.ts`

---

## A) Character lens model (S3)

The lens maps base context axes to subjective axes using character traits/body features.

Contract:
- inputs: `ctx:<axis>:<agentId>` + `feat:char:<agentId>:trait.*` + `feat:char:<agentId>:body.*`
- output: `ctx:final:<axis>:<agentId>`
- neutrality: when all traits/body are at 0.5, `ctx:final ≈ ctx:base`

See `docs/ORACLES.md` (Section 1) for numeric tests.

---

## B) Goal and utility model (S7)

Goals are computed from subjective context (`ctx:final:*`), drivers (`drv:*`), and
optional memory/relationship signals.

Contract:
- goals must cite `ctx:final:*` in trace (final-first rule)
- utilities are a projection from goals (`goal:*`) into `util:*`
- actions must only read `util:*` (no direct goal access)

See `docs/ORACLES.md` (Sections 2–3) for dependency tests.

---

## C) Energy propagation model (explainability overlay)

Energy is propagated along trace edges for explainability. The model is a linear damped
push with retention and uniform split.

Contract:
- non-negativity and mass conservation (with or without sinks)
- no-source stability (zero remains zero)
- attribution completeness for non-zero nodes

See `docs/ORACLES.md` (Section 4) for numeric tests.
