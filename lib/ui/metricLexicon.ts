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
  | 'dyadCloseness'
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
    help: 'Общая опасность ситуации для агента (не про конкретного другого).',
  },
  tension: {
    key: 'tension',
    label: 'Tension',
    help: 'Внутреннее напряжение (смешение эмоций/стресса).',
  },
  clarity: {
    key: 'clarity',
    label: 'Clarity',
    help: 'Насколько ясно, что происходит (низкая неопределённость).',
  },
  coping: {
    key: 'coping',
    label: 'Coping capacity',
    short: 'Coping',
    help: 'Ресурс справляться: самоконтроль/устойчивость.',
  },
  socialExposure: {
    key: 'socialExposure',
    label: 'Social exposure',
    help: 'Социальная заметность/уязвимость (на виду, под наблюдением).',
  },
  normRisk: {
    key: 'normRisk',
    label: 'Norm risk',
    help: 'Риск нарушить нормы/протокол и попасть под санкции.',
  },

  ctxDanger: { key: 'ctxDanger', label: 'Context axis: danger', short: 'danger', help: 'Ось контекста: опасность.' },
  ctxUncertainty: {
    key: 'ctxUncertainty',
    label: 'Context axis: uncertainty',
    short: 'uncertainty',
    help: 'Ось контекста: неопределённость.',
  },
  ctxTimePressure: {
    key: 'ctxTimePressure',
    label: 'Context axis: time pressure',
    short: 'timePressure',
    help: 'Ось контекста: срочность.',
  },
  ctxNormPressure: {
    key: 'ctxNormPressure',
    label: 'Context axis: norm pressure',
    short: 'normPressure',
    help: 'Ось контекста: давление норм.',
  },

  dyadTrust: { key: 'dyadTrust', label: 'Trust', help: 'Насколько этому человеку можно доверять.' },
  dyadThreat: {
    key: 'dyadThreat',
    label: 'Interpersonal threat',
    short: 'Threat',
    help: 'Насколько именно этот человек опасен/враждебен для меня.',
  },
  dyadRespect: { key: 'dyadRespect', label: 'Respect', help: 'Насколько я уважаю/считаю сильным.' },
  dyadCloseness: {
    key: 'dyadCloseness',
    label: 'Closeness',
    help: 'Близость/привязанность/значимость.',
  },
  dyadAlignment: { key: 'dyadAlignment', label: 'Alignment', help: 'Насколько мы на одной стороне по целям.' },
  dyadDominance: { key: 'dyadDominance', label: 'Dominance', help: 'Ощущение доминирования/подчинения в dyad.' },
  dyadUncertainty: {
    key: 'dyadUncertainty',
    label: 'Dyad uncertainty',
    short: 'Uncertainty',
    help: 'Насколько я не уверен в намерениях/поведении этого человека.',
  },
  dyadSupport: { key: 'dyadSupport', label: 'Support', help: 'Насколько этот человек меня поддерживает/легитимизирует.' },
};

export function metricLabel(key: MetricKey) {
  return METRICS[key]?.label ?? key;
}
export function metricShort(key: MetricKey) {
  return METRICS[key]?.short ?? METRICS[key]?.label ?? key;
}
export function metricHelp(key: MetricKey) {
  return METRICS[key]?.help ?? '';
}
