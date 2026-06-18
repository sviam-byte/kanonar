# Worklog 2026-06-18 — dynamics estimator, basis sign-audit, real-roster + archetype audits

Session deliverables for the spine program (gated dimensionality / dual-process
agent / validation ladder). Status legend: ✅ done & verified · 🟡 built, run
pending · ⚠️ behavior-affecting production change.

## 1. Validation Ladder · Layer 1 — frozen d_eff estimator ✅

Pre-commit calibration of one dimensionality estimator before applying it to
Kanonar (spine §4).

- Code: `kanonar_behavior_lab/src/dynamics/` (`synthetic.py`, `estimators.py`,
  `calibrate.py`). Estimator = participation ratio (linear) + Grassberger–Procaccia
  correlation dimension (nonlinear, GP scaling window `(1,15)` pctl, Theiler 10).
- Gate: `python -m kanonar_behavior_lab.src.dynamics.calibrate` — **8/8 hard anchors
  green** (Lorenz 1.98/2.06, Rössler 1.89/1.99, Hénon 1.17/1.22, logistic 0.85/1.0,
  PR exact, white-noise ≥2.5).
- Doc: `docs/DYNAMICS_LAYER1_CALIBRATION.md`.
- Known gaps (next L1 increment): delay-embedded scalar path inflates (needs FNN
  dim selection); attractor classifier (RQA + Rosenstein λ + FTLE dist + branching
  ratio σ) not built.

## 2. Static-basis sign-audit harness (Step 0) ✅ (toy basis — provisional)

- Code: `lib/goal-lab/probe/` — `runProbe.ts` (multi-layer readout: S7
  goalLayerSnapshot.domains + S6 drv:* + S8 decisionSnapshot best/ranked.q over N
  seeds), `scenes.ts` (S_neutral/S_vulnerable/S_hierarchy/S_threat), `sweep.ts`,
  `signTable.ts` (frozen), `runBasisSweep.ts`.
- Triage: `kanonar_behavior_lab/src/basis/triage.py` →
  `python -m kanonar_behavior_lab.src.basis.triage`.
- Finding: the basis is **alive and correctly-signed**, but the construct signal
  lives in the CONTINUOUS `act:prior:*` (S8) + `util:plan:*` (S7), not the
  normalized goal-domain aggregates. Care/Power/Safety PASS on act:prior; Power
  invisible on S7 / visible on S8 (confirmed). One DEAD: Liberty_Autonomy.
- **CAVEAT:** ran on a synthetic 0.5 toy agent (14 axes, no archetype/biography).
  Provisional — superseded by §4/§5 below. Doc: `docs/GOAL_LAB_PROBE_HARNESS.md`.

## 3. ⚠️ Gumbel exploration bug fix (production)

`runPipelineV1.ts` passed `() => rng.next()` (raw uint32) to `decideAction`, which
expects `[0,1)` for the Gumbel inverse-CDF → noise clamped to a constant →
**stochastic exploration was dead sim-wide**. Fixed to `nextFloat()` in
`lib/goal-lab/pipeline/runPipelineV1.ts` (~L1142) + hardened the rng-object branch
in `lib/decision/decide.ts`. Effect: action entropy 0 → ~2.2 bits and responds to
`B_decision_temperature`. **Regression: 269 tests green** (decision/pipeline/simkit/
goals/dilemma). Probe agents now get a per-seed `rngChannels.decide`.

## 4. Real-roster basis sweep (ALL ~52 axes × 24 characters) ✅

The toy basis (§2) is replaced by the populated roster.

- Loader: `lib/goal-lab/probe/realAgents.ts` (`loadRosterAgents` via Vite
  `import.meta.glob` of `data/entities/character-*.ts`), reusing the canonical
  personality→params helpers now exported from
  `lib/simkit/plugins/goalLabWorldState.ts` (`deriveLifeGoals`/`deriveGoalTuning`/
  `deriveDriverCurves`/`deriveInhibitionOverrides`/`deriveDriverInertia`) — no
  duplicate mapping.
- `runProbe` extended with `agentTemplate` + `axisDeltas` → δ-sweep
  `clamp01(baseline + δ)` (±0.4) around each character's real value.
- Driver: `lib/goal-lab/probe/rosterSweep.ts` (axis = union of roster vector_base
  keys; per-character endpoint slope rows for movers > 0.02) → `roster_sweep.csv`.
