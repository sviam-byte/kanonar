// lib/simkit/core/simulator.ts
// Core simulator: step/run/reset/history plus optional plugins.

import type { SimWorld, SimAction, ActionOffer, SimTickRecord, TickTrace, SimWorldFacts } from './types';
import { RNG } from './rng';
import { getCtx, setCtx, getFact, setFact } from './factsAccessors';
import { cloneWorld, buildSnapshot, ensureCharacterPos } from './world';
import { proposeActions, applyAction, applyEvent } from './rules';
import { validateActionStrict } from '../actions/validate';
import { normalizeAtom } from '../../context/v2/infer';
import type { ContextAtom } from '../../context/v2/types';
import { decideAcceptance } from './trust';
import { rememberLastAction, scoreOfferSubjective } from './subjective';
import { clamp01 } from '../../util/math';
import { passiveRelationUpdate, indirectEvidenceUpdate } from '../relations/passiveUpdate';
import { generateNonverbalAtoms } from '../perception/nonverbalAtoms';
import { detectBeats, computeTension, type NarrativeBeat } from '../narrative/beatDetector';
import { resolveConflicts } from '../resolution/conflictDetector';
import { expireDialogues } from '../dialogue/dialogueState';
import { distSameLocation, getCellCover, getCellElevation, getCharXY, getSpatialConfig, hasLineOfSight } from './spatial';

/**
 * Compute per-agent tactical situation atoms from spatial data.
 * These feed into the GoalLab pipeline through S0 canonicalization,
 * giving agents spatial awareness that modulates drivers/goals/decisions.
 */
function computeTacticalAtoms(world: SimWorld) {
  const facts = world.facts || {};
  const chars = Object.values(world.characters || {});
  const cfg = getSpatialConfig(world);

  for (const c of chars) {
    const actorId = c.id;
    const locId = c.locId;
    if (!actorId || !locId) continue;

    // Cover at current position.
    let cover = 0;
    try { cover = getCellCover(world, actorId); } catch { /* no map */ }
    facts[`ctx:tactical:cover:${actorId}`] = clamp01(cover);

    // Elevation at current position.
    let elev = 0;
    try { elev = getCellElevation(world, actorId); } catch { /* no map */ }

    // Count threats and allies nearby.
    let threatsNearby = 0;
    let alliesNearby = 0;
    let losThreats = 0;
    let maxElevAdv = 0;

    for (const other of chars) {
      if (other.id === actorId || other.locId !== locId) continue;
      const d = distSameLocation(world, actorId, other.id);
      if (!Number.isFinite(d)) continue;

      const trust = clamp01(Number(facts?.relations?.[actorId]?.[other.id]?.trust ?? 0.5));
      const threat = clamp01(Number(facts?.relations?.[actorId]?.[other.id]?.threat ?? 0));

      if (threat > 0.4 && d <= cfg.attackRange * 2) {
        threatsNearby++;
        // Check if threat has LoS to us.
        let los = true;
        try { los = hasLineOfSight(world, other.id, actorId); } catch { /* open */ }
        if (los) losThreats++;

        // Elevation advantage over this threat.
        let otherElev = 0;
        try { otherElev = getCellElevation(world, other.id); } catch {}
        maxElevAdv = Math.max(maxElevAdv, elev - otherElev);
      }

      if (trust > 0.55 && d <= 5) {
        alliesNearby++;
      }
    }

    facts[`ctx:tactical:threats:${actorId}`] = clamp01(threatsNearby / 3);
    facts[`ctx:tactical:allies:${actorId}`] = clamp01(alliesNearby / 3);
    facts[`ctx:tactical:los_threats:${actorId}`] = clamp01(losThreats / 3);
    facts[`ctx:tactical:elevation:${actorId}`] = clamp01(0.5 + maxElevAdv * 0.15);

    // Escape routes: count walkable cells adjacent to exits.
    const loc = world.locations[locId];
    const cells: any[] = (loc as any)?.entity?.map?.cells;
    const exits: any[] = (loc as any)?.entity?.map?.exits;
    let escapeScore = 0.5; // default if no map
    if (Array.isArray(cells) && Array.isArray(exits) && exits.length) {
      const pos = getCharXY(world, actorId);
      let minExitDist = 999;
      for (const ex of exits) {
        const dx = pos.x - Number(ex.x ?? 0);
        const dy = pos.y - Number(ex.y ?? 0);
        minExitDist = Math.min(minExitDist, Math.hypot(dx, dy));
      }
      escapeScore = clamp01(1 - minExitDist / 15);
    }
    facts[`ctx:tactical:escape:${actorId}`] = escapeScore;

    // Composite tactical advantage (for driver modulation).
    const tacticalAdv = clamp01(
      cover * 0.3 +
      escapeScore * 0.2 +
      clamp01(0.5 + maxElevAdv * 0.15) * 0.2 +
      clamp01(alliesNearby / 3) * 0.15 +
      (1 - clamp01(losThreats / 3)) * 0.15,
    );
    facts[`ctx:tactical:advantage:${actorId}`] = tacticalAdv;

    // ── Modulate danger by tactical situation ──
    // Exposed agent (low cover, threats with LoS) → danger boosted.
    // Well-positioned agent → danger dampened.
    const baseDanger = clamp01(Number(facts[`ctx:danger:${actorId}`] ?? 0));
    if (threatsNearby > 0) {
      const exposure = clamp01(losThreats / Math.max(1, threatsNearby)) * (1 - cover);
      facts[`ctx:danger:${actorId}`] = clamp01(baseDanger + exposure * 0.2);
    }

    // ── Modulate control by tactical advantage ──
    const baseControl = clamp01(Number(facts[`ctx:control:${actorId}`] ?? 0.5));
    facts[`ctx:control:${actorId}`] = clamp01(baseControl * 0.7 + tacticalAdv * 0.3);
  }
}

