// lib/simkit/core/rules.ts
// Action proposal, validation, and application rules.

import type { SimWorld, SimAction, ActionOffer, SimEvent } from './types';
import { getChar, getLoc } from './world';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function proposeActions(w: SimWorld): ActionOffer[] {
  const offers: ActionOffer[] = [];

  for (const c of Object.values(w.characters)) {
    // WAIT всегда
    offers.push({ kind: 'wait', actorId: c.id, score: 0.1 });

    // REST если энергия низкая
    offers.push({ kind: 'rest', actorId: c.id, score: clamp01((0.6 - c.energy) * 2) });

    // MOVE в соседние локации
    const loc = getLoc(w, c.locId);
    for (const n of loc.neighbors || []) {
      const score = 0.2; // базово; ты заменишь на логику угроз/норм/целей
      offers.push({ kind: 'move', actorId: c.id, targetId: n, score });
    }

    // WORK если энергия не слишком низкая
    offers.push({ kind: 'work', actorId: c.id, score: clamp01((c.energy - 0.2) * 0.8) });

    // TALK — со всеми в той же локации
    for (const other of Object.values(w.characters)) {
      if (other.id === c.id) continue;
      if (other.locId !== c.locId) continue;
      offers.push({ kind: 'talk', actorId: c.id, targetId: other.id, score: 0.15 });
    }
  }

  // normalize: deterministic ordering
  return offers
    .map(o => validateOffer(w, o))
    .sort((a, b) => (b.score - a.score)
      || a.actorId.localeCompare(b.actorId)
      || String(a.targetId ?? '').localeCompare(String(b.targetId ?? ''))
      || a.kind.localeCompare(b.kind));
}

function validateOffer(w: SimWorld, o: ActionOffer): ActionOffer {
  try {
    const c = getChar(w, o.actorId);

    if (o.kind === 'move') {
      const loc = getLoc(w, c.locId);
      const to = String(o.targetId ?? '');
      const ok = !!to && (loc.neighbors || []).includes(to);
      if (!ok) return { ...o, blocked: true, reason: 'not-a-neighbor', score: 0 };
      return o;
    }

    if (o.kind === 'talk') {
      const otherId = String(o.targetId ?? '');
      const other = w.characters[otherId];
      if (!other) return { ...o, blocked: true, reason: 'no-target', score: 0 };
      if (other.locId !== c.locId) return { ...o, blocked: true, reason: 'not-same-location', score: 0 };
      return o;
    }

    return o;
  } catch {
    return { ...o, blocked: true, reason: 'invalid', score: 0 };
  }
}

export function applyAction(w: SimWorld, a: SimAction): { world: SimWorld; events: SimEvent[]; notes: string[] } {
  const notes: string[] = [];
  const events: SimEvent[] = [];

  const c = getChar(w, a.actorId);

  if (a.kind === 'wait') {
    c.energy = clamp01(c.energy + 0.02);
    c.stress = clamp01(c.stress - 0.01);
    notes.push(`${c.id} waits`);
  }

  if (a.kind === 'rest') {
    c.energy = clamp01(c.energy + 0.08);
    c.stress = clamp01(c.stress - 0.03);
    notes.push(`${c.id} rests`);
  }

  if (a.kind === 'work') {
    c.energy = clamp01(c.energy - 0.06);
    c.stress = clamp01(c.stress + 0.03);
    w.facts['work:count'] = (w.facts['work:count'] ?? 0) + 1;
    notes.push(`${c.id} works`);
  }

  if (a.kind === 'move') {
    const to = String(a.targetId ?? '');
    const from = c.locId;
    c.locId = to;
    c.energy = clamp01(c.energy - 0.03);
    notes.push(`${c.id} moves ${from} -> ${to}`);
  }

  if (a.kind === 'talk') {
    const otherId = String(a.targetId ?? '');
    c.stress = clamp01(c.stress - 0.02);
    w.facts[`talk:${c.id}:${otherId}`] = (w.facts[`talk:${c.id}:${otherId}`] ?? 0) + 1;
    notes.push(`${c.id} talks to ${otherId}`);
  }

  // пример: локационные hazards дают событие “hazardPulse”
  const loc = getLoc(w, c.locId);
  const hazard = Number(loc.hazards?.['radiation'] ?? 0);
  if (hazard > 0.001) {
    events.push({
      id: `evt:hazardPulse:${w.tickIndex}:${c.id}`,
      type: 'hazardPulse',
      payload: { actorId: c.id, locId: c.locId, hazardKey: 'radiation', level: hazard },
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
