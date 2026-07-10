# KANONAR_PHASE_I_IMPL_PLAN — реализация и математика Фазы I

> **Status: IMPLEMENTED/OBSERVED v2 (2026-07-10).** Выведен из [KANONAR_TZ](KANONAR_TZ.md)
> Часть II, Фаза I. Без философии: только задачи, файлы, тесты, артефакты.
> Детализируется только та ветка, которая сейчас собирается в код; Фазы II/III
> здесь отсутствуют намеренно. Стиль работы: **spec → test → code → report → freeze.**
> Карта точек подключения (§1) начиналась как снимок 2026-07-05 и обновлена по
> live runtime 2026-07-10. Этот файл теперь служит канонической математической
> картой реализованных Phase-I механизмов; frozen результаты не переоцениваются.

## 0. Scope

**Делаем:** I-0 (технический шлюз = spine WP-A + WP-B), I-1 (MVP-0),
I-2 (мир формализуется). Цель Фазы — ярус A (A1–A5) по минимальным PASS.

**Не делаем (жёстко):** d_eff, η²-язык эффектов, бюджетный гейт w=σ(β(b−cost)+γC̄),
π_μ-подключение, dialogue templates как влияющий канал, невербалку до I-2,
сложные предметы (инвентарь/вес/крафт), N>2 игроков, всё из Фаз II/III.
MVP-0 реализован и запинен; этот документ по-прежнему не расширяет Фазы II/III.

### 0.1 Runtime profiles

| profile | effective mechanics | назначение |
|---|---|---|
| no profile | текущие значения `FC.*.enabled` | программная совместимость и лабораторные ablation-тесты |
| `legacy` | все шесть Phase-I рычагов OFF | явная контрольная ветка UI |
| `phase1` | communication threat, object context, location props, threat memory, prior influence, PAM v2 | обычный пользовательский запуск с наблюдаемыми механизмами |

Источник: `lib/config/runtimeMechanics.ts`. SimKit хранит выбор в
`world.facts['sim:runtimeProfile']`; прямой GoalLab — в
`sceneControl.runtimeProfile`. Профиль не мутирует глобальный FormulaConfig.
`phase1` является рекомендуемым UI-default, но отсутствие профиля сохраняет
историческую программную семантику.

## 1. Карта точек подключения (разведка кода, 2026-07-05)

| точка | где в коде | статус |
|---|---|---|
| Раннер-цикл | `lib/simkit/core/simulator.ts` — `SimKitSimulator.step/run/reset`; trace на тик: offers, applied, events, deltas (chars+facts), validations | готов |
| Живое решение | `lib/simkit/plugins/goalLabDeciderPlugin.ts` — GoalLab S0–S9 на агента на тик; offers→Possibility-мост; трасса в `world.facts['sim:trace:<agentId>']` | готов |
| Гейт решения | `lib/simkit/core/decisionGate.ts` (`selectDecisionMode`) + `reactiveDecision.ts` | 3-режимный, без бюджета — НЕ трогаем в Фазе I |
| Создание мира/агентов | `lib/simkit/adapters/fromKanonarEntities.ts` (`makeSimWorldFromSelection`); probe-путь: `lib/goal-lab/probe/scenes.ts` (`buildProbeAgent`) | готов |
| Facts / состояние мира | `world.facts` через `lib/simkit/core/factsAccessors.ts` (getFact/setFact/getCtx/setCtx) | готов |
| Меню действий | `lib/simkit/actions/specs.ts` (`enumerateActionOffers`) → `rules.ts:proposeActions`; валидация `actions/validate.ts`; предметы `actions/objectSpec.ts` | готов, включая take/give/seize |
| eventLog | `world.events` → `rules.ts:applyEvent`; скользящая история `facts['sim:recentEvents']` (64) | готов |
| Коммуникация (цепочка C1) | S8 threaten → `SpeechEventV1` (`actions/specs.ts:827`) → `speech:v1` → `rules.ts:89` → `perception/speechFilter.ts` (слышимость/приватность) → `facts['inboxAtoms']` → trust-гейт (`simulator.ts` шаг 2.5) → `facts['agentAtoms:<B>']` → S0 адресата след. тика | **вся цепочка есть; контракт (twin-доказательство) — нет.** *Обновлено 2026-07-07 (I-1 ran): звено agentAtoms→S0 НЕ существовало (нет потребителя) — починено в `goalLabWorldState.ts`; цепочка доказана twin-тестом; НО ось danger (`deriveAxes`) не видит speech-атомы — знак C1 danger↑ не наблюдён, вердикт MVP0-C1-V0 в леджере; рычаг — Communication v1 (I-2)* |
| Невербалка | `perception/nonverbalAtoms.ts`, уже включена в `simulator.ts` шаг 5.6 | субстрат для I-2, в MVP-0 не валидируем |
| Spatial | `lib/simkit/core/spatial.ts` + `computeTacticalAtoms` (simulator) | готов |
| Twin-run | `lib/simkit/compare/*` + `lib/simkit/mvp0/runTwins.ts` | готов: removeObject/wipeMemory/injectSpeechAtom, first divergence tick и atom diff |
| Одно-тиковый probe | `lib/goal-lab/probe/runProbe.ts` — один тик против статичного B | остаётся для лабов; MVP-0 его НЕ расширяет |
| Предмет | `obj:v0:*` + `lib/simkit/actions/objectSpec.ts` + `objectContextAtoms.ts` | реализован v0 state/action и v1 context; outcome evidence A4-OBJ PASS |

