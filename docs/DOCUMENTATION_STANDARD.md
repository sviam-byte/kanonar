# Kanonar Documentation Standard

Используйте этот файл как канонический контракт для новой или обновляемой документации в Kanonar. Цель стандарта — не просто «описать систему», а сделать механизмы проверяемыми, воспроизводимыми и привязанными к живому runtime.

## Core rule

Любая нетривиальная математическая или decision-mechanism штука считается задокументированной только тогда, когда по ней можно пройти цепочку:

```text
formula -> meaning -> variables -> ranges/units -> code -> coefficients -> invariants -> tests -> trace -> minimal example
```

Если хотя бы одно звено отсутствует, документация считается неполной.

## Source-of-truth order

Если документация и код расходятся, используйте такой порядок доверия:

1. canonical runtime implementation
2. type contracts
3. tests
4. config files
5. canonical docs
6. UI projections
7. archive / legacy docs

Main anchors for Kanonar:

- `lib/goal-lab/pipeline/runPipelineV1.ts`
- `lib/context/v2/types.ts`
- `lib/config/formulaConfig.ts`
- `lib/config/formulaConfigSim.ts`
- `docs/PIPELINE.md`
- `docs/INVARIANTS.md`
- `tests/pipeline/*`, `tests/decision/*`, `tests/simkit/*`

## Documentation classes

### 1. Entry docs

Purpose: дать внешний вход в проект.

Typical files:

- `README.md`
- `docs/MATH_INDEX.md`
- `docs/WALKTHROUGH_ONE_TICK.md`

### 2. Mathematical specification

Purpose: зафиксировать формулы, переменные, диапазоны и assumptions.

Typical files:

- `docs/agents/05_GOAL_LAB_MATH.md`
- `docs/agents/03_CHARACTER_LENS.md`
- будущие area-specific math docs, если runtime стабилизирован

### 3. Runtime contract

Purpose: зафиксировать, какие стадии/слои что читают и пишут.

Typical files:

- `docs/PIPELINE.md`
- `docs/INVARIANTS.md`
- `docs/IDS_AND_NAMESPACES.md`

### 4. Explainability contract

Purpose: зафиксировать, что trace/UI обязаны показывать.

Typical files:

- `docs/EXPLAINABILITY.md`
- `docs/ORACLES.md`

## Mandatory formula block

Каждая нетривиальная формула должна документироваться этим блоком:

~~~md
## <Mechanism name>

### Purpose

Что механизм моделирует и зачем он нужен.

### Formula

```text
<equation or update rule>
```

### Variables

- `<name>` — смысл, допустимый диапазон, default if missing.
- `<name>` — смысл, допустимый диапазон, default if missing.

### Source of truth

- implementation: `<path>`
- types: `<path>`
- config: `<path>`
- tests: `<path>`
- trace/UI: `<path>`

### Invariants

- invariant 1
- invariant 2
- invariant 3

### Minimal example

Input:

```text
...
```

Calculation:

```text
...
```

Output:

```text
...
```

### Failure modes

- what would count as a bug
- what must not be silently clamped or fallbacked
- what must be visible in trace
~~~

Не публикуйте «голые» формулы без этого блока.

## Coefficient policy

Все численные коэффициенты pipeline- и simulation-логики должны иметь явный source of truth:

- GoalLab / decision / pipeline coefficients: `lib/config/formulaConfig.ts`
- SimKit / simulation coefficients: `lib/config/formulaConfigSim.ts`

Документация не должна вручную дублировать большие таблицы коэффициентов. Вместо этого:

- объясняйте семьи коэффициентов и их смысл;
- ссылайтесь на config как на канонический источник;
- отмечайте, какие tests и trace fields проверяют поведение.

Если в коде появляется новый коэффициент, но:

- он не вынесен в config;
- не имеет объяснимого смысла в docs;
- не привязан к test/trace surface,

то изменение не считается готовым.

## Required language rules

Пишите точным, не-маркетинговым языком.

Хорошо:

```text
Kanonar models deterministic internal simulation variables for agent decision dynamics.
```

Плохо:

```text
Kanonar predicts real human psychology.
```

Хорошо:

```text
`trust`, `fear`, and `stress` are bounded internal simulation scalars.
```

Плохо:

```text
The model measures trust, fear, and stress.
```

Хорошо:

```text
The canonical path is deterministic. Seeded stochastic modes must be explicit and traceable.
```

Плохо:

```text
The system is mostly deterministic.
```

## Assumptions and limitations

Каждая публичная или портфолио-ориентированная документация должна включать ограничительный блок такого типа:

```md
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
```

## Required workflow for doc changes

### 1. Locate live code first

Use `rg` before writing:

```bash
rg -n "<mechanism|function|type|config key>" lib components pages tests docs
```

### 2. Build a source map

For each documented mechanism, identify:

```text
mechanism name
runtime path
type path
config path
test path
trace path
UI path if any
canonical docs touched
```

Если путь не найден, так и напишите. Не выдумывайте runtime path.

### 3. Prefer one durable canonical update

Не разбрасывайте одно и то же объяснение по пяти файлам.

Предпочтение:

- один canonical math/contract doc
- плюс ссылка из entry-map

вместо большого количества дублирующих заметок.

### 4. Add numeric examples for hard math

Примеры обязательны для:

- driver accumulation
- inhibition matrices
- hysteresis thresholds
- utility scoring
- prediction error feedback
- memory update
- divergence / sensitivity comparisons

### 5. Validate honestly

Перед завершением укажите:

- какие docs изменены;
- какие code paths проверены;
- какие tests/commands были реально запущены;
- что не было проверено.

## When to update existing canonical docs

Обновляйте `docs/PIPELINE.md`, если меняется:

- stage outputs;
- stage inputs;
- allowed/forbidden dependencies;
- artifacts returned by a stage.

Обновляйте `docs/INVARIANTS.md`, если меняется:

- determinism requirement;
- namespace/stage rule;
- goal/action isolation rule;
- trace/provenance requirement;
- coefficient centralization rule.

Обновляйте test references или `docs/ORACLES.md`, если меняется:

- correctness oracle;
- explainability surface;
- expected test contract for a mechanism.

## Red flags

Остановитесь и чините docs, если видите одно из этого:

- math described without code path
- code path named without formula or meaning
- coefficient mentioned without config source
- deterministic behavior claimed while hidden randomness exists
- UI treated as the primary source of truth
- `ctx:*` consumed after S3 without documented fallback
- `goal:*` read directly by `action:*`
- psychological labels presented as validated real measurements
- archive file cited as canonical without live runtime confirmation
- tests mentioned but not located
- trace/provenance omitted from a derived mechanism explanation

## Done criteria for documentation work

Documentation task is done only if:

- the right canonical docs were updated;
- formulas have variables and ranges;
- referenced code paths are real;
- config paths are real;
- invariants are explicit;
- tests are named or their absence is reported;
- examples exist for the hard math being described;
- limitations are stated where psychological/behavioral labels appear;
- validation status is reported honestly.
