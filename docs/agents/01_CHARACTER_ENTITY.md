# 1) Персонаж и локация как входные сущности модели

**Источники истины:**

- типы: `types.ts` (`CharacterEntity`, `LocationEntity`, `BodyModel`, `LocationMap`)
- schema осей и физических параметров: `data/character-schema.ts`
- character features: `lib/features/extractCharacter.ts`
- location features: `lib/features/extractLocation.ts`
- stage0 wiring: `lib/context/pipeline/stage0.ts`

Этот документ фиксирует нижний слой модели: как репозиторий представляет персонажа и локацию до того, как начинается `ctx:*`, психика, ToM и GoalLab scoring.

## 1.1. Главный принцип

`CharacterEntity` и `LocationEntity` не являются сами по себе decision-моделью. Они задают:

- стабильный профиль персонажа;
- состояние тела и ресурсов;
- геометрию и свойства локации;
- сырьё, из которого stage0 и S2 построят feature- и context-atoms.

Выбор действия делает не `CharacterEntity`, а staged pipeline.

## 1.2. `CharacterEntity`

### Purpose

`CharacterEntity` хранит стабильный профиль агента и его медленно/быстро меняющиеся внутренние параметры, из которых downstream layers извлекают traits, body state, priorities и ToM-relevant biases.

### Structure

В текущем runtime реально важны:

- `entityId`, `type`, `title`
- `vector_base?: Record<string, number>`
- `body: BodyModel`
- `locationId?: string`
- `memory`
- `lifeGoals`
- опциональные блоки `identity`, `context`, `resources`, `authority`, `evidence`, `observation`, `compute`

### Variables

- `vector_base[axis]` — психо-поведенческая ось, обычно в `[0,1]`
- `body.acute.*` — острое телесное состояние, часто в физических единицах или шкалах `0..100`
- `body.reserves.*` — запас ресурсов и homeostasis-параметры
- `body.regulation.*` — регуляторные параметры вроде arousal / HPA axis
- `locationId` — текущая локация агента

### Source of truth

- implementation: `types.ts`
- schema: `data/character-schema.ts`
- feature extraction: `lib/features/extractCharacter.ts`
- stage usage: `lib/context/pipeline/stage0.ts`
- tests: `tests/pipeline/fixtures.ts`

### Invariants

- `vector_base` не обязан быть полным; отсутствие оси обычно трактуется как нейтраль `0.5`
- физические поля могут жить не в `[0,1]`, но downstream feature-extraction должен нормализовать их
- решение не должно опираться напрямую на необработанный `CharacterEntity`; сначала он должен быть материализован в atoms/features

## 1.3. `vector_base` как психологическое пространство

`vector_base` — это отображение

```text
vector_base: axis_id -> scalar
```

где большинство осей живут в `[0,1]`, а `0.5` играет роль нейтрали.

Ключевой контракт:

- если ось не указана, многие модели читают `axis ?? 0.5`
- сама по себе добавленная ось не меняет поведение системы
- ось начинает влиять на runtime только когда её начинают читать `extractCharacterFeatures`, `characterLens`, ToM-конфиги или GoalLab

Семантика и диапазоны осей задаются в `data/character-schema.ts`.

## 1.4. `LocationEntity`

### Purpose

`LocationEntity` хранит пространственные, нормативные и affordance-свойства среды, из которых stage0 и S2 получают сигналы приватности, контроля, crowding, normative pressure, access gating и hazard geometry.

### Structure

В текущем runtime реально важны:

- `entityId`, `type`, `title`
- `map?: LocationMap`
- `properties?: {...}`
- `state?: {...}`
- `tags?: string[]`
- `ownership?: {...}`
- `access?: ...`
- `hazards?: any[]`
- `geometry?: any`

### Variables

- `properties.privacy` — категориальная privacy-семантика
- `properties.visibility`, `properties.noise`, `properties.normative_pressure`, `properties.control_level` — скаляры среды
- `state.crowd_level` — текущее crowding-состояние
- `map.width`, `map.height`, `cells`, `exits` — геометрия и навигация
- `tags` — дискретные environment hints (`public`, `private`, `safe_hub`, ...)

### Source of truth

- implementation: `types.ts`
- feature extraction: `lib/features/extractLocation.ts`
- stage usage: `lib/context/pipeline/stage0.ts`
- access gating: `lib/access/deriveAccess.ts`
- tests: `tests/pipeline/fixtures.ts`

### Invariants

- `LocationEntity` не должен напрямую “создавать” decision outputs; он сначала материализуется в `world:*`, `feat:loc:*`, `loc:*`
- access semantics должны быть явными и traceable
- hazard / geometry signals должны появляться до тех стадий, которые читают danger / control / escape