Вывод разведки: MVP-0 — это в основном **сборка и доказательство**, а не новый
субстрат. Новый код: objectSpec, два тонких раннера-обёртки, тесты.

## 2. Шаг I-0 — технический шлюз (= spine WP-A + WP-B)

### I-0.1 Per-seed экспорт + seed-aware статистика (WP-A)
- **Вход:** свипы агрегируют по сидам; аудит показал грейдинг не тем эстиматором.
- **Выход:** long-format строки с колонкой `seed`; Python-грейдер interaction на
  per-seed данных: наклон $b_{T,s}$, статистика $D=\mathrm{mean}_s(b_{0.1,s}-b_{0.9,s})$,
  bootstrap-CI по сидам; PASS ⇔ CI_lo>0 ∧ D>EPS_DEAD.
- **Файлы:** `lib/goal-lab/probe/sweep.ts`, `runBasisSweep.ts`;
  `kanonar_behavior_lab/src/basis/` (грейдер).
- **Тест:** расширить `tests/goals/outcome_sweep_export.test.ts` — per-seed строки
  присутствуют, их агрегат совпадает со старым выходом.
- **Freeze:** статистика и пороги — коммитом ДО пере-прогона.
- **Запрещено:** менять сцены, сид-набор, содержимое сцен.

### I-0.2 PAM v2: challenge/defy
- **Вход:** решение автора 2026-07-05: ДА, отдельным versioned freeze.
- **Выход:** записи `challenge`/`defy` в PAM; изменение наблюдаемой версионировано.
- **Файлы:** `lib/decision/actionPriors.ts` (+ `lib/behavior/actionPattern.ts` при необходимости).
- **Тест:** contract — OFF-ветка бит-идентична легаси (паттерн v4).
- **Freeze:** версия PAM v2 фиксируется до пере-прогона любых сцен, где она видна.

#### Purpose

PAM v2 соединяет `A_Liberty_Autonomy` с prior для неподчинительных действий.
Сам prior не гарантирует действие: `challenge` должен пройти possibility gate,
а prior влияет на Q только при effective `actionPriorInfluence=true`.

#### Formula

```text
a = clamp01(A_Liberty_Autonomy)
n = clamp01(0.5·formalism + 0.5·order)
r = clamp01(0.45·publicness + 0.35·surveillance + 0.20·normPressure)

p_challenge = clamp01((0.10 + 0.35a - 0.15n)·(1 - 0.30r))
p_defy      = clamp01((0.05 + 0.40a - 0.20n)·(1 - 0.30r))

challenge available iff dominance ≥ 0.55 and trust ≤ 0.75
m_challenge = clamp01(0.35p_challenge + 0.35(dominance - 0.5)
                      + 0.15(1 - trust))

Q_raw(a) = Σ_g E_g·Δg(a) + I_prior·0.5·priorMagnitude(a) - cost(a)
riskPenalty = 0.4·|Q_raw(a)|·(1-confidence(a))
Q(a) = Q_raw(a) - riskPenalty
```

#### Variables

- `a,n,r,dominance,trust,priorMagnitude,confidence ∈ [0,1]`.
- `E_g` — bounded goal energy; `Δg(a)` — signed action effect on goal `g`.
- `I_prior ∈ {0,1}` — effective prior-influence gate.
- `defy` currently has a prior entry but no consuming possibility; this is
  observable vocabulary debt, not a hidden fallback to `challenge`.

#### Source of truth

