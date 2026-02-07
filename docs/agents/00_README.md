# Docs for agents: Character → Lens → ToM → Goal Lab

Эта подпапка — **канонический том** про «агента» в Kanonar/Goal Lab. Она задумывалась как документация *для ИИ-агента*, поэтому:

- описывает **контракты** (что где лежит, какие диапазоны и зависимости допустимы);
- фиксирует **матмодели** (формулы, нелинейности, нормировки);
- указывает **источники истины в коде** (файлы/функции).

## Навигация

1) `01_CHARACTER_ENTITY.md` — структура персонажа (`CharacterEntity`) и параметрическое пространство (оси/вектор).
2) `02_AXIS_SPACE.md` — математика осей (метрики, веса, клиппинг, добавление новой оси).
3) `03_CHARACTER_LENS.md` — **оператор субъективности**: как строится `ctx:final:*` и `tom:dyad:final:*`.
4) `04_TOM_DYAD_MODEL.md` — Theory of Mind как dyad-модель (A о B) с формулами метрик.
5) `05_GOAL_LAB_MATH.md` — Goal Lab: драйверы→цели→утилиты→действия + гистерезис/режимы.
6) `06_ENERGY_PROPAGATION.md` — объяснимость: энергия на графе атомов.
7) `07_PIPELINE_SPEC.md` — спецификация стадий S0…S8: namespaces, инварианты, «что обязано появиться где».

## Источники истины (в коде)

- Atom types / trace: `lib/context/v2/types.ts`, `lib/context/v2/infer.ts`
- Оси персонажа (schema): `data/character-schema.ts`
- Персонажи: `data/entities/character-*.ts`
- Character lens: `lib/context/lens/characterLens.ts` (`applyCharacterLens`)
- ToM dyad metrics: `lib/tom/dyad-metrics.ts`
- Goal derivation + mode + hysteresis: `lib/goals/goalAtoms.ts`, `lib/goals/selectActive.ts`, `lib/goals/goalState.ts`, `lib/goals/modes.ts`
- Explainability energy propagation: `lib/graph/atomGraph.ts`, `lib/graph/atomEnergy.ts`, `lib/goals/signalField.ts`

## Глобальные конвенции

### Диапазоны

- Большинство «психологических» осей и сигналов живут в **[0,1]**.
- Некоторые ToM-метрики используют **[-1,1]** (через `tanh`).
- Всякие HP/температура/кДж — в физических единицах (см. `data/character-schema.ts`, `path`).

### Namespaces (id)

- `world:*` / `obs:*` — факты мира/наблюдения.
- `feat:char:<id>:*` — признаки/черты/состояние тела персонажа.
- `ctx:*:<id>` — «сырой» контекст (до линзы).
- `ctx:final:*:<id>` — субъективный контекст после линзы.
- `tom:dyad:*:<A>:<B>` — ToM-метрики A о B.
- `goal:*:<id>` — цели, состояние целей, активные цели, режим.
- `util:*:<id>` — утилиты для действий.
- `action:*:<id>` — кандидаты действий/выбор.

### Trace

Каждый derived-атом обязан:
- иметь `trace.usedAtomIds` без циклов (без ссылки на самого себя);
- ссылаться на источники **той стадии**, на которой он произведён;
- для целей/утилит **предпочитать `ctx:final:*`** после S3.
