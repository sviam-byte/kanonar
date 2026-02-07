# Agent Playbook (Kanonar / Goal Lab)

Этот файл предназначен для “агента” (в т.ч. для меня), чтобы быстро и одинаково работать с репо.

## Commands (copy-paste)

Install:
```bash
npm i
```

Dev:
```bash
npm run dev
```

Tests:
```bash
npm test
```

Watch:
```bash
npm run test:watch
```

Build:
```bash
npm run build
```

Preview:
```bash
npm run preview
```

Optional maintenance:
```bash
npm run unused
npm run prune:stubs
```

## Rules (hard)

1) Любое изменение поведения стадии пайплайна (S0…S8) требует:
   - обновить `docs/PIPELINE.md`
   - при необходимости добавить/поправить тесты в `tests/pipeline/*`

2) Любой новый “закон”/инвариант требует:
   - записать в `docs/INVARIANTS.md`
   - добавить тест или runtime-check (в pipeline)

3) Goal/Action изоляция:
   - `action:*` НЕ читает `goal:*` напрямую (только `util:*`)

4) Namespace discipline:
   - после S3 потребители должны читать `ctx:final:*`
   - чтение `ctx:*` без `:final:` после S3 рассматривается как баг (кроме явно документированных fallback)

5) Патчи:
   - присылать **только git diff**
   - не делать форматирование “заодно”

## Debug routine (standard)

Когда “непонятно почему так решило”:
1) Найти стадию, где впервые появился странный атом (через Pipeline panel / stage snapshots).
2) Открыть trace.usedAtomIds на проблемном атоме и проверить:
   - используются ли допустимые ns для этой стадии (см. `docs/PIPELINE.md`)
3) Если проблема в DecisionGraph:
   - проверять `components/goal-lab/DecisionGraphView.tsx`
   - проверять сборку рёбер в `lib/graph/GraphAdapter.ts`
4) Если проблема в personality lens:
   - `lib/context/lens/characterLens.ts`
   - тесты: `tests/lens/*`

## Where is the truth

- Pipeline: `lib/goal-lab/pipeline/*`
- Atom types: `lib/context/v2/types.ts`
- Goal catalog: `lib/goals/*`
- Graph building: `lib/graph/*`
- GoalLab UI: `components/goal-lab/*`
