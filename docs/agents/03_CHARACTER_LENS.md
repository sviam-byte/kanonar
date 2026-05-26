# 3) Психика и начальные расчёты: `feat:* -> ctx:* -> ctx:final:*`

**Источники истины:**

- feature extraction: `lib/features/extractCharacter.ts`, `lib/features/extractLocation.ts`, `lib/features/registry.ts`
- stage0 input layer: `lib/context/pipeline/stage0.ts`
- base context axes: `lib/context/axes/deriveAxes.ts`
- subjective lens: `lib/context/lens/characterLens.ts`
- contracts: `docs/PIPELINE.md`, `docs/INVARIANTS.md`
- tests: `tests/lens/character_lens.test.ts`, `tests/pipeline/stage_isolation.test.ts`

Этот документ описывает первый настоящий психический путь в Kanonar:

```text
CharacterEntity / LocationEntity / world
-> feat:char:* / feat:loc:* / feat:scene:*
-> ctx:*
-> ctx:final:*
```

## 3.1. Что здесь считается "психикой"

В текущем pipeline "психика" не лежит в одном объекте. Она собирается по слоям:

- устойчивые черты и телесное состояние materialize как `feat:char:*`
- среда materialize как `feat:loc:*` и `world:*`
- stage S2 собирает из этого base-context `ctx:*`
- stage S3 делает subjective override `ctx:final:*`

То есть психика здесь — это не один класс, а переход от profile/body/environment к субъективным оценкам ситуации.

## 3.2. Stage0: materialization into features

Stage0 не должен создавать `ctx:*` как конечную истину субъективности. Его задача — собрать нормализованные признаки и миро-факты, из которых следующие стадии построят контекст.

Реально важные группы:

- `feat:char:*` — traits и body state
- `feat:loc:*` — свойства локации
- `feat:scene:*` — свойства сцены
- `world:*`, `obs:*`, `mem:*`, `rel:*`, `life:*`

Контракт stage isolation:

- S0 не должен выдавать `ctx:final:*`
- S0 не должен перескакивать к `goal:*` или `action:*`

Тестовый anchor:

- `tests/pipeline/stage_isolation.test.ts`

## 3.3. S2: base context axes

S2 создаёт `ctx:*` — "сырой" или интерсубъективный контекст, ещё без личной субъективной линзы.

Основные оси в текущем runtime:

- `danger`
- `control`
- `intimacy`
- `hierarchy`
- `publicness`
- `normPressure`
- `surveillance`
- `scarcity`
- `timePressure`
- `uncertainty`
- `legitimacy`
- `secrecy`
- `grief`
- `pain`

## 3.4. Блок формул для S2

## Privacy / publicness / surveillance

### Purpose

Построить социально-пространственные оси приватности, публичности и наблюдаемости, которые downstream layers используют как часть социальной и threat-sensitive интерпретации среды.

### Formula

```text
privacy      = clamp01(0.7 * locPrivacy + 0.3 * normPrivacy)
publicness   = clamp01(0.7 * (1 - locPrivacy) + 0.3 * normPublicExposure)
surveillance = clamp01(0.55 * control + 0.20 * publicness + 0.25 * normSurveillance)
```

### Variables

- `locPrivacy ∈ [0,1]` — приватность локации
- `normPrivacy ∈ [0,1]` — нормативная приватность
- `normPublicExposure ∈ [0,1]` — нормативная публичность
- `control ∈ [0,1]` — environmental control proxy
- `normSurveillance ∈ [0,1]` — нормативная наблюдаемость

### Source of truth

- implementation: `lib/context/axes/deriveAxes.ts`
- inputs: `world:*`, `ctx:src:norm:*`, `feat:loc:*`
- tests: `tests/pipeline/stage_isolation.test.ts`
- trace/UI: `ctx:privacy:*`, `ctx:publicness:*`, `ctx:surveillance:*`

### Invariants

- все величины клиппятся в `[0,1]`
- `publicness` и `privacy` не обязаны быть строго комплементарны после всех смешений
- derived atoms обязаны писать `trace.parts.formula`

### Minimal example

Input:

```text
locPrivacy = 0.8
normPrivacy = 0.4
normPublicExposure = 0.6
control = 0.5
normSurveillance = 0.7
```

Calculation:

```text
privacy = 0.7 * 0.8 + 0.3 * 0.4 = 0.68
publicness = 0.7 * 0.2 + 0.3 * 0.6 = 0.32
surveillance = 0.55 * 0.5 + 0.20 * 0.32 + 0.25 * 0.7 = 0.514
```

Output:

```text
ctx:privacy:* = 0.68
ctx:publicness:* = 0.32
ctx:surveillance:* = 0.514
```

### Failure modes

- axis documented as direct location property even though runtime mixes multiple inputs
- docs omit `trace.parts` and make the axis look like a magic scalar
- publicness/privacy described as raw synonyms of `properties.privacy`

## Danger / control / normPressure

### Purpose

Построить оси угрозы, управляемости и нормативного давления как сжатые оценки состояния среды, пригодные для later appraisal, drivers and goals.

### Formula

```text
vulnFactor   = clamp01(0.85 + 0.10 * (1 - escape) + 0.05 * (1 - cover))
dangerBase   = clamp01(danger * vulnFactor)
dangerSocial = clamp01(0.55 * sceneHostility + 0.45 * sceneThreat)
ctxDanger    = clamp01(0.75 * dangerBase + 0.25 * dangerSocial)

ctxControl   = clamp01(0.45 * controlLevel + 0.20 * escape + 0.15 * cover + 0.20 * resourceAccess)
ctxNorm      = clamp01(0.45 * locNormPressure + 0.30 * surveillance + 0.15 * publicness + 0.10 * proceduralStrict)
```

