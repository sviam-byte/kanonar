

// data/actions-social.ts
import { Action } from '../types';
import { getRelPriors, hasRecentAction } from '../lib/social/actionGuards';

// Action definitions for core social interactions
export const socialActionsData: Omit<Action, 'goalImpact'>[] = [
  {
    id: "introduce",
    name: "Представиться",
    narrative_verb: "представляется",
    tags: ["COMM", "face_to_face"],
    styleTags: ['style_norm_enforcing'],
    cost: { time: 1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} представляется {target}.',
    category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
    id: "share_information",
    name: "Поделиться информацией",
    narrative_verb: "делится информацией с",
    tags: ["COMM", "private", "INFO"],
    styleTags: ['style_cold_logical'],
    cost: { time: 1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} делится фактом "{fact}" с {target}.',
    generateArgs: (ctx) => {
        const atoms = Object.values(ctx.world.contextEx?.contextAtoms || {});
        const facts = atoms.filter(a => (a as any).kind === 'fact');
        if (facts.length > 0) {
            const fact = facts[facts.length - 1] as any;
            return { factId: fact.id, factLabel: fact.label || fact.prop };
        }
        return { factId: null, factLabel: 'general situation' };
    },
    category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'caring', allowedFor: ['any']
  },
  {
    id: "thank",
    name: "Поблагодарить",
    narrative_verb: "благодарит",
    tags: ["COMM", "gratitude"],
    styleTags: ['style_care'],
    cost: { time: 0.6 },
    targetMode: 'character',
    narrativeTemplate: '{actor} благодарит {target}.',
    category: 'support',
    aggression: 'none',
    adequacy: 'adaptive',
    tone: 'caring',
    allowedFor: ['any'],
    isAvailable: ({ world, actor, target }) => {
      if (!target) return false;
      const a = actor.entityId;
      const b = target.entityId;
      // "Thanks" makes sense when the target helped or baseline trust is already decent.
      const helpedMeRecently = hasRecentAction(world, {
        a,
        b,
        lookbackTicks: 30,
        tagsAny: ['help'],
        actorMustBe: 'b',
      });
      const rel = getRelPriors(actor, b);
      return helpedMeRecently || (rel.trust > 0.65 && rel.threat < 0.35);
    },
  },
  {
    id: "apologize",
    name: "Извиниться",
    narrative_verb: "извиняется перед",
    tags: ["COMM", "apology"],
    styleTags: ['style_care', 'style_submissive'],
    cost: { time: 0.8, reputation: 0.05 },
    targetMode: 'character',
    narrativeTemplate: '{actor} извиняется перед {target}.',
    category: 'support',
    aggression: 'none',
    adequacy: 'adaptive',
    tone: 'neutral',
    allowedFor: ['any'],
    isAvailable: ({ world, actor, target }) => {
      if (!target) return false;
      const a = actor.entityId;
      const b = target.entityId;
      // Apologize if I recently harmed the target or threat is high.
      const iHurtRecently = hasRecentAction(world, {
        a,
        b,
        lookbackTicks: 30,
        tagsAny: ['attack', 'lie', 'betrayal'],
        actorMustBe: 'a',
      });
      const rel = getRelPriors(actor, b);
      return iHurtRecently || rel.threat > 0.55;
    },
  },
  {
    id: "set_boundary",
    name: "Обозначить границу",
    narrative_verb: "обозначает границу с",
    tags: ["COMM", "boundary"],
    styleTags: ['style_assertive'],
    cost: { time: 0.9 },
    targetMode: 'character',
    narrativeTemplate: '{actor} обозначает границы в общении с {target}.',
    category: 'withdrawal',
    aggression: 'irritated',
    adequacy: 'adaptive',
    tone: 'cold',
    allowedFor: ['any'],
    isAvailable: ({ actor, target }) => {
      if (!target) return false;
      const rel = getRelPriors(actor, target.entityId);
      // Boundary setting is triggered by high threat/conflict.
      return rel.threat > 0.6;
    },
  },
  {
    id: "reconcile",
    name: "Попытаться помириться",
    narrative_verb: "пытается помириться с",
    tags: ["COMM", "reconcile"],
    styleTags: ['style_care'],
    cost: { time: 1.2, reputation: 0.05 },
    targetMode: 'character',
    narrativeTemplate: '{actor} пытается помириться с {target}.',
    category: 'support',
    aggression: 'none',
    adequacy: 'risky',
    tone: 'caring',
    allowedFor: ['any'],
    isAvailable: ({ world, actor, target }) => {
      if (!target) return false;
      const rel = getRelPriors(actor, target.entityId);
      const recentConflict = hasRecentAction(world, {
        a: actor.entityId,
        b: target.entityId,
        lookbackTicks: 40,
        tagsAny: ['attack', 'lie', 'betrayal'],
      });
      // Reconcile when there's conflict but not a total breakdown.
      return recentConflict && rel.trust > 0.35 && rel.threat > 0.45;
    },
  },
  {
    id: "request_help",
    name: "Попросить помощи",
    narrative_verb: "просит помощи у",
    tags: ["COMM", "request_help"],
    styleTags: ['style_submissive', 'style_care'],
    cost: { time: 0.8 },
    targetMode: 'character',
    narrativeTemplate: '{actor} просит помощи у {target}.',
    category: 'support',
    aggression: 'none',
    adequacy: 'adaptive',
    tone: 'neutral',
    allowedFor: ['any'],
    isAvailable: ({ actor, target }) => {
      if (!target) return false;
      const rel = getRelPriors(actor, target.entityId);
      // Ask for help when trust is high and threat isn't.
      return rel.trust > 0.55 && rel.threat < 0.55;
    },
  },
  {
    id: "offer_help",
    name: "Предложить помощь",
    narrative_verb: "предлагает помощь",
    tags: ["COMM", "help", "offer_help"],
    styleTags: ['style_care'],
    cost: { time: 0.8, energy: 0.1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} предлагает помощь {target}.',
    category: 'support',
    aggression: 'none',
    adequacy: 'adaptive',
    tone: 'caring',
    allowedFor: ['any'],
    isAvailable: ({ actor, target }) => {
      if (!target) return false;
      const rel = getRelPriors(actor, target.entityId);
      // Offering help is fine unless the perceived threat is extreme.
      return rel.threat < 0.75;
    },
  },
  {
    id: "confront_lie",
    name: "Конфронтировать ложь",
    narrative_verb: "конфронтирует",
    tags: ["COMM", "conflict", "lie"],
    styleTags: ['style_confrontational', 'style_assertive'],
    cost: { time: 1.0, stamina: 0.1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} конфронтирует {target} из-за лжи.',
    category: 'aggression',
    aggression: 'irritated',
    adequacy: 'risky',
    tone: 'controlling',
    allowedFor: ['any'],
    isAvailable: ({ world, actor, target }) => {
      if (!target) return false;
      const a = actor.entityId;
      const b = target.entityId;
      const liedRecently = hasRecentAction(world, {
        a,
        b,
        lookbackTicks: 40,
        tagsAny: ['lie'],
        actorMustBe: 'b',
      });
      const rel = getRelPriors(actor, b);
      return liedRecently || rel.threat > 0.6;
    },
  },
  // ... (existing actions kept for brevity, assumed to be part of socialActionsData export) ...
  // Adding new planning actions:
  {
      id: "propose_plan",
      name: "Предложить план",
      narrative_verb: "предлагает план",
      tags: ["planning", "coordination", "leadership"],
      styleTags: ['style_assertive', 'style_cold_logical'],
      cost: { time: 1.0, energy: 0.1 },
      targetMode: 'character', // Can target specific or group (handled by ID='ALL' or logic)
      narrativeTemplate: '{actor} предлагает план действий {target}.',
      category: 'command', aggression: 'none', adequacy: 'adaptive', tone: 'controlling', allowedFor: ['any'],
      isAvailable: (ctx) => {
          // Only available if agent has an active plan
          return !!ctx.actor.planState && ctx.actor.planState.status === 'active';
      }
  },
  {
      id: "accept_plan",
      name: "Принять план",
      narrative_verb: "принимает план",
      tags: ["planning", "coordination", "obedience"],
      styleTags: ['style_submissive', 'style_care'],
      cost: { time: 0.5 },
      targetMode: 'none', // Reactive to a context atom
      narrativeTemplate: '{actor} соглашается с предложенным планом.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any'],
      requires: { fact: 'plan_proposed' } // Conceptual requirement, checked via logic
  },
  {
      id: "reject_plan",
      name: "Отвергнуть план",
      narrative_verb: "отвергает план",
      tags: ["planning", "conflict"],
      styleTags: ['style_assertive', 'style_confrontational'],
      cost: { time: 0.5, reputation: 0.1 },
      targetMode: 'none',
      narrativeTemplate: '{actor} отвергает предложенный план.',
      category: 'withdrawal', aggression: 'none', adequacy: 'adaptive', tone: 'cold', allowedFor: ['any']
  }
];

