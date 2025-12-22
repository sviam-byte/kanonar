// lib/context/catalog/atomSpecs.ts
const AXIS_RU: Record<string, { title: string; low: string; high: string }> = {
  danger:       { title: 'Опасность',        low: 'безопасно',                high: 'опасно' },
  intimacy:     { title: 'Интимность',       low: 'дистанция',                high: 'близость' },
  hierarchy:    { title: 'Иерархия',         low: 'равенство',                high: 'жёсткая иерархия' },
  publicness:   { title: 'Публичность',      low: 'приватно',                 high: 'публично' },
  normPressure: { title: 'Норм-давление',    low: 'можно нарушать без цены',  high: 'нельзя нарушать' },
  surveillance: { title: 'Наблюдение',       low: 'никто не смотрит',         high: 'под наблюдением' },
  scarcity:     { title: 'Дефицит',          low: 'ресурсов хватает',         high: 'дефицит' },
  timePressure: { title: 'Дедлайн',          low: 'времени достаточно',       high: 'времени нет' },
  uncertainty:  { title: 'Неопределённость', low: 'понятно что происходит',   high: 'непонятно' },
  legitimacy:   { title: 'Легитимность',     low: 'сомнительно',              high: 'легитимно/разрешено' },
  secrecy:      { title: 'Секретность',      low: 'можно говорить',           high: 'нельзя раскрывать' },
  grief:        { title: 'Горе',             low: 'нет утраты',               high: 'сильная утрата' },
  pain:         { title: 'Боль',             low: 'нет боли',                 high: 'сильная боль' },
};

export type AtomScale = {
  min: number;
  max: number;
  unit?: string;
  lowMeans: string;
  highMeans: string;
  typical?: string;
};

export type AtomSpec = {
  specId: string;
  idPattern: RegExp;               // матчим по id
  title: (p: Record<string, string>) => string;
  meaning: (p: Record<string, string>) => string;
  scale?: AtomScale;
  formula?: (p: Record<string, string>) => string;
  producedBy?: string[];
  consumedBy?: string[];
  tags?: string[];
};

export type ResolvedSpec = {
  spec: AtomSpec;
  params: Record<string, string>;
};

function matchPattern(id: string, re: RegExp): Record<string, string> | null {
  const m = id.match(re);
  if (!m) return null;
  const groups = (m as any).groups || {};
  return groups;
}