- traits: `lib/features/extractCharacter.ts`;
- priors: `lib/decision/actionPriors.ts`;
- possibility gate: `lib/possibilities/defs.ts`;
- score/selection: `lib/decision/scoreAction.ts`, `lib/decision/decide.ts`;
- config: `FC.actionScoring.{pamV2,priorInfluence,riskCoeff,exploration}`;
- tests: `tests/goals/pam_v2.test.ts`,
  `tests/decision/decision_trace_breakdown.test.ts`,
  `tests/decision/near_tie_sampling.test.ts`.

#### Invariants

- S8 не читает `goal:*` напрямую; Q получает только `util:*`/projected effects.
- При prior-influence OFF prior contribution равен нулю.
- Selection использует seeded RNG. `decisionSnapshot.best` — фактический
  Gumbel winner; `topByQ` — отдельная диагностическая величина.
- Trace обязан содержать goal contributions, prior contribution, cost,
  risk penalty, Q, temperature, noise, sample score и `chosen`.

#### Minimal example

```text
n=0.5, r=0, dominance=0.6, trust=0.5
a: 0.1 -> 0.9
p_challenge: 0.06 -> 0.34
m_challenge: 0.131 -> 0.229
Δ prior contribution = 0.5·(0.229-0.131) ≈ 0.049
```

Это соответствует наблюдавшемуся `Δq≈0.047`, но существенно меньше масштаба
Gumbel noise (`std≈1.28`) и поэтому не доказывает outcome effect. Frozen PAM-v2
результат: wiring PASS, outcome effect BOUNDED-DEAD.

#### Failure modes

- включён PAM v2, но prior influence выключен — vocabulary виден, Q не меняется;
- `defy` документируется как выбираемое действие, хотя consumer отсутствует;
- trace показывает top-Q вместо применённого seeded winner;
- prior term влияет на Q, но отсутствует в decomposition.

### I-0.3 Адъюдикация Care↑→i_defect↑
- **Выход:** строка знака адъюдицирована; вердикт в леджер.
- **Файлы:** `lib/goal-lab/probe/outcomeSignTableV4.ts`;
  `kanonar_behavior_lab/src/basis/outcome_triage_v4.py`; `docs/FALSIFICATION_LEDGER.md`.

### I-0.4 DEBT: production topK=10
- **Выход:** DEBT-строка в `docs/FALSIFICATION_LEDGER.md` (расхождение lab/production topK).

### I-0.5 C(t) read-only: `lib/metrics/tension.ts` (WP-B)
- **Вход:** существующие атомы/трасса (S6 parts, beliefs/surprise, Q и T из S8).
- **Выход:** новый модуль `lib/metrics/tension.ts` — C-вектор 6 каналов
  (формулы: [KANONAR_SPINE](KANONAR_SPINE.md) WP-B), строго read-only.
- **Тест:** contract — пайплайн **побайтово неизменен** при включённой метрике;
  плюс unit на каждый канал (нулевой мир ⇒ нулевой C).
- **Freeze:** `docs/TENSION_FUNCTIONAL.md` (формулы, веса, нормировка, типология
  пар) — до первого отчёта с C(t).
- **Запрещено:** любое влияние C на решения (это Фаза II, гейт).

**DoD I-0:** цикл v4 закрыт честно (перегрейжен per-seed эстиматором);
C(t) считается и покрыт contract-тестом; ничего замороженного не тронуто;
`npx vitest run tests/goals` зелёный.

## 3. Шаг I-1 — MVP-0: вертикальный срез (неприкосновенен по простоте)

Живой цикл: **агент → действие → изменение мира → реакция другого агента →
trace → twin-diff.** Всё новое кладём в `lib/simkit/mvp0/` + один action-spec.

### I-1.1 Сцена MVP-0
- **Вход:** seed.
- **Выход:** `SimWorld`: 2 живых агента (goalLabDeciderPlugin), 1 локация с
  картой (существующие `lib/world`), 1 предмет v0 в facts, 5–20 тиков.
- **Файлы:** `lib/simkit/scenarios/mvp0Scene.ts` (рядом с `basicScenario.ts`).
- **Тест:** сцена строится, оба агента размещены, меню первого тика непусто.
- **Запрещено:** больше одной сцены; конфиг-зоопарк.

### I-1.2 Object v0: ресурс-токен в facts
- **Вход:** мир без предметов.
- **Выход:** факт `obj:v0:<objId> = { holderId: Id|null, locId: Id }`;
  действия `take` (лежит в локации), `give` (у себя, адресат в радиусе),
  `seize` (у другого, та же локация) меняют holderId и эмитят событие
  `obj:transfer` в eventLog; наличие/принадлежность предмета меняет меню.
