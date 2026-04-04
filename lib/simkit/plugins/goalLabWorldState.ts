// lib/simkit/plugins/goalLabWorldState.ts
// Shared SimKit -> GoalLab world-state adapter used by multiple plugins.

import type { SimWorld, SimSnapshot, ActionOffer } from '../core/types';
import { EntityType, type WorldState } from '../../../types';
import { makeAgentRNG, setGlobalRunSeed } from '../../core/noise';
import { clamp01 } from '../../util/math';
import { arr } from '../../utils/arr';
import { buildEpisodicAtomsForAgent } from '../post/perceiveActions';

type BuildWorldStateFromSimOpts = {
  offersByAgent?: Record<string, ActionOffer[]>;
};

type AdaptedDomainEvent = {
  id: string;
  t: number;
  tick: number;
  kind: string;
  actorId: string;
  targetId?: string;
  actionId: string;
  intensity: number;
  magnitude: number;
  domain: string;
  polarity: number;
  ctx?: {
    scenarioKind?: string;
    public?: boolean;
    locationId?: string;
  };
  context: {
    locationId?: string;
    sceneId?: string;
  };
  locationId?: string;
  epistemics?: {
    witnesses?: string[];
  };
  meta?: any;
  tags?: string[];
  topic?: string;
  speechAct?: string;
  urgency?: number;
};

function inferEventKind(type: string, payload: any): string {
  const raw = String(type || 'event').toLowerCase();
  if (raw === 'speech:v1') {
    const act = String(payload?.act || 'talk').toLowerCase();
    if (act === 'ask') return 'ask';
    if (act === 'threaten') return 'threaten';
    if (act === 'promise') return 'promise';
    if (act === 'negotiate') return 'negotiate';
    return 'inform';
  }
  if (raw === 'hazardpulse') return 'hazard';
  if (raw.startsWith('action:')) {
    const suffix = raw.slice('action:'.length);
    if (suffix === 'move_xy' || suffix === 'move_local') return 'move';
    if (suffix === 'question_about') return 'ask';
    if (suffix === 'talk') return 'talk';
    if (suffix === 'attack') return 'attack';
    if (suffix === 'observe') return 'observe';
    if (suffix === 'intent_complete') return 'intent_complete';
    if (suffix === 'blocked') return 'blocked';
    return suffix;
  }
  return raw || 'event';
}

function inferDomain(kind: string): string {
  const k = String(kind || '').toLowerCase();
  if (/attack|threat|harm|hurt|betray/.test(k)) return 'safety';
  if (/ask|talk|inform|promise|negotiate|comfort|help|accuse|praise|apologize/.test(k)) return 'affiliation';
  if (/move|escape|flee|hazard|observe|blocked/.test(k)) return 'survival';
  return 'event';
}

function inferPolarity(kind: string): number {
  const k = String(kind || '').toLowerCase();
  if (/help|comfort|praise|promise|save|heal/.test(k)) return 1;
  if (/attack|threat|hazard|blocked|betray|accuse/.test(k)) return -1;
  return 0;
}

/**
 * Derive life-goal priors when explicit lifeGoals are absent.
 * Keeps adapter backward-compatible for older character payloads.
 */
function deriveLifeGoals(entity: any): Record<string, number> {
  const explicit = entity?.lifeGoals;
  if (explicit && typeof explicit === 'object' && Object.keys(explicit).length > 0) return explicit;

  const vb = entity?.vector_base ?? {};
  const n = (key: string, fb = 0.5) => {
    const v = Number(vb[key]);
    return Number.isFinite(v) ? clamp01(v) : fb;
  };

  return {
    protect_lives: clamp01(0.3 * n('A_Safety_Care') + 0.3 * (1 - n('A_Power_Sovereignty')) + 0.2 * n('C_dominance_empathy') + 0.2 * n('C_coalition_loyalty')),
    maintain_order: clamp01(0.35 * n('A_Legitimacy_Procedure') + 0.3 * n('A_Tradition_Continuity') + 0.2 * (1 - n('A_Liberty_Autonomy')) + 0.15 * n('B_cooldown_discipline')),
    seek_status: clamp01(0.4 * n('A_Power_Sovereignty') + 0.3 * n('C_reputation_sensitivity') + 0.15 * n('A_Justice_Fairness') + 0.15 * (1 - n('C_dominance_empathy'))),
    preserve_autonomy: clamp01(0.45 * n('A_Liberty_Autonomy') + 0.25 * (1 - n('A_Legitimacy_Procedure')) + 0.15 * n('B_tolerance_ambiguity') + 0.15 * n('B_exploration_rate')),
    pursue_truth: clamp01(0.45 * n('A_Knowledge_Truth') + 0.3 * n('B_tolerance_ambiguity') + 0.25 * n('B_exploration_rate')),
    maintain_bonds: clamp01(0.35 * n('A_Safety_Care') + 0.3 * (1 - n('A_Power_Sovereignty')) + 0.2 * n('C_coalition_loyalty') + 0.15 * n('C_reciprocity_index')),
    accumulate_resources: clamp01(0.3 * (1 - n('A_Liberty_Autonomy')) + 0.25 * n('B_discount_rate') + 0.25 * n('A_Power_Sovereignty') + 0.2 * n('D_stamina_reserve')),
  };
}

