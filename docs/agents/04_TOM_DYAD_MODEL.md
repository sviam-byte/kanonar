# 4) ToM dyad: модель «A о B» (`computeDyadMetrics_A_about_B`)

**Источник истины:** `lib/tom/dyad-metrics.ts`.

Dyad-модель считает набор метрик, описывающих субъективные отношения A к B.

## 4.1. Конфиг восприятия `DyadConfigForA`

A имеет конфиг ("как я воспринимаю других"):

- `like_sim_axes`: что мне приятно, когда похоже
- `like_opposite_axes`: что мне приятно, когда дополняет
- `trust_sim_axes`: чему доверяю при сходстве ценностей
- `trust_partner_axes`: чему доверяю, если партнёр “силён” по этим осям
- `fear_threat_axes`: что считаю угрозой, если у партнёра высоко
- `fear_dom_axes`: по каким осям партнёр может доминировать
- `respect_partner_axes`: что вызывает уважение (высокие значения партнёра)
- `closeness_sim_axes`: что даёт близость при сходстве
- `dominance_axes`: по каким осям измеряется доминирование

И набор bias:
- `bias_liking, bias_trust, bias_fear, bias_respect, bias_closeness, bias_dominance` (в коде заявлено -1..+1).

Конфиги лежат в `data/tom-dyad-configs.ts` (источник конкретных весов).

## 4.2. Примитивы и агрегаты

См. `docs/agents/02_AXIS_SPACE.md` для формул `sim`, `dom`, `Threat`.

Обозначения:
- \(\mathbf{a}\) — вектор `a.vector_base`
- \(\mathbf{b}\) — вектор `b.vector_base`

Агрегаты:
\[
\begin{aligned}
like\_sim &= \mathrm{Sim}_{W_{like\_sim}}(\mathbf{a},\mathbf{b}) \\
like\_opp &= 1 - \mathrm{Sim}_{W_{like\_opp}}(\mathbf{a},\mathbf{b}) \\
trust\_sim &= \mathrm{Sim}_{W_{trust\_sim}}(\mathbf{a},\mathbf{b}) \\
trust\_partner &= \mathrm{Level}_{W_{trust\_partner}}(\mathbf{b}) \\
fear\_threat &= \mathrm{Threat}_{W_{fear\_threat}}(\mathbf{b}) \\
fear\_dom &= \max(0,\mathrm{Dom}_{W_{fear\_dom}}(\mathbf{a},\mathbf{b})) \\
respect\_partner &= \mathrm{Level}_{W_{respect\_partner}}(\mathbf{b}) \\
closeness\_sim &= \mathrm{Sim}_{W_{closeness\_sim}}(\mathbf{a},\mathbf{b}) \\
dom &= \mathrm{Dom}_{W_{dom}}(\mathbf{a},\mathbf{b})
\end{aligned}
\]

## 4.3. Нелинейности

В коде:

- `squash(x)=tanh(x)` → диапазон [-1,1]
- `clamp01(x)` → [0,1]

Для перевода `tanh` в [0,1] используется:
\[
g(x)=0.5(\tanh(x)+1)
\]

## 4.4. Метрики (формулы из кода)

### 4.4.1 Liking (-1..1)

\[
liking = \tanh\Big(bias_{liking} + 1.5\,like\_sim + 1.0\,like\_opp - 1.0\,fear\_threat + \Delta_{liking}\Big)
\]

### 4.4.2 Trust (0..1)

\[
trust = g\Big(bias_{trust} + 1.5\,trust\_sim + 1.0\,trust\_partner - 1.0\,fear\_threat - 0.5\,fear\_dom + \Delta_{trust}\Big)
\]

### 4.4.3 Fear (0..1)

\[
fear = g\Big(bias_{fear} + 1.5\,fear\_threat + 1.0\,fear\_dom + \Delta_{fear}\Big)
\]

### 4.4.4 Respect (0..1)

\[
respect = g\Big(bias_{respect} + 1.5\,respect\_partner + 0.3\,fear\_threat + 0.3\,fear\_dom + \Delta_{respect}\Big)
\]

### 4.4.5 Closeness (0..1)

Здесь важно: closeness использует уже вычисленный `liking` и `fear`:

\[
closeness = g\Big(bias_{closeness} + 1.5\,closeness\_sim + 0.5\,liking - 1.0\,fear + \Delta_{closeness}\Big)
\]

### 4.4.6 Dominance (-1..1)

\[
dominance = \tanh\Big(bias_{dominance} + 1.0\,dom - 0.5\,fear\_threat + \Delta_{dominance}\Big)
\]

Интерпретация знака (как в типе):
- \(dominance>0\): A доминирует (субъективно)
- \(dominance<0\): A подчинён

## 4.5. Override (ручные дельты)

Структура `DyadOverride` позволяет вручную подвинуть любые метрики через `*_delta`.
Это добавляется *в raw-логит* перед `tanh`/`g`.

Контракт: дельты должны быть ограничены по масштабу (иначе `tanh` быстро насыщается и всё станет 0/1/±1).

## 4.6. Где dyad превращается в атомы

`computeDyadMetrics_A_about_B` сам по себе возвращает числа.

Дальше они обычно материализуются как атомы `tom:dyad:*` (и при наличии линзы — как `tom:dyad:final:*`, см. `03_CHARACTER_LENS.md`).
