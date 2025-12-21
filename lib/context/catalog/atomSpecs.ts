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
    specId: 'tom.dyad.metric.generic',
    idPattern: /^tom:dyad:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+):(?<metric>[a-zA-Z0-9_-]+)$/,
    title: p => `ToM dyad: ${p.metric} к ${p.otherId}`,
    meaning: p => `Dyad-оценка ${p.metric} у ${p.selfId} по отношению к ${p.otherId}.`,
    scale: { min: 0, max: 1, lowMeans: 'низко', highMeans: 'высоко' },
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
    meaning: p => `Дискретный социальный тег “${p.tag}” от ${p.selfId} к ${p.otherId}. Обычно 0/1 с confidence.`,
    scale: { min: 0, max: 1, lowMeans: 'нет тега', highMeans: 'тег активен' },
    producedBy: ['lib/context/sources/tomDyadAtoms.ts', 'lib/rel/*'],
    consumedBy: ['lib/tom/*', 'lib/context/stage1/socialProximity.ts'],
    tags: ['rel','tag']
  },
  {
    specId: 'prox.friend',
    idPattern: /^prox:friend:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Proximity: друг рядом (${p.otherId})`,
    meaning: p => `Флаг “${p.otherId} рядом и он friend/ally по rel/tag или ToM”.`,
    scale: { min: 0, max: 1, lowMeans: 'нет', highMeans: 'да' },
    producedBy: ['lib/context/stage1/socialProximity.ts'],
    consumedBy: ['lib/contextMind/*', 'lib/threat/*', 'lib/decision/*'],
    tags: ['soc','proximity']
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
    specId: 'tom.trusted_ally_near',
    idPattern: /^tom:trusted_ally_near:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Поддержка рядом: ${p.otherId}`,
    meaning: p => `Нормализованный сигнал “рядом союзник”: близость (obs:nearby) × доверие (tom:dyad:*:trust).`,
    scale: { min: 0, max: 1, lowMeans: 'поддержки рядом нет', highMeans: 'сильная поддержка рядом' },
    formula: _p => `nearby(self,other) * trust(self→other)`,
    producedBy: ['lib/context/stage1/socialProximity.ts'],
    consumedBy: ['lib/contextMind/scoreboard.ts', 'lib/decision/*'],
    tags: ['soc','tom']
  },
  {
    specId: 'tom.threatening_other_near',
    idPattern: /^tom:threatening_other_near:(?<selfId>[a-zA-Z0-9_-]+):(?<otherId>[a-zA-Z0-9_-]+)$/,
    title: p => `Опасный рядом: ${p.otherId}`,
    meaning: p => `Нормализованный сигнал “угроза рядом”: близость × (угроза/конфликт из ToM).`,
    scale: { min: 0, max: 1, lowMeans: 'опасных рядом нет', highMeans: 'опасный очень близко' },
    formula: _p => `nearby(self,other) * threat(self←other)`,
    producedBy: ['lib/context/stage1/socialProximity.ts'],
    consumedBy: ['lib/threat/*', 'lib/decision/*'],
    tags: ['soc','tom']
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