- **Файлы:** новый `lib/simkit/actions/objectSpec.ts`; регистрация в
  `actions/specs.ts`; НИЧЕГО в типах сущностей.
- **Тест:** unit — абляция предмета убирает take/seize из offers (≥1 кандидат
  исчез); seize эмитит obj:transfer; детерминизм.
- **Freeze:** прото-предсказание знака для A4 (одной строкой в отчёте).
- **Запрещено:** инвентарь, вес, durability, крафт, аффордансы v1, контекст-оси.

### I-1.3 Communication v0: контракт «атом → S0 адресата» (сцена C1)
- **Вход:** цепочка уже в коде (карта §1), но недоказана.
- **Выход:** доказанный контракт: twin ± threaten — у Б danger↑, confront↓,
  retreat/give↑; знак пре-зарегистрирован.
- **Файлы:** новых модулей нет; фиксы разрывов цепочки — точечно, по месту
  обнаружения (кандидаты: `rules.ts:89-250`, `simulator.ts` шаг 2.5,
  `goalLabWorldState.ts`).
- **Тест:** twin-тест `injectSpeechAtom` (см. I-1.5) + прото-A5: знак Δp(retreat/give)
  наблюдён на 32 сидах (порог ≥0.15 — только в I-2).
- **Запрещено:** новые виды речевых актов, шаблоны текста, невербалка.

### I-1.4 Раннер `runMvpRollout(seed)`
- **Вход:** `{ seed, ticks?=20 }` (сцена фиксирована — mvp0Scene).
- **Выход:** JSON тик×агент: `{ tick, agentId, action, usedAtomIds, events,
  factsDigest }` + `goldenHash` (sha256 канонизированного JSON).
  `usedAtomIds` — из `sim:trace:<agentId>` / decision meta.
- **Файлы:** `lib/simkit/mvp0/runMvpRollout.ts` (тонкая обёртка над
  `SimKitSimulator` + плагины, по образцу `compare/batchRunner.ts:runBatch`).
- **Тест:** `tests/simkit/mvp0_golden.test.ts` — (а) два запуска одного сида ⇒
  идентичный hash; (б) ≥20 тиков без deadlock (нет пустых меню); (в) 100%
  выбранных действий с непустым usedAtomIds.
- **Freeze:** golden-run hash фиксируется в тесте после первого честного прогона.
- **Запрещено:** конфигурируемость сверх seed/ticks; UI; CSV-экспортёры.

### I-1.5 Twin-API `runTwins(base, intervention)`
- **Вход:** базовый прогон + одно вмешательство:
  `removeObject | wipeMemory | injectSpeechAtom`.
- **Выход:** diff траекторий + **first divergence tick** + разошедшийся атом
  (attribution через `divergenceMetrics`/`amplifierAttribution`).
- **Файлы:** `lib/simkit/mvp0/runTwins.ts` — обёртка над
  `compare/batchRunner.ts:runPair` + `worldTransform`; три интервенции как
  чистые world-transform функции там же.
- **Тест:** `tests/simkit/mvp0_twins.test.ts` — removeObject ⇒ непустой diff с
  указанным first divergence tick; wipeMemory ⇒ расхождение ≤5 тиков после wipe
  (прото-A3, порог мягкий); injectSpeechAtom ⇒ знак C1 (I-1.3).
- **Запрещено:** свипы, батчи по сеткам параметров, Lyapunov-выводы (это II-3).

**DoD I-1 (= DoD MVP-0 из ТЗ):** A1, A2 полностью; A4/A5 прототипно (знаки
наблюдены, пороги — в I-2). Распухает — режем.

## 4. Шаг I-2 — мир формализуется (закрывает ярус A)

Мини-спеки детализированы 2026-07-07 (после приёмки MVP-0 автором; входы —
вердикты MVP0-* в леджере). Порядок: I-2.1 → I-2.2 — критический путь A5;
I-2.5 после I-2.1; I-2.3/I-2.4 параллелимы.

### I-2.1 Communication v1a: speech→danger coupling (рычаг MVP0-C1-V0)
- **Вход:** ось danger строится ТОЛЬКО из ctx:/world:-источников; speech-атом
  0.7 в S0 невидим для `deriveAxes` (вердикт MVP0-C1-V0).
