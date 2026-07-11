# METRIC-INVENTORY-0 — метрики Entity Detail

Статус: DONE. Дата: 2026-07-11. Scope: вкладка `Симуляция (SDE)` страницы
Entity Detail и реально вызываемые вложенные компоненты `MetricsDashboard`.
Runtime, UI и формулы не изменялись.

## Live path

```text
EntityDetailPage(paramValues, branch, blackSwans)
  -> useCharacterCalculations(character, branch, socialEvents=[])
     -> calculateAllCharacterMetrics
        -> derived metrics + V4.2 + ToM + behavioral advice
  -> useEntityMetrics(entity, 90 days, calculations, blackSwans, branch)
     -> simulateCharacter(seed=42, ensemble=16)
     -> SDE snapshot/stability/scenario fitness
  -> MetricsDashboard
```

Важное различие: placeholders `S=50`, `Vsigma=50`, пустые scenario/simulation
массивы из `calculateAllCharacterMetrics` не доходят до dashboard для живого
персонажа. `useEntityMetrics` заменяет их результатом 90-дневной seeded
симуляции. Они остаются compatibility fillers для прямых потребителей
`FullCharacterMetrics`.

## Inventory: SDE and stability

| metric id | UI label/path | source/formula | range/unit | update trigger | downstream | placeholder/duplicate | decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Vsigma` | Хаотичность (Vσ), thermometer | `simulateCharacter.mean[0].Vsigma`; SDE volatility from `lib/sde.ts` | UI scale `0..100` | entity/branch/black-swan/calculation change; fixed seed 42 | color thresholds, monster veto, scenario fitness | real for character; direct `calculateAllCharacterMetrics.Vsigma=50` is bypassed duplicate filler | keep |
| `vsigma_components.*` | Риск-поза, Гигиена, Апофения, Дисциплина, Тьма, База | `initialState.vsigma_components` from simulation initialization | signed/internal contributions; UI displays only positive relative share | simulation rebuild | breakdown bar only | negative/zero components hidden; labels are UI aliases | keep |
| `S_star` | Стационарная точка S* | `κμ/(κ+h)` in `sde.ts` / `sde-helpers.ts` | `0..100` | SDE t0 diagnostics | equilibrium panel, DS | real for character; absent for object branch | keep |
| `S_ss` | Trait S | initial simulated character state `S` | `0..100` | simulation rebuild | equilibrium panel | label says trait although initial state also uses SDE diagnostics | keep |
| `scenario_S` | Scenario S | `100 * (0.5*mean(S)/100 + 0.5*(1-frac(S<40)))` | `0..100` | 90-day mean trajectory changes | equilibrium panel | unavailable for empty trajectory | keep |
| `DS` | DS | `abs(S*_stressed - S*_base)/20`, stress perturbation +20 | internal sensitivity scalar | entity parameters change | equilibrium panel | not scene sensitivity; static perturbation | keep |
| `DR` | DR | percent of 16 runs whose minimum S remains above 40 | percent `0..100` | ensemble rerun | equilibrium panel | fixed ensemble/seed; not statistical confidence | keep |
| `N_pillar` | N | SDE diagnostic `N`, divided by 100 in UI | displayed `0..1` | simulation rebuild | equilibrium panel | `??0` turns missing diagnostic into zero | keep |
| `H_pillar` | H | SDE diagnostic `H_p`, divided by 100 in UI | displayed `0..1` | simulation rebuild | equilibrium panel | same missing-to-zero fallback | keep |
| `C_pillar` | C | SDE diagnostic `C`, divided by 100 in UI | displayed `0..1` | simulation rebuild | equilibrium panel | same missing-to-zero fallback | keep |
| `mu` | μ | SDE target from `(N+H+C)/3` plus bounded modifiers; UI receives t0 μ/100 | `0..1` | simulation rebuild | S* and sensitivities | UI assumes normalized input | keep |
| `kappa` | κ | SDE restoring stiffness | approximately `0..0.3` UI scale | simulation rebuild | S*, state dynamics | no direct component test | keep |
| `h` | h | SDE destructive pressure | approximately `0..0.1` UI scale | simulation rebuild | S*, state dynamics | no direct component test | keep |
| `simulationData[0].S` | Waterfall S(t) | first ensemble-mean SDE point | percent-like `0..100` | simulation rebuild | waterfall | `||0` fallback can hide malformed point | keep |
| `deltaS_inertia` | Инерция | `-ζ*v*dt*100` | percentage-point delta | simulation rebuild | waterfall | zeros are filtered from display | keep |
| `deltaS_restoring` | Восстан. | `κ*(μ-S_norm)*dt*100` | percentage-point delta | simulation rebuild | waterfall | zeros are filtered | keep |
| `deltaS_destroyer` | Разруш. | `-h*S_norm*dt*100` | percentage-point delta | simulation rebuild | waterfall | zeros are filtered | keep |
| `deltaS_shock` | Шок | `shock_J*(1-S/100)*100` | percentage-point delta | black swan / seeded run | waterfall | zeros are filtered | keep |
| computed end | S(t+1) | UI cumulative sum of four displayed deltas plus S(t) | `0..100` expected, not explicitly clamped in component | simulation data change | waterfall | UI reconstruction duplicates SDE next-state presentation | keep |
| `scenarioFitness[*]` | Годность по сценариям: dynamic title, ok/fail score, checks | `data/scenarios[*].calculateFitness` over snapshot metrics and effective params | score display, nominally `0..100`; status enum also allows `warn`, UI renders every non-`ok` as `fail` | entity/metrics/branch change | scenario badges | `warn` is mislabeled `fail` | connect real source |

## Inventory: visible derived risk metrics

All seven values come from `calculateDerivedMetrics` in `lib/derived-metrics.ts`.
They are sigmoid outputs in `(0,1)` and recompute when the character, branch or
event-adjusted parameters change.

| id | UI label | formula family/source | known fallback or issue | decision |
| --- | --- | --- | --- | --- |
| `rho` | ρ / Рисковость | risk posture from RP, autonomy, power, EW, CH, reputation sensitivity, temperature | missing inputs default to 0.5 | keep |
| `lambda` | λ / Эмо-лабильность | HPA, stress/arousal EMA delta, forgetting noise, temperature, sleep resilience, self-concept | absent EMA deltas become 0 | keep |
| `iota` | ι / Импульсивность | temperature, discounting, cooldown, metacognition, fatigue | fatigue defaults to 0 | keep |
| `chaosPressure` | χ / Хаос-давление | SO−CH, observation/report noise, verification/STEM | missing noise defaults to 0.5 through `getParam` | keep |
| `socialFriction` | φ / Соц. трение | dominance/empathy split, reciprocity, loyalty, betrayal cost, dark susceptibility | conceptual scalar, not observed social friction | keep |
| `reputationFragility` | ℱ / Реп. хрупкость | reputation sensitivity, visibility lag, OPSEC, diplomacy signature, dark exposure | missing diplomacy expression has redundant fallback after `getParam` | keep |
| `darkTendency` | δ / Тёмная тяга | dark exposure, moral injury, HPA, EW, SD, civic knowledge | internal simulation scalar only | keep |

The dashboard does not render `resilience`, `antifragility`, `regulatoryGain`,
`sensoriumReliability`, `sleepPressure`, `energyMargin`, `Vsigma_*`,
`body_tail_risk` or `load_capacity`; they are outside this first UI scope.

## Confirmed false zeros

| id/label | reason | decision |
| --- | --- | --- |
| `derivedMetrics.goalTension` / Напряжение | `calculateAllCharacterMetrics` calls `calculateDerivedMetrics(..., goalEcology=null)` before deriving goal ecology; formula therefore returns `0` every time in this path | connect real source |
| `derivedMetrics.frustration` / Фрустрация | same null input; UI displays `0.00`, not unknown | connect real source |
| `linterIssues=[]` | Entity Detail hardcodes an empty array; `MetricsDashboard` neither renders the prop nor uses imported `LintBadges` | hide |

`goalTension` and `frustration` must be recomputed after `deriveGoalCatalog`, or
the UI must mark them unavailable. Retaining `0.00` claims a confirmed neutral
state that was never calculated.

## Inventory: V4.2 display

All values are produced by `calculateV42Metrics` from normalized character
parameters, latent metrics, fixed `Pv_norm=0` in `calculateAllCharacterMetrics`,
and optional ToM v2 feedback. Runtime formulas are in
`lib/character-metrics-v4.2.ts`; UI formula templates are duplicated in
`lib/formulas/registry.ts`.

| id | visible label | purpose/formula family | range/unit | downstream | issue | decision |
| --- | --- | --- | --- | --- | --- | --- |
| `V_t` | V | bounded valence from meaning, SO, exploration/memory and physiological costs | nominal `0..1` | advice/other metric consumers | formula registry uses a tanh presentation that is not textually identical to runtime sigmoid | keep |
| `A_t` | A | bounded activation from arousal/HPA minus sleep/fatigue | `0..1` | WMcap, TailRisk | duplicate registry formula | keep |
| `WMcap_t` | WMcap | cognitive capacity × arousal/stress curves | nonnegative, intended `0..1` | DQ, PlanRobust, advisor | formula button cannot resolve values here because dashboard does not pass `agent` context | keep |
| `DQ_t` | DQ | decision quality × WM capacity × stress curve | nonnegative, intended `0..1` | RAP | same formula-display limitation | keep |
| `Habit_t` | Habit | habitual-control drive | `0..1` | Agency, advisor | none found | keep |
| `Agency_t` | Agency | agency base suppressed by habit | `0..1` | RAP, advisor | distinct from archetype AGENCY metric | keep |
| `TailRisk_t` | TailRisk | uncertainty/risk linear score through sigmoid | `0..1` | PlanRobust, RAP, advisor | none found | keep |
| `Rmargin_t` | Rmargin | reversibility/stability harmonic mean minus risk | `0..1` after clamp | ToM/advisor | none found | keep |
| `PlanRobust_t` | PlanRobust | SD, CH, WM capacity minus tail/dose fragility | `0..1` | RAP, advisor | none found | keep |
| `DriveU_t` | DriveU | exponential transform of energy/hydration/glucose/O2/pain/sleep deficits | `0..1` | advisor | input normalization silently makes absent numeric params zero | keep |
| `ExhaustRisk_t` | Exhaust | sleep/fatigue/HPA/stamina with stress synergy | `0..1` | Recovery, advisor | none found | keep |
| `Recovery_t` | Recovery | resilience capacity reduced by exhaustion | `0..1` | display | none found | keep |
| `ImpulseCtl_t` | ImpulseCtl | SD/cooldown/civic versus temperature/HPA, scaled by WMcap | `0..1` | display | none found | keep |
| `InfoHyg_t` | InfoHyg | CH/OPSEC geometric core plus verification/fidelity minus exposure/noise | `0..1` | display | none found | keep |
| `RAP_t` | RAP | performance × risk penalty × plan boost, optional ToM penalty | `0..1` | display | `Pv_norm` is hardcoded to 0 in Entity Detail calculation, so performance omits live SDE Pv | connect real source |

Formula ticket required: automatically compare `FORMULA_REGISTRY` templates
against runtime formula/version metadata, and either pass the calculated agent
context to `V42MetricsDisplay` or hide the unresolved `ƒ` interaction. This is
a display/provenance ticket; it does not change the `keep` decision for the
underlying metrics.

## Behavioral Advisor

| visible field | source/status | decision |
| --- | --- | --- |
| recommendation title and description | deterministic rule tree over V4.2 and ToM dashboard metrics in `lib/behavioral-advisor.ts` | optional |
| contributing metric names/values | selected inputs from the fired rule; values are real calculated scalars | optional |

This is rule-based simulation guidance, not validated psychological or real-life
advice. The default “Сбалансированное состояние” means no earlier rule fired; it
is not evidence of measured balance.

## Unknown without scene / runtime probe required

No selected dashboard field requires an interactive GoalLab scene to produce a
number. The page runs a local static/seeded SDE simulation from entity data and
black-swan inputs.

However the following cannot be interpreted as live-scene measurements:

- goal tension/frustration are currently disconnected false zeros;
- ToM inputs used by advice are character/dashboard metrics, not the target-
  specific S5 scene belief contract;
- social-event impacts receive `socialEvents=[]` from Entity Detail, so external
  social events do not participate even though the calculator supports them.

The last item requires `connect real source` if Entity Detail intends to reflect
the repository's social-event catalog.

## Duplicate labels and fields

- `Agency_t` (V4.2) and archetype `AGENCY` are different formulas but can be
  read as the same concept; preserve IDs in labels/docs.
- root `Vsigma`, `stability.Vsigma` and `derivedMetrics.Vsigma_total` have
  different scales/owners. Dashboard uses root SDE `Vsigma`.
- `S`, `S_ss`, `S_star` and `scenario_S` are distinct initial, equilibrium and
  trajectory summaries; current short labels need source/status metadata in the
  later metric catalog.
- `TailRisk_t` and `derivedMetrics.body_tail_risk` are different metrics;
  dashboard renders V4.2 `TailRisk_t`.
- V4.2 formulas exist both in runtime and `FORMULA_REGISTRY`.

## Test evidence

Directly found:

- `tests/metrics/social_events_determinism.test.ts` covers explicit-time social
  event decay only.

Not found:

- direct `MetricsDashboard` rendering/field test;
- `useEntityMetrics` seeded reproducibility test;
- goal tension/frustration connection regression;
- V4.2 formula-registry parity test;
- scenario `warn` rendering test;
- scale/unit contract for S/Vσ/pillars;
- test that partial V4.2 payloads are shown as unknown rather than zero.

## Decision summary

Keep:

- live SDE/stability/waterfall values;
- seven rendered risk scalars;
- fifteen V4.2 metrics.

Connect real source:

- goal tension and frustration after goal ecology exists;
- RAP performance input if it is intended to use live SDE Pv;
- scenario `warn` status rendering;
- external social events if Entity Detail claims to include them.

Optional:

- Behavioral Advisor and its contributing-metric explanation.

Hide:

- unused `linterIssues`/`LintBadges` contract until a real producer is wired.

Formula tickets required:

- runtime/registry formula parity and formula-version provenance;
- explicit scale/unit catalog for SDE, derived and V4.2 families.

## Acceptance

- Every rendered dashboard label/field family has a source, status and one
  decision.
- Confirmed false zeros, missing scene/runtime meaning, mock/broken inputs,
  duplicate fields and formula tickets are listed separately.
- No UI label, formula or runtime behavior was changed.

## Assumptions and limitations

Kanonar is a research/prototype simulation system. Variables such as trust, fear,
stress, resentment, affiliation need, or control need are internal simulation
scalars. They are not clinical, psychometric, or experimentally calibrated
measurements.

The system is useful for deterministic simulation, explainable decision
pipelines, sensitivity analysis, comparing rule systems, and prototyping agent
dynamics.

The system must not be presented as a validated psychological, diagnostic, or
real-world behavioral prediction model without external validation.