function applyHazardPoints(world: SimWorld) {
  const points = Array.isArray(getFact<unknown[]>(world, 'hazardPoints')) ? getFact<unknown[]>(world, 'hazardPoints')! : [];
  if (!points.length) return;
  for (const c of Object.values(world.characters || {})) {
    const locId = c.locId;
    const x = Number(c.pos?.x);
    const y = Number(c.pos?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    let danger = 0;
    let safe = 0;
    for (const p of points) {
      if (p.locationId !== locId) continue;
      const dx = x - Number(p.x);
      const dy = y - Number(p.y);
      const r = Math.max(10, Number(p.radius ?? 120));
      const d2 = dx * dx + dy * dy;
      const falloff = Math.exp(-d2 / (2 * r * r));
      const s = clamp01(Number(p.strength ?? 0.7)) * falloff;
      if (p.kind === 'danger') danger += s;
      else safe += s;
    }
    const danger01 = clamp01(danger - 0.8 * safe);
    setCtx(world, 'danger', c.id, danger01);
    setCtx(world, 'privacy', c.id, clamp01(0.5 + 0.5 * safe - 0.4 * danger));
  }
}

type RecentSimEvent = {
  id: string;
  type: string;
  tick: number;
  actorId?: string;
  targetId?: string;
  locationId?: string;
  payload?: any;
};

// Keeps short rolling event history so next tick adapter can still see just-consumed events.
function persistRecentEvents(world: SimWorld, eventsApplied: any[]) {
  const facts = world.facts || (world.facts = {} as SimWorldFacts);
  const prev = Array.isArray(facts['sim:recentEvents']) ? facts['sim:recentEvents'] : [];
  const next: RecentSimEvent[] = (Array.isArray(eventsApplied) ? eventsApplied : []).map((e: any) => {
    const payload = (e && typeof e === 'object') ? (e.payload || {}) : {};
    return {
      id: String(e?.id || ''),
      type: String(e?.type || 'event'),
      tick: Number(payload?.tick ?? payload?.tickIndex ?? world.tickIndex ?? 0),
      actorId: payload?.actorId != null ? String(payload.actorId) : undefined,
      targetId: payload?.targetId != null ? String(payload.targetId) : undefined,
      locationId: payload?.locationId != null
        ? String(payload.locationId)
        : (payload?.locId != null ? String(payload.locId) : undefined),
      payload,
    };
  }).filter((e: RecentSimEvent) => e.id);

  const keep = 64;
  const merged = [...prev, ...next];
  facts['sim:recentEvents'] = merged.slice(-keep);
}

function applyInputAxesSensors(world: SimWorld) {
  // Sensors: standardized 0..1 axes per actor, derived from location properties + local crowd.
  // Stored as world.facts['ctx:<axis>:<actorId>'] for easy reuse by subjective + GoalLab pipeline.
  if (!world.facts) world.facts = {} as SimWorldFacts;
  const chars = Object.values(world.characters || {});
  const byLoc: Record<string, number> = {};
  for (const c of chars) {
    const locId = c.locId;
    if (!locId) continue;
    byLoc[locId] = (byLoc[locId] || 0) + 1;
  }

  for (const c of chars) {
    const actorId = c.id;
    const locId = c.locId;
    if (!actorId || !locId) continue;

    const loc = world.locations[locId];
    const props = (loc?.entity as Record<string, unknown>)?.properties as Record<string, unknown> || {};

    const privacyBase = props.privacy === 'private' ? 1 : props.privacy === 'semi' ? 0.5 : 0;
    const controlLevel = clamp01(Number(props.control_level ?? props.controlLevel ?? 0));

    const temperature = clamp01(Number(props.temperature ?? 0.5));
    const comfort = clamp01(Number(props.comfort ?? 0.5));
    const hygiene = clamp01(Number(props.hygiene ?? 0.5));
    const aesthetics = clamp01(Number(props.aesthetics ?? 0.5));

    const baseNoise = clamp01(Number(props.noise ?? props.noiseLevel ?? 0.2));

    const peopleHere = byLoc[locId] || 0;
    const crowdDensity = clamp01((peopleHere - 1) / 4); // heuristic

    const noiseLevel = clamp01(baseNoise + crowdDensity * 0.25);
    const privacyComputed = clamp01(privacyBase - crowdDensity * 0.5);

    const authorityPresence = clamp01(Number(props.authorityPresence ?? props.authority_presence ?? controlLevel));

    // Combine with existing privacy sensor if present, to avoid breaking current behavior.
    const existingPrivacyRaw = getCtx(world, 'privacy', actorId);
    const existingPrivacy = typeof existingPrivacyRaw === 'number' ? existingPrivacyRaw : Number(existingPrivacyRaw);
    const privacy = Number.isFinite(existingPrivacy)
      ? clamp01(existingPrivacy * 0.6 + privacyComputed * 0.4)
      : privacyComputed;

    setCtx(world, 'temperature', actorId, temperature);
    setCtx(world, 'comfort', actorId, comfort);
    setCtx(world, 'hygiene', actorId, hygiene);
    setCtx(world, 'aesthetics', actorId, aesthetics);
    setCtx(world, 'crowdDensity', actorId, crowdDensity);
    setFact(world, `ctx:noise:${actorId}`, noiseLevel);
    setCtx(world, 'noiseLevel', actorId, noiseLevel);
    setCtx(world, 'authorityPresence', actorId, authorityPresence);
    setCtx(world, 'privacy', actorId, privacy);
  }
}

export type SimPlugin = {
  id: string;
  // Optional pre-step decision hook: can return actions to apply before default heuristic.
  decideActions?: (args: {
    world: SimWorld;
    offers: ActionOffer[];
    rng: RNG;
    tickIndex: number;
  }) => SimAction[] | null | void;
  afterSnapshot?: (args: {
    world: SimWorld;
    snapshot: any;              // SimSnapshot
    record: SimTickRecord;      // mutable attach point
  }) => void;
};

export type SimulatorConfig = {
  scenarioId: string;
  seed: number;
  initialWorld: SimWorld;
  plugins?: SimPlugin[];
  maxRecords?: number;
};

function pickTopOffer(world: SimWorld, offers: ActionOffer[], actorId: string): ActionOffer | null {
  const forActor = offers.filter(o => o.actorId === actorId && !o.blocked);
  if (!forActor.length) return null;

  // NOTE: offers are already roughly sorted by base heuristic score, but we apply
  // subjective modifiers (emotion, inertia, contagion, cognitive effort) here.
  // Deterministic tie-breakers are important for stable replays.
  const scored = forActor.map((o, idx) => ({ o, idx, s: scoreOfferSubjective(world, o) }));
  scored.sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s;
    if (b.o.score !== a.o.score) return b.o.score - a.o.score;
    const ka = String(a.o.kind);
    const kb = String(b.o.kind);
    if (ka !== kb) return ka.localeCompare(kb);
    return a.idx - b.idx;
  });
  return scored[0].o;
}

