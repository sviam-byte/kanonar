
import {
  ActionDef,
  ActionIntent,
  AgentGoalState,
  ContextWorldState,
  GoalDef,
  GoalId,
  LogEntry,
  MandateId,
  MandateRegistryEntry,
  ScenarioConfig,
  Metrics,
  OfferAtom,
  AtomBase,
  FactAtom,
  GatePredicate,
  CommitmentAtom,
  CommitmentStatus
} from './types';
import type { TickContext } from './engineTypes';
import type { AgentState, WorldState, DomainEvent } from '../../types';
import { applyDomainEventsToWorldContext } from './contextEngine';

export function updateScenarioContextFromEvents(world: WorldState, events: DomainEvent[]): WorldState {
  return applyDomainEventsToWorldContext(world, events);
}

export interface ResolutionRules {
  exclusivityKeys: (intent: ActionIntent, w: ContextWorldState) => string[];
  mergeKey?: (intent: ActionIntent, w: ContextWorldState) => string | null;
  priority: (intent: ActionIntent, w: ContextWorldState) => number;
}

export interface ResolvedAction {
  intent: ActionIntent;
  status: 'applied' | 'blocked' | 'merged' | 'downgraded';
  reason?: string;
  mergedIntoId?: string;
}

/**
 * Линейное затухание уверенности атома:
 * c_eff(t) = c0 * max(0, 1 - d * (t - t0)).
 * Если decayPerTick не задан, уверенность не затухает.
 */
export function effectiveAtomConfidence(atom: AtomBase, currentTick: number): number {
  const decay = atom.decayPerTick ?? 0;
  if (decay <= 0) {
    return atom.confidence;
  }
  const age = Math.max(0, currentTick - atom.createdTick);
  if (age <= 0) {
    return atom.confidence;
  }
  const factor = Math.max(0, 1 - decay * age);
  return atom.confidence * factor;
}

/**
 * Утилиты для логов
 */
export function pushLog(w: ContextWorldState, entry: Omit<LogEntry, 'tick'>) {
  w.contextEx.logs.push({ tick: w.tick, ...entry });
}

/**
 * Hard-availability: контекст, стадия, affordances, метрики, мандаты и т.п.
 */