## 1.5. Обязательный мост: сущности -> features

Нижний слой Kanonar не должен читать “сырые” поля хаотично по всему коду. Канонический мост — это feature extraction.

## Character feature extraction

### Purpose

Превратить разнородные поля персонажа (`vector_base`, `body`, `identity`, `context`) в компактный нормализованный словарь признаков `feat:char:*`, который downstream stages читают единообразно.

### Formula

```text
feature = clamp01(raw_value)
feature = mapRange01(raw_value, min_raw, max_raw)    for body-like quantities
feature = fallback-composition(...)                   for derived traits
```

### Variables

- `acute.pain`, `acute.fatigue`, `acute.stress` — телесные/аффективные raw поля
- `reserves.sleep_debt_h`, `reserves.energy` — ресурсные raw поля
- `vector_base.*` — устойчивые психо-поведенческие оси
- `context.age` — proxy для `trait.experience`

### Source of truth

- implementation: `lib/features/extractCharacter.ts`
- types: `types.ts`
- schema: `data/character-schema.ts`
- trace/UI: `feat:char:<selfId>:*` atoms in stage0

### Invariants

- все feature values после extraction должны быть в `[0,1]`
- `trait.normSensitivity` сейчас derived из `formalism` и `order`
- `trait.care` имеет backward-compatible fallback через `A_Safety_Care` и `A_Power_Sovereignty`

### Minimal example

Input:

```text
body.acute.stress = 30
body.acute.fatigue = 20
vector_base.C_betrayal_cost = 0.8
context.age = 42
```

Calculation:

```text
body.stress = mapRange01(30, 0, 100) = 0.30
body.fatigue = mapRange01(20, 0, 100) = 0.20
trait.paranoia = clamp01(0.8) = 0.8
trait.experience = clamp01((42 - 18) / 60) = 0.4
```

Output:

```text
feat:char:A:body.stress = 0.30
feat:char:A:body.fatigue = 0.20
feat:char:A:trait.paranoia = 0.80
feat:char:A:trait.experience = 0.40
```

### Failure modes

- feature extraction silently emits values outside `[0,1]`
- downstream docs claim a trait exists but `extractCharacterFeatures` never builds it
- docs refer to a direct `vector_base` read while runtime actually reads `feat:char:*`

## Location feature extraction

### Purpose

Превратить дискретные и смешанные свойства локации в нормализованный набор `feat:loc:*`, из которого S2 и access logic могут выводить психологически значимые context axes.

### Formula

```text
loc.privacy      = 1 if properties.privacy == "private" else 0
loc.visibility   = clamp01(properties.visibility)
loc.normPressure = clamp01(properties.normative_pressure)
loc.controlLevel = clamp01(properties.control_level)
loc.crowd        = clamp01(state.crowd_level)
tag.<name>       = 1 if tag present else 0
```

### Variables

- `properties.*` — статические/environment-level scalars
- `state.*` — текущее состояние локации
- `tags` — категориальные флаги
- `map.*` — упрощённые геометрические proxies

### Source of truth

- implementation: `lib/features/extractLocation.ts`
- types: `types.ts`
- stage wiring: `lib/context/pipeline/stage0.ts`
- downstream use: `lib/context/axes/deriveAxes.ts`, `lib/access/deriveAccess.ts`

### Invariants

- location features тоже обязаны быть нормализованы в `[0,1]`
- `privacy` сейчас бинаризуется грубо; это контракт текущей реализации, а не общая истина о среде
- tags не должны подменять собой геометрию или access contract, а только дополнять её

### Minimal example

Input:

```text
properties.privacy = "private"
properties.visibility = 0.8
properties.control_level = 0.6
state.crowd_level = 0.25
tags = ["safe_hub"]
```

Calculation:

```text
loc.privacy = 1
loc.visibility = 0.8
loc.controlLevel = 0.6
loc.crowd = 0.25
tag.safeHub = 1
```

Output:

```text
feat:loc:...:loc.privacy = 1
feat:loc:...:loc.visibility = 0.8
feat:loc:...:loc.controlLevel = 0.6
feat:loc:...:loc.crowd = 0.25
feat:loc:...:tag.safeHub = 1
```

### Failure modes

- docs treat `LocationEntity` as if it already were `ctx:*`
- location tags are documented as canonical risk/legitimacy values even though runtime only uses them as hints
- access rules are described without the actual `loc:<id>:access:*` atoms

## 1.6. Что смотреть дальше

После этого входного слоя следующий канонический переход такой:

```text
CharacterEntity / LocationEntity / world
-> features in stage0
-> base context axes in S2
-> subjective context in S3
-> ToM dyads in S5
```

Следующий документ для этого перехода: `03_CHARACTER_LENS.md`.