type SigmoidCurve = { type: 'sigmoid'; center: number; slope: number };

/** Personality-dependent activation curves for driver physics. */
function deriveDriverCurves(entity: any): Record<string, SigmoidCurve> | null {
  const vb = entity?.vector_base;
  if (!vb || typeof vb !== 'object') return null;

  const n = (key: string, fb = 0.5) => {
    const v = Number(vb[key]);
    return Number.isFinite(v) ? clamp01(v) : fb;
  };

  const safetyCenterShift = 0.15 * n('D_pain_tolerance') - 0.15 * n('D_HPA_reactivity') + 0.1 * n('B_tolerance_ambiguity');
  const safetySlope = 4 + 2 * n('D_HPA_reactivity');

  const controlCenterShift = -0.12 * n('A_Power_Sovereignty') + 0.1 * n('A_Liberty_Autonomy');
  const controlSlope = 4 + 1.5 * (1 - n('B_tolerance_ambiguity'));

  const affCenterShift = 0.15 * (1 - n('C_coalition_loyalty')) - 0.1 * n('A_Safety_Care');
  const affSlope = 3.5;

  const statusCenterShift = -0.15 * n('A_Power_Sovereignty') - 0.1 * n('C_reputation_sensitivity') + 0.1;
  const statusSlope = 3.5 + 2 * n('C_reputation_sensitivity');

  const resolveCenterShift = -0.12 * n('D_HPA_reactivity') - 0.08 * n('A_Power_Sovereignty');
  const resolveSlope = 4.5 + 2 * n('D_HPA_reactivity');

  const restCenterShift = 0.15 * n('D_stamina_reserve') + 0.1 * n('D_pain_tolerance') - 0.1;
  const restSlope = 3.5;

  const curiosityCenterShift = -0.15 * n('A_Knowledge_Truth') - 0.1 * n('B_exploration_rate') + 0.1;
  const curiositySlope = 3.5;

  return {
    safetyNeed: { type: 'sigmoid', center: clamp01(0.45 + safetyCenterShift), slope: safetySlope },
    controlNeed: { type: 'sigmoid', center: clamp01(0.45 + controlCenterShift), slope: controlSlope },
    affiliationNeed: { type: 'sigmoid', center: clamp01(0.5 + affCenterShift), slope: affSlope },
    statusNeed: { type: 'sigmoid', center: clamp01(0.5 + statusCenterShift), slope: statusSlope },
    resolveNeed: { type: 'sigmoid', center: clamp01(0.45 + resolveCenterShift), slope: resolveSlope },
    restNeed: { type: 'sigmoid', center: clamp01(0.5 + restCenterShift), slope: restSlope },
    curiosityNeed: { type: 'sigmoid', center: clamp01(0.5 + curiosityCenterShift), slope: curiositySlope },
  };
}

/** Personality-dependent inhibition matrix overrides for driver interactions. */
function deriveInhibitionOverrides(entity: any): Record<string, Record<string, number>> | null {
  const vb = entity?.vector_base;
  if (!vb || typeof vb !== 'object') return null;

  const n = (key: string, fb = 0.5) => {
    const v = Number(vb[key]);
    return Number.isFinite(v) ? clamp01(v) : fb;
  };

  const out: Record<string, Record<string, number>> = {};

  const curiosityResilience = 0.35 * (1 - 0.7 * n('A_Knowledge_Truth') * n('D_pain_tolerance'));
  if (Math.abs(curiosityResilience - 0.35) > 0.03) {
    out.safetyNeed = { ...(out.safetyNeed || {}), curiosityNeed: curiosityResilience };
  }

  const care = 0.6 * n('A_Safety_Care') + 0.4 * (1 - n('A_Power_Sovereignty'));
  if (care > 0.6) {
    out.resolveNeed = { ...(out.resolveNeed || {}), affiliationNeed: 0.3 * (1 - care * 0.5) };
  }

  if (n('A_Power_Sovereignty') > 0.6) {
    out.safetyNeed = { ...(out.safetyNeed || {}), statusNeed: 0.2 * (1 - n('A_Power_Sovereignty') * 0.4) };
  }

  return Object.keys(out).length > 0 ? out : null;
}