- Triage: `kanonar_behavior_lab/src/basis/roster_triage.py` — population
  sign-consistency per (axis, scene, readout): STABLE (≥0.8 agree) vs SIGN-FLIP
  (<0.65 → basis non-identifiability / spine's compensations). Run:
  `python -m kanonar_behavior_lab.src.basis.roster_triage`.
- Contract test `tests/goals/roster_probe.test.ts` (4/4 green): loads ≥20 real
  agents, axis union > 30, real agent runs the pipeline, sweep emits slope rows.
- Note: map runs at 1 seed (deterministic readouts); the variance readout
  (action_entropy) needs a separate multi-seed pass and is excluded from the map.

**Results (24 chars, 10,418 slope rows, `roster_triage.json`):** only **8 of ~52
canonical axes** drive any readout > 0.02 across the roster — the rest are dead at
this layer (unwired into the goal-lab pipeline, or need affordances the scenes
don't provide: `E_Skill_*`, `E_KB_*`, `F_*`, `G_*`, `A_Causality_Sanctity`,
`A_Justice_Fairness`, etc.). The 8 LIVE axes are correctly-signed AND
population-stable (consistency 1.00 across ~23 chars):
| axis | signature |
|---|---|
| A_Power_Sovereignty | command ↑0.25, threaten ↑0.24 |
| A_Safety_Care | guard ↑0.19, call_backup ↑0.17 |
| C_betrayal_cost | ctxDanger ↑0.43, affiliationNeed ↓0.33, safetyNeed ↑0.32 |
| D_HPA_reactivity | call_backup ↑0.11, threaten ↑0.10 |
| B_tolerance_ambiguity | verify ↓0.13, investigate ↓0.10 |
| C_reputation_sensitivity | statusNeed ↑0.09 |
| A_Legitimacy_Procedure | apologize/accuse ↑0.06 |
| A_Tradition_Continuity | apologize/accuse ↑0.07 |

Key reads:
- **A_Care_Compassion is NOT live on the roster** — most real characters lack that
  axis (`extractCharacter` derives `trait.care` from Safety/Power), so its effect
  is subsumed into A_Safety_Care / A_Power_Sovereignty. (On the toy agent it looked
  like a clean Care PASS; on real data it isn't a separate live axis.)
- **A_Liberty_Autonomy stays DEAD on real characters** too — the toy-basis DEAD
  finding was NOT an artifact. Investigate whether it should be wired beyond the
  `preserve_autonomy` life-goal.
- **One SIGN-FLIP**: C_betrayal_cost → `prior:B:confront` (consistency 0.64) —
  character-dependent direction, exactly the compensation / non-identifiability
  signal the spine predicts.

## 5. Archetype / μ basis audit (separate harness) ✅

Archetype does NOT flow into `runGoalLabPipelineV1` — it has its own readouts.

- Code: `lib/goal-lab/probe/archetypeProbe.ts` + `archetypeSignTable.ts` (frozen
  μ-signatures from `MODE_EFFECTS` / `makeGoals`).
- Readouts: (1) effect vectors via `computeArchetypeEffects`; (2) λ blend
  (shadowActivation 0→1, actual→shadow); (3) **behavior** via `fromArchetype`
  action ranking, mirroring `lib/choice/qvalue.ts:361-392` (faithful to the live
  wiring without constructing a full world).
- Test `tests/goals/archetype_probe.test.ts` (5/5 green): each μ yields its
  pre-registered preferredTags; μ poles produce DISTINCT correctly-signed
  behavioral tops (SR→rebel, SN→coordinate, ON→optimize, OR→deceive); λ blend
  shifts the top from actual toward shadow.
- Open: continuous μ-`mixture` is not in the runtime (agent.archetype uses discrete
  `actualId`/`shadowId`); only discrete identity + λ are sweepable today.

## Running everything (bundled Node — see memory [[node-toolchain-unavailable]])

```
$node = "C:\Users\ЬШ\AppData\Local\ms-playwright-go\1.57.0\node.exe"
& $node node_modules\vitest\vitest.mjs run tests/goals --reporter=basic
python -m kanonar_behavior_lab.src.dynamics.calibrate
python -m kanonar_behavior_lab.src.basis.triage
python -m kanonar_behavior_lab.src.basis.roster_triage
```

## Next

- **v2 sign-table** re-pointed to `act:prior` (frozen after roster results land).
- **Liberty_Autonomy**: confirm DEAD on real characters (toy-basis artifact?) —
  check axis→trait mapping + S_hierarchy defy affordance.
- Phase 4 (collinearity / θ-distinguishability), Step 1 (payoff harness for
  S_contest/S_defection), and Layer-1 attractor classifier.