- **Дизайн:** НЕ менять формулу оси. У `dangerSocial` уже есть сокет
  `ctx:src:scene:threat`; добавляем параллельный источник
  `ctx:src:comm:threat:<selfId>` — флаг-гейтед продьюсер (runPipelineV1, до
  deriveAxes): max по входящим speech-атомам с meta.act='threaten',
  meta.from≠self, значение = magnitude·confidence, трасса = id этих атомов.
  В deriveAxes: `scThreatEff = max(scThreat, commThreat)`; при OFF атом не
  существует ⇒ max(x,0)=x ⇒ выход побайтово легаси.
- **Файлы:** `lib/config/formulaConfig.ts` (FC.communication.speechThreatV1,
  default OFF); `lib/goal-lab/pipeline/runPipelineV1.ts` (продьюсер);
  `lib/context/axes/deriveAxes.ts` (max-join + parts).
- **Тест:** contract — OFF: запинённый golden hash MVP-0 не двигается +
  замороженные probe-тесты зелёные; unit ON: threaten-атом в пуле ⇒
  ctx:danger↑ с предсказуемым вкладом.
- **Запрещено:** менять веса 0.75/0.25/0.55/0.45; невербалка; шаблоны текста.

#### Purpose

Сделать принятую адресатом угрозу причинным входом оси danger без изменения
существующей формулы оси и без повторного чтения сырого event payload.

#### Formula

```text
c_comm = max_i(clamp01(magnitude_i)·clamp01(confidence_i))
threat_eff = max(sceneThreat, c_comm)
danger = clamp01(0.75·dangerBase
                 + 0.25·(0.55·hostility + 0.45·threat_eff))
```

Множество `i` содержит только принятые входящие speech-атомы с
`meta.act='threaten'` и `meta.from != selfId`. Пустое множество даёт `c_comm=0`.

#### Variables

- `magnitude_i, confidence_i, sceneThreat, hostility, dangerBase ∈ [0,1]`.
- `c_comm, threat_eff, danger ∈ [0,1]` после clamp/max.

#### Source of truth

- producer: `lib/context/sources/commThreatAtoms.ts`;
- axis join: `lib/context/axes/deriveAxes.ts`;
- orchestration/profile: `runPipelineV1.ts`, `runtimeMechanics.ts`;
- tests: `tests/simkit/comm_threat_v1.test.ts`,
  `mvp0_c1_sign_v1.test.ts`, `mvp0_c1v2_sign.test.ts`;
- trace: `ctx:src:comm:threat:*` contributors and `ctx:danger:*` formula parts.

#### Invariants

- только уже принятые trust gate атомы входят в `c_comm`;
- self-threat и другие речевые акты игнорируются;
- если профиль/флаг OFF, source atom отсутствует, а не создаётся с новым ID и 0;
- новый канал не меняет веса frozen danger law.

#### Minimal example

```text
magnitude=0.70, confidence=0.90
c_comm=0.63
sceneThreat=hostility=dangerBase=0
danger=0.25·0.45·0.63=0.070875
```

В полной MVP-сцене это дало средний `ΔsafetyNeed≈+0.003`: канал причинный,
но сильно сжат. C1-v1 wiring/sign PASS; исходный yield outcome FAIL;
C1-v2 engagement/retention DIRECTIONAL-UNDER-BAR.

#### Failure modes

- speech присутствует в S0, но не создаёт source atom;
- непринятая/чужая речь влияет на danger;
- UI обещает крупный behavioral shift из unit-вклада `0.070875`;
- результат C1-v2 округляется до PASS вопреки frozen threshold.

### I-2.2 C1-v1: A5 в полную силу (re-run 32 сида, флаг ON)
- **Пре-регистрация (freeze до прогона):** твин ± threaten(A→B, mag 0.7) @t0,
  ридаут B @tick 1: S1 Δdanger>0 (safetyNeed/fear); S2 Δp(confront)≤0;
  S3 Δp(retreat/give)>0; **A5 мин-PASS: Δp(retreat/give) ≥ 0.15 @32 сида.**
- **Файлы:** `tests/simkit/mvp0_c1_sign.test.ts` (v1-вариант с флагом ON) +
  отчёт `mvp0_c1_sign_v1.json`.