/** Personality-dependent driver accumulation inertia (alpha) overrides. */
function deriveDriverInertia(entity: any): Record<string, number> | null {
  const vb = entity?.vector_base;
  if (!vb || typeof vb !== 'object') return null;

  const n = (key: string, fb = 0.5) => {
    const v = Number(vb[key]);
    return Number.isFinite(v) ? clamp01(v) : fb;
  };

  const discipline = n('B_cooldown_discipline');
  const tradition = n('A_Tradition_Continuity');
  const baseAlpha = clamp01(0.3 + 0.25 * discipline + 0.15 * tradition);

  return {
    safetyNeed: clamp01(baseAlpha - 0.08 * n('D_HPA_reactivity')),
    controlNeed: baseAlpha,
    statusNeed: clamp01(baseAlpha + 0.05 * n('C_reputation_sensitivity')),
    affiliationNeed: clamp01(baseAlpha + 0.05 * (1 - n('A_Power_Sovereignty'))),
    resolveNeed: clamp01(baseAlpha - 0.1 * n('D_HPA_reactivity')),
    restNeed: clamp01(baseAlpha - 0.05),
    curiosityNeed: clamp01(baseAlpha - 0.05 * n('B_exploration_rate')),
  };
}

/** Personality-dependent goal tuning (slope/bias/veto per domain). */
function deriveGoalTuning(entity: any): Record<string, any> | null {
  const vb = entity?.vector_base;
  if (!vb || typeof vb !== 'object') return null;

  const n = (key: string, fb = 0.5) => {
    const v = Number(vb[key]);
    return Number.isFinite(v) ? clamp01(v) : fb;
  };

  // Goal-level slope/bias: values > 1 slope amplify, < 1 dampen.
  // Bias shifts the logit center: positive makes the goal activate at lower
  // raw scores, negative makes it harder to activate.
  const goals: Record<string, { slope: number; bias: number }> = {};

  // Safety: cautious agents amplify, pain-tolerant / brave ones dampen.
  const safetySens = n('D_HPA_reactivity') + n('A_Safety_Care') - n('D_pain_tolerance');
  goals.safety = { slope: 1 + 0.4 * (safetySens - 0.5), bias: 0.3 * (safetySens - 0.5) };

  // Affiliation: high care/loyalty → amplifies; low empathy → dampens.
  const affSens = 0.5 * n('A_Care_Compassion') + 0.3 * n('C_coalition_loyalty') + 0.2 * n('C_dominance_empathy');
  goals.affiliation = { slope: 1 + 0.5 * (affSens - 0.5), bias: 0.25 * (affSens - 0.5) };

  // Status: high power drive + reputation sensitivity → amplified.
  const statusSens = 0.5 * n('A_Power_Sovereignty') + 0.35 * n('C_reputation_sensitivity') + 0.15 * (1 - n('C_dominance_empathy'));
  goals.status = { slope: 1 + 0.4 * (statusSens - 0.5), bias: 0.2 * (statusSens - 0.5) };

  // Exploration: high truth-seeking + ambiguity tolerance → amplified.
  const exploreSens = 0.4 * n('A_Knowledge_Truth') + 0.35 * n('B_tolerance_ambiguity') + 0.25 * n('B_exploration_rate');
  goals.exploration = { slope: 1 + 0.5 * (exploreSens - 0.5), bias: 0.3 * (exploreSens - 0.5) };

  // Order: high formalism + tradition → amplified; high autonomy → dampened.
  const orderSens = 0.4 * n('A_Legitimacy_Procedure') + 0.35 * n('A_Tradition_Continuity') + 0.25 * (1 - n('A_Liberty_Autonomy'));
  goals.order = { slope: 1 + 0.35 * (orderSens - 0.5), bias: 0.15 * (orderSens - 0.5) };

  // Rest: low stamina → rest activates earlier.
  const restSens = 1 - n('D_stamina_reserve');
  goals.rest = { slope: 1 + 0.3 * (restSens - 0.5), bias: 0.2 * (restSens - 0.5) };

  // Wealth: high discount rate (short-term focus) → resource goals amplified.
  const wealthSens = 0.5 * n('B_discount_rate') + 0.3 * n('A_Power_Sovereignty') + 0.2 * (1 - n('A_Care_Compassion'));
  goals.wealth = { slope: 1 + 0.3 * (wealthSens - 0.5), bias: 0.15 * (wealthSens - 0.5) };

  // Control: high power drive + low ambiguity tolerance → amplified.
  const controlSens = 0.45 * n('A_Power_Sovereignty') + 0.35 * (1 - n('B_tolerance_ambiguity')) + 0.2 * n('A_Legitimacy_Procedure');
  goals.control = { slope: 1 + 0.4 * (controlSens - 0.5), bias: 0.2 * (controlSens - 0.5) };

  // Check if all tunings are near-neutral; skip allocation if so.
  const hasSignificant = Object.values(goals).some(
    g => Math.abs(g.slope - 1) > 0.05 || Math.abs(g.bias) > 0.03
  );
  if (!hasSignificant) return null;

  return { goals };
}