### Variables

- `danger ∈ [0,1]` — агрегированный физический/environment hazard
- `escape ∈ [0,1]` — возможность выхода/эвакуации
- `cover ∈ [0,1]` — защитное укрытие
- `sceneHostility ∈ [0,1]`, `sceneThreat ∈ [0,1]` — социальная угроза сцены
- `controlLevel ∈ [0,1]` — контроль над ситуацией
- `resourceAccess ∈ [0,1]` — доступ к ресурсам
- `locNormPressure ∈ [0,1]`, `proceduralStrict ∈ [0,1]` — нормативные входы

### Source of truth

- implementation: `lib/context/axes/deriveAxes.ts`
- tests: `tests/pipeline/stage_isolation.test.ts`
- trace/UI: `ctx:danger:*`, `ctx:control:*`, `ctx:normPressure:*`

### Invariants

- danger combines physical and social inputs, а не только карту/хазарды
- `ctx:control` не равен просто `control_level`; это смесь control/escape/cover/resources
- `ctx:normPressure` после построения уже зависит от surveillance/publicness

### Minimal example

Input:

```text
danger = 0.7
escape = 0.4
cover = 0.5
sceneHostility = 0.6
sceneThreat = 0.4
controlLevel = 0.5
resourceAccess = 0.3
locNormPressure = 0.8
surveillance = 0.5
publicness = 0.2
proceduralStrict = 0.7
```

Calculation:

```text
vulnFactor = 0.85 + 0.10 * 0.6 + 0.05 * 0.5 = 0.935
dangerBase = 0.7 * 0.935 = 0.6545
dangerSocial = 0.55 * 0.6 + 0.45 * 0.4 = 0.51
ctxDanger = 0.75 * 0.6545 + 0.25 * 0.51 = 0.618

ctxControl = 0.45 * 0.5 + 0.20 * 0.4 + 0.15 * 0.5 + 0.20 * 0.3 = 0.44
ctxNorm = 0.45 * 0.8 + 0.30 * 0.5 + 0.15 * 0.2 + 0.10 * 0.7 = 0.61
```

### Failure modes

- docs treat `ctx:danger` as a direct read from one atom
- formulas omit escape/cover/resource terms and mislead later model work
- trace omits the actual multi-source origin of the axis

## 3.5. S3: subjective lens

S3 не создаёт новый "объективный" мир. Он превращает `ctx:*` в субъективное восприятие конкретного агента.

Main contract:

- `ctx:*` не перезаписывается
- появляется `ctx:final:*`
- после S3 downstream layers должны предпочитать `ctx:final:*`

## Subjective modulation

### Purpose

Сместить и усилить base-context в зависимости от traits/body state персонажа так, чтобы одинаковая ситуация по-разному переживалась разными агентами.

### Formula

```text
shifted   = clamp01(x + bias)
centered  = shifted - 0.5
amplified = centered * sensitivity
result    = clamp01(0.5 + amplified)
```

или кратко:

```text
modulate(x, bias, sensitivity) = clamp01(0.5 + (clamp01(x + bias) - 0.5) * sensitivity)
```

### Variables

- `x ∈ [0,1]` — base context axis from `ctx:*`
- `bias` — baseline shift from traits/body/context
- `sensitivity` — multiplicative gain around the neutral point `0.5`

### Source of truth

- implementation: `lib/context/lens/characterLens.ts`
- tests: `tests/lens/character_lens.test.ts`
- trace/UI: `ctx:final:*`, `ctx:base:*`

### Invariants

- при нейтральных traits/body (`0.5`) линза должна быть почти identity
- линза не должна создавать self-cycles в trace
- все outputs клиппятся в `[0,1]`

### Minimal example

Input:

```text
x = 0.30
bias = 0.20
sensitivity = 1.30
```

Calculation:

```text
shifted = clamp01(0.30 + 0.20) = 0.50
centered = 0.50 - 0.5 = 0
amplified = 0 * 1.30 = 0
result = 0.50
```

Output:

```text
ctx:final:<axis>:A = 0.50
```

### Failure modes

- docs describe the lens as pure multiplier and ignore bias
- traces point only to `ctx:*`, but not to `feat:char:*`
- docs imply the lens mutates `ctx:*`, while runtime actually writes `ctx:final:*`

## 3.6. Example: subjective danger

Current runtime uses:

```text
kDanger = 1 + 1.2 * (paranoia - 0.5) + 0.6 * (stress - 0.5) + 0.45 * (hpaReactivity - 0.5)
bDanger = 0.7 * (paranoia - 0.5) + 0.25 * (stress - 0.5) - 0.30 * (experience - 0.5)
danger  = modulate(danger0, bDanger, kDanger)
```

Это означает:

- паранойя повышает и baseline shift, и gain
- стресс тоже усиливает danger-perception
- опыт снижает систематическую переоценку угрозы

Тестовые anchors:

- `tests/lens/character_lens.test.ts`
- high paranoia must increase perceived danger
- neutral traits must keep danger almost unchanged

## 3.7. Что считать завершённой документацией для этого слоя

Слой `features -> ctx:* -> ctx:final:*` считается задокументированным только если:

- указаны реальные source paths;
- формулы S2 и S3 привязаны к коду;
- описано, какие величины base, а какие subjective;
- есть test anchors;
- trace surfaces названы явно.