- **Запрещено:** менять сцену/сиды/классы глаголов после freeze.
- **RAN 2026-07-07 (freeze c2d6ce8, вердикт C1-V1 в леджере):** S1 PASS
  универсально (dSafetyNeed>0 на 32/32 сидах — цепочка жива end-to-end),
  S3/A5 FAIL — эффект-сайз: угроза 0.63 сжимается до danger +0.071 и
  safetyNeed +0.003; retreat/give не конкурентен против q(talk)≈1.05.
  Рычаг: СТАВКИ в сцене C1 (угроза над предметом = конвергенция с I-2.3)
  и/или Q-сторона; решение автора.

### I-2.3 Object v1: типизированный контракт (A4 outcome-level)
- **Состав:** possibility-гейты (наличие/владение токеном гейтит кандидатов)
  И контекст-оси (владение → `ctx:src:scene:resourceAccess`, отсутствие →
  scarcity); transfer/seize скорится в Game (расширение G_* или новый G_object).
- **Freeze предсказаний:** |Δp| ≥ 0.10 @32 сида, знак пре-зарегистрирован
  (абляция токена ⇒ scarcity↑ ⇒ предсказанный сдвиг класса действий).
- **Известный риск:** take не выбирается (q-доминирование talk, MVP0-A4-MENU);
  лечится осевым каналом (scarcity/resourceAccess), не тюнингом q.
- **RAN 2026-07-07 (freeze f76e7c9, вердикты A4-OBJ + A5-STAKES в леджере):**
  **A4 ЗАКРЫТ по мин-PASS** — dAcquisitive = +0.125 ≥ 0.10 (осевой канал
  работает: scarcity 0.7 у соперника ⇒ acquisitive 0.281→0.406). A5: S1
  danger↑ воспроизведён; S3 ЗНАК ПЕРЕВЁРНУТ (Δp = −0.063: под угрозой
  держатель ПЕРЕСТАЁТ делиться — share 2→0 — и уходит в negotiate 6→13;
  защитная ретенция вместо уступки). Рычаги A5 (решение автора): эффект-сайз
  danger (кривая драйвера) ИЛИ пере-регистрация сигнатуры C1-v2 как
  engagement/retention.
- **C1-v2 RAN 2026-07-07 (freeze 626c4d3, свежие сиды 33–64):** версия
  engagement/retention подтвердила все направления: negotiate 14/32→17/32
  (Δ=+0.09375), voluntary yield {give,share} 1/32→0 (Δ=−0.03125),
  dSafetyNeed=+0.00304, confront 0→0. Вердикт **DIRECTIONAL-UNDER-BAR**:
  frozen min-PASS +0.10 не пройден на один выбор. Это не переоценка и не
  ретроактивное закрытие A5-STAKES; исходная гипотеза уступки остаётся
  фальсифицированной.

#### Object state and transition formula

```text
obj:v0:<id> = { holderId: Id|null, locId: Id }

take  available iff holderId=null and actor.locId=locId
give  available iff holderId=actor and recipient is in talk range
seize available iff holderId=other and actor.locId=other.locId=locId

take/give/seize: holderId' = new holder
seize side effects:
  holder.stress' = clamp01(holder.stress + 0.04)
  threat(holder,seizer)' = clamp01(threat + 0.05)
```

Offers сортируются детерминированно. Каждая передача эмитит `obj:transfer`.

#### Object context formula

```text
self holds      -> resourceAccess=0.9, scarcitySource=0.0
unheld here     -> resourceAccess=0.5, scarcitySource=0.35
rival holds here-> resourceAccess=0.1, scarcitySource=0.7

control = clamp01(0.45·locationControl + 0.20·escape
                  +0.15·cover + 0.20·resourceAccess)
scarcity = clamp01(0.75·sceneScarcity + 0.25·(1-resourceAccess))
```

#### Variables

- `holderId` — единственный текущий держатель либо `null`;
- source/axis величины ∈ `[0,1]`;
- при нескольких предметах выбирается наблюдение с максимальным
  `resourceAccess`, с детерминированным порядком по object ID.

#### Source of truth

- state/actions: `lib/simkit/actions/objectSpec.ts`;
- context producer: `lib/context/sources/objectContextAtoms.ts`;
- axes: `lib/context/axes/deriveAxes.ts`;
- tests: `mvp0_scene_object.test.ts`, `object_context_v1.test.ts`,
  `mvp0_stakes_sign.test.ts`, `mvp0_twins.test.ts`;
- trace/event: source atoms, fact digest, `obj:transfer`.

#### Invariants

- нет UI-only владения: holder меняется только доменным transition;
- предмет вне локации агента не создаёт local source atoms;
- context gate OFF не отключает object action protocol;
- отсутствие предмета должно менять menu, а не переименовывать preset.

