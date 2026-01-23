import type { CharacterEntity } from '../../types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function num01(x: any, fb: number) {
  const v = Number(x);
  if (!Number.isFinite(v)) return fb;
  if (v > 1) return clamp01(v / 100);
  if (v < 0) return 0;
  return v;
}

// Нормальная “боевая мощность” 0..1, грубо но устойчиво.
// Смысл: upper/lower + explosive + endurance + hp.
export function computeCombatPower01(char: CharacterEntity | any): number {
  const b = char?.body ?? {};
  const f = b?.functional ?? {};
  const c = b?.constitution ?? {};
  const st = char?.state ?? {};

  const su = num01(f.strength_upper, 0.5);
  const sl = num01(f.strength_lower, 0.5);
  const ex = num01(f.explosive_power, 0.5);
  const en = num01(f.endurance ?? f.strength_endurance_profile ?? c.endurance_max, 0.5);

  const hp = num01(char?.hp ?? st.hp ?? 100, 1.0);
  const fatig = 1 - num01(b?.acute?.fatigue ?? st.fatigue ?? 0, 0.0);

  // геометрическое среднее по “силовой базе”
  const base = Math.pow(Math.max(1e-6, su * sl * ex), 1 / 3);

  // итог: база + endurance, умножаем на состояние
  return clamp01((0.70 * base + 0.30 * en) * (0.65 + 0.35 * hp) * (0.75 + 0.25 * fatig));
}

export function logRatio(selfPower: number, otherPower: number): number {
  const a = Math.max(1e-6, selfPower);
  const b = Math.max(1e-6, otherPower);
  return Math.log(a / b);
}

// Сигмоида на log-ratio: нелинейно и симметрично.
// Возвращает 0..1, где 0.5 = равны, >0.5 = я сильнее.
export function advantageSigmoid(selfPower: number, otherPower: number, k = 2.2): number {
  const x = logRatio(selfPower, otherPower);
  return 1 / (1 + Math.exp(-k * x));
}