export function hardAvailable(
  intent: ActionIntent,
  ctx: TickContext,
  w: ContextWorldState
): boolean {
  const { scenario, agentLocationTags } = ctx;
  const stage = scenario.stages.find(s => s.id === w.contextEx.stageId);
  const def = ctx.actionCatalog[intent.actionId];
  if (!def) return false;

  const affs = scenario.affordances ?? [];
  if (!affs.length) {
    // Если affordances нет — ничего не режем
  } else {
    const tags = agentLocationTags[intent.actorId] ?? [];
    const applicable = affs.filter(aff =>
      !aff.requiresLocationTags ||
      aff.requiresLocationTags.every(t => tags.includes(t))
    );
    const effective = applicable.length
      ? applicable
      : affs.filter(aff => !aff.requiresLocationTags);

    if (effective.length) {
      const allowed = effective.some(aff =>
        aff.allowedActions?.includes(intent.actionId)
      );
      if (!allowed) return false;
    }
  }

  // стадия: белый / чёрный список
  if (stage?.allowedActions && !stage.allowedActions.includes(intent.actionId)) {
    return false;
  }
  if (stage?.forbiddenActions && stage.forbiddenActions.includes(intent.actionId)) {
    return false;
  }

  // hard-gates из ActionDef
  for (const gate of def.gatesHard) {
    switch (gate.kind) {
      case 'context': {
        const mode = stage?.contextOverride ?? scenario.contextMode;
        if (!gate.allowed.includes(mode)) return false;
        break;
      }
      case 'stage': {
        const st = w.contextEx.stageId;
        if (gate.allowed && !gate.allowed.includes(st)) return false;
        if (gate.forbidden && gate.forbidden.includes(st)) return false;
        break;
      }
      case 'metric': {
        const val = w.contextEx.metrics[gate.metric] ?? 0;
        if (gate.min !== undefined && val < gate.min) return false;
        if (gate.max !== undefined && val > gate.max) return false;
        break;
      }
      case 'mandate': {
        const reg = w.contextEx.mandates[gate.mandateId];
        if (!reg || !reg.active || reg.holderId !== intent.actorId) return false;
        break;
      }
      case 'requiresFact': {
        const required = gate.prop;
        const minConf = gate.minConf ?? 0;

        const atoms = Object.values(w.contextEx?.contextAtoms ?? {});
        const now = w.tick ?? 0;

        if (required === 'help_offered') {
          // Специальный случай: требуется "мне кто-то предложил помощь".
          // Ищем OfferAtom с offerKind='help' и targetId === actorId,
          // у которого c_eff >= minConf.
          const helpAtoms = atoms.filter(
            (a): a is OfferAtom =>
              (a as any).kind === 'offer' &&
              (a as any).offerKind === 'help' &&
              (a as any).targetId === intent.actorId
          );

          if (helpAtoms.length === 0) {
            return false;
          }

          const ok = helpAtoms.some((atom) => {
            const eff = effectiveAtomConfidence(atom as any, now);
            return eff >= minConf;
          });

          if (!ok) {
            return false;
          }
        } else {
          // Общий случай: нужен факт с prop === gate.prop.
          const ok = atoms.some((a): a is FactAtom => {
            if ((a as any).kind !== 'fact') return false;
            const fa = a as FactAtom;
            if (fa.prop !== required) return false;
            const eff = effectiveAtomConfidence(fa, now);
            return eff >= minConf;
          });

          if (!ok) {
            return false;
          }
        }
        break;
      }
      case 'locationTagRequired': {
        const tag = gate.tag;
        const locTagsByAgent = w.contextEx?.agentLocationTags;
        const tags = locTagsByAgent?.[intent.actorId] ?? [];
        // Если у актёра нет нужного тега локации — действие недоступно
        if (!tags.includes(tag)) {
          return false;
        }
        break;
      }
      case 'commitmentAbsent': {
        const requiredKind = gate.commitmentKind;
        const minConf = gate.minConf ?? 0;
        const atoms = Object.values(w.contextEx?.contextAtoms ?? {});
        const now = w.tick ?? 0;

        const hasActiveCommitment = atoms.some((a): a is CommitmentAtom => {
          if ((a as any).kind !== 'commitment') return false;
          const c = a as CommitmentAtom;
          if (c.commitmentKind !== requiredKind) return false;
          if (c.toId !== intent.actorId) return false;
          if (c.status !== 'active') return false;
          const eff = effectiveAtomConfidence(c as any, now);
          return eff >= minConf;
        });

        // Gate "commitmentAbsent" пропускает ТОЛЬКО если нет активных обязательств
        if (hasActiveCommitment) {
          return false;
        }
        break;
      }
      case 'locationTags': {
        const gatePred = gate; // as Extract<HardGate, {kind: 'locationTags'}>
        const locOf = w.contextEx?.locationOf ?? {};
        const actorLocId = locOf[intent.actorId];
        if (!actorLocId) return false;

        const loc = scenario.map.locations.find((l) => l.id === actorLocId);
        if (!loc) return false;

        const tags = new Set(loc.tags ?? []);

        if (gatePred.requires && gatePred.requires.length > 0) {
            for (const t of gatePred.requires) {
            if (!tags.has(t)) return false;
            }
        }

        if (gatePred.forbids && gatePred.forbids.length > 0) {
            for (const t of gatePred.forbids) {
            if (tags.has(t)) return false;
            }
        }
        break;
      }
    }
  }

  return true;
}

function computeAgentLocationTags(
  actorId: string,
  ctx: TickContext
): string[] {
  const locId = ctx.locationOf[actorId];
  const loc = ctx.scenario.map.locations.find((item) => item.id === locId);
  return loc?.tags ?? [];
}

