import { ContextAtom } from './types';

function cloneAs(a: ContextAtom, newId: string): ContextAtom {
  return {
    ...a,
    id: newId,
    // алиасы — derived, чтобы не путать с фактами мира
    origin: 'derived',
    source: 'alias',
    ns: (newId.split(':')[0] as any) || a.ns,
    trace: {
      ...(a.trace || {}),
      usedAtomIds: Array.from(new Set([...(a.trace?.usedAtomIds || []), a.id])),
      notes: [...(a.trace?.notes || []), `alias_of:${a.id}`]
    }
  } as any;
}

function exists(atoms: ContextAtom[], id: string) {
  return atoms.some(x => x.id === id);
}

function pick(atoms: ContextAtom[], id: string) {
  return atoms.find(x => x.id === id);
}

/**
 * Делает алиасы вида:
 *   ctx:danger        -> ctx:danger:${selfId}
 *   threat:final      -> threat:final:${selfId}
 * и т.д. — ТОЛЬКО если “короткого” айди нет, а “длинный” есть.
 */
export function buildSelfAliases(atoms: ContextAtom[], selfId: string): ContextAtom[] {
  const out: ContextAtom[] = [];

  const ctxAxes = [
    'danger','intimacy','hierarchy','publicness','normPressure','surveillance',
    'scarcity','timePressure','uncertainty','legitimacy','secrecy','grief','pain',
    'privacy','crowd'
  ];

  for (const k of ctxAxes) {
    const longId = `ctx:${k}:${selfId}`;
    const shortId = `ctx:${k}`;
    if (!exists(atoms, shortId)) {
      const a = pick(atoms, longId);
      if (a) out.push(cloneAs(a, shortId));
    }
  }

  const threatKeys = ['final','env','soc','auth','unc','body','sc'];
  for (const t of threatKeys) {
    const longId = `threat:${t}:${selfId}`;
    const shortId = `threat:${t}`;
    if (!exists(atoms, shortId)) {
      const a = pick(atoms, longId);
      if (a) out.push(cloneAs(a, shortId));
    }
  }

  // часто встречающиеся world:* алиасы
  const worldIds = [
    ['world:map:cover', `world:map:cover:${selfId}`],
    ['world:map:escape', `world:map:escape:${selfId}`],
    ['world:map:danger', `world:map:danger:${selfId}`],
    ['world:map:exits', `world:map:exits:${selfId}`],
    ['world:loc:privacy', `world:loc:privacy:${selfId}`],
    ['world:loc:publicness', `world:loc:publicness:${selfId}`],
    ['world:loc:visibility', `world:loc:visibility:${selfId}`],
    ['world:loc:crowd', `world:loc:crowd:${selfId}`],
    ['obs:infoAdequacy', `obs:infoAdequacy:${selfId}`],
  ] as const;

  for (const [shortId, longId] of worldIds) {
    if (!exists(atoms, shortId)) {
      const a = pick(atoms, longId);
      if (a) out.push(cloneAs(a, shortId));
    }
  }

  return out;
}
