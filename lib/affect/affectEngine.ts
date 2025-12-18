
// lib/affect/affectEngine.ts
import { clamp01 } from "../threat/threatStack";

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export type Appraisal = {
  threat: number;        // 0..1
  uncertainty: number;   // 0..1
  goalBlock: number;     // 0..1
  socialSupport: number; // 0..1
  controllability: number; // 0..1
  intimacy: number;      // 0..1
};

export type Proprio = {
  fatigue01: number;       // 0..1
  stress01: number;        // 0..1
  pain01: number;          // 0..1
  sleepDebt01: number;     // 0..1
  arousal01: number;       // 0..1
};

export type Affect = {
  fear: number;
  anger: number;
  shame: number;
  trust: number;
  exhaustion: number;
  valence: number;   // -1..1
  arousal: number;   // 0..1
  control: number;   // 0..1
  updatedAtTick: number;
  why: string[];
};

export function computeProprioFromBody(agent: any): Proprio {
  const acute = agent?.body?.acute ?? {};
  const reserves = agent?.body?.reserves ?? {};
  const reg = agent?.body?.regulation ?? {};

  const fatigue01 = clamp01((acute.fatigue ?? 0) / 100);
  const stress01 = clamp01((acute.stress ?? 0) / 100);
  const pain01 = clamp01((acute.pain_now ?? 0) / 100);
  const sleepDebt01 = clamp01((reserves.sleep_debt_h ?? 0) / 12); // 12ч как “очень плохо”
  const arousal01 = clamp01(reg.arousal ?? 0.5);

  return { fatigue01, stress01, pain01, sleepDebt01, arousal01 };
}

export function updateAffect(
  prev: Affect | null,
  appraisal: Appraisal,
  proprio: Proprio,
  tick: number
): Affect {
  const why: string[] = [];

  // Fear: угроза + неопределённость + стресс + низкая контролируемость
  const fearTarget = clamp01(
    0.55 * appraisal.threat +
    0.25 * appraisal.uncertainty +
    0.15 * proprio.stress01 +
    0.15 * (1 - appraisal.controllability)
  );

  // Anger: goalBlock + threat при высокой ответственности/контроле (здесь proxy: controllability)
  const angerTarget = clamp01(
    0.45 * appraisal.goalBlock +
    0.25 * appraisal.threat +
    0.20 * appraisal.controllability -
    0.15 * appraisal.socialSupport
  );

  // Shame: низкая поддержка + высокая публичность (если добавишь) + moral rumination (если есть)
  const shameTarget = clamp01(
    0.35 * (1 - appraisal.socialSupport) +
    0.20 * appraisal.uncertainty +
    0.20 * proprio.stress01
  );

  // Trust: социальная поддержка + интимность минус страх
  const trustTarget = clamp01(
    0.55 * appraisal.socialSupport +
    0.35 * appraisal.intimacy -
    0.30 * fearTarget
  );

  // Exhaustion: проприоцепция
  const exhaustionTarget = clamp01(
    0.45 * proprio.fatigue01 +
    0.35 * proprio.sleepDebt01 +
    0.20 * proprio.stress01
  );

  // Интегратор: если раньше было “залипание”, делай принудительный шаг
  const alpha = 0.55; // скорость адаптации
  const fear = prev ? lerp(prev.fear, fearTarget, alpha) : fearTarget;
  const anger = prev ? lerp(prev.anger, angerTarget, alpha) : angerTarget;
  const shame = prev ? lerp(prev.shame, shameTarget, alpha) : shameTarget;
  const trust = prev ? lerp(prev.trust, trustTarget, alpha) : trustTarget;
  const exhaustion = prev ? lerp(prev.exhaustion, exhaustionTarget, alpha) : exhaustionTarget;

  // valence/arousal/control
  const arousal = clamp01(0.55 * proprio.arousal01 + 0.35 * fear + 0.20 * anger);
  const control = clamp01(0.65 * appraisal.controllability + 0.20 * trust - 0.25 * fear);
  const valence = clamp01(trust - (fear + anger + shame) / 3) * 2 - 1; // -1..1

  why.push(
    `fear=${fear.toFixed(3)}(t=${fearTarget.toFixed(3)}) anger=${anger.toFixed(3)} trust=${trust.toFixed(3)} exh=${exhaustion.toFixed(3)}`
  );

  return { fear, anger, shame, trust, exhaustion, valence, arousal, control, updatedAtTick: tick, why };
}
