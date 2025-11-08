import { Scenario, EntityType } from '../types';

export const scenarios: Scenario[] = [
  // --- CHARACTER SCENARIOS ---
  {
    key: 'negotiations',
    title: 'Переговоры',
    supportedTypes: [EntityType.Character],
    calculateFitness: (metrics, params) => {
      const { competence_neg = 0, will = 0, ideology_rigidity = 100 } = params;
      const score = (competence_neg * 0.5) + (will * 0.3) + ((100 - ideology_rigidity) * 0.2);
      return { score: Math.min(100, score), status: score > 60 ? 'ok' : 'fail' };
    },
  },
  {
    key: 'repair_no_monster',
    title: 'Ремонт (без монстра)',
    supportedTypes: [EntityType.Character],
    calculateFitness: (metrics, params) => {
      const { competence_op = 0 } = params;
      const prMonstro = metrics.prMonstro || 100;
      const score = (competence_op * 0.7) + ((100 - prMonstro) * 0.3);
      return { score: Math.min(100, score), status: score > 70 ? 'ok' : 'fail' };
    },
  },
  {
    key: 'evacuation_corridor',
    title: 'Эвакуационный коридор',
    supportedTypes: [EntityType.Character],
    calculateFitness: (metrics, params) => {
      const { mandate_ops = 0, competence_op = 0, stress = 100 } = params;
      const score = ((params.mandate_ops || 0) / 3 * 50) + (competence_op * 0.3) + ((100-stress) * 0.2);
      return { score: Math.min(100, Math.max(0, score)), status: score > 50 ? 'ok' : 'fail' };
    }
  },
  {
    key: 'silent_exit',
    title: 'Тихий выход',
    supportedTypes: [EntityType.Character],
    calculateFitness: (metrics, params) => {
      const { opsec = 0, dark_exposure = 100, network_degree = 0 } = params;
      const score = (opsec * 0.6) + ((100 - dark_exposure) * 0.2) + (network_degree * 0.2);
      return { score: Math.min(100, Math.max(0, score)), status: score > 75 ? 'ok' : 'fail' };
    }
  },
  {
    key: 'restriction_recommended',
    title: 'Рекомендовано ограничение',
    supportedTypes: [EntityType.Character],
    calculateFitness: (metrics) => {
      const prMonstro = metrics.prMonstro || 0;
      // UI shows fail when restriction is needed. Score is the probability of needing restriction.
      return { score: prMonstro, status: prMonstro > 50 ? 'fail' : 'ok' };
    }
  },
  {
    key: 'localize_incident_character',
    title: 'Локализация инцидента',
    supportedTypes: [EntityType.Character],
    calculateFitness: (metrics, params) => {
        const { competence_op = 0, decision_speed = 0, mandate_ops = 0 } = params;
        const score = (competence_op * 0.4) + (decision_speed * 0.2) + ((mandate_ops / 3) * 40);
        return { score: Math.min(100, Math.max(0, score)), status: score > 65 ? 'ok' : 'fail' };
    }
  },

  // --- OBJECT SCENARIOS ---
  {
    key: 'stable_deployment',
    title: 'Стабильное развёртывание',
    supportedTypes: [EntityType.Object],
    calculateFitness: ({ S, Vsigma }) => {
      const score = Math.max(0, (S * 1.2 - Vsigma * 0.8));
      return { score: Math.min(100, score), status: score > 50 ? 'ok' : 'fail' };
    },
  },
  {
    key: 'low_infra_footprint',
    title: 'Низкий инфр. след',
    supportedTypes: [EntityType.Object],
    calculateFitness: (metrics, params) => {
        const score = 100 - (params.infra_footprint || 0);
        return { score, status: score >= 80 ? 'ok' : 'fail' };
    }
  },
  {
    key: 'safe_for_crowd',
    title: 'Безопасно для толпы',
    supportedTypes: [EntityType.Object],
    calculateFitness: ({ Vsigma }, params) => {
      const causal_penalty = params.causal_penalty || 100;
      const score = 100 - (Vsigma * 0.5 + causal_penalty * 0.5);
      return { score: Math.max(0, score), status: score > 60 ? 'ok' : 'fail' };
    },
  },
   {
    key: 'o2_route',
    title: 'Маршрут с O₂-запасом',
    supportedTypes: [EntityType.Object],
    calculateFitness: (metrics, params) => {
        const resources = params.resources || 0;
        const exergy = params.exergy_cost || 0;
        const score = resources - exergy;
        return { score: Math.max(0, score), status: score > 20 ? 'ok' : 'fail' };
    }
  },
  {
    key: 'budget_fit',
    title: 'В рамках бюджета',
    supportedTypes: [EntityType.Object],
    calculateFitness: ({ Vsigma }) => {
        const score = 100 - Vsigma;
        return { score: Math.max(0, score), status: score > 40 ? 'ok' : 'fail' };
    }
  },
  {
    key: 'publish_proof',
    title: 'Публикация как док-во',
    supportedTypes: [EntityType.Object],
    calculateFitness: ({ Pv }, params) => {
        const witness = params.witness_count || 0;
        const score = (Pv + Math.log1p(witness)*10) / 2;
        return { score: Math.max(0, Math.min(100, score)), status: score > 75 ? 'ok' : 'fail' };
    }
  },
   {
    key: 'safe_rollback',
    title: 'Безопасный откат',
    supportedTypes: [EntityType.Object],
    calculateFitness: ({ drift }) => {
        const score = 100 - drift * 1.5;
        return { score: Math.max(0, score), status: score > 50 ? 'ok' : 'fail' };
    }
  },
  {
    key: 'localize_incident_object',
    title: 'Локализация инцидента',
    supportedTypes: [EntityType.Object],
    calculateFitness: (metrics, params) => {
        const topo = params.topo || 0;
        const score = topo * 10;
        return { score: Math.min(100, Math.max(0, score)), status: score > 65 ? 'ok' : 'fail' };
    }
  },
];