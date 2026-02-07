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
