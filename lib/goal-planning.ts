
import { AgentState, WorldState, CharacterGoalId, GoalEcology, GoalState, LifeGoalComponents, GoalId } from '../types';
import { PlanningGoalDef, GoalDomainId, SituationContext } from './types-goals';
import { buildLifeDomainWeights, LIFE_GOAL_DEFS } from './life-domains';
import { aggregateDomainContextWeights, buildSituationContext, CONTEXT_PROFILES } from './context-goals';

const ALL_DOMAINS: GoalDomainId[] = [
  'survival',
  'group_cohesion',
  'leader_legitimacy',
  'control',
  'information',
  'ritual',
  'personal_bond',
  'rest',
  'self_expression',
  'obedience',
  'status',
  'other',
  'autonomy',
  'attachment_care',
  'social',
  'self_transcendence',
];

interface GoalPlanningOptions {
  skipBioShift?: boolean;
}

export interface GoalPlanningResult {
  priorities: number[];
  activations: number[];
  alpha: number[];
  debug: {
    b_ctx: number[];
    d_mix: Record<GoalDomainId, number>;
    temperature: number;
  };
  lifeGoalDebug: LifeGoalComponents | null;
}

function normalizeDomainWeights(input: Record<GoalDomainId, number>): Record<GoalDomainId, number> {
  const out: Record<GoalDomainId, number> = {} as any;
  let maxAbs = 0;
  for (const d of Object.keys(input) as GoalDomainId[]) {
    const v = input[d] ?? 0;
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  }
  if (maxAbs <= 0) return { ...input };
  for (const d of Object.keys(input) as GoalDomainId[]) {
    out[d] = (input[d] ?? 0) / maxAbs;
  }
  return out;
}

function getGoalWeight(world: WorldState, agent: AgentState, goalId: GoalId): number {
    const base = agent.goalWeights?.[goalId as CharacterGoalId] ?? 0; // Using AgentState goalWeights cache if available or need calculation

    const phase = world.scenarioContext?.activePhase;
    // Check if phase has specific weight override
    const phaseWeight = phase?.goalWeights?.[goalId as CharacterGoalId] ?? 1;

    return base * phaseWeight;
}

export function computeGoalPriorities(
  agent: AgentState,
  goals: PlanningGoalDef[],
  world: WorldState,
  options: GoalPlanningOptions = {},
  ctxOverride?: SituationContext,
): GoalPlanningResult {
  // 1) Жизненные домены из lifeGoals
  const lifeVector = (agent.lifeGoals || {}) as Record<string, number>;
  const lifeDomainRaw = buildLifeDomainWeights(lifeVector as any, LIFE_GOAL_DEFS);
  const lifeDomain = normalizeDomainWeights(lifeDomainRaw);

  // 2) Контекстные домены из сценария / сцены
  const ctx = ctxOverride ?? buildSituationContext(agent, world);
  const ctxDomainRaw = aggregateDomainContextWeights(CONTEXT_PROFILES, ctx, agent.effectiveRole || 'any');
  const ctxDomain = normalizeDomainWeights(ctxDomainRaw as any);

  // 3) Смешивание доменов: жизнь + контекст
  const wLife = options.skipBioShift ? 1.0 : 0.7;
  const wCtx = 1.0;

  const d_mix: Record<GoalDomainId, number> = {} as any;
  for (const d of ALL_DOMAINS) {
    const vLife = lifeDomain[d] ?? 0;
    const vCtx = ctxDomain[d] ?? 0;
    d_mix[d] = wLife * vLife + wCtx * vCtx;
  }

  // 4) Фазовые и глобальные модификаторы сценария по конкретным CharacterGoalId
  const scenario = world.scenario;
  const scene = world.scene;
  const activePhase = world.scenarioContext?.activePhase;

  function getScenarioBoost(goalId: CharacterGoalId): number {
    if (!scenario) return 0;
    let boost = 0;

    // globalGoalModifiers: постоянный сдвиг для цели в данном сценарии
    if (scenario.globalGoalModifiers && scenario.globalGoalModifiers[goalId]) {
      boost += scenario.globalGoalModifiers[goalId]!;
    }

    // missionGoalWeights текущей фазы: фазовый приоритет
    // Use activePhase from context if available, otherwise legacy
    if (activePhase) {
        const w = activePhase.goalWeights?.[goalId];
        if (w && w !== 0) {
            boost += 2.0 * w; // Strong boost from context engine phase
        }
    } else if (scenario.phases && scene?.currentPhaseId) {
      const phase = scenario.phases.find(p => p.id === scene.currentPhaseId);
      const w = phase?.missionGoalWeights?.[goalId];
      if (w && w !== 0) {
        boost += 2.0 * w;
      }
    }

    return boost;
  }

  // 5) Считаем скоры по целям
  const temperature = agent.temperature || 1.0;
  const b_ctx: number[] = [];
  const activations: number[] = [];
  const priorities: number[] = [];
  const alpha: number[] = [];

  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    let score = 0;

    // Доменные веса цели
    for (const dw of g.domains) {
      const d = dw.domain;
      const w = dw.weight ?? 0;
      const dm = d_mix[d] ?? 0;
      score += w * dm;
    }

    // Базовое значение цели
    if (g.baseValue != null) {
      score += g.baseValue;
    }

    // Фазовые/глобальные бонусы сценария
    const scenarioBoost = getScenarioBoost(g.id as CharacterGoalId);
    score += scenarioBoost;

    b_ctx.push(score);

    // Активация — сглаженная положительная величина
    const act = Math.log1p(Math.exp(score / Math.max(0.1, temperature)));
    activations.push(act);
  }

  // Нормировка приоритетов (по максимуму активации)
  let maxAct = 0;
  for (const a of activations) {
    if (a > maxAct) maxAct = a;
  }

  for (let i = 0; i < goals.length; i++) {
    const a = activations[i];
    const p = maxAct > 0 ? a / maxAct : 0;
    priorities.push(p);
    alpha.push(a); // для отладки — “сырая” сила цели
  }

  const lifeGoalDebug: LifeGoalComponents | null = (agent.goalEcology?.lifeGoalDebug as any) || null;

  return {
    priorities,
    activations,
    alpha,
    debug: {
      b_ctx,
      d_mix,
      temperature,
    },
    lifeGoalDebug,
  };
}
