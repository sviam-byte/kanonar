
// lib/narrative/formatters.ts
import { NarrativeLogLine, LeaderChangedEvent, ActionChosenEvent, ActionAppliedEvent, ActionOutcome, SceneMetricsUpdatedEvent, QBreakdown, RoleAssignedEvent, RoleClaimedEvent, RoleProposedEvent, RoleResponseEvent } from '../../types';
import { entityMap } from '../../data';
import { GOAL_DEFS } from '../goals/space';
import { getArchetypeData, FUNCTION_NAMES } from '../../data/archetypes';

// Re-importing socialActions because it's not exported from data/index
import { socialActions } from '../../data/actions-social';

const name = (id?: string | null) => id ? (entityMap.get(id)?.title ?? id) : 'N/A';
const nameGoal = (id?: string) => id ? (GOAL_DEFS[id as keyof typeof GOAL_DEFS]?.label_ru ?? id) : 'N/A';
const nameAction = (id?: string) => {
    const action = socialActions.find(a => a.id === id);
    return action?.name || id || 'N/A';
}

function prettyGoalList(goalContribs: Record<string, number>): string {
  const entries = Object.entries(goalContribs)
    .sort((a,b)=> b[1]-a[1])
    .slice(0, 2)
    .filter(([_,v]) => v > 0.01);

  if (entries.length === 0) return "";

  return entries
    .map(([g, v]) => `${nameGoal(g)} ${(v ?? 0).toFixed(2)}`)
    .join(", ");
}

function getArchetypeName(id: string | undefined | null) {
    if (!id) return 'Неизвестно';
    const parts = id.split('-');
    if (parts.length >= 3) {
        const lambda = parts[0];
        const f = parseInt(parts[1]);
        const mu = parts[2];
        const data = getArchetypeData(lambda, f, mu);
        const funcName = FUNCTION_NAMES[f - 1] || 'Archetype';
        return data ? `${funcName} (${data.name})` : id;
    }
    return id;
}


export function formatLeaderChangedNarrative(e: LeaderChangedEvent): NarrativeLogLine {
  if (!e.oldLeaderId) {
    return {
      tick: e.tick,
      text: `Лидер назначен: ${name(e.newLeaderId)} (${e.explanation})`,
    };
  }
  if (e.oldLeaderId === e.newLeaderId) {
    return {
      tick: e.tick,
      text: `Лидер остался прежним: ${name(e.newLeaderId)} (${e.explanation})`,
    };
  }
  return {
    tick: e.tick,
    text: `Лидерство сменилось: теперь ${name(e.newLeaderId)} (${e.explanation})`,
  };
}

export function buildActionTooltip(e: ActionChosenEvent): string {
  const breakdown = (e.scoreBreakdown || e as any) as QBreakdown;
  const { fromGoals, fromScenario, fromProcedure, fromRelations, fromFaction, fromLeader, cost, repetitionPenalty, stagnationPenalty, fromArchetype, fromRisk, fromRole } = breakdown;
  const alpha = e.alpha ?? breakdown.alpha ?? 0;
  const ctx = e.archetypeContext;
  const isPlanned = !!e.planId;
  
  const q2_base = fromGoals + fromScenario + fromProcedure + fromRelations + fromFaction + fromLeader + (fromRisk || 0);
  const final_q2 = (1 - alpha) * q2_base;
  const final_q1 = fromArchetype;
  const total_utility = final_q1 + final_q2 + (fromRole || 0);
  const total_score = total_utility - cost - repetitionPenalty - stagnationPenalty;

  // Visual bars for the tooltip
  const barLength = 10;
  const rationalBlocks = Math.round((1-alpha) * barLength);
  const instinctBlocks = barLength - rationalBlocks;
  const controlBar = `[${'='.repeat(rationalBlocks)}${'-'.repeat(instinctBlocks)}] ${(1-alpha)*100}% Rat / ${(alpha)*100}% Inst`;

  const sections = [
    `=== PSYCHO-ENGINE REPORT ===`,
    `Total Score: ${total_score.toFixed(3)} (Prob: ${(e.probability * 100).toFixed(1)}%)`,
    isPlanned ? `[EXECUTION: PLAN STEP]` : `[REACTIVE CHOICE]`,
    ``,
    `[CONTROL DYNAMICS]`,
    `${controlBar}`,
    `Alpha (System 1 weight): ${alpha.toFixed(2)}`,
    `Shadow Activation: ${ctx ? (ctx.shadowActivation * 100).toFixed(1) + '%' : 'N/A'}`,
    ``,
  ];

  if (ctx) {
      sections.push(
        `[IDENTITY CRISIS]`,
        `Self (Mask):   ${getArchetypeName(ctx.selfId)}`,
        `Actual (Real): ${getArchetypeName(ctx.actualId)}`,
        `Shadow (Rep.): ${ctx.shadowId ? getArchetypeName(ctx.shadowId) : 'None'}`,
        ``
      );
  }

  if (isPlanned) {
      sections.push(
          `[PLAN CONTEXT]`,
          `Plan ID: ${e.planId}`,
          `Driving Goal: ${nameGoal(e.topGoalId)}`,
          ``
      );
  } else {
      sections.push(
        `[MOTIVATION SOURCE]`,
        `Rational Utility (Q2): ${q2_base.toFixed(2)} -> ${final_q2.toFixed(2)} (weighted)`,
        `  Goals: ${fromGoals.toFixed(2)}`,
        `  Scenario: ${fromScenario.toFixed(2)}`,
        `  Relations: ${fromRelations.toFixed(2)}`,
        `Archetypal Drive (Q1): ${fromArchetype.toFixed(2)} (raw)`,
        `Role Fit: ${fromRole ? fromRole.toFixed(2) : '0.00'}`,
        ``
      );
  }

  sections.push(
    `[COSTS & PENALTIES]`,
    `Cost: ${cost.toFixed(2)}`,
    `Repetition: ${repetitionPenalty.toFixed(2)}`,
    ``,
    `[TOP GOALS]`,
    ...Object.entries(e.goalContribs as Record<string, number>)
      .sort(([,a], [,b]) => b-a)
      .slice(0, 3)
      .map(([gId, v]) => `  ${nameGoal(gId)}: ${(v ?? 0).toFixed(3)}`)
  );

  return sections.join("\n");
}

