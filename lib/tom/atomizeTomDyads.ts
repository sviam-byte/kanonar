import type { WorldState } from '../../types';
import type { ContextAtom } from '../context/v2/types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num = (v: any, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// максимально робастный извлекатель dyad-данных из world.tom
function readDyad(world: any, selfId: string, otherId: string): any | null {
  const tom = world?.tom;
  if (!tom) return null;

  // Shape A: tom.dyads[self][other]
  const a = tom?.dyads?.[selfId]?.[otherId];
  if (a) return a;

  // Shape B: tom.matrix[self][other]
  const b = tom?.matrix?.[selfId]?.[otherId];
  if (b) return b;

  // Shape C: tom[self][other]
  const c = tom?.[selfId]?.[otherId];
  if (c) return c;

  // Shape D: tom.edges is array
  const edges = tom?.edges;
  if (Array.isArray(edges)) {
    const e = edges.find((x: any) =>
      (x?.from === selfId && x?.to === otherId) ||
      (x?.a === selfId && x?.b === otherId) ||
      (x?.source === selfId && x?.target === otherId)
    );
    if (e) return e;
  }

  return null;
}

function mkAtom(args: {
  id: string;
  magnitude: number;
  selfId: string;
  otherId: string;
  label: string;
  tags: string[];
  traceParts?: Record<string, any>;
}): ContextAtom {
  return {
    id: args.id,
    ns: 'tom',
    kind: 'tom_dyad',
    origin: 'world',
    source: 'tom',
    magnitude: clamp01(args.magnitude),
    confidence: 1,
    subject: args.selfId,
    object: args.otherId,
    tags: ['tom', 'dyad', ...args.tags],
    label: args.label,
    trace: {
      usedAtomIds: [],
      notes: ['atomized from world.tom'],
      parts: args.traceParts ?? {},
    },
  } as any;
}

export function atomizeTomDyads(world: WorldState, selfId: string): ContextAtom[] {
  const out: ContextAtom[] = [];
  const agents = world?.agents ?? [];

  for (const other of agents) {
    const otherId = (other as any)?.entityId;
    if (!otherId || otherId === selfId) continue;

    const d = readDyad(world, selfId, otherId) ?? {};

    // поддерживаем несколько неймингов полей
    const trust =
      num(d.trust, num(d.trustBase, num(d.t, 0)));
    const threat =
      num(d.threat, num(d.threatBase, num(d.risk, 0)));
    const alignment =
      num(d.alignment, num(d.align, num(d.coop, 0)));
    const familiarity =
      num(d.familiarity, num(d.known, num(d.fam, 0)));

    // если dyad пустой — не шумим атомами
    const hasAny =
      trust !== 0 || threat !== 0 || alignment !== 0 || familiarity !== 0;
    if (!hasAny) continue;

    out.push(
      mkAtom({
        id: `tom:dyad:${selfId}:${otherId}:trust`,
        magnitude: trust,
        selfId,
        otherId,
        label: `tom trust → ${otherId}`,
        tags: ['trust'],
        traceParts: { field: 'trust' },
      }),
      mkAtom({
        id: `tom:dyad:${selfId}:${otherId}:threat`,
        magnitude: threat,
        selfId,
        otherId,
        label: `tom threat → ${otherId}`,
        tags: ['threat'],
        traceParts: { field: 'threat' },
      }),
      mkAtom({
        id: `tom:dyad:${selfId}:${otherId}:alignment`,
        magnitude: alignment,
        selfId,
        otherId,
        label: `tom alignment → ${otherId}`,
        tags: ['alignment'],
        traceParts: { field: 'alignment' },
      }),
      mkAtom({
        id: `tom:dyad:${selfId}:${otherId}:familiarity`,
        magnitude: familiarity,
        selfId,
        otherId,
        label: `tom familiarity → ${otherId}`,
        tags: ['familiarity'],
        traceParts: { field: 'familiarity' },
      }),
    );
  }

  return out;
}
