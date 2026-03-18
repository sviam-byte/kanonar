// lib/simkit/dialogue/types.ts
// Structured dialogue model: exchanges, proposals, responses.

export type SpeechAct = 'inform' | 'ask' | 'propose' | 'accept' | 'reject' | 'counter' | 'threaten' | 'promise' | 'command';

export type SpeechIntent = 'truthful' | 'selective' | 'deceptive';

export type DialogueAtom = {
  id: string;
  magnitude: number;
  confidence: number;
  /** Original magnitude (before deception). Only stored if intent ≠ truthful. */
  trueMagnitude?: number;
  meta?: any;
};

export type DialogueEntry = {
  tick: number;
  speakerId: string;
  targetId: string;
  act: SpeechAct;
  intent: SpeechIntent;
  volume: 'whisper' | 'normal' | 'shout';
  topic: string;
  atoms: DialogueAtom[];
  /** Text template for UI display. */
  text: string;
  /** Who actually received (after speech routing). */
  recipients: Array<{
    agentId: string;
    channel: 'direct' | 'overheard' | 'distant';
    confidence: number;
    accepted: boolean;
  }>;
  /** If this is a response, link to the original exchange. */
  respondingTo?: string;
};

export type DialogueExchange = {
  id: string;
  initiatorId: string;
  targetId: string;
  startTick: number;
  entries: DialogueEntry[];
  status: 'open' | 'accepted' | 'rejected' | 'expired';
};

export type DialogueState = {
  exchanges: DialogueExchange[];
  /** Max age (ticks) before an unanswered exchange expires. */
  expiryTicks: number;
};
