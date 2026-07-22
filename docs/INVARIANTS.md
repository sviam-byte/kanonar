# Invariants (must hold)

## Namespace / stage invariants

- S0: запрещены `ctx:*`
- S0: запрещены `action:*`, `util:*`, `drv:*`
- Atom namespaces must be canonical or documented legacy aliases in `lib/context/v2/namespaces.ts`.
- S0: до запуска downstream стадий должна быть выполнена валидация размещения (`placementValidation`); невалидная сцена должна быть явно помечена в артефактах/фактах.
- S2: разрешены `ctx:*`, запрещены `ctx:final:*`
- S3: обязаны появиться `ctx:final:*`
- S7: goal derivation использует `ctx:final:*`, не `ctx:*` (без final)
- S8: actions не читают `goal:*` напрямую (только `util:*`)

## Goal ↔ Action isolation

Единственный мост между goal-уровнем и decision/action — `util:*` проекция.

- Непрозрачные ID внешних possibilities нельзя разбирать для восстановления
  семантики действия. Продюсер передаёт типизированный `actionKey`; возврат в
  kernel выполняется только по точному совпадению projection row.
- Набор допустимых действий механики входит в реальный S8 через
  `externalPossibilityMode='replace'`; повторная сборка/оценка после завершённого
  S8 не является каноническим Conflict choice.

## Intent/Schema traceability invariants

- Кандидаты Layer F/Layer G обязаны сохранять explainability-поля (`family`, `goalContribs`, `dialogueHook`/`desiredEffect`, `trace.parts`).
- Schema→dialogue bridge в S8 должен явно указывать источник (`schemaLayer` или `legacy`) в артефактах.

## Trace invariants

Если атом вычислен из других атомов, он должен указывать зависимости в:
- `trace.usedAtomIds`

- Goal-energy lookup follows canonical atom order: the first atom for a key
  wins. Every ranked Conflict candidate must retain the atom IDs for the goal
  energies actually used in its score; aggregate `usedAtomIds` on the chosen
  candidate alone is not complete provenance.

## Conflict N-kernel invariants

- Participant/role IDs that collide with own `Object.prototype` keys are
  invalid before any `Record` is constructed; composite pair keys must use an
  injective tuple encoding.
- N-step accepts only the exact canonical `trust_exchange` protocol structure.
- Forced pairwise N≥2 step/trajectory/analysis and the externally supplied
  directed action-matrix step may run experimentally. A matrix contains exactly
  `N*(N-1)` cells, each unordered pair consumes only its two directed cells,
  and N>2 outcome/history must never invent a surrogate player action. N=2
  matrix execution preserves legacy state/history and dyadic outcome bytes.
- Actor-level `runConflictNJointDecisionV1` and `runConflictNLabSessionV1`
  remain dyad-only. Canonical N>2 GoalLab choice/session must use the additive
  target-matrix lane, with one complete S8 trace and one independently seeded
  named RNG channel per directed cell.
- Directed-cell RNGs are created once per session in canonical actor-major,
  target-major order and persist across rounds. Changing one cell's evidence,
  candidates or RNG consumption must not change any other cell.
- Live Conflict round budgets are finite integers in `1..30`; no clamping,
  flooring, or silent fallback is permitted.
- N-analysis never throws for caller-supplied state mismatch; it returns typed
  `invalid_state` or `participant_set_mismatch` results.

## Versioning invariants

- Single source of system version truth: `lib/goal-lab/versioning.ts` -> `KANONAR_SYSTEM_VERSION`.
- GoalLab contracts may keep local `schemaVersion` values for wire compatibility, but they MUST carry the same top-level `systemVersion`.
- New control-plane contracts MUST import version constants/helpers from `lib/goal-lab/versioning.ts`; new inline `schemaVersion: <number>` literals in contract code count as tech debt.
- `schemaVersion` identifies payload shape compatibility; `systemVersion` identifies the Kanonar build semantics that produced the payload. These roles must stay separate.