// Основные спеки (ядро). Дальше расширяется.
export const ATOM_SPECS: AtomSpec[] = [
  {
    specId: 'world.location.ref',
    idPattern: /^world:location:(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Мир: текущая локация (${p.selfId})`,
    meaning: p =>
      `Ссылочный атом: где находится агент ${p.selfId} в текущем тике. ` +
      `magnitude всегда 1, а конкретный locationId хранится в atom.target / atom.meta.locationId и в label.`,
    scale: { min: 0, max: 1, lowMeans: 'не используется', highMeans: 'активно' },
    producedBy: ['lib/context/pipeline/worldFacts.ts'],
    consumedBy: ['lib/context/sources/locationAtoms.ts', 'lib/context/pipeline/stage0.ts'],
    tags: ['world','location']
  },
  {
    specId: 'ctx.axis',
    idPattern: /^ctx:(?<axis>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)(?::(?<otherId>[a-zA-Z0-9_-]+))?$/,
    title: p => `Контекст: ${(AXIS_RU[p.axis]?.title ?? p.axis)}${p.otherId ? ` (${p.otherId})` : ''}`,
    meaning: p => `Контекстная ось "${p.axis}" для ${p.selfId}${p.otherId ? ` относительно ${p.otherId}` : ''}.`,
    scale: {
      min: 0, max: 1,
      lowMeans: p => (AXIS_RU[p.axis]?.low ?? 'низко') as any,
      highMeans: p => (AXIS_RU[p.axis]?.high ?? 'высоко') as any,
    } as any,
    tags: ['ctx']
  },
  {
    specId: 'ctx.source',
    idPattern: /^ctx:src:(?<name>[a-zA-Z0-9_-]+)(?::(?<selfId>[a-zA-Z0-9_-]+))?$/,
    title: p => `Источник контекста: ${p.name}`,
    meaning: _p => `Вклад/фича, которая участвует в сборке контекстных осей (ctx:*).`,
    scale: { min: 0, max: 1, lowMeans: 'не влияет', highMeans: 'сильно влияет' },
    tags: ['ctx','src']
  },
  {
    specId: 'ctx.source.scoped',
    idPattern: /^ctx:src:(?<group>[a-zA-Z0-9_-]+):(?<name>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Источник контекста: ${p.group}.${p.name} (${p.selfId})`,
    meaning: p =>
      `Агент-скоупнутый вход в сборку ctx-осей: группа="${p.group}", имя="${p.name}". ` +
      `Как правило, это “сырые” входы из сцены/норм/мира вида ctx:src:${p.group}:${p.name}:${p.selfId}.`,
    scale: { min: 0, max: 1, lowMeans: 'не влияет', highMeans: 'сильно влияет' },
    producedBy: ['lib/scene/applyScene.ts', 'lib/context/pipeline/worldFacts.ts'],
    consumedBy: ['lib/context/axes/deriveAxes.ts'],
    tags: ['ctx','src']
  },
  {
    specId: 'ctx.scene.mode',
    idPattern: /^ctx:scene:mode:(?<mode>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Режим сцены: ${p.mode} (${p.selfId})`,
    meaning: p =>
      `Канонический флаг режима сцены для агента ${p.selfId}. ` +
      `Появляется из scene-инъекции вида scene:mode:${p.mode} и сохраняется, даже если legacy scene:* атомы фильтруются.`,
    scale: { min: 0, max: 1, lowMeans: 'не активен', highMeans: 'активен' },
    producedBy: ['lib/scene/applyScene.ts'],
    consumedBy: ['lib/engine/integrators.ts', 'lib/context/*', 'lib/decision/*'],
    tags: ['ctx','scene','mode']
  },
  {
    specId: 'norm.scene',
    idPattern: /^norm:(?<name>[a-zA-Z0-9_-]+)(?::(?<selfId>[a-zA-Z0-9_-]+))?$/,
    title: p => `Норма: ${p.name}${p.selfId ? ` (${p.selfId})` : ''}`,
    meaning: _p => `Нормативный вход (из сцены/локации), используемый для ctx-осей и decision gate.`,
    scale: { min: 0, max: 1, lowMeans: 'нет/слабо', highMeans: 'сильно' },
    tags: ['norm']
  },
  {
    specId: 'obs.nearby',
    idPattern: /^obs:nearby:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Наблюдение: близость ${p.otherId}`,
    meaning: p => `Оценка “насколько ${p.otherId} рядом” с точки зрения ${p.selfId}.`,
    scale: { min: 0, max: 1, lowMeans: 'далеко/не рядом', highMeans: 'очень близко' },
    producedBy: ['lib/context/sources/observationAtoms.ts'],
    consumedBy: ['lib/context/stage1/socialProximity.ts', 'lib/threat/*'],
    tags: ['obs','social']
  },
  {
    specId: 'app.generic',
    idPattern: /^app:(?<channel>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Appraisal: ${p.channel} (${p.selfId})`,
    meaning: p =>
      `Оценка ситуации (appraisal) для агента ${p.selfId}: канал "${p.channel}". ` +
      `Appraisal — промежуточный слой между контекстом (ctx/threat/mind/world) и эмоциями (emo:*).`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    tags: ['app','emotionLayer']
  },
  {
    specId: 'emo.generic',
    idPattern: /^emo:(?<channel>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Emotion: ${p.channel} (${p.selfId})`,
    meaning: p =>
      `Эмоция/аффективный канал для агента ${p.selfId}: "${p.channel}". ` +
      `Считается из appraisal-атомов (app:*), которые, в свою очередь, считаются из ctx/threat/mind/world. ` +
      `Диапазон по умолчанию 0..1 (valence может храниться как 0..1 при внутреннем -1..1).`,
    scale: { min: 0, max: 1, lowMeans: 'нет/слабо', highMeans: 'сильно' },
    tags: ['emo','emotionLayer']
  },
  {
    specId: 'tom.dyad.trust',
    idPattern: /^tom:dyad:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+):trust$/,
    title: p => `ToM: доверие к ${p.otherId}`,
    meaning: p => `Оценка доверия ${p.selfId} к ${p.otherId} (в dyad-модели).`,
    scale: { min: 0, max: 1, lowMeans: 'не доверяет', highMeans: 'очень доверяет' },
    producedBy: ['lib/context/sources/tomDyadAtoms.ts', 'lib/tom/*'],
    consumedBy: ['lib/context/stage1/socialProximity.ts', 'lib/threat/*', 'lib/decision/*'],
    tags: ['tom','dyad']
  },
  {
    specId: 'tom.dyad.threat',
    idPattern: /^tom:dyad:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+):threat$/,
    title: p => `ToM: угроза от ${p.otherId}`,
    meaning: p => `Сводная оценка угрозы/конфликтности со стороны ${p.otherId} для ${p.selfId} (из ToM).`,
    scale: { min: 0, max: 1, lowMeans: 'не опасен', highMeans: 'очень опасен' },
    producedBy: ['lib/context/sources/tomDyadAtoms.ts'],
    consumedBy: ['lib/threat/*', 'lib/context/stage1/socialProximity.ts'],
    tags: ['tom','dyad']
  },
  {
    specId: 'tom.dyad.metric',
    idPattern: /^tom:dyad:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+):(?<metric>[a-zA-Z0-9_]+)$/,
    title: p => `ToM dyad: ${p.metric} к ${p.otherId}`,
    meaning: p => `Нормализованная dyad-оценка (${p.metric}) того, как ${p.selfId} воспринимает ${p.otherId}.`,
    scale: { min: 0, max: 1, lowMeans: 'минимум', highMeans: 'максимум', typical: '0.2–0.8' },
    formula: p => `Берётся из ToM-состояния (world.tom / agent.tom) и сводится в tom:dyad:* в extractTomDyadAtoms().`,
    producedBy: ['lib/context/sources/tomDyadAtoms.ts'],
    consumedBy: ['lib/context/stage1/socialProximity.ts', 'lib/threat/*', 'lib/decision/*'],
    tags: ['tom','dyad']
  },
  {
    specId: 'tom.effective.dyad.metric',
    idPattern: /^tom:effective:dyad:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+):(?<metric>[a-zA-Z0-9_-]+)$/,
    title: p => `ToM (effective): ${p.metric} к ${p.otherId}`,
    meaning: p => `ToM-оценка ${p.metric}, скорректированная контекстом (effective) для ${p.selfId}→${p.otherId}.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    tags: ['tom','effective']
  },
  {
    specId: 'rel.tag',
    idPattern: /^rel:tag:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+):(?<tag>[a-zA-Z0-9_-]+)$/,
    title: p => `Отношение: ${p.tag} (${p.otherId})`,
    meaning: p => `Бинарный ярлык отношения (friend/enemy/etc) для пары ${p.selfId} → ${p.otherId}. Может быть из памяти (rel_base) или подсказкой из ToM.`,
    scale: { min: 0, max: 1, lowMeans: 'нет ярлыка', highMeans: 'ярлык активен' },
    producedBy: ['lib/rel/*', 'lib/context/sources/tomDyadAtoms.ts'],
    consumedBy: ['lib/context/stage1/socialProximity.ts', 'lib/decision/*'],
    tags: ['rel']
  },
  {
    specId: 'soc.proximity',
    idPattern: /^prox:(?<kind>friend|enemy|neutral):(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Социальная близость: ${p.kind} рядом (${p.otherId})`,
    meaning: p => `Интеграция “рядом” (obs:nearby) и отношения (tom:dyad + rel:tag) в один сигнал: кто рядом и это союзник/враг/нейтрал для ${p.selfId}.`,
    scale: { min: 0, max: 1, lowMeans: 'почти не влияет', highMeans: 'рядом и сильно влияет' },
    formula: _p => `prox = w_close*obs:nearby + w_rel*ToM/rel (см. socialProximity.ts)`,
    producedBy: ['lib/context/stage1/socialProximity.ts'],
    consumedBy: ['lib/threat/*', 'lib/decision/*', 'lib/contextMind/*'],
    tags: ['social']
  },
  {
    specId: 'prox.generic',
    idPattern: /^prox:(?<kind>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Близость: ${p.kind} (${p.otherId})`,
    meaning: p => `Геометрическая близость/соседство (${p.kind}) для ${p.selfId}↔${p.otherId}.`,
    scale: { min: 0, max: 1, lowMeans: 'далеко', highMeans: 'рядом' },
    tags: ['map','prox']
  },
  {
    specId: 'soc.support_threat',
    idPattern: /^soc:(?<kind>support|threat):(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Социально: ${p.kind === 'support' ? 'поддержка' : 'угроза'} рядом (${p.otherId})`,
    meaning: p => `Социальный вклад от ${p.otherId} рядом с ${p.selfId}: ${p.kind}. Обычно собирается из obs:nearby + tom:dyad + rel:tag.`,
    scale: { min: 0, max: 1, lowMeans: 'нет', highMeans: 'сильно' },
    tags: ['soc']
  },
  {
    specId: 'soc.support_threat_near',
    idPattern: /^soc:(?<kind>support|threat)_near:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Социально: ${p.kind === 'support' ? 'поддержка' : 'угроза'} рядом (${p.otherId})`,
    meaning: p => `Сигнал “${p.kind} прямо рядом” от ${p.otherId} к ${p.selfId}: близость × оценка ToM.`,
    scale: { min: 0, max: 1, lowMeans: 'нет', highMeans: 'сильно' },
    tags: ['soc','proximity']
  },
  {
    specId: 'soc.trusted_ally_near',
    idPattern: /^tom:trusted_ally_near:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Ситуация: доверенный союзник рядом (${p.otherId})`,
    meaning: p => `Флаг: рядом есть союзник, которому доверяют. Используется как социальный “буфер” опасности/стресса.`,
    scale: { min: 0, max: 1, lowMeans: 'поддержки рядом нет', highMeans: 'сильная поддержка рядом' },
    formula: _p => `nearby(self,other) * trust(self→other)`,
    producedBy: ['lib/context/stage1/socialProximity.ts'],
    consumedBy: ['lib/contextMind/scoreboard.ts', 'lib/decision/*'],
    tags: ['soc','tom']
  },
  {
    specId: 'soc.threatening_other_near',
    idPattern: /^tom:threatening_other_near:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Ситуация: угрожающий другой рядом (${p.otherId})`,
    meaning: p => `Флаг: рядом персонаж, который воспринимается как угроза. Должен усиливать danger/threat.`,
    scale: { min: 0, max: 1, lowMeans: 'опасных рядом нет', highMeans: 'опасный очень близко' },
    formula: _p => `nearby(self,other) * threat(self←other)`,
    producedBy: ['lib/context/stage1/socialProximity.ts'],
    consumedBy: ['lib/threat/*', 'lib/decision/*'],
    tags: ['soc','tom']
  },
  {
    specId: 'world.map.hazard_proximity',
    idPattern: /^world:map:hazardProximity:(?<selfId>[a-zA-Z0-9_-]+)(?::(?<otherId>[a-zA-Z0-9_-]+))?$/,
    title: p => `Карта: близость к опасным клеткам${p.otherId ? ` (${p.otherId})` : ''}`,
    meaning: p => `Насколько близко ${p.otherId ? p.otherId : p.selfId} находится к ближайшей “опасной клетке” (1 = рядом, 0 = далеко или опасностей нет).`,
    scale: { min: 0, max: 1, lowMeans: 'далеко от опасности', highMeans: 'очень близко к опасности', typical: '0.0–0.8' },
    producedBy: ['lib/context/stage1/hazardGeometry.ts'],
    consumedBy: ['lib/threat/*', 'lib/context/axes/*'],
    tags: ['world','map','hazard']
  },
  {
    specId: 'world.map.hazard_between',
    idPattern: /^world:map:hazardBetween:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Карта: опасность между ${p.selfId} и ${p.otherId}`,
    meaning: p => `Максимальная опасность на сегменте между позициями ${p.selfId} и ${p.otherId} (по сетке карты).`,
    scale: { min: 0, max: 1, lowMeans: 'между нами чисто', highMeans: 'между нами опасность' },
    producedBy: ['lib/context/stage1/hazardGeometry.ts'],
    tags: ['world','map','hazard']
  },
  {
    specId: 'soc.ally_hazard_between',
    idPattern: /^soc:allyHazardBetween:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Соц: союзник рядом, но между нами опасность (${p.otherId})`,
    meaning: _p => `Композиция prox:friend * world:map:hazardBetween.`,
    scale: { min: 0, max: 1 },
    producedBy: ['lib/context/stage1/hazardGeometry.ts'],
    tags: ['soc','hazard']
  },
  {
    specId: 'soc.enemy_hazard_between',
    idPattern: /^soc:enemyHazardBetween:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Соц: враг рядом, но между нами опасность (${p.otherId})`,
    meaning: _p => `Композиция prox:enemy * world:map:hazardBetween.`,
    scale: { min: 0, max: 1 },
    producedBy: ['lib/context/stage1/hazardGeometry.ts'],
    tags: ['soc','hazard']
  },
  {
    specId: 'haz.enemy_proximity',
    idPattern: /^haz:enemyProximity:(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Опасность: близость врагов (${p.selfId})`,
    meaning: _p => `Максимум prox:enemy. Это “враг как источник опасности”.`,
    scale: { min: 0, max: 1 },
    producedBy: ['lib/context/stage1/hazardGeometry.ts'],
    tags: ['misc','enemy']
  },
  {
    specId: 'haz.danger_source_proximity',
    idPattern: /^haz:dangerSourceProximity:(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Опасность: ближайший источник (${p.selfId})`,
    meaning: _p => `max(world:map:hazardProximity, haz:enemyProximity).`,
    scale: { min: 0, max: 1 },
    producedBy: ['lib/context/stage1/hazardGeometry.ts'],
    tags: ['misc','danger']
  },
  {
    specId: 'appraisal.metric',
    idPattern: /^app:(?<key>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Appraisal: ${p.key}`,
    meaning: p => `Ситуационная оценка (0..1), вход для эмоций/аффекта и контекстного ToM.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко', typical: '0.1–0.8' },
    producedBy: ['lib/emotion/appraisals.ts'],
    tags: ['appraisal','emotion_input']
  },
  {
    specId: 'emotion.core',
    idPattern: /^emo:(?<key>fear|anger|shame|relief|resolve|care):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Emotion: ${p.key}`,
    meaning: p => `Базовая эмоция (0..1), вычисленная из appraisal.`,
    scale: { min: 0, max: 1, lowMeans: 'нет/слабо', highMeans: 'сильно', typical: '0.0–0.7' },
    producedBy: ['lib/emotion/emotions.ts'],
    consumedBy: ['lib/decision/*', 'lib/tom/*'],
    tags: ['emotion','core']
  },
  {
    specId: 'emotion.axis',
    idPattern: /^emo:(?<key>arousal):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Affect axis: ${p.key}`,
    meaning: p => `Ось аффекта (0..1).`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко', typical: '0.1–0.9' },
    producedBy: ['lib/emotion/emotions.ts'],
    tags: ['emotion','axis']
  },
  {
    specId: 'emotion.axis.valence',
    idPattern: /^emo:(?<key>valence):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: () => `Affect axis: valence`,
    meaning: () => `Валентность (-1..1): отрицательно/положительно.`,
    scale: { min: -1, max: 1, lowMeans: 'негативно', highMeans: 'позитивно', typical: '-0.4..0.4' },
    producedBy: ['lib/emotion/emotions.ts'],
    tags: ['emotion','axis']
  },
  {
    specId: 'emotion.dyad',
    idPattern: /^emo:dyad:(?<key>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Dyadic emotion: ${p.key} → ${p.otherId}`,
    meaning: p => `Эмоция/установка ${p.selfId} к ${p.otherId} (0..1) на базе ToM effective + близости.`,
    scale: { min: 0, max: 1, lowMeans: 'нет/слабо', highMeans: 'сильно', typical: '0.0–0.8' },
    producedBy: ['lib/emotion/dyadic.ts'],
    consumedBy: ['lib/decision/*', 'lib/contextMind/*'],
    tags: ['emotion','dyad']
  },
  {
    specId: 'threat.final',
    idPattern: /^threat:final:(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Угроза: итоговая (${p.selfId})`,
    meaning: p => `Сводный показатель угрозы/опасности для агента ${p.selfId}.`,
    scale: { min: 0, max: 1, lowMeans: 'безопасно', highMeans: 'критически опасно', typical: '0.1–0.7' },
    formula: _p => `Агрегация threat:ch:* с весами в computeThreatStack().`,
    producedBy: ['lib/threat/*'],
    consumedBy: ['lib/engine/integrators.ts', 'lib/decision/*', 'lib/cost/*'],
    tags: ['threat']
  },
];

export function resolveAtomSpec(id: string): ResolvedSpec | null {
  for (const spec of ATOM_SPECS) {
    const params = matchPattern(id, spec.idPattern);
    if (params) return { spec, params };
  }
  return null;
}