export function formatActionNarrative(e: ActionChosenEvent): NarrativeLogLine {
  // This is the "Intent" line.
  
  const actionDef = socialActions.find(a => a.id === e.actionId);
  let text = "";
  
  // Simple fallback if no template
  const actorName = name(e.actorId);
  const targetName = e.targetId ? name(e.targetId) : "";
  
  const template = actionDef?.narrativeTemplate;
  if (template) {
      text = template
        .replace('{actor}', actorName)
        .replace('{target}', targetName || "...");
        
      // Clean up placeholders that weren't filled
      text = text.replace(/{.*?}/g, "...");
  } else {
      const actionName = nameAction(e.actionId);
      text = `[${actorName}] → ${actionName}${e.targetId ? ` на ${targetName}` : ''}`;
  }

  // Icons
  const alpha = e.alpha ?? 0;
  const isInstinctive = alpha > 0.5;
  const isShadowDriven = (e.archetypeContext?.shadowActivation ?? 0) > 0.6;
  const isPlanned = !!e.planId;
  
  let icon = '';
  if (isPlanned) icon = '🧠 '; // Brain/Map for planned
  else if (isShadowDriven) icon = '🌑 ';
  else if (isInstinctive) icon = '⚡ ';

  // Add context specific suffix for meaning
  let suffix = "";
  if (e.topGoalId) {
      const goalLabel = GOAL_DEFS[e.topGoalId]?.label_ru;
      if (goalLabel) suffix = ` (ради: ${goalLabel})`;
  }

  return {
    tick: e.tick,
    text: `${icon}${text}${suffix}`,
    tooltip: buildActionTooltip(e),
  };
}

export function formatSceneMetricsUpdate(e: SceneMetricsUpdatedEvent): NarrativeLogLine {
    const deltas = Object.entries(e.deltas)
        .filter(([_, value]) => {
            if (typeof value === 'number') {
                return Math.abs(value) > 0.01;
            }
            return value !== undefined;
        })
        .map(([key, value]) => {
            const label = key.replace(/_/g, ' ');
            if (typeof value === 'number') {
                const numValue = value;
                const formattedValue = numValue % 1 === 0 ? numValue : numValue.toFixed(1);
                return `${label}: ${numValue > 0 ? '+' : ''}${formattedValue}`;
            }
            return `${label}: ${value}`;
        });
    
    if (deltas.length === 0) {
        return {
            tick: e.tick,
            text: `  > Состояние сцены не изменилось.`
        };
    }

    return {
        tick: e.tick,
        text: `  > Изменения: ${deltas.join(', ')}`
    };
}


export function formatActionEffectNarrative(e: ActionAppliedEvent): NarrativeLogLine {
    const actionDef = socialActions.find(a => a.id === e.actionId);
    const orders = e.outcome?.ordersIssued;
    
    let text = "";
    const actorName = name(e.actorId);
    const targetName = e.targetId ? name(e.targetId) : "";
    
    // If we have an order, prioritize describing it
    if (actionDef?.id === 'issue_order' && orders && orders.length > 0) {
        const order = orders[0];
        text = `  > ${actorName} отдаёт приказ ${targetName}: "${order.summary || order.kind}"`;
    } else if (actionDef?.narrativeTemplate) {
         let resultText = 'неудачно';
         if (e.success > 0.8) resultText = 'успешно';
         else if (e.success > 0.2) resultText = 'частично успешно';
         
         text = `  > Выполнение: ${resultText}`;
    } else {
         // Fallback
         let resultText = 'неудачно';
         if (e.success > 0.8) resultText = 'успешно';
         else if (e.success > 0.2) resultText = 'частично успешно';
         text = `  > Результат: ${resultText}`;
    }
    
    // Append body deltas
    const deltas: string[] = [];
    if (e.bodyDelta?.stress) deltas.push(`стресс ${e.bodyDelta.stress > 0 ? '+' : ''}${e.bodyDelta.stress.toFixed(1)}`);
    if (deltas.length) text += ` (${deltas.join(", ")})`;

    return {
        tick: e.tick,
        text,
    };
}

export function formatRoleEventNarrative(e: RoleAssignedEvent | RoleClaimedEvent | RoleProposedEvent | RoleResponseEvent): NarrativeLogLine {
    let text = '';
    switch(e.kind) {
        case 'RoleProposed':
            text = `👑 ${name(e.fromId)} предлагает роль "${e.role}" персонажу ${name(e.toId)}.`;
            break;
        case 'RoleResponse':
            const response = e.response === 'accept' ? 'принимает' : e.response === 'reluctant_accept' ? 'нехотя принимает' : 'отказывается от';
            text = `🔸 ${name(e.fromId)} ${response} роль "${e.role}".`;
            break;
        case 'RoleAssigned':
            text = `✅ Роль "${e.role}" официально закреплена за ${name(e.actorId)}.`;
            break;
        case 'RoleClaimed':
            text = `📣 ${name(e.actorId)} заявляет: "Я беру на себя роль ${e.role}!"`;
            break;
    }
    return { tick: e.tick, text };
}
