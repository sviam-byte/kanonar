import type { ContextAtom } from '../context/v2/types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num01 = (v: any, d = 0) => {
  const x = typeof v === 'number' && Number.isFinite(v) ? v : d;
  // допускаем [-1..1] для valence и приводим к 0..1 только при необходимости в потребителях
  return x;
};

function mk(args: {
  id: string;
  selfId: string;
  magnitude: number;
  label: string;
  used?: string[];
  parts?: Record<string, any>;
}): ContextAtom {
  return {
    id: args.id,
    ns: 'affect',
    kind: 'affect_state',
    origin: 'manual',
    source: 'affect',
    magnitude: args.magnitude,
    confidence: 1,
    subject: args.selfId,
    tags: ['affect'],
    label: args.label,
    trace: {
      usedAtomIds: args.used ?? [],
      notes: ['from affectOverrides UI'],
      parts: args.parts ?? {},
    },
  } as any;
}

export type AffectOverride = Partial<{
  valence: number;   // желательно [-1..1]
  arousal: number;   // 0..1
  fear: number;      // 0..1
  anger: number;     // 0..1
  shame: number;     // 0..1
}>;

export function atomizeAffectOverrides(selfId: string, ov?: AffectOverride | null): ContextAtom[] {
  if (!ov) return [];

  const out: ContextAtom[] = [];
  if (ov.valence !== undefined) {
    out.push(mk({
      id: `affect:valence:${selfId}`,
      selfId,
      magnitude: num01(ov.valence, 0),
      label: `affect.valence=${num01(ov.valence, 0).toFixed(2)}`,
    }));
  }
  if (ov.arousal !== undefined) {
    out.push(mk({
      id: `affect:arousal:${selfId}`,
      selfId,
      magnitude: clamp01(num01(ov.arousal, 0)),
      label: `affect.arousal=${clamp01(num01(ov.arousal, 0)).toFixed(2)}`,
    }));
  }
  if (ov.fear !== undefined) {
    out.push(mk({
      id: `affect:fear:${selfId}`,
      selfId,
      magnitude: clamp01(num01(ov.fear, 0)),
      label: `affect.fear=${clamp01(num01(ov.fear, 0)).toFixed(2)}`,
    }));
  }
  if (ov.anger !== undefined) {
    out.push(mk({
      id: `affect:anger:${selfId}`,
      selfId,
      magnitude: clamp01(num01(ov.anger, 0)),
      label: `affect.anger=${clamp01(num01(ov.anger, 0)).toFixed(2)}`,
    }));
  }
  if (ov.shame !== undefined) {
    out.push(mk({
      id: `affect:shame:${selfId}`,
      selfId,
      magnitude: clamp01(num01(ov.shame, 0)),
      label: `affect.shame=${clamp01(num01(ov.shame, 0)).toFixed(2)}`,
    }));
  }

  return out;
}
