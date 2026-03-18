// lib/simkit/core/rules.ts
// Action proposal, validation, and application rules.

import type { SimWorld, SimAction, ActionOffer, SimEvent, SpeechEventV1 } from './types';
import { getChar, getLoc } from './world';
import { enumerateActionOffers, applyActionViaSpec } from '../actions/specs';
import { distSameLocation, getSpatialConfig, privacyOf } from './spatial';
import { routeSpeechEvent } from '../perception/speechFilter';
import { recordDialogueEntry } from '../dialogue/dialogueState';

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
    const targetId = String(s?.targetId || '');
    const atoms = Array.isArray(s?.atoms) ? s?.atoms : [];

    // Recipient routing with spatial + volume policy.
    const recipients = routeSpeechEvent(w, e).map((r) => ({
      id: r.agentId,
      overhear: r.channel !== 'direct',
      confMul: clamp01(r.confidence),
      channel: r.channel,
    }));

    if (!recipients.length) {
      notes.push(`speech dropped (no recipients): ${speakerId}`);
      return { world: w, notes };
    }

    // Store delivered atoms per recipient (for GoalLab / ToM later).
    const inbox = (w.facts['inboxAtoms'] && typeof w.facts['inboxAtoms'] === 'object') ? w.facts['inboxAtoms'] : {};
    const locId = speaker.locId;
    const speakerPrivacy = privacyOf(w, locId, speaker.pos?.nodeId ?? null);
    for (const r of recipients) {
      const key = String(r.id);
      const arr = Array.isArray((inbox as any)[key]) ? (inbox as any)[key] : [];
      const d = distSameLocation(w, speakerId, r.id);
      for (const a of atoms) {
        const baseConf = typeof a.confidence === 'number' ? a.confidence : 0.7;
        arr.push({
          id: String(a.id),
          magnitude: typeof a.magnitude === 'number' ? a.magnitude : 1,
          confidence: clamp01(baseConf * r.confMul),
          meta: {
            ...(a.meta || {}),
            from: speakerId,
            volume,
            act: s?.act,
            topic: s?.topic,
            tickIndex: w.tickIndex,
            distance: Number.isFinite(d) ? d : null,
            speakerPrivacy,
            // Mark that the recipient overheard rather than being explicitly targeted.
            overhear: r.overhear,
            channel: r.channel,
          },
        });
      }
      (inbox as any)[key] = arr;
    }
    w.facts['inboxAtoms'] = inbox as any;

    // Structured dialogue trace for UI/debug.
    recordDialogueEntry(w, {
      tick: w.tickIndex,
      speakerId,
      targetId,
      act: (s?.act as any) || 'inform',
      intent: ((s as any)?._intent || 'truthful') as any,
      volume,
      topic: String(s?.topic || ''),
      atoms: atoms as any,
      text: String(s?.text || ''),
      recipients: recipients.map((r) => ({
        agentId: r.id,
        channel: r.channel,
        confidence: r.confMul,
        accepted: true,
      })),
    });

    notes.push(
      `speech:v1 ${speakerId} -> ${targetId || '(broadcast)'} recips=${recipients.length} (${volume})`
    );
  }

  if (e.type?.startsWith('action:')) {
    const actorId = String((e.payload || {})?.actorId ?? '');
    const actor = w.characters[actorId];
    if (actor) {
      for (const other of Object.values(w.characters)) {
        if (other.id === actorId) continue;
        if (other.locId !== actor.locId) continue;

        // Observers only see nearby actions (lightweight proximity check).
        const d = distSameLocation(w, actorId, other.id);
        if (!Number.isFinite(d) || d > getSpatialConfig(w).talkRange * 1.2) continue;

        const inbox = (w.facts['inboxAtoms'] && typeof w.facts['inboxAtoms'] === 'object') ? w.facts['inboxAtoms'] : {};
        const arr = Array.isArray((inbox as any)[other.id]) ? (inbox as any)[other.id] : [];

        arr.push({
          id: `ctx:observe:${e.type}:${actorId}:${w.tickIndex}`,
          magnitude: 1,
          confidence: 0.85,
          meta: {
            from: actorId, // use from to route through trust gating
            observedAction: e.type,
            tickIndex: w.tickIndex,
          },
        });

        (inbox as any)[other.id] = arr;
        w.facts['inboxAtoms'] = inbox as any;
      }
    }
  }

  return { world: w, notes };
}
