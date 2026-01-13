// lib/context/v2/ingestSpeech.ts
// Minimal speech ingestion: convert speech events into ContextAtoms.

import type { ContextAtom } from './types';

export function atomsFromSpeechEvent(payload: any, tickIndex: number): ContextAtom[] {
  if (!payload || payload.schema !== 'SpeechEventV1') return [];
  const actorId = String(payload.actorId || '').trim();
  const targetId = String(payload.targetId || '').trim();
  if (!actorId || !targetId) return [];

  const out: ContextAtom[] = [];
  const atoms = Array.isArray(payload.atoms) ? payload.atoms : [];

  for (const a of atoms) {
    const id = String(a?.id || '').trim();
    if (!id) continue;
    out.push({
      id: `heard:${id}:${targetId}:${tickIndex}`, // стабильный id для “я это услышал”
      ns: 'speech',
      kind: 'signal',
      source: 'speech',
      magnitude: typeof a.magnitude === 'number' ? a.magnitude : 1,
      confidence: typeof a.confidence === 'number' ? a.confidence : 0.75,
      origin: 'obs',
      trace: {
        notes: ['speech:v1'],
        parts: { act: payload.act, topic: payload.topic, ref: id },
      },
      meta: {
        act: payload.act,
        topic: payload.topic ?? null,
        text: payload.text ?? null,
        from: actorId,
        to: targetId,
        raw: a?.meta ?? null,
      },
    } as any);
  }

  // общий “факт общения”
  out.push({
    id: `ctx:speech:seen:${actorId}:${targetId}:${tickIndex}`,
    ns: 'speech',
    kind: 'event',
    source: 'speech',
    magnitude: 1,
    confidence: 0.9,
    origin: 'obs',
    trace: {
      notes: ['speech:v1'],
      parts: { act: payload.act, topic: payload.topic },
    },
    meta: { act: payload.act, topic: payload.topic ?? null, from: actorId, to: targetId },
  } as any);

  return out;
}