#### Minimal example

```text
B holds token; A is co-located rival
A: resourceAccess=0.1, scarcitySource=0.7
ctx:scarcity_A = 0.75·0.7 + 0.25·0.9 = 0.75
B: resourceAccess=0.9, scarcitySource=0
ctx:scarcity_B = 0.75·0 + 0.25·0.1 = 0.025
resourceAccess contribution to B control = 0.20·0.9 = 0.18
```

#### Failure modes

- два одновременных holder;
- action available без spatial precondition;
- object source atom не называет object/relation в trace parts;
- A4 thin-slice `+0.125` подаётся как универсальный outcome law.

### I-2.4 Location v1: оси как факторы (A4)
- **Состав:** `FC.location.propsV1` (default OFF) пропускает `properties`
  сущности SimKit-локации в GoalLab `LocationEntity`; существующие
  `locationAtoms.ts` и `deriveAxes.ts` превращают privacy private↔public в
  `world:loc:privacy:*` и оси privacy/publicness/intimacy. `state` и
  `ownership` не входят в v1. Перемещение как действие уже есть (move-офферы),
  но в этой ячейке не проверяется.
- **Контракт:** OFF — adapter output бит-идентичен при private/public
  манипуляции и golden-run не меняется; ON — properties доходят до pipeline,
  privacy↑, publicness↓, intimacy↑. Чистая функция
  `setLocationPrivacyTransform` меняет только privacy в клонированном мире.
- **RAN 2026-07-07 (freeze 626c4d3, A4-LOC):** private 30/64 affiliative
  (0.46875), public 17/64 (0.265625), **dAffiliative=+0.203125 ≥ +0.10 — PASS**.
  Состав: help 30→17, negotiate 8→21, talk 26→26. Это outcome-level
  подтверждение location-фактора на одной сцене/32 сидах, не проверка всех
  location properties и не проверка move-механики. Долг артефакта: JSON
  сохранил список сидов и aggregate counts, но не per-seed строки; paired
  uncertainty из него не восстановить, и frozen cell ради этого не
  перезапускается.

#### Purpose

Довести уже существующие свойства SimKit location entity до канонических
GoalLab location atoms. Механика не создаёт новые психологические величины;
она устраняет потерю данных в adapter boundary.

#### Formula

```text
locPrivacy = private -> 1; public -> 0; other/missing -> 0.5
privacy    = clamp01(0.7·locPrivacy + 0.3·normPrivacy)
publicness = clamp01(0.7·(1-locPrivacy) + 0.3·normPublicExposure)
surveillance = clamp01(0.55·controlLevel + 0.20·publicness
                       + 0.25·normSurveillance)
intimacy = clamp01(0.7·privacy + 0.3·(1-surveillance))
```

#### Variables

- все нормированные inputs/outputs ∈ `[0,1]`;
- `privacy` source берётся из `LocationEntity.properties` только при effective
  `locationPropsV1`;
- `state`/`ownership` не входят в frozen v1 passthrough.

#### Source of truth

- adapter: `lib/simkit/plugins/goalLabWorldState.ts`;
- atomization: `lib/context/pipeline/locationAtoms.ts`;
- axes: `lib/context/axes/deriveAxes.ts`;
- types: root `types.ts` (`LocationEntity`);
- tests: `tests/simkit/location_props_v1.test.ts`,
  `tests/simkit/mvp0_location_sign.test.ts`;
- trace: `world:loc:privacy:*` -> `ctx:privacy/publicness/intimacy:*`.

#### Invariants

- adapter не изменяет location entity;
- no-profile/config-OFF shape не получает `properties`;
- profile/flag ON передаёт реальные properties без UI reconstruction;
- location outcome report остаётся single-scene evidence.

#### Minimal example

```text
private clean room:
privacy=0.7; publicness=0; surveillance=0; intimacy=0.79

public clean room:
privacy=0; publicness=0.7; surveillance=0.14; intimacy=0.258
```

#### Failure modes

- private/public twins дают одинаковые atoms при profile ON;
- UI показывает entity privacy, хотя adapter/pipeline её потерял;
- `dAffiliative=0.203125` интерпретируется без оговорки о pooled agents и
  отсутствии per-seed artifact rows.

### I-2.5 Память: A3 в полную силу

#### Назначение

Effective `runtimeMechanics.memoryThreatTraceV1` превращает принятую речь
`threaten` в явный затухающий внутренний trace. No-profile ветвь продолжает
читать default-OFF `FC.memory.threatTraceV1`; профиль `phase1` включает канал
без глобальной мутации FC.