/**
 * Soft-gates превращаются в стоимость, но не блокируют
 */
export function softGateCost(
  agent: AgentState,
  intent: ActionIntent,
  def: ActionDef,
  w: ContextWorldState
): { cost: number; violations: LogEntry[] } {
  let cost = 0;
  const logs: LogEntry[] = [];

  if (!def.gatesSoft?.length) return { cost, violations: logs };

  for (const gate of def.gatesSoft) {
    const p = gate.violationLikelihood(agent, w);
    if (p <= 0) continue;

    const expectedSeverity = (gate.penalty.addViolationSeverity ?? 0) * p;
    cost += expectedSeverity;

    logs.push({
      tick: w.tick,
      kind: 'norm',
      actorId: agent.entityId,
      message: `Потенциальное нарушение нормы ${gate.normId} при действии ${def.id}`,
      data: { normId: gate.normId, probability: p, penalty: gate.penalty },
    });
  }

  return { cost, violations: logs };
}

/**
 * Utility: U(goal, world)
 */
export function goalUtility(goal: GoalDef, metrics: Metrics): number {
  return goal.terms.reduce((acc, term) => {
    const x = metrics[term.metric] ?? 0;
    return acc + term.weight * term.utility(x);
  }, 0);
}

function sumActiveGoals(
  agentGoals: AgentGoalState[],
  goalDefs: Record<GoalId, GoalDef>,
  metrics: Metrics
): number {
  return agentGoals.reduce((acc, g) => {
    const def = goalDefs[g.goalId];
    if (!def) return acc;
    const u = goalUtility(def, metrics);
    return acc + g.basePriority * (1 + g.tension) * u;
  }, 0);
}

/**
 * Оценка одного интента (direct utility – cost)
 */
export function scoreIntent(
  agent: AgentState,
  agentGoals: AgentGoalState[],
  intent: ActionIntent,
  def: ActionDef,
  w: ContextWorldState,
  goalDefs: Record<GoalId, GoalDef>
): number {
  // preview мира после эффекта
  const deltas = def.effects(w, intent);
  const metricsPrime: Metrics = { ...w.contextEx.metrics };
  for (const d of deltas) {
    metricsPrime[d.metric] = (metricsPrime[d.metric] ?? 0) + d.deltaMean;
  }

  const uBefore = sumActiveGoals(agentGoals, goalDefs, w.contextEx.metrics);
  const uAfter = sumActiveGoals(agentGoals, goalDefs, metricsPrime);

  const { cost, violations } = softGateCost(agent, intent, def, w);
  violations.forEach(v => w.contextEx.logs.push(v));
  
  // Saturation Penalty (if action creates a fact that already exists)
  let saturationPenalty = 0;
  if (def.satisfies?.prop) {
      const prop = def.satisfies.prop;
      const existing = w.contextEx.contextAtoms[prop];
      if (existing && existing.confidence > 0.5) {
          saturationPenalty = 2.0;
      }
  }

  return (uAfter - uBefore) - cost - saturationPenalty;
}

/**
 * Resolution: lock / merge / priority
 */
export function resolveIntents(
  intents: ActionIntent[],
  rr: ResolutionRules,
  w: ContextWorldState
): ResolvedAction[] {
  const result: ResolvedAction[] = [];
  const locked = new Set<string>();
  const byMerge: Record<string, ResolvedAction[]> = {};

  // сортируем по приоритету
  const sorted = [...intents].sort(
    (a, b) => rr.priority(b, w) - rr.priority(a, w)
  );

  for (const intent of sorted) {
    const keys = rr.exclusivityKeys(intent, w);
    if (keys.some(k => locked.has(k))) {
      result.push({
        intent,
        status: 'blocked',
        reason: 'exclusivity-lock',
      });
      continue;
    }

    const mk = rr.mergeKey?.(intent, w);
    if (mk) {
      if (!byMerge[mk]) byMerge[mk] = [];
      const ra: ResolvedAction = { intent, status: 'merged', mergedIntoId: mk };
      byMerge[mk].push(ra);
      result.push(ra);
      keys.forEach(k => locked.add(k));
      continue;
    }

    // обычное применённое действие
    result.push({ intent, status: 'applied' });
    keys.forEach(k => locked.add(k));
  }

  // сюда можно добавить логи о merge/blocked
  return result;
}

