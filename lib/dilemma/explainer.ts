// lib/dilemma/explainer.ts
//
// Rule-based, deterministic explanation helpers for v2 dilemma traces.

import type { CompiledAgent, CompiledDyad, ActionScore, ScenarioTemplate } from './types';

interface ExplainContext {
  agent: CompiledAgent;
  dyad: CompiledDyad;
  scenario: ScenarioTemplate;
  scores: ActionScore[];
  chosenId: string;
}

export function explainDecision(ctx: ExplainContext): string {
  const { agent, dyad, scenario, scores, chosenId } = ctx;
  const chosen = scores.find((s) => s.actionId === chosenId);
  if (!chosen) return `${agent.id} не смог выбрать действие.`;

  const sorted = [...scores].sort((a, b) => b.U - a.U);
  const rank = sorted.findIndex((s) => s.actionId === chosenId);
  const topAction = sorted[0];
  const template = scenario.actionPool.find((a) => a.id === chosenId);
  const label = template?.label ?? chosenId;

  const parts: string[] = [];
  parts.push(`${agent.id} выбрал «${label}»`);

  const dominant = dominantAxis(chosen);
  if (dominant) parts.push(dominantExplanation(dominant, agent, dyad));

  if (agent.confidence < 0.5) {
    parts.push(`(низкая уверенность в профиле: ${(agent.confidence * 100).toFixed(0)}%)`);
  }
  if (dyad.confidence < 0.5) {
    parts.push(`(пара слабо задана: ${(dyad.confidence * 100).toFixed(0)}%)`);
  }

  if (rank > 0) {
    const preferredLabel = scenario.actionPool.find((a) => a.id === topAction.actionId)?.label ?? topAction.actionId;
    const margin = topAction.U - chosen.U;
    parts.push(
      `Предпочтительнее было «${preferredLabel}» (Δ=${margin.toFixed(2)}), но стохастика при τ=${agent.effectiveTemperature.toFixed(2)} дала другой результат`,
    );
  } else if (sorted.length >= 2) {
    const margin = sorted[0].U - sorted[1].U;
    if (margin < 0.15) {
      const altLabel = scenario.actionPool.find((a) => a.id === sorted[1].actionId)?.label ?? sorted[1].actionId;
      parts.push(`Решение было близким — «${altLabel}» почти столь же вероятно (Δ=${margin.toFixed(2)})`);
    }
  }

  return parts.join('. ') + '.';
}

type AxisName = 'G' | 'R' | 'I' | 'L' | 'S' | 'M' | 'O' | 'X';

function dominantAxis(score: ActionScore): AxisName | null {
  const axes: [AxisName, number][] = [
    ['G', score.G], ['R', score.R], ['I', score.I], ['L', score.L],
    ['S', score.S], ['M', score.M], ['O', score.O], ['X', -score.X],
  ];
  axes.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (Math.abs(axes[0][1]) < 0.05) return null;
  return axes[0][0];
}

function dominantExplanation(axis: AxisName, agent: CompiledAgent, dyad: CompiledDyad): string {
  switch (axis) {
    case 'G': {
      const topGoal = Object.entries(agent.cognitive.wGoals).sort((a, b) => b[1] - a[1])[0];
      return topGoal ? `потому что это лучше всего служит цели «${topGoal[0]}»` : 'потому что это ближе к достижению цели';
    }
    case 'R':
      return dyad.rel.trust > 0.6
        ? `потому что доверие к ${dyad.toId} достаточно высоко (${dyad.rel.trust.toFixed(2)})`
        : `потому что отношение к ${dyad.toId} сильнее всего влияет на выбор`;
    case 'I':
      return `потому что это совместимо с самоконцептом (self_consistency=${(agent.axes.G_Self_consistency_drive ?? 0.5).toFixed(2)})`;
    case 'L':
      return `потому что это процедурно правильно (legitimacy=${(agent.axes.A_Legitimacy_Procedure ?? 0.5).toFixed(2)})`;
    case 'S':
      return agent.state.burnoutRisk > 0.5
        ? `потому что burnout=${agent.state.burnoutRisk.toFixed(2)} делает безопасность приоритетом`
        : 'потому что снижение угрозы важнее остального';
    case 'M':
      return `потому что «как меня увидят» (mirror=${dyad.secondOrder.mirrorIndex.toFixed(2)}) перевешивает`;
    case 'O':
      return `потому что ожидаемый ответ ${dyad.toId} на это действие оказался самым выгодным`;
    case 'X':
      return 'потому что ожидаемая цена других вариантов слишком высока';
  }
}

export function summarizeGame(
  agentId: string,
  traces: Array<{ chosenActionId: string; explanation: string }>,
  confidence: number,
): string {
  const actions = traces.map((t) => t.chosenActionId);
  const unique = [...new Set(actions)];
  const dominant = unique.sort((a, b) => actions.filter((x) => x === b).length - actions.filter((x) => x === a).length)[0];
  const repeatRate = actions.length > 0 ? actions.filter((a) => a === dominant).length / actions.length : 0;

  const parts: string[] = [];
  if (repeatRate > 0.7 && dominant) {
    parts.push(`${agentId} устойчиво выбирал «${dominant}» (${(repeatRate * 100).toFixed(0)}% раундов)`);
  } else {
    parts.push(`${agentId} варьировал стратегию: ${unique.join(', ') || 'нет действий'}`);
  }

  if (confidence < 0.5) {
    parts.push(`Результат малодостоверен — профиль заполнен на ${(confidence * 100).toFixed(0)}%`);
  }
  return parts.join('. ') + '.';
}