export class SimKitSimulator {
  public cfg: SimulatorConfig;
  public rng: RNG;
  public world: SimWorld;
  public records: SimTickRecord[] = [];

  // внешняя очередь “принудительных” действий на следующий тик
  public forcedActions: SimAction[] = [];
  public beats: NarrativeBeat[] = [];
  public tensionHistory: number[] = [];

  constructor(cfg: SimulatorConfig) {
    this.cfg = cfg;
    this.rng = new RNG(cfg.seed);
    this.world = cloneWorld(cfg.initialWorld);
    this.world.seed = cfg.seed;
    // Ensure placements exist for immediate UI rendering (before the first tick).
    const ids = Object.keys(this.world.characters).sort();
    for (let i = 0; i < ids.length; i++) ensureCharacterPos(this.world, ids[i], i);
  }

  reset(seed?: number) {
    const s = Number.isFinite(seed as any) ? Number(seed) : this.cfg.seed;
    this.rng = new RNG(s);
    this.world = cloneWorld(this.cfg.initialWorld);
    this.world.seed = s;
    // Precompute placements so UI has a sane map before the first tick.
    const ids = Object.keys(this.world.characters).sort();
    for (let i = 0; i < ids.length; i++) ensureCharacterPos(this.world, ids[i], i);
    this.records = [];
    this.forcedActions = [];
    this.beats = [];
    this.tensionHistory = [];
  }