/**
 * Обновление мандатов: уникальность и конфликты
 */
export function updateMandates(
  w: ContextWorldState,
  exclusiveMandates: MandateId[]
) {
  const reg = w.contextEx.mandates;

  const groups: Record<MandateId, MandateRegistryEntry[]> = {};
  for (const mid of exclusiveMandates) {
    const entry = reg[mid];
    if (!entry || !entry.active) continue;
    if (!groups[mid]) groups[mid] = [];
    groups[mid].push(entry);
  }

  for (const [mid, entries] of Object.entries(groups)) {
    if (entries.length <= 1) continue;
    // конфликт за власть
    w.contextEx.logs.push({
      tick: w.tick,
      kind: 'mandate',
      message: `Конфликт мандата ${mid}: ${entries
        .map(e => e.holderId)
        .join(', ')}`,
      data: { mandateId: mid, holders: entries.map(e => e.holderId) },
    });
  }
}

/**
 * Один тик сценария (без ToM/DecisionSystem — только контекстный слой)
 */
export interface TickConfig {
  scenario: ScenarioConfig;
  actionCatalog: Record<string, ActionDef>;
  goalDefs: Record<GoalId, GoalDef>;
  resolutionRules: ResolutionRules;
  proposalGenerator: (ctx: TickContext) => ActionIntent[];
  pickIntent: (candidates: ActionIntent[], ctx: TickContext) => ActionIntent | null;
  exclusiveMandates?: MandateId[];
}

