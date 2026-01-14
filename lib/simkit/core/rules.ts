// lib/simkit/core/rules.ts
// Action proposal, validation, and application rules.

import type { SimWorld, SimAction, ActionOffer, SimEvent, SpeechEventV1 } from './types';
import { getChar, getLoc } from './world';
import { enumerateActionOffers, applyActionViaSpec } from '../actions/specs';
import { canHear } from './spatial';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function proposeActions(w: SimWorld): ActionOffer[] {
  return enumerateActionOffers(w);
}

export function applyAction(w: SimWorld, a: SimAction): { world: SimWorld; events: SimEvent[]; notes: string[] } {
  const { world, events, notes } = applyActionViaSpec(w, a);

  // пример: локационные hazards дают событие “hazardPulse”
  const c = getChar(world, a.actorId);
  const loc = getLoc(world, c.locId);
  const hazard = Number(loc.hazards?.['radiation'] ?? 0);
  if (hazard > 0.001) {
    events.push({
      id: `evt:hazardPulse:${world.tickIndex}:${c.id}`,
      type: 'hazardPulse',
      payload: { actorId: c.id, locationId: c.locId, hazardKey: 'radiation', level: hazard },
    });
  }

  return { world, events, notes };
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

  if (e.type === 'speech:v1') {
    const s = (e.payload || null) as SpeechEventV1 | null;
    const speakerId = String(s?.actorId || '');
    if (!speakerId || !w.characters[speakerId]) {
      return { world: w, notes };
    }
    const speaker = w.characters[speakerId];
    const volume = (s?.volume || 'normal') as 'whisper' | 'normal' | 'shout';

    // Determine recipients by spatial + volume.
    const recips: string[] = [];
    for (const other of Object.values(w.characters)) {
      if (other.id === speakerId) continue;
      if (other.locId !== speaker.locId) continue;
      if (canHear(w, speakerId, other.id, volume)) {
        recips.push(other.id);
      }
    }

    // Store delivered atoms per recipient (for GoalLab / ToM later).
    const inbox = (w.facts['inboxAtoms'] && typeof w.facts['inboxAtoms'] === 'object') ? w.facts['inboxAtoms'] : {};
    for (const rid of recips) {
      const key = String(rid);
      const arr = Array.isArray(inbox[key]) ? inbox[key] : [];
      for (const a of (s?.atoms || [])) {
        arr.push({
          id: String(a.id),
          magnitude: typeof a.magnitude === 'number' ? a.magnitude : 1,
          confidence: typeof a.confidence === 'number' ? a.confidence : 0.7,
          meta: {
            ...(a.meta || {}),
            from: speakerId,
            volume,
            act: s?.act,
            topic: s?.topic,
            tickIndex: w.tickIndex,
          },
        });
      }
      inbox[key] = arr;
    }
    w.facts['inboxAtoms'] = inbox;

    notes.push(`speech:v1 ${speakerId} -> [${recips.join(', ')}] (${volume})`);
  }

  return { world: w, notes };
}
