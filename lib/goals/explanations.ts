import { GOAL_DEFS } from './space';
import type { ContextualGoalContribution } from '../context/v2/types';

function safeStr(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function fmt(n: number | undefined, digits = 2): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

export function humanGoalLabel(goalId: string | undefined): string {
  if (!goalId) return 'эту цель';
  const def = (GOAL_DEFS as Record<string, { label?: string; label_ru?: string }> | undefined)?.[
    goalId
  ];
  return (def?.label_ru || def?.label || goalId) as string;
}

export type HumanContribution = {
  title: string;
  details: string[];
  kind?: string;
  impactVerb?: 'усиливает' | 'ослабляет';
};

function pickKind(contrib: ContextualGoalContribution): string | undefined {
  return contrib.atomKind || undefined;
}

function prettyKey(s: string): string {
  return s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function generateHumanContributionExplanation(
  contrib: ContextualGoalContribution,
  goalId?: string
): HumanContribution {
  const kind = pickKind(contrib);
  const goalLabel = humanGoalLabel(goalId);
  const impactVerb: HumanContribution['impactVerb'] = contrib.value >= 0 ? 'усиливает' : 'ослабляет';

  const label = prettyKey(
    safeStr(contrib.atomLabel || contrib.detailKey || contrib.explanation || contrib.source)
  );

  const abs = Math.abs(contrib.value);
  const pct = abs <= 1 ? Math.round(abs * 100) : undefined;

  // small set of readable templates
  const titleByKind: Record<string, string> = {
    threat: `Есть угроза: ${label}`,
    body_wounded: `Персонаж ранен: ${label}`,
    social_support: `Социальная поддержка: ${label}`,
    rest: `Нужен отдых: ${label}`,
    order: `Важно соблюдение порядка/норм: ${label}`,
    resource: `Есть ресурсный фактор: ${label}`,
    status: `Фактор статуса/уважения: ${label}`,
    trait: `Черта характера влияет: ${label}`,
    bio: `Биография/опыт влияет: ${label}`,
    relational: `Отношения влияют: ${label}`,
    tuning: `Ручная настройка влияет: ${label}`,
    base: `Базовая мотивация: ${label}`,
  };

  const title = titleByKind[kind || ''] || label || 'Фактор';

  const details: string[] = [];
  if (typeof contrib.weight === 'number') details.push(`Сила (вес): ${fmt(contrib.weight, 2)}`);
  if (typeof contrib.agentValue === 'number') {
    details.push(`Текущее значение: ${fmt(contrib.agentValue, 2)}`);
  }
  if (pct != null) details.push(`Интенсивность: ${pct}%`);
  details.push(
    `→ ${impactVerb} “${goalLabel}” (вклад: ${contrib.value >= 0 ? '+' : '−'}${fmt(abs, 2)})`
  );

  return { title, details, kind, impactVerb };
}
