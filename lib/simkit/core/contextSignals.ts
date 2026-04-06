// lib/simkit/core/contextSignals.ts
// Final-first reads for subjective/runtime context signals.

import { clamp01 } from '../../util/math';

export type ContextSignalRead = {
  value: number;
  source: 'final' | 'raw' | 'fallback';
  key: string | null;
};

export function readCtxSignal(facts: any, agentId: string, axis: string, fallback = 0): ContextSignalRead {
  const finalKey = `ctx:final:${axis}:${agentId}`;
  const rawKey = `ctx:${axis}:${agentId}`;
  const finalVal = Number(facts?.[finalKey]);
  if (Number.isFinite(finalVal)) {
    return { value: clamp01(finalVal), source: 'final', key: finalKey };
  }
  const rawVal = Number(facts?.[rawKey]);
  if (Number.isFinite(rawVal)) {
    return { value: clamp01(rawVal), source: 'raw', key: rawKey };
  }
  return { value: clamp01(fallback), source: 'fallback', key: null };
}
