# Invariants (must hold)

## Namespace / stage invariants

- S0: запрещены `ctx:*`
- S2: разрешены `ctx:*`, запрещены `ctx:final:*`
- S3: обязаны появиться `ctx:final:*`
- S7: goal derivation использует `ctx:final:*`, не `ctx:*` (без final)
- S8: actions не читают `goal:*` напрямую (только `util:*`)

## Goal ↔ Action isolation

Единственный мост между goal-уровнем и decision/action — `util:*` проекция.

## Trace invariants

Если атом вычислен из других атомов, он должен указывать зависимости в:
- `trace.usedAtomIds`

## Documentation discipline

Если меняется:
- outputs стадии → обновить `docs/PIPELINE.md`
- новое “нельзя/надо” → обновить `docs/INVARIANTS.md` + тест

## Belief feedback loop invariants

- `belief:surprise:*` должен сохраняться в `pipeline.beliefPersist.beliefAtoms` (а не только в frame atoms), иначе петля S9→S0→S6 разрывается.
- S6 может усиливать `drv:*` только через явный конфиг (`FC.drivers.surpriseFeedback`) с верхней границей (`maxBoost`) и trace-полем `parts.surpriseBoost`.

### Belief persistence completeness (v27+)

beliefPersist.beliefAtoms MUST include both prediction atoms AND surprise atoms.
Surprise atoms are consumed by S6 (deriveDrivers) on the next tick.
If surprise atoms are not persisted, the POMDP feedback loop is broken.

### FormulaConfig completeness (v27+)

All numeric coefficients in pipeline stages S0–S9 MUST be sourced from
`lib/config/formulaConfig.ts`. Local hardcoded constants are treated as bugs.
Run `grep -rn "0\.\d\+" lib/drivers/ lib/decision/ | grep -v formulaConfig`
to detect violations.
