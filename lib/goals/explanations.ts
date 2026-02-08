import type { ContextualGoalContribution } from '../context/v2/types';

type HumanExplanation = {
  title: string;
  details: string[];
  icon?: string;
  kind?: string;
  impactVerb?: string;
};

function fmt(n: number | undefined, digits = 2): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function normalizeKey(s: string | undefined): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9_:-]+/g, ' ');
}

function guessIcon(kind?: string): string | undefined {
  switch (kind) {
    case 'threat':
      return '⚠️';
    case 'social_support':
    case 'relational':
      return '🤝';
    case 'body_wounded':
      return '🩸';
    case 'proximity_enemy':
      return '👹';
    case 'ctx_privacy':
      return '🕯️';
    case 'trait':
      return '🧬';
    case 'bio':
      return '📜';
    case 'tuning':
      return '🎚️';
    case 'base':
      return '🧱';
    default:
      return undefined;
  }
}

export function generateHumanContributionExplanation(
  contrib: ContextualGoalContribution,
  goalLabel?: string
): HumanExplanation {
  const kind = contrib.atomKind || 'default';
  const icon = guessIcon(kind);
  const impactVerb = contrib.value >= 0 ? 'усиливает' : 'ослабляет';

  const label = String(contrib.atomLabel || contrib.explanation || contrib.source || '').trim();
  const k = normalizeKey(label);

  // Safe pattern-based descriptions (no hard dependency on domain lists).
  const baseTitle = (() => {
    if (kind === 'threat' || k.includes('threat') || k.includes('danger') || k.includes('enemy')) {
      return 'Персонаж ощущает угрозу';
    }
    if (kind === 'body_wounded' || k.includes('wound') || k.includes('injur') || k.includes('hp')) {
      return 'Физическое состояние ухудшено (ранение/боль)';
    }
    if (kind === 'social_support' || k.includes('support') || k.includes('ally') || k.includes('friend') || k.includes('help')) {
      return 'Есть (или нет) социальная поддержка';
    }
    if (kind === 'proximity_enemy' || k.includes('distance') || k.includes('proximity')) {
      return 'Опасный объект/враг близко';
    }
    if (kind === 'ctx_privacy' || k.includes('privacy') || k.includes('safe') || k.includes('shelter')) {
      return 'Ситуация более/менее безопасна и приватна';
    }
    if (kind === 'trait') {
      return 'Срабатывает черта характера';
    }
    if (kind === 'bio') {
      return 'Срабатывает биографический фактор';
    }
    if (kind === 'relational') {
      return 'Срабатывает фактор отношений';
    }
    if (kind === 'tuning') {
      return 'Срабатывает ручная настройка/override';
    }
    if (kind === 'base') {
      return 'Срабатывает базовый драйв';
    }
    return 'Срабатывает фактор';
  })();

  const details: string[] = [];
  if (label) details.push(`Фактор: ${label}`);
  if (contrib.detailCategory || contrib.detailKey) {
    details.push(
      `Источник: ${[contrib.detailCategory, contrib.detailKey].filter(Boolean).join(' / ')}`
    );
  }

  if (typeof contrib.weight === 'number' && typeof contrib.agentValue === 'number') {
    details.push(
      `Сила (weight): ${fmt(contrib.weight)} × состояние (value): ${fmt(contrib.agentValue)} = вклад ${fmt(
        contrib.weight * contrib.agentValue
      )}`
    );
  } else if (contrib.formula) {
    details.push(`Формула: ${contrib.formula}`);
  }

  const goal = goalLabel ? `"${goalLabel}"` : 'цель';
  details.push(`${impactVerb} ${goal} на ${fmt(Math.abs(contrib.value))}`);

  return {
    title: `${baseTitle} → ${impactVerb} ${goal}`,
    details,
    icon,
    kind,
    impactVerb,
  };
}
