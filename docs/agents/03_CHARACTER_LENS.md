# 3) Character Lens: оператор субъективности `ctx:* → ctx:final:*`

**Источник истины:** `lib/context/lens/characterLens.ts` (`applyCharacterLens`).

Линза делает две ключевые вещи:
1) создаёт **субъективные** контекстные оси `ctx:final:<axis>:<selfId>` из “сырых” `ctx:<axis>:<selfId>`;
2) (частично) создаёт **субъективные** ToM-метрики dyad (если подключено; см. `mkDyadDerived`).

## 3.1. Инварианты линзы

1) **Не трогать world/obs факты.** Линза не должна перетирать `world:*`/`obs:*`.
2) **Не перетирать `ctx:*`.** Она добавляет `ctx:final:*`.
3) **Никаких self-cycles в trace.** `trace.usedAtomIds` очищается (см. `sanitizeUsedAtomIds`).
4) **Клиппинг:** все magnitudes линзы в [0,1] (`clamp01`).
5) **Base copy:** перед override создаётся “base copy” атома (см. `ensureBaseCopy`), чтобы explainability сохранялась.

## 3.2. Входы линзы

Линза читает:

### (A) Трейты / тело (feat:char)

Пусть:
- \(p\) = paranoia, \(s\) = sensitivity, \(e\) = experience,
- \(a\) = ambiguityTolerance,
- \(h\) = hpaReactivity,
- \(n\) = normSensitivity,
- \(\sigma\) = stress, \(f\) = fatigue.

Значения берутся из атомов `feat:char:<selfId>:trait.*` и `feat:char:<selfId>:body.*`.

### (B) Сырой контекст `ctx:*`

Для каждого контекстного канала берётся базовое значение \(x_0\) из `ctx:<axis>:<selfId>` (fallback = 0).

В текущем коде участвуют (минимум):
- danger, uncertainty, normPressure, publicness,
- surveillance (fallback на `world:loc:control_level:*`),
- intimacy, crowd,
- control, timePressure, secrecy, legitimacy, hierarchy, privacy.

## 3.3. Центральная формула: modulate(x, bias, sensitivity)

Линза задаётся функцией:

1) базовое смещение:
\[
x'=\mathrm{clamp01}(x+b)
\]
2) центрирование около 0.5:
\[
z=x'-0.5
\]
3) усиление:
\[
z' = k\cdot z
\]
4) возврат в [0,1]:
\[
\mathrm{modulate}(x,b,k)=\mathrm{clamp01}(0.5+z')
\]

> Важное отличие от «чистого amplify»: здесь есть **bias**, который сдвигает базовую оценку даже при \(x\approx0.5\).

## 3.4. Откуда берутся bias и k (пример: danger)

### 3.4.1. Сжатая подозрительность (diagnostic)

Линза вычисляет «подозрительность»:
\[
\mathrm{suspicion}=\mathrm{clamp01}\big(0.55p + 0.20\sigma + 0.15\,surv_0 + 0.10\,danger_0\big)
\]
(используется как объяснимый агрегат; важно для дебага).

### 3.4.2. Коэффициенты усиления (k)

Для danger в коде:
\[
k_{danger}=1 + 1.2(p-0.5) + 0.6(\sigma-0.5) + 0.45(h-0.5)
\]
Смысл: паранойя/стресс/реактивность HPA повышают *чувствительность* восприятия опасности.

### 3.4.3. Смещения (b)

Три линейных вклада:
\[
\begin{aligned}
+b_{paranoia}&=0.7(p-0.5)\\
+b_{stress}&=0.25(\sigma-0.5)\\
+b_{exp}&=-0.30(e-0.5)\\
+b_{danger}&=b_{paranoia}+b_{stress}+b_{exp}
\end{aligned}
\]
Смысл: опыт снижает систематическую переоценку угрозы.

И затем:
\[
danger=\mathrm{modulate}(danger_0,b_{danger},k_{danger})
\]

Аналогичные пары \((b,k)\) заданы для uncertainty/norm/publicness/surveillance/… (см. `characterLens.ts`).

## 3.5. Выходы линзы: `ctx:final:*`

Для каждого axis создаётся derived-атом:

- `id = ctx:final:<axis>:<selfId>`
- `origin = derived`, `source = character_lens`
- `magnitude = clamp01(result)`
- `trace.usedAtomIds` включает:
  - входные `feat:char:*` и `ctx:*`,
  - **base copy** для соответствующей `ctx:*` оси.

### Почему нужен base copy

Если мы создаём `ctx:final:*` как override-слой, важно уметь показать пользователю:
- чему равнялось сырьё до линзы,
- какие именно черты дали смещение.

`ensureBaseCopy(...)` создаёт атом вроде:
- `ctx:base:danger:<selfId>`
с `trace.notes = ['base copy before override', ...]` и ссылками на исходные usedAtomIds.

## 3.6. Инварианты trace (самый частый источник багов)

Линза санитизирует зависимости:

- удаляет ссылки на самого себя (`x === outId`);
- удаляет нестроки/пустые;
- дедуплицирует.

Это важно, потому что граф атомов (`AtomGraph`) строится по `trace.usedAtomIds` и любая петля → плохо для визуализации/объяснимости.

## 3.7. Как расширять линзу (контракт)

Если ты добавляешь новую ось контекста, на которую должна влиять субъективность:

1) обеспечить её существование на сыром уровне `ctx:<axis>:<id>` до стадии применения линзы;
2) добавить чтение \(x_0\) в `characterLens.ts`;
3) задать \((b,k)\) из trait/body/ctx так, чтобы при (traits=0.5) линза была почти тождественной;
4) добавить выход `ctx:final:<axis>:<id>` и включить зависимости в `usedCtx`.
