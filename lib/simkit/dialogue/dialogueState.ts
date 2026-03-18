// lib/simkit/dialogue/dialogueState.ts
// Tracks active dialogue exchanges in world.facts.

import type { SimWorld } from '../core/types';
import type { DialogueState, DialogueExchange, DialogueEntry } from './types';

const STATE_KEY = 'sim:dialogue';
const DEFAULT_EXPIRY = 5;

export function getDialogueState(world: SimWorld): DialogueState {
  const raw = (world.facts as any)[STATE_KEY];
  if (raw && typeof raw === 'object' && Array.isArray(raw.exchanges)) return raw as DialogueState;
  return { exchanges: [], expiryTicks: DEFAULT_EXPIRY };
}

export function setDialogueState(world: SimWorld, state: DialogueState): void {
  (world.facts as any)[STATE_KEY] = state;
}

/** Register a new speech entry and manage exchanges. */
export function recordDialogueEntry(world: SimWorld, entry: DialogueEntry): void {
  const state = getDialogueState(world);

  if (entry.respondingTo) {
    const ex = state.exchanges.find((e) => e.id === entry.respondingTo && e.status === 'open');
    if (ex) {
      ex.entries.push(entry);
      if (entry.act === 'accept') ex.status = 'accepted';
      else if (entry.act === 'reject') ex.status = 'rejected';
    }
  } else if (entry.act === 'propose' || entry.act === 'ask' || entry.act === 'command') {
    const exchange: DialogueExchange = {
      id: `dlg:${entry.speakerId}:${entry.targetId}:${entry.tick}`,
      initiatorId: entry.speakerId,
      targetId: entry.targetId,
      startTick: entry.tick,
      entries: [entry],
      status: 'open',
    };
    state.exchanges.push(exchange);
  }

  setDialogueState(world, state);
}

/** Expire old unanswered exchanges. Called once per tick. */
export function expireDialogues(world: SimWorld): void {
  const state = getDialogueState(world);
  const tick = world.tickIndex;
  for (const ex of state.exchanges) {
    if (ex.status !== 'open') continue;
    if (tick - ex.startTick > state.expiryTicks) {
      ex.status = 'expired';
    }
  }
  setDialogueState(world, state);
}

/** Get open proposals/questions directed at a specific agent. */
export function getPendingForAgent(world: SimWorld, agentId: string): DialogueExchange[] {
  const state = getDialogueState(world);
  return state.exchanges.filter((e) => e.targetId === agentId && e.status === 'open');
}

/** Get full dialogue log for UI panel. */
export function getDialogueLog(world: SimWorld): DialogueEntry[] {
  const state = getDialogueState(world);
  const entries: DialogueEntry[] = [];
  for (const ex of state.exchanges) {
    entries.push(...ex.entries);
  }
  entries.sort((a, b) => a.tick - b.tick);
  return entries;
}
