// lib/context/catalog/atomSpecs.ts

// Human titles for common parametric families (optional; fallback is metric/channel itself)
const WORLD_LOC_METRIC_RU: Record<string, string> = {
  privacy: 'Приватность',
  visibility: 'Видимость',
  noise: 'Шум',
  social_visibility: 'Социальная видимость',
  normative_pressure: 'Норм-давление',
  control_level: 'Контроль',
  normPressure: 'Норм-давление (alias)',
  control: 'Контроль (alias)',
  crowd: 'Толпа',
  kind: 'Тип локации',
  owner: 'Владелец локации',
  tag: 'Тег локации',
};

const WORLD_MAP_METRIC_RU: Record<string, string> = {
  danger: 'Опасность (карта)',
  cover: 'Укрытия (карта)',
  obstacles: 'Препятствия (карта)',
  exits: 'Выходы (карта)',
  escape: 'Маршрут/выход (escape)',
};

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
  // Optional: human-readable formula for UI/debug. Use for derived atoms or key metrics.
  // For “raw observations” formula can be omitted.
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
  // NOTE: ordering matters. Keep specific patterns BEFORE generic catch-alls.
  // Tip: use GoalLab -> Coverage -> Export to generate AtomSpec stubs for missing ids.
  {
    specId: 'world.location.ref',
    idPattern: /^world:location:(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Мир: локация (${p.selfId})`,
    meaning: p => `Якорь: текущая локация агента ${p.selfId} (reference atom).`,
    scale: { min: 0, max: 1, lowMeans: '—', highMeans: '—' },
    producedBy: ['lib/context/pipeline/worldFacts.ts'],
    consumedBy: ['lib/context/sources/locationAtoms.ts', 'lib/context/axes/deriveAxes.ts'],
    tags: ['world']
  },
  // Explicit doc for hazardMax too (kept above generic world.map.metric)
  {
    specId: 'world.map.hazardMax',
    idPattern: /^world:map:hazardMax:(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Карта: hazardMax (${p.selfId})`,
    meaning: p => `Максимальная опасность на карте локации вокруг ${p.selfId}.`,
    formula: _ => `max_cell( max(tagHazard, max(hazards[].intensity), danger) )`,
    scale: { min: 0, max: 1, lowMeans: 'нет', highMeans: 'макс', typical: '0.0–1.0' },
    producedBy: ['lib/context/sources/locationAtoms.ts'],
    consumedBy: ['lib/context/axes/deriveAxes.ts', 'lib/threat/*'],
    tags: ['world','map','hazard']
  },
  {
    specId: 'world.tick',
    idPattern: /^world:tick:(?<tick>[0-9]+)$/,
    title: p => `Мир: тик ${p.tick}`,
    meaning: p => `Текущий дискретный тик симуляции (якорь воспроизводимости и временных правил).`,
    scale: { min: 0, max: 1, lowMeans: '—', highMeans: '—' },
    producedBy: ['lib/context/pipeline/worldFacts.ts'],
    consumedBy: ['lib/goals/*', 'components/GoalLab/*'],
    tags: ['world','time']
  },
  {
    specId: 'world.tick',
    idPattern: /^world:tick:(?<tick>[0-9]+)$/,
    title: p => `Мир: тик ${p.tick}`,
    meaning: p =>
      `Текущий дискретный тик симуляции. Используется как якорь воспроизводимости и для временных правил позже.`,
    scale: { min: 0, max: 1, lowMeans: 'N/A', highMeans: 'N/A' },
    producedBy: ['lib/context/pipeline/worldFacts.ts'],
    consumedBy: ['lib/goal-lab/*'],
    tags: ['world','time']
  },
  {
    // Covers ids emitted by:
    // - lib/context/sources/locationAtoms.ts
    // - lib/context/pipeline/worldFacts.ts (world:loc:* seeds)
    specId: 'world.loc.metric',
    idPattern: /^world:loc:(?<metric>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)(?::(?<value>[a-zA-Z0-9_-]+))?$/,
    title: p => `Мир/Локация: ${(WORLD_LOC_METRIC_RU[p.metric] ?? p.metric)} (${p.selfId})${p.value ? ` = ${p.value}` : ''}`,
    meaning: p =>
      `Параметр/факт, “подаваемый локацией” для агента ${p.selfId}. ` +
      `metric="${p.metric}"${p.value ? `, value="${p.value}"` : ''}. ` +
      `Обычно magnitude 0..1 (нормированная интенсивность), а для маркеров kind/owner/tag magnitude часто = 1.`,
    scale: { min: 0, max: 1, lowMeans: 'низко/нет', highMeans: 'высоко/есть' },
    producedBy: ['lib/context/sources/locationAtoms.ts', 'lib/context/pipeline/worldFacts.ts'],
    consumedBy: ['lib/context/axes/deriveAxes.ts', 'lib/threat/*', 'lib/emotion/*'],
    tags: ['world','loc']
  },
  {
    // Covers ids emitted by:
    // - lib/context/sources/locationAtoms.ts (world:map:* and world:map:escape:*:* )
    // - lib/context/pipeline/worldFacts.ts (world:map:* seeds)
    specId: 'world.map.metric',
    idPattern: /^world:map:(?<metric>[a-zA-Z0-9_.-]+):(?<selfId>[a-zA-Z0-9_-]+)(?::(?<value>[a-zA-Z0-9_-]+))?$/,
    title: p => `Мир/Карта: ${(WORLD_MAP_METRIC_RU[p.metric] ?? p.metric)} (${p.selfId})${p.value ? ` = ${p.value}` : ''}`,
    meaning: p =>
      `Картографический/геометрический сигнал вокруг агента ${p.selfId}. ` +
      `metric="${p.metric}"${p.value ? `, value="${p.value}"` : ''}. ` +
      `Обычно magnitude 0..1 (опасность/укрытия/выходы), а escape может кодировать конкретный выход через value.`,
    scale: { min: 0, max: 1, lowMeans: 'низко/нет', highMeans: 'высоко/есть' },
    producedBy: ['lib/context/sources/locationAtoms.ts', 'lib/context/stage1/hazardGeometry.ts'],
    consumedBy: ['lib/context/axes/deriveAxes.ts', 'lib/threat/*'],
    tags: ['world','map']
  },
  {
    // Emitted by lib/context/sources/locationAtoms.ts
    specId: 'world.env.hazard',
    idPattern: /^world:env:hazard:(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Опасность среды (${p.selfId})`,
    meaning: p => `Сводная опасность локации вокруг ${p.selfId}: max(location.hazards, map.hazardMax).`,
    scale: { min: 0, max: 1, lowMeans: 'безопасно', highMeans: 'крайне опасно', typical: '0.0–0.9' },
    producedBy: ['lib/context/sources/locationAtoms.ts'],
    consumedBy: ['lib/context/axes/deriveAxes.ts', 'lib/threat/*'],
    tags: ['world','hazard']
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
    specId: 'ctx.source.scoped',
    idPattern: /^ctx:src:(?<group>[a-zA-Z0-9_-]+):(?<name>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Источник ctx: ${p.group}.${p.name} (${p.selfId})`,
    meaning: p =>
      `Сырой контекстный сигнал из группы "${p.group}" с именем "${p.name}" для агента ${p.selfId}. ` +
      `Используется как вход для deriveAxes и/или линзы.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    producedBy: ['lib/context/pipeline/worldFacts.ts', 'lib/context/pipeline/stage0.ts'],
    consumedBy: ['lib/context/axes/deriveAxes.ts', 'lib/context/lens/characterLens.ts'],
    tags: ['ctx','source']
  },
  {
    specId: 'ctx.source',
    idPattern: /^ctx:src:(?<name>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Источник ctx: ${p.name} (${p.selfId})`,
    meaning: p =>
      `Сырой контекстный сигнал "${p.name}" для агента ${p.selfId}. ` +
      `Используется как вход для deriveAxes и/или линзы.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    producedBy: ['lib/context/pipeline/worldFacts.ts', 'lib/context/pipeline/stage0.ts'],
    consumedBy: ['lib/context/axes/deriveAxes.ts', 'lib/context/lens/characterLens.ts'],
    tags: ['ctx','source']
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
    // Generic obs:* family (los/audio/infoAdequacy/etc) emitted by lib/context/sources/observationAtoms.ts
    // Must go AFTER obs.nearby so the specific one wins.
    specId: 'obs.generic',
    idPattern: /^obs:(?<channel>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)(?::(?<otherId>[a-zA-Z0-9_-]+))?$/,
    title: p => `Наблюдение: ${p.channel} (${p.selfId})${p.otherId ? ` → ${p.otherId}` : ''}`,
    meaning: p =>
      `Перцептивный сигнал канала "${p.channel}" для агента ${p.selfId}` +
      (p.otherId ? ` относительно ${p.otherId}` : '') + `. magnitude 0..1.`,
    scale: { min: 0, max: 1, lowMeans: 'низко/нет', highMeans: 'высоко/есть' },
    producedBy: ['lib/context/sources/observationAtoms.ts'],
    consumedBy: ['lib/context/stage1/socialProximity.ts', 'lib/threat/*', 'lib/context/axes/deriveAxes.ts'],
    tags: ['obs']
  },

  // --- APPRAISALS (specific; must be before any app:* generic) ---
  {
    specId: 'appraisal.metric',
    idPattern: /^app:(?<key>[a-zA-Z0-9_.-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Appraisal: ${p.key} (${p.selfId})`,
    meaning: p =>
      `Оценка (appraisal) по каналу "${p.key}" для агента ${p.selfId}. ` +
      `Appraisal — промежуточный слой между ctx/threat/mind/world и эмоциями.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко', typical: '0.1–0.8' },
    producedBy: ['lib/emotion/appraisal/*', 'lib/threat/*', 'lib/contextMind/*'],
    consumedBy: ['lib/emotion/*'],
    tags: ['app','emotionLayer']
  },

  // --- EMOTIONS (specific; must be before any emo:* generic) ---
  {
    specId: 'emotion.dyad',
    idPattern: /^emo:dyad:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+):(?<key>[a-zA-Z0-9_.-]+)$/,
    title: p => `Emotion(dyad): ${p.key} (${p.selfId}→${p.otherId})`,
    meaning: p =>
      `Двухсубъектная эмоция/установка агента ${p.selfId} к ${p.otherId} по каналу "${p.key}". ` +
      `Обычно производная от app:* + tom/rel сигналов.`,
    scale: { min: 0, max: 1, lowMeans: 'слабо', highMeans: 'сильно', typical: '0.0–0.8' },
    producedBy: ['lib/emotion/*'],
    consumedBy: ['lib/decision/*', 'lib/contextMind/*', 'lib/threat/*'],
    tags: ['emo','dyad']
  },
  {
    specId: 'emotion.axis.valence',
    idPattern: /^emo:valence:(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Emotion axis: valence (${p.selfId})`,
    meaning: p =>
      `Ось валентности (негативно/позитивно) для агента ${p.selfId}. ` +
      `Если хранится как 0..1, интерпретация: 0=негативно, 1=позитивно.`,
    scale: { min: 0, max: 1, lowMeans: 'негативно', highMeans: 'позитивно', typical: '0.3–0.7' },
    producedBy: ['lib/emotion/*'],
    consumedBy: ['lib/decision/*'],
    tags: ['emo','axis']
  },
  {
    specId: 'emotion.axis',
    idPattern: /^emo:(?<key>arousal|tension|calm|activation):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Emotion axis: ${p.key} (${p.selfId})`,
    meaning: p =>
      `Ось эмоционального состояния "${p.key}" для агента ${p.selfId}.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко', typical: '0.1–0.8' },
    producedBy: ['lib/emotion/*'],
    consumedBy: ['lib/decision/*', 'lib/contextMind/*'],
    tags: ['emo','axis']
  },
  {
    specId: 'emotion.core',
    idPattern: /^emo:(?<key>[a-zA-Z0-9_.-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Emotion: ${p.key} (${p.selfId})`,
    meaning: p =>
      `Базовая эмоция/аффект "${p.key}" для агента ${p.selfId}. ` +
      `Считается из appraisal-атомов (app:*).`,
    scale: { min: 0, max: 1, lowMeans: 'нет/слабо', highMeans: 'сильно', typical: '0.0–0.7' },
    producedBy: ['lib/emotion/*'],
    consumedBy: ['lib/decision/*', 'lib/contextMind/*', 'lib/threat/*'],
    tags: ['emo','emotionLayer']
  },

  // --- LEGACY GENERIC (keep at the end of these blocks; for old snapshots only) ---
  {
    specId: 'app.generic',
    idPattern: /^app:(?<channel>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Appraisal(legacy): ${p.channel} (${p.selfId})`,
    meaning: p =>
      `Legacy appraisal id. Prefer app:<key>:<selfId> with specId=appraisal.metric.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    tags: ['app','legacy']
  },
  {
    specId: 'emo.generic',
    idPattern: /^emo:(?<channel>[a-zA-Z0-9_-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Emotion(legacy): ${p.channel} (${p.selfId})`,
    meaning: p =>
      `Legacy emotion id. Prefer emo:<key>:<selfId> with specId=emotion.core/axis.`,
    scale: { min: 0, max: 1, lowMeans: 'нет', highMeans: 'сильно' },
    tags: ['emo','legacy']
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
    specId: 'rel.base.metric',
    idPattern: /^rel:base:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+):(?<metric>[a-zA-Z0-9_-]+)$/,
    title: p => `REL(base): ${p.metric} (${p.otherId})`,
    meaning: p =>
      `Базовый (биографический) prior отношения ${p.selfId}→${p.otherId} по метрике ${p.metric}. ` +
      `Это не ToM и не текущая реакция — это "как обычно" (память/история).`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    producedBy: ['lib/relations/atomize.ts'],
    consumedBy: ['lib/relations/deriveState.ts', 'lib/decision/*', 'lib/emotion/*', 'lib/context/stage1/socialProximity.ts'],
    tags: ['rel', 'base']
  },
  {
    specId: 'rel.state.metric',
    idPattern: /^rel:state:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+):(?<metric>[a-zA-Z0-9_-]+)$/,
    title: p => `REL(state): ${p.metric} (${p.otherId})`,
    meaning: p =>
      `Текущее состояние отношения ${p.selfId}→${p.otherId} по метрике ${p.metric}, ` +
      `полученное из rel:base + контекста + событий + ToM. Это слой, который должен влиять на ToM/эмоции/решения.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    producedBy: ['lib/relations/deriveState.ts', 'lib/context/pipeline/stage0.ts'],
    consumedBy: ['lib/context/stage1/socialProximity.ts', 'lib/decision/*', 'lib/emotion/*', 'lib/threat/*'],
    tags: ['rel', 'state']
  },
  {
    specId: 'rel.prior.metric',
    idPattern: /^rel:prior:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+):(?<metric>[a-zA-Z0-9_-]+)$/,
    title: p => `REL(prior): ${p.metric} (${p.otherId})`,
    meaning: p =>
      `Быстрый prior для отношения ${p.selfId}→${p.otherId} по метрике ${p.metric} (обычно trust/threat), ` +
      `используется как семя для rel:state или как короткий путь в отсутствие памяти.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    producedBy: ['lib/relations/atomizeRelations.ts'],
    consumedBy: ['lib/relations/deriveState.ts', 'lib/decision/*', 'lib/emotion/*'],
    tags: ['rel', 'prior']
  },
  {
    specId: 'rel.label',
    idPattern: /^rel:label:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `REL(label): ярлык для ${p.otherId}`,
    meaning: p =>
      `Краткий человеко-читаемый ярлык отношений ${p.selfId}→${p.otherId} (например “boss”, “ally”). ` +
      `Это не числовая метрика, magnitude обычно 1.`,
    scale: { min: 0, max: 1, lowMeans: 'не используется', highMeans: 'активно' },
    producedBy: ['lib/relations/atomizeRelations.ts'],
    consumedBy: ['components/goal-lab/*'],
    tags: ['rel', 'label']
  },
  {
    specId: 'cap.metric',
    idPattern: /^cap:(?<key>[a-zA-Z0-9_.-]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `CAP: ${p.key} (${p.selfId})`,
    meaning: p =>
      `Способность/компетенция агента ${p.selfId} по каналу ${p.key} (0..1).`,
    scale: { min: 0, max: 1, lowMeans: 'слабо', highMeans: 'сильно' },
    producedBy: ['lib/capabilities/atomizeCapabilities.ts'],
    consumedBy: ['lib/decision/*'],
    tags: ['cap']
  },
  {
    specId: 'feat.metric',
    idPattern: /^feat:(?<scope>char|loc|scene):(?<entityId>[a-zA-Z0-9_-]+):(?<key>[a-zA-Z0-9_.-]+)$/,
    title: p => `FEAT(${p.scope}): ${p.key} (${p.entityId})`,
    meaning: p =>
      `Нормированная “фича” (черта/состояние/контекстный параметр) уровня ${p.scope} ` +
      `для сущности ${p.entityId} по ключу ${p.key}.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
    producedBy: ['lib/features/atomize.ts'],
    consumedBy: ['lib/context/lens/*', 'lib/context/axes/*', 'lib/emotion/*', 'lib/threat/*', 'lib/decision/*'],
    tags: ['feat']
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