function toWitnessIds(world: SimWorld, payload: any): string[] {
  const explicit = arr<string>(payload?.witnessIds).map(String).filter(Boolean);
  if (explicit.length) return Array.from(new Set(explicit));

  const locId = payload?.locationId ?? payload?.locId;
  if (!locId) return [];
  return Object.values(world.characters || {})
    .filter((c: any) => String(c?.locId ?? '') === String(locId))
    .map((c: any) => String(c?.id || ''))
    .filter(Boolean);
}

function adaptSimEvent(world: SimWorld, snapshot: SimSnapshot, e: any): AdaptedDomainEvent {
  const nowTick = Number((snapshot as any)?.tickIndex ?? (world as any)?.tickIndex ?? 0);
  const p = (e && typeof e === 'object') ? (e.payload || {}) : {};
  const tick = Number(p.tick ?? p.tickIndex ?? nowTick);
  const actorId = String(p.actorId ?? p.actor ?? 'system');
  const targetId = p.targetId != null ? String(p.targetId) : undefined;
  const locationId = p.locationId != null
    ? String(p.locationId)
    : (p.locId != null ? String(p.locId) : undefined);
  const kind = inferEventKind(String(e?.type || 'event'), p);
  const magnitude = clamp01(Number(
    p.magnitude
    ?? p.severity
    ?? p.level
    ?? (kind === 'hazard' ? 0.75 : 0.5)
  ));
  const topic = typeof p?.topic === 'string' ? p.topic : undefined;
  const speechAct = typeof p?.act === 'string' ? p.act : undefined;
  const witnessIds = toWitnessIds(world, p);
  const tags = Array.from(new Set([
    kind,
    inferDomain(kind),
    speechAct ? `act:${speechAct}` : '',
    topic ? `topic:${topic}` : '',
  ].filter(Boolean)));

  return {
    id: String(e?.id || `evt:${kind}:${tick}:${actorId}`),
    t: tick,
    tick,
    kind,
    actorId,
    targetId,
    actionId: String(e?.type || kind || 'event'),
    intensity: magnitude,
    magnitude,
    domain: inferDomain(kind),
    polarity: inferPolarity(kind),
    locationId,
    ctx: {
      locationId,
      public: p?.volume === 'shout' ? true : undefined,
      scenarioKind: typeof p?.scenarioKind === 'string' ? p.scenarioKind : undefined,
    },
    context: {
      locationId,
      sceneId: p?.sceneId != null ? String(p.sceneId) : undefined,
    },
    epistemics: witnessIds.length ? { witnesses: witnessIds } : undefined,
    meta: {
      // Keep raw payload for forensic UI/debug; downstream pipeline uses normalized fields.
      simEventId: e?.id,
      simType: e?.type,
      payload: p,
    },
    tags,
    topic,
    speechAct,
    urgency: magnitude,
  };
}