export function tickContext(
  w: ContextWorldState,
  cfg: TickConfig
): ContextWorldState {
  const { scenario } = cfg;
  
  // Check engine mode: 'legacy' skips context loop, 'context' uses context logic, 'hybrid' uses both (context part shown here)
  const mode = (scenario as any).engineMode ?? 'legacy';
  if (mode === 'legacy') {
    return w;
  }

  if (!w.contextEx) {
       w.contextEx = {
          metrics: {},
          locationOf: {},
          contextAtoms: {},
          agentViews: {},
          conflicts: {},
          mandates: {},
          stageId: scenario.stages[0].id,
          scenarioId: scenario.id,
          logs: []
       };
  }
  if (!w.contextEx.agentLocationTags) {
    w.contextEx.agentLocationTags = {};
  }

  // 1) stage transition
  const currentStage = scenario.stages.find(s => s.id === w.contextEx.stageId);
  const nextStage = scenario.stages.find(s =>
    s.id !== currentStage?.id && s.transition(w)
  );
  if (nextStage) {
    w.contextEx.stageId = nextStage.id;
    pushLog(w, {
      kind: 'context',
      message: `Переход стадии: ${currentStage?.label} -> ${nextStage.label}`,
    });
  }

  // 2) generate intents (все агенты)
  const participants = w.agents.map(agent => agent.entityId);
  let allIntents: ActionIntent[] = [];
  for (const agent of w.agents) {
    const ctx: TickContext = {
      actorId: agent.entityId,
      participants,
      actionCatalog: cfg.actionCatalog,
      scenario,
      world: w,
      locationOf: w.contextEx.locationOf,
      agentLocationTags: w.contextEx.agentLocationTags,
      goalWeights: agent.goalWeights ?? {},
    };
    ctx.agentLocationTags[ctx.actorId] = computeAgentLocationTags(ctx.actorId, ctx);
    const proposals = cfg.proposalGenerator(ctx);
    const valid = proposals.filter(intent => hardAvailable(intent, ctx, w));

    pushLog(w, {
      kind: 'proposal',
      actorId: ctx.actorId,
      message: `Намерения: ${valid.length}/${proposals.length}`,
      data: {
        total: proposals.length,
        valid: valid.length,
        sample: valid.slice(0, 5),
      },
    });

    // выбор одного намерения
    const picked = cfg.pickIntent(valid, ctx);
    if (picked) allIntents.push(picked);
  }

  // 3) resolve conflicts / priority
  const resolved = resolveIntents(allIntents, cfg.resolutionRules, w);

  // 4) apply effects
  for (const res of resolved) {
    if (res.status === 'applied') {
      const def = cfg.actionCatalog[res.intent.actionId];
      // применить метрики
      const deltas = def.effects(w, res.intent);
      for (const d of deltas) {
        w.contextEx.metrics[d.metric] =
          (w.contextEx.metrics[d.metric] ?? 0) + d.deltaMean;
      }
      
      // Add fact if satisfies constraint
      if (def.satisfies?.prop) {
         const { prop, scope } = def.satisfies;
         // For now we treat all as shared facts in contextEx
         w.contextEx.contextAtoms[prop] = {
             id: `fact-${prop}-${w.tick}`,
             kind: 'fact',
             scope: 'shared',
             createdTick: w.tick,
             confidence: 1,
             prop: prop,
             source: 'action',
             label: `Fact: ${prop}`
         };
      }

      // log action
      pushLog(w, {
        kind: 'action',
        actorId: res.intent.actorId,
        message: `Действие ${def.label} выполнено`,
        data: { target: res.intent.target, deltas },
      });
    } else {
      pushLog(w, {
        kind: 'resolution',
        actorId: res.intent.actorId,
        message: `Действие ${res.intent.actionId} заблокировано/слито (${res.status})`,
        data: { reason: res.reason },
      });
    }
  }

  // 5) update mandates & system rules
  if (cfg.exclusiveMandates) {
    updateMandates(w, cfg.exclusiveMandates);
  }
  // context rules update
  for (const rule of scenario.contextRules) {
    if (rule.when(w)) {
      const atoms = rule.thenAdd(w);
      atoms.forEach(a => (w.contextEx.contextAtoms[a.id] = a));
    }
  }

  return w;
}

// ====== Управление обязательствами (CommitmentAtom) ======

/**
 * Регистрирует новое обязательство в ContextWorldState.
 * Если commitmentId не задан, генерируется на основе тика и участников.
 */
export function registerCommitmentAtom(
  ctx: ContextWorldState,
  params: {
    commitmentKind: string;
    fromId: string;
    toId: string;
    createdTick: number;
    dueTick?: number;
    confidence?: number;
    strength?: number;
    decayPerTick?: number;
  }
): CommitmentAtom {
  const id =
    'commitment:' +
    params.commitmentKind +
    ':' +
    params.fromId +
    '->' +
    params.toId +
    ':' +
    params.createdTick;

  const atom: CommitmentAtom = {
    id,
    scope: 'shared',
    source: 'action',
    kind: 'commitment',
    commitmentKind: params.commitmentKind,
    fromId: params.fromId,
    toId: params.toId,
    createdTick: params.createdTick,
    dueTick: params.dueTick,
    status: 'active',
    confidence: params.confidence ?? 1,
    strength: params.strength ?? 1,
    decayPerTick: params.decayPerTick,
  };

  ctx.contextEx.contextAtoms[id] = atom;
  return atom;
}

/**
 * Обновляет статус обязательств данного вида между участниками.
 */
export function updateCommitmentStatus(
  ctx: ContextWorldState,
  kind: string,
  fromId: string,
  toId: string,
  status: CommitmentStatus
): void {
  Object.values(ctx.contextEx.contextAtoms).forEach((atom) => {
    if ((atom as any).kind !== 'commitment') return;
    const c = atom as CommitmentAtom;
    if (c.commitmentKind !== kind) return;
    if (c.fromId !== fromId || c.toId !== toId) return;
    c.status = status;
  });
}
