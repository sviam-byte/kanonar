// lib/context/codex/quarkCodex.ts
//
// “Кварк-кодекс” GoalLab: единый справочник значений (атомов) уровня смысла.
//
// Идея:
// - atom.id остаётся совместимым с текущей кодировкой (через ':')
// - atom.code становится каноническим идентификатором смысла ("кварка")
// - atom.params хранит разобранные параметры (selfId, otherId, axis, metric...)
//
// Законы (как из кварков рождаются молекулы/следствия) будут добавляться позже.

import type { AtomNamespace, AtomOrigin, ContextAtomKind, ContextSource } from '../v2/types';
import type { ContextAxisId } from '../../../types';

export type QuarkCode = string;

export type QuarkParamSchema = Record<
  string,
  { type: 'string' | 'number' | 'boolean'; required?: boolean; example?: any; note?: string }
>;

export type QuarkDef = {
  code: QuarkCode;
  ns: AtomNamespace;
  kind: ContextAtomKind;
  origin: AtomOrigin;
  defaultSource: ContextSource;
  title: string;
  meaning: string;
  params?: QuarkParamSchema;
  tags?: string[];
  scale?: { min: number; max: number; lowMeans: string; highMeans: string; unit?: string };
};

export const CTX_AXIS_IDS: ContextAxisId[] = [
  'danger','intimacy','hierarchy','publicness','normPressure','surveillance',
  'scarcity','timePressure','uncertainty','legitimacy','secrecy','grief','pain'
];

export const QUARK_CODEX: Record<QuarkCode, QuarkDef> = (() => {
  const out: Record<string, QuarkDef> = {};

  // --- World basics ---
  out['world.tick'] = {
    code: 'world.tick',
    ns: 'world',
    kind: 'world_tick',
    origin: 'world',
    defaultSource: 'world',
    title: 'Тик мира',
    meaning: 'Текущий tick (дискретное время симуляции). magnitude всегда 1; значение хранится в params.tick.',
    params: {
      tick: { type: 'number', required: true, example: 42 },
    },
    tags: ['world', 'tick'],
  };

  out['world.location'] = {
    code: 'world.location',
    ns: 'world',
    kind: 'location_ref',
    origin: 'world',
    defaultSource: 'world',
    title: 'Ссылка на текущую локацию',
    meaning: 'Текущая локация агента; magnitude всегда 1; locationId обычно лежит в atom.target или atom.meta.locationId.',
    params: {
      selfId: { type: 'string', required: true, example: 'agent_1' },
      locationId: { type: 'string', required: false, example: 'loc_warehouse', note: 'обычно лежит в atom.target или atom.meta.locationId' },
    },
    tags: ['world', 'location'],
  };

  // world.loc.*
  const worldLoc = (metric: string, title: string, meaning: string): QuarkDef => ({
    code: `world.loc.${metric}`,
    ns: 'world',
    kind: 'world_fact',
    origin: 'world',
    defaultSource: 'locationExtractor',
    title,
    meaning,
    params: { selfId: { type: 'string', required: true, example: 'agent_1' } },
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    tags: ['world','location'],
  });
  out['world.loc.privacy'] = worldLoc('privacy','Приватность локации','Насколько локация приватна (0..1).');
  out['world.loc.visibility'] = worldLoc('visibility','Видимость в локации','Насколько легко видеть и быть увиденным (0..1).');
  out['world.loc.noise'] = worldLoc('noise','Шум в локации','Насколько шумно (0..1); снижает слышимость.');
  out['world.loc.social_visibility'] = worldLoc('social_visibility','Социальная видимость','Насколько легко привлечь социальное внимание (0..1).');
  out['world.loc.normative_pressure'] = worldLoc('normative_pressure','Нормативное давление (локация)','Насколько локация “давит правилами” (0..1).');
  out['world.loc.control_level'] = worldLoc('control_level','Контроль (локация)','Насколько локация контролируется институтами/силой (0..1).');
  out['world.loc.crowd'] = worldLoc('crowd','Толпа','Насколько многолюдно (0..1).');

  // world.map.*
  const worldMap = (metric: string, title: string, meaning: string): QuarkDef => ({
    code: `world.map.${metric}`,
    ns: 'world',
    kind: 'world_fact',
    origin: 'world',
    defaultSource: 'locationExtractor',
    title,
    meaning,
    params: { selfId: { type: 'string', required: true } },
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    tags: ['world','map'],
  });
  out['world.map.cover'] = worldMap('cover','Укрытия','Средняя доступность укрытий вокруг (0..1).');
  out['world.map.danger'] = worldMap('danger','Опасность (карта)','Средняя опасность клеток/района (0..1).');
  out['world.map.escape'] = worldMap('escape','Возможность уйти','Прокси-оценка “можно ли сбежать” (0..1).');
  out['world.map.exits'] = worldMap('exits','Выходы','Нормированное число выходов (0..1).');
  out['world.map.walkableFrac'] = worldMap('walkableFrac','Проходимость','Доля проходимых клеток (0..1).');

  out['world.env.hazard'] = {
    code: 'world.env.hazard',
    ns: 'world',
    kind: 'world_fact',
    origin: 'world',
    defaultSource: 'locationExtractor',
    title: 'Опасность среды',
    meaning: 'Интенсивность средовых угроз (0..1), агрегированная по hazard list.',
    params: { selfId: { type: 'string', required: true } },
    scale: { min: 0, max: 1, lowMeans: 'безопасно', highMeans: 'опасно' },
    tags: ['world','hazard'],
  };

  // obs.*
  const obsDyad = (metric: string, title: string, meaning: string): QuarkDef => ({
    code: `obs.${metric}`,
    ns: 'obs',
    kind: 'observation',
    origin: 'obs',
    defaultSource: 'observationExtractor',
    title,
    meaning,
    params: { selfId: { type: 'string', required: true }, otherId: { type: 'string', required: true } },
    scale: { min: 0, max: 1, lowMeans: 'нет', highMeans: 'да' },
    tags: ['obs'],
  });
  out['obs.nearby'] = obsDyad('nearby','Близость','Насколько другой агент близко (0..1).');
  out['obs.los'] = obsDyad('los','Линия видимости','Насколько есть визуальный контакт (0..1).');
  out['obs.audio'] = obsDyad('audio','Слышимость','Насколько слышно другого (0..1).');
  out['obs.infoAdequacy'] = {
    code: 'obs.infoAdequacy',
    ns: 'obs',
    kind: 'observation',
    origin: 'obs',
    defaultSource: 'observationExtractor',
    title: 'Адекватность информации',
    meaning: 'Сводная оценка качества восприятия/данных в тике (0..1).',
    params: { selfId: { type: 'string', required: true } },
    scale: { min: 0, max: 1, lowMeans: 'плохая', highMeans: 'хорошая' },
    tags: ['obs'],
  };

  // ctx.axis.*
  for (const axis of CTX_AXIS_IDS) {
    out[`ctx.axis.${axis}`] = {
      code: `ctx.axis.${axis}`,
      ns: 'ctx',
      kind: 'ctx_axis',
      origin: 'derived',
      defaultSource: 'deriveAxes',
      title: `Ось контекста: ${axis}`,
      meaning: `Высокоуровневый контекст-сигнал ${axis} (0..1).`,
      params: { selfId: { type: 'string', required: true } },
      scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
      tags: ['ctx','axis'],
    };
  }

  // app.* + emo.* + tom.dyad.* (минимальное ядро)
  // (оставлено как в файле — ядро есть, расширять просто добавлением записей)

  return out;
})();
