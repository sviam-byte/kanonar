# Docs for agents: персонаж -> локация -> психика -> ToM -> Goal Lab

Статус: deep chapters основной книги. Главный вход в документацию — `README.md` -> `docs/MATH_INDEX.md`; эта подпапка раскрывает агентную модель подробнее.

Эта подпапка — канонический русский том по математике и контрактам агентного слоя Kanonar. Сначала она объясняет, как представлены входные сущности, затем — как из них рождаются психические сигналы, и только потом — как строится dyad-модель Theory of Mind и goal/action chain.

Для repo/control-plane reference смотрите `docs/unified/*`; он не заменяет текущую книгу.

## Рекомендуемый порядок чтения

0. `../ENTITY_AND_METRIC_INDEX.md`
Полный inventory layer: какие типы сущностей и какие именованные metric spaces вообще существуют в текущем runtime.

1. `01_CHARACTER_ENTITY.md`
Что такое `CharacterEntity` и `LocationEntity`, какие поля считаются входом модели и как они превращаются в feature-atoms.

2. `02_AXIS_SPACE.md`
Как устроено пространство осей, какие у него диапазоны, как считаются similarity / dominance primitives и как правильно добавлять новую ось.

3. `03_CHARACTER_LENS.md`
Как Stage0 и S2 превращают `character/location/world` в `feat:*` и `ctx:*`, а S3 делает из этого `ctx:final:*`.

4. `04_TOM_DYAD_MODEL.md`
Как из `vector_base` и dyad-configs считаются liking / trust / fear / respect / closeness / dominance.

5. `05_GOAL_LAB_MATH.md`
Как `ctx:final:*` и `drv:*` переходят в `goal:*`, `util:*`, режимы и hysteresis.

6. `06_ENERGY_PROPAGATION.md`
Explainability layer: граф зависимостей и propagation attribution mass.

7. `07_PIPELINE_SPEC.md`
Как все эти модели раскладываются по стадиям `S0...S8`.

## Источники истины в коде

- типы атомов и trace: `lib/context/v2/types.ts`, `lib/goal-lab/types.ts`
- runtime spine: `lib/goal-lab/pipeline/runPipelineV1.ts`
- schema осей: `data/character-schema.ts`
- feature extraction: `lib/features/extractCharacter.ts`, `lib/features/extractLocation.ts`, `lib/features/registry.ts`
- stage0 raw/input layer: `lib/context/pipeline/stage0.ts`
- S2 base axes: `lib/context/axes/deriveAxes.ts`
- S3 lens: `lib/context/lens/characterLens.ts`
- ToM dyad formulas: `lib/tom/dyad-metrics.ts`
- dyad configs: `data/tom-dyad-configs.ts`
- goals / utilities / modes: `lib/goals/*`

## Глобальные конвенции

### Диапазоны

- Большинство feature-, context- и ToM-сигналов живут в `[0,1]`.
- Некоторые ToM-метрики и промежуточные logits живут в `[-1,1]` через `tanh`.
- Физические величины могут жить в натуральных единицах в `CharacterEntity` / `LocationEntity`, но перед downstream scoring обычно нормализуются в `[0,1]`.

### Namespaces

- `world:*`, `obs:*`, `mem:*`, `rel:*`, `life:*` — канонические входные atoms
- `feat:char:*`, `feat:loc:*`, `feat:scene:*` — нормализованные feature-atoms
- `ctx:*` — base context axes
- `ctx:final:*` — subjective context after lens
- `tom:dyad:*` — base ToM dyads
- `tom:dyad:final:*` — subjective dyads after lens, если слой включён
- `goal:*`, `util:*`, `action:*` — downstream decision layers

### Trace

Каждый derived-атом обязан:

- иметь `trace.usedAtomIds` без self-cycles;
- ссылаться на реальные upstream atoms своей стадии;
- после S3 предпочитать `ctx:final:*` вместо raw `ctx:*`, если речь идёт о subjective decision path.