function toDomainEvents(world: SimWorld, snapshot: SimSnapshot): AdaptedDomainEvent[] {
  const fromSnapshot = arr<any>((snapshot as any)?.events);
  const fromFacts = arr<any>((world as any)?.facts?.['sim:recentEvents']).map((e: any) => ({
    id: e?.id,
    type: e?.type,
    payload: e?.payload,
  }));

  const merged = [...fromFacts, ...fromSnapshot];
  const byId = new Map<string, AdaptedDomainEvent>();
  for (const raw of merged) {
    const adapted = adaptSimEvent(world, snapshot, raw);
    if (!adapted.id) continue;
    byId.set(adapted.id, adapted);
  }
  return Array.from(byId.values()).sort((a, b) => a.tick - b.tick);
}

function buildObservedByAgent(events: AdaptedDomainEvent[], world: SimWorld) {
  const out: Record<string, any[]> = {};
  const chars = Object.values(world.characters || {});
  for (const c of chars) {
    const selfId = String((c as any)?.id || '');
    if (!selfId) continue;
    const selfLocId = String((c as any)?.locId || '');
    out[selfId] = events
      .filter((ev) => {
        if (ev.actorId === selfId || ev.targetId === selfId) return true;
        const witnesses = arr<string>(ev.epistemics?.witnesses).map(String);
        if (witnesses.includes(selfId)) return true;
        return !!selfLocId && !!ev.locationId && String(ev.locationId) === selfLocId;
      })
      .map((ev) => ({
        eventId: ev.id,
        mode: ev.actorId === selfId || ev.targetId === selfId
          ? 'seen'
          : (arr<string>(ev.epistemics?.witnesses).map(String).includes(selfId) ? 'seen' : 'inferred'),
        confidence: ev.actorId === selfId || ev.targetId === selfId ? 1 : 0.75,
        freshness: 1,
        topic: ev.topic,
        kind: ev.kind,
      }));
  }
  return out;
}

