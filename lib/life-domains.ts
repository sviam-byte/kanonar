
import { LifeGoalId, LifeGoalDef, LifeGoalVector } from './types-life';
import { GoalDomainId } from './types-goals';

export const LIFE_GOAL_DEFS: Record<LifeGoalId, LifeGoalDef> = {
  protect_lives: {
    id: 'protect_lives',
    label: 'Защищать жизни',
    domains: [
      { domain: 'survival', weight: 0.5 },
      { domain: 'attachment_care', weight: 0.8 },
      { domain: 'group_cohesion', weight: 0.4 }
    ]
  },
  maintain_order: {
    id: 'maintain_order',
    label: 'Поддерживать порядок',
    domains: [
      { domain: 'control', weight: 0.7 },
      { domain: 'leader_legitimacy', weight: 0.6 },
      { domain: 'obedience', weight: 0.5 }
    ]
  },
  seek_status: {
    id: 'seek_status',
    label: 'Искать признание',
    domains: [
      { domain: 'status', weight: 1.0 },
      { domain: 'control', weight: 0.4 },
      { domain: 'leader_legitimacy', weight: 0.3 }
    ]
  },
  preserve_autonomy: {
    id: 'preserve_autonomy',
    label: 'Сохранять свободу',
    domains: [
      { domain: 'autonomy', weight: 1.0 },
      { domain: 'obedience', weight: -0.5 },
      { domain: 'survival', weight: 0.4 }
    ]
  },
  serve_authority: {
    id: 'serve_authority',
    label: 'Служить власти',
    domains: [
      { domain: 'obedience', weight: 0.9 },
      { domain: 'leader_legitimacy', weight: 0.8 },
      { domain: 'group_cohesion', weight: 0.4 }
    ]
  },
  pursue_truth: {
    id: 'pursue_truth',
    label: 'Искать истину',
    domains: [
      { domain: 'information', weight: 1.0 },
      { domain: 'control', weight: 0.3 }
    ]
  },
  maintain_bonds: {
    id: 'maintain_bonds',
    label: 'Беречь связи',
    domains: [
      { domain: 'personal_bond', weight: 0.9 },
      { domain: 'attachment_care', weight: 0.7 },
      { domain: 'group_cohesion', weight: 0.5 }
    ]
  },
  seek_comfort: {
    id: 'seek_comfort',
    label: 'Искать комфорт',
    domains: [
      { domain: 'rest', weight: 1.0 },
      { domain: 'survival', weight: 0.3 }
    ]
  },
  self_transcendence: {
    id: 'self_transcendence',
    label: 'Самопревосхождение',
    domains: [
      { domain: 'ritual', weight: 0.8 },
      { domain: 'status', weight: 0.2 }
    ]
  },
  accumulate_resources: {
    id: 'accumulate_resources',
    label: 'Копить ресурсы',
    domains: [
      { domain: 'control', weight: 0.6 },
      { domain: 'survival', weight: 0.5 }
    ]
  },
  other: {
      id: 'other',
      label: 'Прочее',
      domains: []
  }
};

export function buildLifeDomainWeights(
  lifeGoals: LifeGoalVector,
  lifeDefs: Record<LifeGoalId, LifeGoalDef> = LIFE_GOAL_DEFS,
): Record<GoalDomainId, number> {
  const out: Record<GoalDomainId, number> = {} as any;
  for (const [gid, weight] of Object.entries(lifeGoals)) {
    const w = weight ?? 0;
    if (w <= 0) continue;

    const def = lifeDefs[gid as LifeGoalId];
    if (!def) continue;

    for (const { domain, weight: domainW } of def.domains) {
      out[domain] = (out[domain] ?? 0) + w * domainW;
    }
  }
  return out;
}