  /** Replace initial world (used by Scene Setup) and reset session. */
  setInitialWorld(next: SimWorld, opts?: { seed?: number; scenarioId?: string }) {
    const seed = Number.isFinite(opts?.seed as any) ? Number(opts!.seed) : this.cfg.seed;
    if (opts?.scenarioId) this.cfg.scenarioId = opts.scenarioId;

    // keep cfg.seed in sync
    this.cfg.seed = seed;

    // normalize world for new session
    const w = cloneWorld(next);
    w.tickIndex = 0;
    w.seed = seed;
    w.events = w.events || [];
    w.facts = w.facts || {};

    this.cfg.initialWorld = w;
    this.reset(seed);
  }

  /** Useful for UI: show a map even before first tick. */
  getPreviewSnapshot() {
    return buildSnapshot(this.world);
  }

  enqueueAction(a: SimAction) {
    this.forcedActions.push(a);
  }

  step(): SimTickRecord {
    const w0 = cloneWorld(this.world);

    // Ensure every character has a valid position before spatial logic runs.
    const ids = Object.keys(this.world.characters).sort();
    for (let i = 0; i < ids.length; i++) {
      ensureCharacterPos(this.world, ids[i], i);
    }

    // Apply hazard/safe map points into world facts before scoring/actions.
    applyHazardPoints(this.world);
    applyInputAxesSensors(this.world);
    computeTacticalAtoms(this.world);

    const offers = proposeActions(this.world);

    const actionsApplied: SimAction[] = [];
    const eventsApplied: any[] = [];
    const notes: string[] = [];
    const actionValidations: NonNullable<TickTrace['actionValidations']> = [];

    // 1) применяем forcedActions (если есть), иначе — даём плагинам шанс выбрать действия
    const forced = this.takeForcedActions();
    let pluginDecided: SimAction[] | null = null;
    if (!forced.length) {
      for (const p of this.cfg.plugins || []) {
        const out = p.decideActions?.({
          world: this.world,
          offers,
          rng: this.rng,
          tickIndex: this.world.tickIndex,
        });
        if (Array.isArray(out) && out.length) {
          pluginDecided = out;
          break; // первый решивший плагин выигрывает
        }
      }
    }

    const actionsToApply = forced.length ? forced : (pluginDecided || []);

    // 1.5) Conflict resolution.
    let conflictEvents: any[] = [];
    let resolvedConflicts: any[] = [];
    const conflictResult = resolveConflicts(this.world, actionsToApply, this.cfg.seed);
    const actionsAfterConflict = conflictResult.filteredActions;
    conflictEvents = conflictResult.events;
    resolvedConflicts = conflictResult.resolved;
    if (resolvedConflicts.length) {
      notes.push(`conflicts: ${resolvedConflicts.map((r) => r.reason).join('; ')}`);
    }

    if (actionsAfterConflict.length) {
      for (const a of actionsAfterConflict) {
        const vr = validateActionStrict(this.world, a);
        let actionToApply: SimAction | null = null;

        if (vr.allowed) {
          actionToApply = vr.normalizedAction ? vr.normalizedAction : a;
        } else {
          actionToApply = vr.fallbackAction ? vr.fallbackAction : null;
        }

        actionValidations.push({
          actionId: a.id,
          actorId: a.actorId,
          kind: a.kind,
          targetId: a.targetId ?? null,
          allowed: vr.allowed,
          singleTick: vr.singleTick,
          reasons: vr.reasons,
          normalizedTo: actionToApply
            ? { id: actionToApply.id, kind: actionToApply.kind, targetId: actionToApply.targetId ?? null }
            : null,
        });

        if (!actionToApply) {
          notes.push(`action dropped: ${a.id} reasons=${vr.reasons.join(',')}`);
          continue;
        }

        const r = applyAction(this.world, actionToApply);
        this.world = r.world;
        actionsApplied.push(actionToApply);
        rememberLastAction(this.world, actionToApply);
        notes.push(...r.notes);
        // события от действий идут в очередь событий этого тика
        this.world.events.push(...r.events);
      }
    } else {
      // fallback: эвристика как раньше
      for (const cId of Object.keys(this.world.characters).sort()) {
        const best = pickTopOffer(this.world, offers, cId);
        if (!best) continue;
        const a: SimAction = {
          id: `act:${best.kind}:${this.world.tickIndex}:${cId}`,
          kind: best.kind,
          actorId: cId,
          targetId: best.targetId ?? null,
        };
        const vr = validateActionStrict(this.world, a);
        const actionToApply = vr.allowed ? (vr.normalizedAction ? vr.normalizedAction : a) : (vr.fallbackAction || null);

        actionValidations.push({
          actionId: a.id,
          actorId: a.actorId,
          kind: a.kind,
          targetId: a.targetId ?? null,
          allowed: vr.allowed,
          singleTick: vr.singleTick,
          reasons: vr.reasons,
          normalizedTo: actionToApply
            ? { id: actionToApply.id, kind: actionToApply.kind, targetId: actionToApply.targetId ?? null }
            : null,
        });

        if (!actionToApply) {
          notes.push(`action dropped: ${a.id} reasons=${vr.reasons.join(',')}`);
          continue;
        }

        const r = applyAction(this.world, actionToApply);
        this.world = r.world;
        actionsApplied.push(actionToApply);
        rememberLastAction(this.world, actionToApply);
        notes.push(...r.notes);
        this.world.events.push(...r.events);
      }
    }

    // 2) применяем события (включая те, что уже были в мире)
    const eventsNow = (this.world.events || []).slice();
    if (conflictEvents.length) eventsNow.push(...conflictEvents);
    this.world.events = []; // consumed
    for (const e of eventsNow) {
      const r = applyEvent(this.world, e);
      this.world = r.world;
      eventsApplied.push(e);
      notes.push(...r.notes);
    }
    expireDialogues(this.world);

    // 2.5) integrate inboxAtoms into agentAtoms with trust/compat gating.
    const inbox = (this.world.facts['inboxAtoms'] && typeof this.world.facts['inboxAtoms'] === 'object')
      ? this.world.facts['inboxAtoms']
      : null;

    if (inbox) {
      const dbgKey = `debug:inbox:${this.world.tickIndex}`;
      const dbg: any = { tickIndex: this.world.tickIndex, perAgent: {} };

      for (const [agentId, atoms] of Object.entries(inbox as Record<string, any[]>)) {
        const c = this.world.characters[agentId];
        if (!c) continue;

        const accepted: ContextAtom[] = [];
        const quarantined: ContextAtom[] = [];
        const rejected: any[] = [];

        for (const a of (Array.isArray(atoms) ? atoms : [])) {
          const speakerId = String(a?.meta?.from ?? '');
          const baseConf = typeof a?.confidence === 'number' ? a.confidence : 0.6;

          // If no speaker specified (e.g., observation), accept but lower weight.
          const decision = speakerId
            ? decideAcceptance(this.world, agentId, speakerId, baseConf)
            : { weight: 0.65, status: 'accept' as const, reasons: ['no_speaker'], trust: 0.5, compat: 0.6 };

          const mag = typeof a?.magnitude === 'number' ? a.magnitude : 1;
          const conf = clamp01(baseConf * decision.weight);

          const atom: ContextAtom = normalizeAtom({
            id: String(a.id),
            kind: 'ctx',
            source: a?.meta?.observedAction ? 'observation' : 'speech',
            magnitude: mag,
            confidence: conf,
            origin: 'obs',
            meta: {
              ...(a?.meta ?? {}),
              origin: {
                type: a?.meta?.observedAction ? 'observation' : 'speech',
                from: speakerId || null,
                tickIndex: this.world.tickIndex,
              },
              accept: {
                status: decision.status,
                weight: decision.weight,
                reasons: decision.reasons,
                trust: decision.trust,
                compat: decision.compat,
              },
            },
          });

          if (decision.status === 'accept') accepted.push(atom);
          else if (decision.status === 'quarantine') quarantined.push(atom);
          else rejected.push({ id: atom.id, from: speakerId || null, reasons: decision.reasons, trust: decision.trust, compat: decision.compat });
        }

        const keyA = `agentAtoms:${agentId}`;
        const prevA = Array.isArray(this.world.facts[keyA]) ? this.world.facts[keyA] : [];
        this.world.facts[keyA] = prevA.concat(accepted);

        const keyQ = `quarantineAtoms:${agentId}`;
        const prevQ = Array.isArray(this.world.facts[keyQ]) ? this.world.facts[keyQ] : [];
        this.world.facts[keyQ] = prevQ.concat(quarantined);

        (dbg.perAgent as any)[agentId] = {
          accepted: accepted.length,
          quarantined: quarantined.length,
          rejected: rejected.length,
          rejectedItems: rejected.slice(0, 12),
          // Store key info about accepted atoms for narrative display.
          acceptedItems: accepted.slice(0, 8).map((a: Record<string, unknown>) => ({
            id: String(a.id || '').replace(/:\d+$/, ''),
            mag: Number(a.magnitude ?? 0).toFixed(2),
            src: a.source || a.meta?.origin?.type || 'unknown',
            from: a.meta?.from || a.meta?.origin?.from || null,
          })),
        };
      }

      this.world.facts[dbgKey] = dbg;
      delete this.world.facts['inboxAtoms'];
    }

    // 3) строим снапшот
    // IMPORTANT: by now this.world.events has been consumed/reset.
    // We must pass the applied events explicitly for traceability.
    // Persist bounded history before snapshot; otherwise next tick sees empty event list.
    persistRecentEvents(this.world, eventsApplied as any[]);
    const snapshot = buildSnapshot(this.world, { events: eventsApplied });

    // 4) собираем trace deltas (минимально: по персонажам + фактам)
    const deltasChars: TickTrace['deltas']['chars'] = [];
    for (const id of Object.keys(this.world.characters).sort()) {
      const before = w0.characters[id];
      const after = this.world.characters[id];
      if (!before || !after) continue;
      // пишем только ключевые поля (можно расширить)
      const b = { locId: before.locId, stress: before.stress, health: before.health, energy: before.energy };
      const a = { locId: after.locId, stress: after.stress, health: after.health, energy: after.energy };
      if (JSON.stringify(b) !== JSON.stringify(a)) deltasChars.push({ id, before: b, after: a });
    }

    const deltasFacts: TickTrace['deltas']['facts'] = {};
    const keys = new Set<string>([...Object.keys(w0.facts || {}), ...Object.keys(this.world.facts || {})]);
    for (const k of Array.from(keys).sort()) {
      const b = (w0.facts || {})[k];
      const a = (this.world.facts || {})[k];
      if (JSON.stringify(b) !== JSON.stringify(a)) deltasFacts[k] = { before: b, after: a };
    }

    const trace: TickTrace = {
      tickIndex: this.world.tickIndex,
      time: snapshot.time,
      actionsProposed: offers,
      actionsApplied,
      eventsApplied,
      deltas: { chars: deltasChars, facts: deltasFacts },
      actionValidations,
      notes,
    };

    const rec: SimTickRecord = {
      snapshot,
      trace,
      plugins: {
        conflicts: resolvedConflicts,
      },
    };

    // 5) plugins (например, оркестратор)
    for (const p of this.cfg.plugins || []) {
      p.afterSnapshot?.({ world: this.world, snapshot, record: rec });
    }

    // 5.5) Passive relation dynamics
    passiveRelationUpdate(this.world, actionsApplied);
    indirectEvidenceUpdate(this.world, actionsApplied);

    // 5.6) Generate nonverbal observation atoms
    const nv = generateNonverbalAtoms(this.world);
    if (nv.length) {
      const inbox = (this.world.facts['inboxAtoms'] && typeof this.world.facts['inboxAtoms'] === 'object')
        ? this.world.facts['inboxAtoms']
        : {};
      for (const atom of nv) {
        const toId = String((atom as any)?.meta?.to ?? '');
        if (!toId || !this.world.characters[toId]) continue;
        const arr = Array.isArray((inbox as any)[toId]) ? (inbox as any)[toId] : [];
        arr.push(atom);
        (inbox as any)[toId] = arr;
      }
      this.world.facts['inboxAtoms'] = inbox as any;
      // Keep debug copy for diagnostics without losing operational delivery.
      (this.world.facts as any)[`obs:nonverbal:${this.world.tickIndex}`] = nv;
    }

    // 5.7) Beat detection + tension curve
    const prev = this.records.length ? this.records[this.records.length - 1] : null;
    const beats = detectBeats(rec, prev, this.world, w0);
    if (beats.length) this.beats.push(...beats);
    this.tensionHistory.push(computeTension(this.world));

    this.records.push(rec);
    if (this.cfg.maxRecords && this.records.length > this.cfg.maxRecords) {
      this.records = this.records.slice(-this.cfg.maxRecords);
    }

    // 6) increment tick
    this.world.tickIndex += 1;
    return rec;
  }

  run(n: number): SimTickRecord[] {
    const out: SimTickRecord[] = [];
    for (let i = 0; i < n; i++) out.push(this.step());
    return out;
  }

  private takeForcedActions(): SimAction[] {
    const xs = this.forcedActions.slice();
    this.forcedActions = [];
    xs.sort((a, b) => a.id.localeCompare(b.id));
    return xs;
  }
}
