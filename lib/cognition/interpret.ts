import type { CognitionProfile, ThinkingProfile, ActionDispositionScalars, PolicyKnobs } from '../../types';

const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '0.00');

function topLines(items: { label: string; value: number }[], limit = 6) {
  return [...items]
    .filter(item => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map(item => `${item.label}=${fmt(item.value)}`);
}

function axisLabels(t: ThinkingProfile) {
  return {
    A: t.dominantA,
    B: t.dominantB,
    C: t.dominantC,
    D: t.dominantD,
  };
}

function riskNotes(t: ThinkingProfile, s: ActionDispositionScalars, p: PolicyKnobs): string[] {
  const out: string[] = [];

  if (p.planFirst > 0.72 && s.uncertaintyTolerance < 0.45) {
    out.push('Риск: планирование превращается в избегание (нужна опора на маленькие тесты).');
  }
  if (p.planFirst > 0.70 && s.executiveCapacity < 0.40) {
    out.push('Риск: “хочу планировать, но не тяну ресурс” (срыв плана/пересборка каждые 2 шага).');
  }
  if (s.actionBiasVsFreeze < 0.35) {
    out.push('Риск: замирание/ожидание вместо шага (freeze-паттерн).');
  }
  if (p.actNow > 0.72 && t.control.intuitive > 0.60 && s.normPressureSensitivity < 0.40) {
    out.push('Риск: импульсивные действия без проверки и без учёта санкций.');
  }
  if (s.confidenceCalibration < 0.40) {
    out.push('Риск: некалиброванная уверенность (пере-/недооценка знаний, скачки решений).');
  }
  if (p.probeAndUpdate < 0.35 && s.experimentalism < 0.35 && s.uncertaintyTolerance < 0.45) {
    out.push('Риск: избегание тестов → застревание в ожидании или в догадках.');
  }

  return out;
}

export function interpretCognition(cog?: CognitionProfile) {
  if (!cog?.prior) return null;
  const active = cog.posterior ?? cog.prior;
  const t = active.thinking;
  const s = active.scalars;
  const pol = active.policy;

  const labels = axisLabels(t);
  const why = topLines([
    { label: 'planFirst', value: pol.planFirst },
    { label: 'actNow', value: pol.actNow },
    { label: 'probeAndUpdate', value: pol.probeAndUpdate },
    { label: 'futureHorizon(E)', value: s.futureHorizon },
    { label: 'uncertaintyTol(F)', value: s.uncertaintyTolerance },
    { label: 'normSensitivity(G)', value: s.normPressureSensitivity },
    { label: 'actVsFreeze(H)', value: s.actionBiasVsFreeze },
    { label: 'R1 confCal', value: s.confidenceCalibration },
    { label: 'R2 execCap', value: s.executiveCapacity },
    { label: 'R3 experimentalism', value: s.experimentalism },
    { label: 'control.analytic', value: t.control.analytic },
    { label: 'control.intuitive', value: t.control.intuitive },
    { label: 'control.meta', value: t.control.metacognitive },
    { label: 'inference.abductive', value: t.inference.abductive },
    { label: 'inference.causal', value: t.inference.causal },
  ]);

  const summary: string[] = [];
  summary.push(`Формат: ${labels.A}.`);
  summary.push(`Вывод: ${labels.B}.`);
  summary.push(`Режим контроля: ${labels.C} (meta=${fmt(t.metacognitiveGain)}).`);
  summary.push(`Функция: ${labels.D}.`);
  summary.push(
    `Ресурсы: confCal=${fmt(s.confidenceCalibration)} · execCap=${fmt(s.executiveCapacity)} · experimentalism=${fmt(s.experimentalism)}.`
  );

  return {
    summary,
    why,
    risks: riskNotes(t, s, pol),
  };
}