#### Формула

```text
c(t) = c0 · d^(t - τ)
t_1/2 = ln(0.5) / ln(d)
```

#### Переменные

- `c0 ∈ [0,1]` — confidence принятого speech-атома после trust gate.
- `d = 0.97` — `decayPerTick` из `FC.memory.threatTraceV1`.
- `τ` — тик наблюдения; `t` — текущий тик, `t ≥ τ`.
- `forgetBelow = 0.12` — порог удаления trace; `maxFacts = 600` — предел store.

#### Источники истины

- runtime: `lib/simkit/post/perceiveActions.ts`,
  `lib/simkit/plugins/perceptionMemoryPlugin.ts`,
  `lib/simkit/plugins/goalLabWorldState.ts`;
- config: `lib/config/formulaConfig.ts` (`FC.memory.threatTraceV1`);
- tests: `tests/simkit/memory_threat_v1.test.ts`,
  `tests/simkit/mvp0_memory_sign.test.ts`;
- trace/report: `kanonar_behavior_lab/data/reports/mvp0_memory_sign.json`.

#### Инварианты

- абсолютный возраст считается от `lastObservedTick`; повторное
  `confidence *= d^age` запрещено для v1 trace;
- в GoalLab возвращаются только decaying entries с tags `{speech, threat}`;
- no-profile/legacy не включает новый store; wipe очищает все B memory stores
  до шага twin.

#### Минимальный пример

```text
c0 = 0.60, d = 0.97, age = 23
c(23) = 0.60 · 0.97^23 ≈ 0.298
t_1/2 = 22.7566; discrete crossing = 23; ratio = 1.0107
```

#### Результат и ограничения

**RAN 2026-07-07 (freeze b3f8f9f): A3 PASS.** На заранее выбранном из
C1-v1 threat-responsive seed 3 оба twin получают одну угрозу в t0; wipe B
перед t2 даёт первое расхождение B в t2 (lag 0): base `help`, twin
`negotiate`. Half-life проходит критерий ×2. Результат — single-seed
mechanism cell, не population estimate. Upstream `mem:speech:threat:*` пока не
доходит до action-level `usedAtomIds`; S8 показывает только разошедшиеся
`util:hint:*`, поэтому индивидуальная atom-attribution остаётся debt.

#### Failure modes

- speech trace отсутствует в S0 после завершения fresh delivery;
- confidence зависит от числа вызовов persistence, а не только от возраста;
- no-profile меняет applied-action/menu semantics без отдельной версии;
- wipe не меняет решение в frozen пяти-тиковом окне.

## 5. Верификация и дисциплина (сквозные)

- TS: `npx vitest run tests/simkit tests/goals`; `npm run typecheck` при
  production-изменениях; полный `tests/` перед freeze-коммитами.
- Contract: read-only метрики — побайтовая неизменность; OFF-ветки флагов
  бит-идентичны легаси.
- Python: грейдеры на per-seed данных; `calibrate` как гейт (exit≠0).
- Freeze коммитом ДО прогона; грейдить только названным эстиматором; per-seed
  данные хранить; греп «сознание» вне conceptual-слоя = ноль.
- **Отчёт после каждого куска** (обязательные поля): какой тест прошёл; сид(ы);
  first divergence tick; какой атом вызвал расхождение; hash golden-run;
  что осталось debt.

## 6. Ожидаемые артефакты Фазы I

| артефакт | появляется в |
|---|---|
| per-seed CSV/long-format + перегрейженный вердикт interaction | I-0.1 |
| PAM v2 versioned freeze | I-0.2 |
| `lib/metrics/tension.ts` + `docs/TENSION_FUNCTIONAL.md` (FROZEN) | I-0.5 |
| `mvp0Scene` + `objectSpec` + `runMvpRollout` + `runTwins` | I-1 |
| golden-run hash (в тесте) + первый twin-отчёт (divergence tick + атом) | I-1.4/1.5 |
| закрытые A1–A5 по минимальным PASS | I-2 |

## 7. Порядок работ

```
I-0.1 → I-0.2 → I-0.3/I-0.4 (мелкие, пакетом)   ← закрывают v4 честно
I-0.5 (tension.ts) — параллелимо с I-0.1..4
I-1.1 → I-1.2 → I-1.4 → I-1.5 → I-1.3            ← сцена и раннер раньше контракта C1
I-2 — только после приёмки DoD I-1
```

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
