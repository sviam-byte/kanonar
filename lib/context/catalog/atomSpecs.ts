// lib/context/catalog/atomSpecs.ts
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
    idPattern: /^ctx:(?<axis>[a-zA-Z0-9_]+):(?<selfId>[a-zA-Z0-9_-]+)$/,
    title: p => `Контекст: ${p.axis}`,
    meaning: p => `Нормализованная ось контекста для агента ${p.selfId}.`,
    scale: {
      min: 0,
      max: 1,
      lowMeans: 'слабо выражено / почти не влияет',
      highMeans: 'сильно выражено / доминирующий фактор',
      typical: '0.2–0.6'
    },
    formula: _p => `Собирается из ctx:src:* + world:* + obs:* + feat:* через deriveAxes().`,
    producedBy: ['lib/context/axes/deriveAxes.ts'],
    consumedBy: ['lib/threat/*', 'lib/decision/*', 'lib/cost/*', 'lib/engine/*'],
    tags: ['ctx']
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