// ... (keeping rest of file structure compatible)

export const socialActions: Action[] = [
  {
    id: "introduce",
    name: "Представиться",
    narrative_verb: "представляется",
    tags: ["COMM", "face_to_face"],
    styleTags: ['style_norm_enforcing'],
    cost: { time: 1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} представляется {target}.',
    category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
    id: "share_information",
    name: "Поделиться информацией",
    narrative_verb: "делится информацией с",
    tags: ["COMM", "private", "INFO"],
    styleTags: ['style_cold_logical'],
    cost: { time: 1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} делится фактом "{fact}" с {target}.',
    generateArgs: (ctx) => {
        const atoms = Object.values(ctx.world.contextEx?.contextAtoms || {});
        const facts = atoms.filter(a => (a as any).kind === 'fact');
        if (facts.length > 0) {
            const fact = facts[facts.length - 1] as any;
            return { factId: fact.id, factLabel: fact.label || fact.prop };
        }
        return { factId: null, factLabel: 'general situation' };
    },
    category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'caring', allowedFor: ['any']
  },
  {
    id: "thank",
    name: "Поблагодарить",
    narrative_verb: "благодарит",
    tags: ["COMM", "gratitude"],
    styleTags: ['style_care'],
    cost: { time: 0.6 },
    targetMode: 'character',
    narrativeTemplate: '{actor} благодарит {target}.',
    category: 'support',
    aggression: 'none',
    adequacy: 'adaptive',
    tone: 'caring',
    allowedFor: ['any'],
    isAvailable: ({ world, actor, target }) => {
      if (!target) return false;
      const a = actor.entityId;
      const b = target.entityId;
      // "Thanks" makes sense when the target helped or baseline trust is already decent.
      const helpedMeRecently = hasRecentAction(world, {
        a,
        b,
        lookbackTicks: 30,
        tagsAny: ['help'],
        actorMustBe: 'b',
      });
      const rel = getRelPriors(actor, b);
      return helpedMeRecently || (rel.trust > 0.65 && rel.threat < 0.35);
    },
  },
  {
    id: "apologize",
    name: "Извиниться",
    narrative_verb: "извиняется перед",
    tags: ["COMM", "apology"],
    styleTags: ['style_care', 'style_submissive'],
    cost: { time: 0.8, reputation: 0.05 },
    targetMode: 'character',
    narrativeTemplate: '{actor} извиняется перед {target}.',
    category: 'support',
    aggression: 'none',
    adequacy: 'adaptive',
    tone: 'neutral',
    allowedFor: ['any'],
    isAvailable: ({ world, actor, target }) => {
      if (!target) return false;
      const a = actor.entityId;
      const b = target.entityId;
      // Apologize if I recently harmed the target or threat is high.
      const iHurtRecently = hasRecentAction(world, {
        a,
        b,
        lookbackTicks: 30,
        tagsAny: ['attack', 'lie', 'betrayal'],
        actorMustBe: 'a',
      });
      const rel = getRelPriors(actor, b);
      return iHurtRecently || rel.threat > 0.55;
    },
  },
  {
    id: "set_boundary",
    name: "Обозначить границу",
    narrative_verb: "обозначает границу с",
    tags: ["COMM", "boundary"],
    styleTags: ['style_assertive'],
    cost: { time: 0.9 },
    targetMode: 'character',
    narrativeTemplate: '{actor} обозначает границы в общении с {target}.',
    category: 'withdrawal',
    aggression: 'irritated',
    adequacy: 'adaptive',
    tone: 'cold',
    allowedFor: ['any'],
    isAvailable: ({ actor, target }) => {
      if (!target) return false;
      const rel = getRelPriors(actor, target.entityId);
      // Boundary setting is triggered by high threat/conflict.
      return rel.threat > 0.6;
    },
  },
  {
    id: "reconcile",
    name: "Попытаться помириться",
    narrative_verb: "пытается помириться с",
    tags: ["COMM", "reconcile"],
    styleTags: ['style_care'],
    cost: { time: 1.2, reputation: 0.05 },
    targetMode: 'character',
    narrativeTemplate: '{actor} пытается помириться с {target}.',
    category: 'support',
    aggression: 'none',
    adequacy: 'risky',
    tone: 'caring',
    allowedFor: ['any'],
    isAvailable: ({ world, actor, target }) => {
      if (!target) return false;
      const rel = getRelPriors(actor, target.entityId);
      const recentConflict = hasRecentAction(world, {
        a: actor.entityId,
        b: target.entityId,
        lookbackTicks: 40,
        tagsAny: ['attack', 'lie', 'betrayal'],
      });
      // Reconcile when there's conflict but not a total breakdown.
      return recentConflict && rel.trust > 0.35 && rel.threat > 0.45;
    },
  },
  {
    id: "request_help",
    name: "Попросить помощи",
    narrative_verb: "просит помощи у",
    tags: ["COMM", "request_help"],
    styleTags: ['style_submissive', 'style_care'],
    cost: { time: 0.8 },
    targetMode: 'character',
    narrativeTemplate: '{actor} просит помощи у {target}.',
    category: 'support',
    aggression: 'none',
    adequacy: 'adaptive',
    tone: 'neutral',
    allowedFor: ['any'],
    isAvailable: ({ actor, target }) => {
      if (!target) return false;
      const rel = getRelPriors(actor, target.entityId);
      // Ask for help when trust is high and threat isn't.
      return rel.trust > 0.55 && rel.threat < 0.55;
    },
  },
  {
    id: "offer_help",
    name: "Предложить помощь",
    narrative_verb: "предлагает помощь",
    tags: ["COMM", "help", "offer_help"],
    styleTags: ['style_care'],
    cost: { time: 0.8, energy: 0.1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} предлагает помощь {target}.',
    category: 'support',
    aggression: 'none',
    adequacy: 'adaptive',
    tone: 'caring',
    allowedFor: ['any'],
    isAvailable: ({ actor, target }) => {
      if (!target) return false;
      const rel = getRelPriors(actor, target.entityId);
      // Offering help is fine unless the perceived threat is extreme.
      return rel.threat < 0.75;
    },
  },
  {
    id: "confront_lie",
    name: "Конфронтировать ложь",
    narrative_verb: "конфронтирует",
    tags: ["COMM", "conflict", "lie"],
    styleTags: ['style_confrontational', 'style_assertive'],
    cost: { time: 1.0, stamina: 0.1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} конфронтирует {target} из-за лжи.',
    category: 'aggression',
    aggression: 'irritated',
    adequacy: 'risky',
    tone: 'controlling',
    allowedFor: ['any'],
    isAvailable: ({ world, actor, target }) => {
      if (!target) return false;
      const a = actor.entityId;
      const b = target.entityId;
      const liedRecently = hasRecentAction(world, {
        a,
        b,
        lookbackTicks: 40,
        tagsAny: ['lie'],
        actorMustBe: 'b',
      });
      const rel = getRelPriors(actor, b);
      return liedRecently || rel.threat > 0.6;
    },
  },
  {
    id: "share_personal_belief",
    name: "Поделиться мнением",
    narrative_verb: "делится мнением с",
    tags: ["COMM", "face_to_face"],
    styleTags: ['style_care'], 
    cost: { time: 1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} делится своим мнением с {target}.',
    category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
    id: "ask_question",
    name: "Задать вопрос",
    narrative_verb: "задает вопрос",
    tags: ["COMM", "face_to_face"],
    styleTags: ['style_cold_logical'],
    cost: { time: 1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} задает вопрос {target}.',
    category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
    id: "observe",
    name: "Наблюдать",
    narrative_verb: "наблюдает за",
    tags: ["INFO", "passive"],
    styleTags: ['style_cold_logical', 'style_avoidant'],
    cost: { time: 1 },
    isAvailable: ({ world, actor }) => {
      if (!world.scene?.currentPhaseId) return true;
      const phase = world.scene.scenarioDef.phases?.find(p => p.id === world.scene.currentPhaseId);
      if (!phase) return true;
      return phase.id === 'orientation' || (world.scene.metrics.discipline < 40);
    },
    targetMode: 'none',
    narrativeTemplate: '{actor} внимательно наблюдает за происходящим.',
    category: 'withdrawal', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
    id: "persuade",
    name: "Убеждать",
    narrative_verb: "убеждает",
    tags: ["COMM", "face_to_face"],
    styleTags: ['style_assertive', 'style_care'],
    cost: { time: 1, stamina: 0.1 },
    targetMode: 'character',
    narrativeTemplate: '{actor} пытается убедить {target}.',
    preconditions: [
        ({ world }: any) => {
            const atoms = Object.values(world.contextEx?.contextAtoms || {});
            // FIX: cast atom to any to access scope property safely if types are loose
            return atoms.some((a: any) => a.scope === 'shared' && a.kind === 'fact');
        }
    ],
    category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'caring', allowedFor: ['any']
  },
  {
    id: "intimidate",
    name: "Запугивать",
    narrative_verb: "запугивает",
    tags: ["MANIP", "face_to_face"],
    styleTags: ['style_confrontational', 'style_assertive'],
    cost: { time: 1, stamina: 0.1 },
    isAvailable: ({ actor }) => {
        if (actor.entityId === 'character-krystar-mann' && (actor.body.acute.stress ?? 0) > 50) {
            return false;
        }
        return true;
    },
    targetMode: 'character',
    narrativeTemplate: '{actor} пытается запугать {target}.',
    category: 'aggression', aggression: 'hostile', adequacy: 'risky', tone: 'controlling', allowedFor: ['any']
  },
  {
      id: "deceive",
      name: "Обмануть",
      narrative_verb: "лжет",
      tags: ["MANIP", "deception"],
      styleTags: ['style_avoidant', 'style_norm_breaking'],
      cost: { time: 1, reputation: 0.1 },
      targetMode: 'character',
      narrativeTemplate: '{actor} лжет {target}.',
      category: 'deception', aggression: 'none', adequacy: 'risky', tone: 'mocking', allowedFor: ['any']
  },
  {
      id: "gossip",
      name: "Сплетничать",
      narrative_verb: "распускает слухи о",
      tags: ["MANIP", "social"],
      styleTags: ['style_confrontational'],
      cost: { time: 1 },
      targetMode: 'character',
      narrativeTemplate: '{actor} распускает слухи о {target}.',
      category: 'deception', aggression: 'irritated', adequacy: 'maladaptive', tone: 'mocking', allowedFor: ['any']
  },
  {
      id: "blame_other",
      name: "Обвинить",
      narrative_verb: "обвиняет",
      tags: ["conflict", "MANIP"],
      styleTags: ['style_confrontational', 'style_assertive'],
      cost: { time: 0.5, reputation: 0.1 },
      targetMode: 'character',
      narrativeTemplate: '{actor} обвиняет {target} в происходящем.',
      category: 'aggression', aggression: 'hostile', adequacy: 'maladaptive', tone: 'controlling', allowedFor: ['any']
  },
  {
      id: "sow_dissent",
      name: "Сеять раздор",
      narrative_verb: "сеет смуту среди",
      tags: ["conflict", "MANIP", "group"],
      styleTags: ['style_norm_breaking'],
      cost: { time: 1.5, reputation: 0.2 },
      targetMode: 'group',
      narrativeTemplate: '{actor} пытается посеять раздор в группе.',
      category: 'deception', aggression: 'hostile', adequacy: 'risky', tone: 'mocking', allowedFor: ['any']
  },
  {
      id: "support_leader",
      name: "Поддержать лидера",
      narrative_verb: "поддерживает лидера",
      tags: ["social", "hierarchy"],
      styleTags: ['style_submissive', 'style_norm_enforcing'],
      cost: { time: 0.5 },
      targetMode: 'none',
      narrativeTemplate: '{actor} публично выражает поддержку лидеру.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
      id: "challenge_leader",
      name: "Бросить вызов",
      narrative_verb: "бросает вызов",
      tags: ["conflict", "hierarchy", "risk"],
      styleTags: ['style_assertive', 'style_confrontational', 'style_norm_breaking'],
      cost: { time: 0.5, reputation: 0.2 },
      targetMode: 'none',
      narrativeTemplate: '{actor} открыто оспаривает авторитет лидера.',
      category: 'aggression', aggression: 'hostile', adequacy: 'risky', tone: 'controlling', allowedFor: ['any']
  },
  {
      id: "issue_order",
      name: "Отдать приказ",
      narrative_verb: "приказывает",
      tags: ["hierarchy", "command"],
      styleTags: ['style_assertive', 'style_norm_enforcing'],
      cost: { time: 0.5, energy: 0.1 },
      targetMode: 'character',
      narrativeTemplate: '{actor} приказывает {target}.',
      category: 'command', aggression: 'none', adequacy: 'adaptive', tone: 'controlling', allowedFor: ['any']
  },
  {
      id: "acknowledge_order",
      name: "Подтвердить приказ",
      narrative_verb: "подтверждает",
      tags: ["hierarchy", "obedience"],
      styleTags: ['style_submissive', 'style_norm_enforcing'],
      cost: { time: 0.2 },
      targetMode: 'none',
      narrativeTemplate: '{actor} подтверждает получение приказа.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
      id: "refuse_order",
      name: "Отказаться",
      narrative_verb: "отказывается",
      tags: ["hierarchy", "conflict", "risk"],
      styleTags: ['style_confrontational', 'style_norm_breaking'],
      cost: { time: 0.5, reputation: 0.3 },
      targetMode: 'none',
      narrativeTemplate: '{actor} отказывается выполнять приказ.',
      category: 'withdrawal', aggression: 'irritated', adequacy: 'risky', tone: 'despair', allowedFor: ['any']
  },
  {
      id: "wait",
      name: "Ожидать",
      narrative_verb: "ждет",
      tags: ["passive"],
      styleTags: ['style_avoidant'],
      cost: { time: 1.0 },
      targetMode: 'none',
      narrativeTemplate: '{actor} ждет развития событий.',
      category: 'withdrawal', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
      id: "rest",
      name: "Отдыхать",
      narrative_verb: "отдыхает",
      tags: ["recovery"],
      styleTags: ['style_avoidant'],
      cost: { time: 2.0 },
      targetMode: 'none',
      narrativeTemplate: '{actor} берет паузу для отдыха.',
      category: 'withdrawal', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
      id: "search_route",
      name: "Искать путь",
      narrative_verb: "ищет путь",
      tags: ["progress", "topo", "physical"],
      styleTags: [],
      cost: { time: 1.0, energy: 0.2 },
      targetMode: 'none',
      narrativeTemplate: '{actor} ищет безопасный маршрут.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
      id: "clear_debris",
      name: "Расчищать завал",
      narrative_verb: "расчищает завал",
      tags: ["progress", "physical"],
      styleTags: [],
      cost: { time: 2.0, energy: 0.4 },
      targetMode: 'none',
      narrativeTemplate: '{actor} расчищает путь.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
      id: "protect_exit",
      name: "Охранять выход",
      narrative_verb: "охраняет выход",
      tags: ["security", "physical"],
      styleTags: ['style_assertive'],
      cost: { time: 1.0, energy: 0.1 },
      targetMode: 'none',
      narrativeTemplate: '{actor} занимает позицию у выхода.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'controlling', allowedFor: ['any']
  },
  {
      id: "triage_wounded",
      name: "Сортировать раненых",
      narrative_verb: "оказывает помощь",
      tags: ["medical", "care"],
      styleTags: ['style_care', 'style_cold_logical'],
      cost: { time: 1.5, energy: 0.2 },
      targetMode: 'none',
      narrativeTemplate: '{actor} оказывает первую помощь раненым.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'caring', allowedFor: ['any']
  },
  {
      id: "evacuate_wounded",
      name: "Эвакуировать",
      narrative_verb: "эвакуирует",
      tags: ["medical", "physical", "care"],
      styleTags: ['style_care'],
      cost: { time: 2.0, energy: 0.5 },
      targetMode: 'none',
      narrativeTemplate: '{actor} помогает эвакуировать раненых.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'caring', allowedFor: ['any']
  },
  {
      id: "coordinate_search",
      name: "Координировать поиск",
      narrative_verb: "координирует поиск",
      tags: ["leadership", "coordination"],
      styleTags: ['style_assertive'],
      cost: { time: 1.0, energy: 0.1 },
      targetMode: 'none',
      narrativeTemplate: '{actor} координирует действия поисковых групп.',
      category: 'command', aggression: 'none', adequacy: 'adaptive', tone: 'controlling', allowedFor: ['any']
  },
  {
      id: "broadcast_plan",
      name: "Огласить план",
      narrative_verb: "оглашает план",
      tags: ["leadership", "communication"],
      styleTags: ['style_assertive', 'style_norm_enforcing'],
      cost: { time: 0.5 },
      targetMode: 'none',
      narrativeTemplate: '{actor} громко объявляет план действий.',
      category: 'command', aggression: 'none', adequacy: 'adaptive', tone: 'controlling', allowedFor: ['any']
  },
  {
      id: "organize_evac",
      name: "Организовать эвакуацию",
      narrative_verb: "организует эвакуацию",
      tags: ["leadership", "logistics"],
      styleTags: ['style_assertive'],
      cost: { time: 1.5, energy: 0.2 },
      targetMode: 'none',
      narrativeTemplate: '{actor} распределяет задачи по эвакуации.',
      category: 'command', aggression: 'none', adequacy: 'adaptive', tone: 'controlling', allowedFor: ['any']
  },
   {
      id: "delegate_leadership",
      name: "Делегировать лидерство",
      narrative_verb: "передает командование",
      tags: ["leadership", "hierarchy"],
      styleTags: ['style_assertive'],
      cost: { time: 0.5, reputation: 0.1 },
      targetMode: 'character',
      narrativeTemplate: '{actor} передает полномочия лидера {target}.',
      category: 'command', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['leader']
  },
  {
      id: "propose_leadership",
      name: "Предложить лидерство",
      narrative_verb: "предлагает возглавить",
      tags: ["leadership", "hierarchy"],
      styleTags: ['style_submissive'],
      cost: { time: 0.5 },
      targetMode: 'character',
      narrativeTemplate: '{actor} предлагает {target} взять командование на себя.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any']
  },
  {
      id: "accept_leadership",
      name: "Принять лидерство",
      narrative_verb: "принимает командование",
      tags: ["leadership", "hierarchy"],
      styleTags: ['style_assertive'],
      cost: { time: 0.5 },
      targetMode: 'none',
      narrativeTemplate: '{actor} принимает полномочия лидера.',
      category: 'command', aggression: 'none', adequacy: 'adaptive', tone: 'controlling', allowedFor: ['any']
  },
  {
      id: "reassure",
      name: "Успокоить",
      narrative_verb: "успокаивает",
      tags: ["social", "care"],
      styleTags: ['style_care'],
      cost: { time: 0.5 },
      targetMode: 'character',
      narrativeTemplate: '{actor} успокаивает {target}.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'caring', allowedFor: ['any']
  },
  {
      id: "reassure_group",
      name: "Успокоить группу",
      narrative_verb: "успокаивает группу",
      tags: ["social", "care", "leadership"],
      styleTags: ['style_care', 'style_assertive'],
      cost: { time: 1.0, energy: 0.1 },
      targetMode: 'none',
      narrativeTemplate: '{actor} обращается к группе, пытаясь снизить панику.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'caring', allowedFor: ['any']
  },
  {
      id: "search_exit_alone",
      name: "Искать выход одному",
      narrative_verb: "ищет выход в одиночку",
      tags: ["self-preservation", "risk", "isolation"],
      styleTags: ['style_avoidant', 'style_norm_breaking'],
      cost: { time: 1.0, reputation: 0.2 },
      targetMode: 'none',
      narrativeTemplate: '{actor} ищет выход в одиночку, игнорируя остальных.',
      category: 'withdrawal', aggression: 'none', adequacy: 'risky', tone: 'selfish', allowedFor: ['any']
  },
  // New Planning Actions
  {
      id: "propose_plan",
      name: "Предложить план",
      narrative_verb: "предлагает план",
      tags: ["planning", "coordination", "leadership"],
      styleTags: ['style_assertive', 'style_cold_logical'],
      cost: { time: 1.0, energy: 0.1 },
      targetMode: 'character', // Can target specific or group (handled by ID='ALL' or logic)
      narrativeTemplate: '{actor} предлагает план действий {target}.',
      category: 'command', aggression: 'none', adequacy: 'adaptive', tone: 'controlling', allowedFor: ['any'],
      isAvailable: (ctx) => {
          // Only available if agent has an active plan
          return !!ctx.actor.planState && ctx.actor.planState.status === 'active';
      }
  },
  {
      id: "accept_plan",
      name: "Принять план",
      narrative_verb: "принимает план",
      tags: ["planning", "coordination", "obedience"],
      styleTags: ['style_submissive', 'style_care'],
      cost: { time: 0.5 },
      targetMode: 'none', // Reactive to a context atom
      narrativeTemplate: '{actor} соглашается с предложенным планом.',
      category: 'support', aggression: 'none', adequacy: 'adaptive', tone: 'neutral', allowedFor: ['any'],
      requires: { fact: 'plan_proposed' } // Conceptual requirement, checked via logic
  },
  {
      id: "reject_plan",
      name: "Отвергнуть план",
      narrative_verb: "отвергает план",
      tags: ["planning", "conflict"],
      styleTags: ['style_assertive', 'style_confrontational'],
      cost: { time: 0.5, reputation: 0.1 },
      targetMode: 'none',
      narrativeTemplate: '{actor} отвергает предложенный план.',
      category: 'withdrawal', aggression: 'none', adequacy: 'adaptive', tone: 'cold', allowedFor: ['any']
  }
];
