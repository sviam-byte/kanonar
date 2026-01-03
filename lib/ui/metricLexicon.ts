export type MetricKey =
  | 'situationalThreat'
  | 'tension'
  | 'clarity'
  | 'coping'
  | 'socialExposure'
  | 'normRisk'
  | 'ctxDanger'
  | 'ctxUncertainty'
  | 'ctxTimePressure'
  | 'ctxNormPressure'
  // dyad keys:
  | 'dyadTrust'
  | 'dyadThreat'
  | 'dyadRespect'
  | 'dyadIntimacy'
  | 'dyadAlignment'
  | 'dyadDominance'
  | 'dyadUncertainty'
  | 'dyadSupport';

export type MetricSpec = {
  key: MetricKey;
  label: string;      // то, что видит пользователь
  short?: string;     // коротко для компактных мест
  help: string;       // 1 строка "что это значит"
};

export const METRICS: Record<MetricKey, MetricSpec> = {
  situationalThreat: {
    key: 'situationalThreat',
    label: 'Situational threat',
    short: 'Threat',
    help: 'Общая оценка опасности ситуации для агента (не про конкретного другого).',
  },
  tension: {
    key: 'tension',
    label: 'Tension',
    help: 'Внутреннее напряжение/зажатость (аффект + стрессовые следы).',
  },
  clarity: {
    key: 'clarity',
    label: 'Clarity',
    help: 'Насколько ясно, что происходит и что делать (низкая неопределённость).',
  },
  coping: {
    key: 'coping',
    label: 'Coping capacity',
    short: 'Coping',
    help: 'Ресурс справляться: самоконтроль/устойчивость/организация.',
  },
  socialExposure: {
    key: 'socialExposure',
    label: 'Social exposure',
    help: 'Социальная “заметность/открытость”: насколько агент на виду/уязвим социально.',
  },
  normRisk: {
    key: 'normRisk',
    label: 'Norm risk',
    help: 'Риск нарушения норм/протокола и связанных санкций.',
  },

  ctxDanger: {
    key: 'ctxDanger',
    label: 'Context: danger',
    short: 'danger',
    help: 'Ось контекста: опасность.',
  },
  ctxUncertainty: {
    key: 'ctxUncertainty',
    label: 'Context: uncertainty',
    short: 'uncertainty',
    help: 'Ось контекста: неопределённость.',
  },
  ctxTimePressure: {
    key: 'ctxTimePressure',
    label: 'Context: time pressure',
    short: 'timePressure',
    help: 'Ось контекста: срочность.',
  },
  ctxNormPressure: {
    key: 'ctxNormPressure',
    label: 'Context: norm pressure',
    short: 'normPressure',
    help: 'Ось контекста: давление норм.',
  },

  dyadTrust: { key: 'dyadTrust', label: 'Trust', help: 'Насколько “ему можно доверять”.' },
  dyadThreat: {
    key: 'dyadThreat',
    label: 'Interpersonal threat',
    short: 'Threat',
    help: 'Насколько этот человек опасен/враждебен для меня.',
  },
  dyadRespect: { key: 'dyadRespect', label: 'Respect', help: 'Насколько я уважаю/считаю сильным.' },
  dyadIntimacy: {
    key: 'dyadIntimacy',
    label: 'Closeness',
    short: 'Closeness',
    help: 'Близость/привязанность/значимость.',
  },
  dyadAlignment: { key: 'dyadAlignment', label: 'Alignment', help: 'Насколько мы на одной стороне/сходимся по целям.' },
  dyadDominance: { key: 'dyadDominance', label: 'Dominance', help: 'Моё ощущение доминирования/подчинения в dyad.' },
  dyadUncertainty: {
    key: 'dyadUncertainty',
    label: 'Dyad uncertainty',
    short: 'Uncertainty',
    help: 'Насколько я не уверен в его намерениях/поведении.',
  },
  dyadSupport: { key: 'dyadSupport', label: 'Support', help: 'Насколько он меня поддерживает/легитимизирует.' },
};

export function metricLabel(key: MetricKey) {
  return METRICS[key]?.label ?? key;
}
export function metricHelp(key: MetricKey) {
  return METRICS[key]?.help ?? '';
}