export function buildWorldStateFromSim(world: SimWorld, snapshot: SimSnapshot, opts?: BuildWorldStateFromSimOpts): WorldState {
  // Ensure GoalLab's seeded RNG channels are wired in SimKit mode.
  // SimKit exposes a per-run seed; map it into the global seed factory.
  setGlobalRunSeed(Number((world as any)?.seed ?? 12345));

  const chars = arr<any>((snapshot as any)?.characters);
  const locs = arr<any>((snapshot as any)?.locations);
  const domainEvents = toDomainEvents(world, snapshot);
  const observedByAgent = buildObservedByAgent(domainEvents, world);
  const inboxByAgent = ((world as any)?.facts?.inboxAtoms && typeof (world as any).facts.inboxAtoms === 'object')
    ? (world as any).facts.inboxAtoms
    : {};

  // Agents: minimal fields needed by pipeline, rest as "any".
  const agents = chars.map((c: any) => {
    const entityId = String(c?.id);
    const locId = String(c?.locId ?? 'loc:unknown');
    const beliefAtoms = arr<any>((world as any)?.facts?.[`mem:beliefAtoms:${entityId}`]);
    // Episodic memory atoms are generated from prior salient events around co-present agents.
    const episodicAtoms = buildEpisodicAtomsForAgent(world, entityId);
    const allBeliefAtoms = [...beliefAtoms, ...episodicAtoms];
    return {
      entityId,
      type: EntityType.Character,
      title: String(c?.name ?? entityId),
      locationId: locId,
      // pipeline reads agent.memory.beliefAtoms
      // persisted by perceptionMemoryPlugin into world.facts[mem:beliefAtoms:<id>]
      memory: { beliefAtoms: allBeliefAtoms },
      // keep room for extensions
      params: {
        stress: clamp01(Number(c?.stress ?? 0)),
        health: clamp01(Number(c?.health ?? 1)),
        energy: clamp01(Number(c?.energy ?? 1)),
      },
      // Seeded RNG channels for decision stochasticity (matches main world initializer).
      rngChannels: {
        decide: makeAgentRNG(entityId, 1),
        physio: makeAgentRNG(entityId, 2),
        perceive: makeAgentRNG(entityId, 3),
        goals: makeAgentRNG(entityId, 4),
      },
      // Optional per-agent temperature knobs (GoalLab pipeline reads these).
      temperature: (world as any)?.facts?.decisionTemperature ?? 1.0,
      behavioralParams: { T0: (world as any)?.facts?.decisionTemperature ?? 1.0 },
      // v32 adapter fix: preserve original CharacterEntity slices for feature extraction.
      // Without passthrough, extractCharacterFeatures falls back to neutral defaults.
      body: (c as any)?.entity?.body ?? {},
      vector_base: (c as any)?.entity?.vector_base ?? {},
      identity: (c as any)?.entity?.identity ?? {},
      context: (c as any)?.entity?.context ?? {},
      lifeGoals: deriveLifeGoals((c as any)?.entity),
      goalTuning: (c as any)?.entity?.goalTuning ?? deriveGoalTuning((c as any)?.entity),
      driverCurves: (c as any)?.entity?.driverCurves ?? deriveDriverCurves((c as any)?.entity),
      inhibitionOverrides: (c as any)?.entity?.inhibitionOverrides ?? deriveInhibitionOverrides((c as any)?.entity),
      driverInertia: (c as any)?.entity?.driverInertia ?? deriveDriverInertia((c as any)?.entity),
    } as any;
  });

  // v32 adapter fix: map SimKit dyadic relations -> GoalLab rel:state atoms.
  // We inject only atoms linked to current agent (from or to), so memory stays scoped.
  const rels = (world.facts as any)?.relations;
  if (rels && typeof rels === 'object') {
    for (const agent of agents) {
      const selfId = String((agent as any)?.entityId ?? '');
      if (!selfId) continue;
      const selfRels: any[] = [];

      for (const [fromId, targets] of Object.entries(rels)) {
        if (!targets || typeof targets !== 'object') continue;
        for (const [toId, metrics] of Object.entries(targets as any)) {
          if (!metrics || typeof metrics !== 'object') continue;
          if (fromId !== selfId && toId !== selfId) continue;
          for (const [metric, value] of Object.entries(metrics as any)) {
            const v = Number(value);
            if (!Number.isFinite(v)) continue;
            selfRels.push({
              id: `rel:state:${fromId}:${toId}:${metric}`,
              ns: 'rel',
              kind: 'rel_state',
              origin: 'world',
              source: 'simkit:facts.relations',
              magnitude: clamp01(v),
              confidence: 1,
              tags: ['rel', 'state', metric],
              label: `rel:${fromId}→${toId}:${metric}=${v.toFixed(2)}`,
            });
          }
        }
      }

      if (selfRels.length) {
        (agent as any).memory = (agent as any).memory || {};
        (agent as any).memory.beliefAtoms = [...arr((agent as any)?.memory?.beliefAtoms), ...selfRels];
      }
    }
  }

  const locations = locs.map((l: any) => {
    const entityId = String(l?.id);
    return {
      entityId,
      type: EntityType.Location,
      title: String(l?.name ?? entityId),
      tags: arr<string>(l?.tags),
      hazards: l?.hazards || {},
      norms: l?.norms || {},
      neighbors: arr<string>(l?.neighbors),
      // pipeline expects LocationEntity-ish, tolerate extra fields
    } as any;
  });

  const beliefAtomsByAgent = Object.fromEntries(
    agents.map((a: any) => [String(a.entityId), arr((a as any)?.memory?.beliefAtoms)])
  );

  const w: WorldState = {
    tick: Number((world as any)?.tickIndex ?? (snapshot as any)?.tickIndex ?? 0),
    rngSeed: Number((world as any)?.seed ?? 0),
    decisionTemperature: (world as any)?.facts?.decisionTemperature ?? 1.0,
    decisionCurvePreset: (world as any)?.facts?.decisionCurvePreset ?? 'smoothstep',
    agents,
    locations,
    leadership: {} as any,
    initialRelations: {},
    observations: observedByAgent,
    eventLog: {
      schemaVersion: 1,
      events: domainEvents as any,
    },
    // lightweight sceneSnapshot hook (optional)
    sceneSnapshot: {
      simkit: {
        tickIndex: Number((snapshot as any)?.tickIndex ?? 0),
        facts: (world as any)?.facts || {},
      },
      simTickPacket: {
        tick: Number((snapshot as any)?.tickIndex ?? 0),
        seed: Number((world as any)?.seed ?? 0),
        recentEvents: domainEvents,
        observedByAgent,
        inboxByAgent,
        beliefAtomsByAgent,
        availableOffersByAgent: opts?.offersByAgent || {},
        provenance: {
          runId: String((world as any)?.facts?.['sim:runId'] ?? 'simkit'),
          simSnapshotId: String((snapshot as any)?.id ?? ''),
        },
      },
    },
  } as any;

  return w;
}
