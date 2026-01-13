import type { ActivityCaps, ThinkingProfile, ThinkingAxisA, ThinkingAxisB, ThinkingAxisC, ThinkingAxisD } from '../../types';

const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—');

function topK<T extends string>(m: Record<T, number>, k = 2): { key: T; val: number }[] {
  const xs = Object.keys(m).map((kk) => ({ key: kk as T, val: Number(m[kk as T] ?? 0) }));
  xs.sort((a, b) => b.val - a.val);
  return xs.slice(0, Math.max(1, k));
}

function labelA(a: ThinkingAxisA) {
  if (a === 'enactive') return 'Наглядно-действенное (думать руками)';
  if (a === 'imagery') return 'Наглядно-образное (сцены/картинки)';
  if (a === 'verbal') return 'Словесно-логическое (формулировки/правила)';
  return 'Абстрактно-теоретическое (системы/модели)';
}
function labelB(b: ThinkingAxisB) {
  if (b === 'deductive') return 'Дедуктивное';
  if (b === 'inductive') return 'Индуктивное';
  if (b === 'abductive') return 'Абдуктивное';
  if (b === 'causal') return 'Каузальное';
  return 'Вероятностное/байесовское';
}
function labelC(c: ThinkingAxisC) {
  if (c === 'intuitive') return 'Интуитивное/быстрое';
  if (c === 'analytic') return 'Аналитическое/медленное';
  return 'Метакогнитивное (контроль качества)';
}
function labelD(d: ThinkingAxisD) {
  if (d === 'understanding') return 'Понимающее (сбор модели смысла)';
  if (d === 'planning') return 'Планирующее/стратегическое';
  if (d === 'critical') return 'Критическое (проверка дыр)';
  if (d === 'creative') return 'Творческое/генеративное';
  if (d === 'normative') return 'Ценностно-нормативное';
  return 'Социальное (ToM)';
}

export type ThinkingInterpretation = {
  summary: string[];
  tendencies: string[];
  risks: string[];
  why: string[];
};

/**
 * Deterministic interpretation for thinking axes + activity caps.
 * Produces concise summary/tendencies/risks that can be reused across panels.
 */
export function interpretThinking(
  th: ThinkingProfile,
  caps?: ActivityCaps,
  debugPred?: Record<string, number>
): ThinkingInterpretation {
  const summary: string[] = [];
  const tendencies: string[] = [];
  const risks: string[] = [];
  const why: string[] = [];

  const A = th.dominantA;
  const B = th.dominantB;
  const C = th.dominantC;
  const D = th.dominantD;

  summary.push(`Форма: ${labelA(A)}.`);
  summary.push(`Вывод: ${labelB(B)}.`);
  summary.push(`Контроль: ${labelC(C)} (metaGain=${fmt(th.metacognitiveGain)}).`);
  summary.push(`Функция: ${labelD(D)}.`);

  // tendencies: from caps + mix
  const ops = caps?.operations ?? 0.5;
  const act = caps?.actions ?? 0.5;
  const proactive = caps?.proactive ?? 0.5;
  const reactive = caps?.reactive ?? 0.5;
  const regulatory = caps?.regulatory ?? 0.5;
  const reflective = caps?.reflective ?? 0.5;

  if (proactive > reactive + 0.12) tendencies.push('Склонность: действовать через цель/план (проактивно).');
  if (reactive > proactive + 0.12) tendencies.push('Склонность: реагировать на стимулы (реактивно).');
  if (regulatory > 0.65) tendencies.push('Сильная саморегуляция: держит курс, переключается, восстанавливается.');
  if (reflective > 0.65) tendencies.push('Сильная рефлексия: пересобирает цели/“задачу задачи”.');
  if (ops > 0.70 && act < 0.55) tendencies.push('Сильнее операции/рутина, чем целевые действия (делает, но может не выбирать цель).');
  if (act > 0.70 && proactive < 0.55) tendencies.push('Хорошие действия, но план слабее — работает “шагами”, не “дорожной картой”.');

  // risks (детерминированно)
  if (C === 'intuitive' && reactive > 0.65) risks.push('Риск: импульс/эвристики → ошибки в ловушках (особенно при стрессе).');
  if (C === 'analytic' && proactive > 0.65 && reactive < 0.35) risks.push('Риск: “планирование в вакууме” → задержка шага/перепланирование.');
  if (C === 'metacognitive' && reflective > 0.7 && act < 0.5) risks.push('Риск: контроль качества превращается в торможение действий.');
  if (D === 'critical' && th.function.creative < 0.12) risks.push('Риск: отбрасывает варианты слишком рано.');
  if (D === 'creative' && th.function.critical < 0.12) risks.push('Риск: иллюзия понимания без проверки.');

  // why (коротко: топы)
  const a2 = topK(th.representation, 2);
  const b2 = topK(th.inference, 2);
  const c2 = topK(th.control, 2);
  const d2 = topK(th.function, 2);

  why.push(`Top-A: ${a2.map(x => `${x.key}=${fmt(x.val)}`).join(', ')}`);
  why.push(`Top-B: ${b2.map(x => `${x.key}=${fmt(x.val)}`).join(', ')}`);
  why.push(`Top-C: ${c2.map(x => `${x.key}=${fmt(x.val)}`).join(', ')}`);
  why.push(`Top-D: ${d2.map(x => `${x.key}=${fmt(x.val)}`).join(', ')}`);

  if (caps) {
    why.push(`Caps: ops=${fmt(ops)} act=${fmt(act)} pro=${fmt(proactive)} re=${fmt(reactive)} reg=${fmt(regulatory)} ref=${fmt(reflective)}`);
  }

  // Optional: show predicates to diagnose "everything identical".
  if (debugPred) {
    const keys = [
      'formalCapacity',
      'verbalCapacity',
      'imageryCapacity',
      'sensorimotorIteration',
      'ambiguityTol',
      'needsControl',
      'futureHorizon',
      'tom',
      'normPressure',
      'metacog',
    ];
    const line = keys
      .filter(k => debugPred[k] != null)
      .map(k => `${k}=${fmt(Number(debugPred[k]))}`)
      .join(' · ');
    if (line) why.push(`Pred: ${line}`);
  }

  return { summary, tendencies, risks, why };
}
