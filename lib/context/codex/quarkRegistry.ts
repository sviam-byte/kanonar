// lib/context/codex/quarkRegistry.ts
// Single “source of truth” for quark codes (atom.code).
// AtomSpec explains atom.id; this explains atom.code.

export type QuarkFamily =
  | 'ctx.axis'
  | 'ctx.source'
  | 'world.loc'
  | 'world.map'
  | 'world.env'
  | 'obs'
  | 'app'
  | 'emo'
  | 'tom'
  | 'rel'
  | 'mind'
  | 'lens'
  | 'trace'
  | 'missing';

export type QuarkDef = {
  code: string;
  family: QuarkFamily;
  title: string;
  meaning: string;
  tags?: string[];
  scale?: { min: number; max: number; lowMeans: string; highMeans: string; unit?: string; typical?: string };
};

function mk(
  code: string,
  family: QuarkFamily,
  title: string,
  meaning: string,
  opts?: Partial<Pick<QuarkDef, 'tags' | 'scale'>>
): QuarkDef {
  return { code, family, title, meaning, tags: opts?.tags, scale: opts?.scale };
}

// Minimal canonical set. Extend aggressively later (this file is the intended growth point).
const BASE: QuarkDef[] = [
  mk('world.tick', 'world.env', 'Тик мира', 'Маркер времени/шага симуляции.', {
    tags: ['world'],
    scale: { min: 0, max: 1, lowMeans: '—', highMeans: '—' }
  }),
  mk('world.location', 'world.env', 'Текущая локация', 'Ссылка/якорь: где находится агент.', { tags: ['world'] }),

  mk('world.env.hazard', 'world.env', 'Опасность среды', 'Сводная опасность локации (hazards + карта).', {
    tags: ['hazard','world'],
    scale: { min: 0, max: 1, lowMeans: 'безопасно', highMeans: 'крайне опасно', typical: '0.0–0.8' }
  }),

  mk('lens.suspicion', 'lens', 'Подозрительность линзы', 'Множитель линзы: насколько агент интерпретирует сигналы как угрозу.', {
    tags: ['lens','tom'],
    scale: { min: 0, max: 1, lowMeans: 'доверчиво', highMeans: 'подозрительно', typical: '0.1–0.7' }
  }),
];

function dyn(code: string): QuarkDef | null {
  // ctx.axis.*
  if (code.startsWith('ctx.axis.')) {
    const axis = code.slice('ctx.axis.'.length);
    return mk(code, 'ctx.axis', `Ось контекста: ${axis}`, `Сводная ось контекста "${axis}" (0..1).`, {
      tags: ['ctx','axis'],
      scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко', typical: '0.1–0.8' }
    });
  }
  // ctx.src.* / ctx.src.group.name
  if (code.startsWith('ctx.src.')) {
    return mk(code, 'ctx.source', `Источник контекста: ${code}`, 'Сырой контекстный сигнал (до линзы).', {
      tags: ['ctx','source'],
      scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' }
    });
  }
  if (code.startsWith('world.loc.')) {
    const metric = code.slice('world.loc.'.length);
    return mk(code, 'world.loc', `Метрика локации: ${metric}`, 'Локальная метрика локации (0..1).', {
      tags: ['world','loc'],
      scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' }
    });
  }
  if (code.startsWith('world.map.')) {
    const metric = code.slice('world.map.'.length);
    return mk(code, 'world.map', `Метрика карты: ${metric}`, 'Агрегат/геометрия карты локации (0..1).', {
      tags: ['world','map'],
      scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' }
    });
  }
  if (code.startsWith('obs.')) {
    const ch = code.slice('obs.'.length);
    return mk(code, 'obs', `Наблюдение: ${ch}`, 'Перцептивный сигнал/наблюдение (0..1).', {
      tags: ['obs'],
      scale: { min: 0, max: 1, lowMeans: 'нет', highMeans: 'есть' }
    });
  }
  if (code.startsWith('app.')) {
    const k = code.slice('app.'.length);
    return mk(code, 'app', `Appraisal: ${k}`, 'Промежуточная оценка (0..1), вход для эмоций.', {
      tags: ['appraisal'],
      scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко', typical: '0.1–0.8' }
    });
  }
  if (code.startsWith('emo.dyad.')) {
    const k = code.slice('emo.dyad.'.length);
    return mk(code, 'emo', `Dyadic emotion: ${k}`, 'Эмоция/установка в dyad-режиме (0..1).', {
      tags: ['emo','dyad'],
      scale: { min: 0, max: 1, lowMeans: 'слабо', highMeans: 'сильно', typical: '0.0–0.8' }
    });
  }
  if (code.startsWith('emo.')) {
    const k = code.slice('emo.'.length);
    if (k === 'valence') {
      return mk(code, 'emo', 'Валентность', 'Ось валентности (-1..1): негативно/позитивно.', {
        tags: ['emo','axis'],
        scale: { min: -1, max: 1, lowMeans: 'негативно', highMeans: 'позитивно', typical: '-0.4..0.4' }
      });
    }
    return mk(code, 'emo', `Emotion: ${k}`, 'Базовая эмоция/аффект (0..1).', {
      tags: ['emo'],
      scale: { min: 0, max: 1, lowMeans: 'нет', highMeans: 'сильно', typical: '0.0–0.7' }
    });
  }
  if (code.startsWith('mind.metric.')) {
    const k = code.slice('mind.metric.'.length);
    return mk(code, 'mind', `Mind metric: ${k}`, 'Метрика контекстного mind-scoreboard (0..1).', {
      tags: ['mind'],
      scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' }
    });
  }
  if (code.startsWith('trace.')) {
    const k = code.slice('trace.'.length);
    return mk(code, 'trace', `Trace metric: ${k}`, 'Долговременный след/нагрузка (0..1).', {
      tags: ['trace'],
      scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' }
    });
  }
  return null;
}

export function describeQuark(code: string | null | undefined): QuarkDef {
  const c = String(code || '').trim();
  if (!c) return mk('—', 'missing', 'Нет quark-кода', 'Atom.code отсутствует. Нужна нормализация/AtomSpec.', { tags: ['missing'] });
  const base = BASE.find(x => x.code === c);
  if (base) return base;
  const d = dyn(c);
  if (d) return d;
  return mk(c, 'missing', `Unknown quark: ${c}`, 'Quark-код не описан в quarkRegistry.ts (добавить описание).', { tags: ['missing'] });
}

// Placeholder for future molecules (composition of quarks).
export const MOLECULES: { id: string; title: string; quarks: string[]; meaning: string }[] = [
  {
    id: 'mol.threat.spike',
    title: 'Всплеск угрозы',
    quarks: ['ctx.axis.danger', 'app.threat', 'emo.fear'],
    meaning: 'Составная структура: рост опасности → appraisal угрозы → страх.'
  }
];
