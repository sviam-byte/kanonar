// lib/simkit/core/rules.ts
// Action proposal, validation, and application rules.

import type { SimWorld, SimAction, ActionOffer, SimEvent } from './types';
import { getChar, getLoc } from './world';
import { enumerateActionOffers } from '../actions/specs';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function proposeActions(w: SimWorld): ActionOffer[] {
  // Single source of truth for action affordances:
  // enumerate from ActionSpecs (each spec encodes when/requirements/blocking).
  return enumerateActionOffers(w);
}
// validateOffer() moved to ActionSpecs registry (lib/simkit/actions/specs.ts).

export function applyAction(w: SimWorld, a: SimAction): { world: SimWorld; events: SimEvent[]; notes: string[] } {
  const notes: string[] = [];
  const events: SimEvent[] = [];

  const c = getChar(w, a.actorId);

  if (a.kind === 'wait') {
    c.energy = clamp01(c.energy + 0.02);
    c.stress = clamp01(c.stress - 0.01);
    notes.push(`${c.id} waits`);
    events.push({
      id: `evt:action:wait:${w.tickIndex}:${c.id}`,
      type: 'action:wait',
      payload: { actorId: c.id, locationId: c.locId },
    });
  }

  if (a.kind === 'rest') {
    c.energy = clamp01(c.energy + 0.08);
    c.stress = clamp01(c.stress - 0.03);
    notes.push(`${c.id} rests`);
    events.push({
      id: `evt:action:rest:${w.tickIndex}:${c.id}`,
      type: 'action:rest',
      payload: { actorId: c.id, locationId: c.locId },
    });
  }

  if (a.kind === 'work') {
    c.energy = clamp01(c.energy - 0.06);
    c.stress = clamp01(c.stress + 0.03);
    w.facts['work:count'] = (w.facts['work:count'] ?? 0) + 1;
    notes.push(`${c.id} works`);
    events.push({
      id: `evt:action:work:${w.tickIndex}:${c.id}`,
      type: 'action:work',
      payload: { actorId: c.id, locationId: c.locId, factKey: 'work:count' },
    });
  }

  if (a.kind === 'move') {
    const to = String(a.targetId ?? '');
    const from = c.locId;
    const fromLoc = getLoc(w, from);
    const ok = !!to && (fromLoc.neighbors || []).includes(to);

    if (!ok) {
      notes.push(`${c.id} move blocked ${from} -> ${to || '(none)'}`);
      events.push({
        id: `evt:action:move:${w.tickIndex}:${c.id}`,
        type: 'action:move',
        payload: { actorId: c.id, fromLocId: from, toLocId: to || null, ok: false, locationId: from },
      });
    } else {
      c.locId = to;
      c.energy = clamp01(c.energy - 0.03);
      notes.push(`${c.id} moves ${from} -> ${to}`);
      events.push({
        id: `evt:action:move:${w.tickIndex}:${c.id}`,
        type: 'action:move',
        payload: { actorId: c.id, fromLocId: from, toLocId: to, ok: true, locationId: to },
      });
    }
  }

  if (a.kind === 'talk') {
    const otherId = String(a.targetId ?? '');
    c.stress = clamp01(c.stress - 0.02);
    w.facts[`talk:${c.id}:${otherId}`] = (w.facts[`talk:${c.id}:${otherId}`] ?? 0) + 1;
    notes.push(`${c.id} talks to ${otherId}`);
    events.push({
      id: `evt:action:talk:${w.tickIndex}:${c.id}:${otherId}`,
      type: 'action:talk',
      payload: { actorId: c.id, targetId: otherId, locationId: c.locId },
    });
  }

  // пример: локационные hazards дают событие “hazardPulse”
  const loc = getLoc(w, c.locId);
  const hazard = Number(loc.hazards?.['radiation'] ?? 0);
  if (hazard > 0.001) {
    events.push({
      id: `evt:hazardPulse:${w.tickIndex}:${c.id}`,
      type: 'hazardPulse',
      payload: { actorId: c.id, locationId: c.locId, hazardKey: 'radiation', level: hazard },
    });
  }

  return { world: w, events, notes };
}

export function applyEvent(w: SimWorld, e: SimEvent): { world: SimWorld; notes: string[] } {
  const notes: string[] = [];

  if (e.type === 'hazardPulse') {
    const { actorId, hazardKey, level } = e.payload || {};
    const c = w.characters[String(actorId)];
    if (c) {
      if (hazardKey === 'radiation') {
        c.health = clamp01(c.health - 0.02 * Number(level));
        c.stress = clamp01(c.stress + 0.04 * Number(level));
        notes.push(`hazardPulse radiation -> ${c.id} (level=${Number(level).toFixed(2)})`);
      }
    }
  }

  return { world: w, notes };
}
