// lib/goal-lab/explain.ts
import type { ContextSnapshot } from '../context/v2/types';

function clamp01(x: any) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function topMetric(snapshot: any, key: string) {
  const metrics = snapshot?.contextMind?.metrics || [];
  const m = metrics.find((x: any) => x.key === key);
  return m ? clamp01(m.value) : 0;
}

export function buildGoalLabExplain(snapshot: ContextSnapshot | null) {
  if (!snapshot) return null;

  const threat = topMetric(snapshot as any, 'threat');
  const pressure = topMetric(snapshot as any, 'pressure');
  const support = topMetric(snapshot as any, 'support');

  const affect = (snapshot as any)?.contextMindAffect || (snapshot as any)?.agentAffect || null;

  const whatHappens = [
    threat > 0.66 ? 'Ситуация ощущается опасной.' : threat > 0.33 ? 'Есть заметная угроза.' : 'Ситуация относительно безопасна.',
    pressure > 0.66 ? 'Сильное давление роли/норм/наблюдения.' : pressure > 0.33 ? 'Есть фоновое давление.' : 'Давление низкое.',
    support > 0.66 ? 'Поддержка доступна.' : support > 0.33 ? 'Поддержка частично доступна.' : 'Поддержки почти нет.',
  ];

  const decision = (snapshot as any)?.decision || null;
  const thinks = decision?.why?.slice?.(0, 8) || [];

  const feels: string[] = [];
  if (affect?.e) {
    const entries = Object.entries(affect.e)
      .map(([k, v]: any) => [k, clamp01(v)] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    for (const [k, v] of entries) {
      if (v <= 0.05) continue;
      feels.push(`${k}:${Math.round(v * 100)}%`);
    }
  }

  return {
    schemaVersion: 1,
    what: whatHappens,
    think: thinks,
    feel: feels,
    raw: {
      threat,
      pressure,
      support,
      decisionId: decision?.choiceId ?? null,
    }
  };
}