## Documentation discipline

Если меняется:
- outputs стадии → обновить `docs/PIPELINE.md`
- новое “нельзя/надо” → обновить `docs/INVARIANTS.md` + тест

## Belief feedback loop invariants

- `belief:surprise:*` должен сохраняться в `pipeline.beliefPersist.beliefAtoms` (а не только в frame atoms), иначе петля S9→S0→S6 разрывается.
- S6 может усиливать `drv:*` только через явный конфиг (`FC.drivers.surpriseFeedback`) с верхней границей (`maxBoost`) и trace-полем `parts.surpriseBoost`.

## Memory v1 invariants

- При effective `runtimeMechanics.memoryThreatTraceV1=true` confidence принятого threat trace
  вычисляется только как `c0 * decayPerTick^age`, где
  `age = currentTick - lastObservedTick`.
- Повторное умножение уже затухшего confidence на `decayPerTick^age` запрещено:
  результат не должен зависеть от числа промежуточных вызовов persistence.
- В GoalLab из `mem:memory:*` проецируются только явно tagged
  `{speech, threat}` entries; action-memory сохраняет legacy-семантику.
- No-profile/legacy ветвь обязана сохранять поведенческую семантику MVP-0.
  Provenance-only исправления требуют явного re-pin с объяснением. Проверки:
  `tests/simkit/memory_threat_v1.test.ts`, `tests/simkit/mvp0_golden.test.ts`.

## Runtime profile invariants

- Runtime profile is per run: `world.facts['sim:runtimeProfile']` in SimKit or
  `sceneControl.runtimeProfile` in direct GoalLab calls.
- `phase1` enables communication threat, object context, location properties,
  threat memory, prior influence, PAM v2, S5 OpponentBelief dual-emit and the
  active-goal/domain energy union without mutating global `FC`.
- `tom.opponentBeliefS5V1` is ON by default only for `phase1`. It remains OFF
  for `legacy` and no-profile/config runs. Object form
  `{ profileId, opponentBeliefS5V1: true|false }` is the explicit opt-in/rollback
  seam. Gate:
  `tests/simkit/runtime_mechanics_profile.test.ts`.
- `actionScoring.goalEnergyDomainUnionV1` is ON by default only for `phase1`.
  It merges active-goal and domain-keyed energy before S8 scoring, with
  active-goal keys winning collisions. `legacy` and no-profile/config remain
  OFF; object form `{ profileId, goalEnergyDomainUnionV1: true|false }` is the
  explicit opt-in/rollback seam. Gates:
  `tests/decision/goal_energy_domain_union.test.ts` and
  `tests/simkit/runtime_mechanics_profile.test.ts`.
- No explicit profile continues to resolve the current FormulaConfig defaults;
  `legacy` is an explicit all-OFF control.
- Same state + same seed + same profile must produce the same semantic output.
- Explicit profiles must be visible in stage/runtime trace. Reactive branches
  must show the profile and explicitly report that pipeline C(t) is unavailable.
- C(t) retention state belongs to resettable world facts, not plugin closure
  state, so simulator reset cannot leak EMA/held state across runs.

### Belief persistence completeness (v27+)

beliefPersist.beliefAtoms MUST include both prediction atoms AND surprise atoms.
Surprise atoms are consumed by S6 (deriveDrivers) on the next tick.
If surprise atoms are not persisted, the POMDP feedback loop is broken.

### Coefficient ownership

Every new or changed scoring coefficient in S0–S9 must be placed in
`lib/config/formulaConfig.ts` or `lib/config/formulaConfigSim.ts`, unless the
mechanism is an explicitly versioned frozen observable such as `TENSION_V1`.
Existing local tables in `lib/decision/actionProjection.ts` and related legacy
paths are known migration debt, not evidence that centralization is complete.
Tests and documentation must name the real owner of each coefficient family.
