import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x?.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function has(atoms: ContextAtom[], id: string) {
  return atoms.some(a => a?.id === id);
}

function readRelBase(atoms: ContextAtom[], selfId: string, otherId: string) {
  return {
    closeness: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:closeness`, 0)),
    loyalty: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:loyalty`, 0)),
    hostility: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:hostility`, 0)),
    dependency: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:dependency`, 0)),
    authority: clamp01(getMag(atoms, `rel:base:${selfId}:${otherId}:authority`, 0)),
  };
}

function eventDelta(atoms: ContextAtom[], selfId: string, otherId: string) {
  // Мягко и безопасно: не требуем конкретных event-атомов (они могут меняться),
  // но если они есть — используем.
  // Поддерживаем расширение: новые события добавишь — добавишь сюда маппинг.
  const pos = [
    `ev:dyad:${selfId}:${otherId}:help`,
    `ev:dyad:${selfId}:${otherId}:gift`,
    `ev:dyad:${selfId}:${otherId}:protect`,
    `ev:dyad:${selfId}:${otherId}:truth`,
    `ev:dyad:${selfId}:${otherId}:support`,
  ].reduce((s, id) => s + getMag(atoms, id, 0), 0);

  const neg = [
    `ev:dyad:${selfId}:${otherId}:harm`,
    `ev:dyad:${selfId}:${otherId}:betray`,
    `ev:dyad:${selfId}:${otherId}:lie`,
    `ev:dyad:${selfId}:${otherId}:threaten`,
    `ev:dyad:${selfId}:${otherId}:humiliate`,
  ].reduce((s, id) => s + getMag(atoms, id, 0), 0);

  // Сжимаем: события должны медленно сдвигать rel:state
  const delta = clamp01(0.5 + 0.20 * (pos - neg));
  return { pos, neg, delta };
}

function mkRelState(selfId: string, otherId: string, name: string, v: number, usedAtomIds: string[], parts: any): ContextAtom {
  return normalizeAtom({
    id: `rel:state:${selfId}:${otherId}:${name}`,
    ns: 'rel',
    kind: 'relation_state' as any,
    origin: 'derived',
    source: 'rel_state',
    magnitude: clamp01(v),
    confidence: 1,
    subject: selfId,
    target: otherId,
    tags: ['rel', 'state', name],
    label: `rel.state.${name}=${Math.round(clamp01(v) * 100)}%`,
    trace: { usedAtomIds, notes: ['derived rel:state'], parts }
  } as any);
}

/**
 * rel:state — текущие отношения
 * - основывается на rel:base (биографический prior)
 * - плюс слабая корректировка от событий, ToM и контекста
 * - детерминированно и расширяемо
 */
export function deriveRelStateAtoms(args: {
  selfId: string;
  otherIds: string[];
  atoms: ContextAtom[];
}): ContextAtom[] {
  const { selfId, otherIds, atoms } = args;
  const out: ContextAtom[] = [];

  const paranoia = clamp01(getMag(atoms, `feat:char:${selfId}:trait.paranoia`, 0.5));
  const stress = clamp01(getMag(atoms, `feat:char:${selfId}:body.stress`, 0.3));
  const surv = clamp01(getMag(atoms, `ctx:surveillance:${selfId}`, 0));

  for (const otherId of otherIds) {
    if (!otherId || otherId === selfId) continue;

    const r0 = readRelBase(atoms, selfId, otherId);

    // контекстный “социальный пресс” делает отношения хрупче/осторожнее
    const socialPressure = clamp01(0.40 * surv + 0.35 * stress + 0.25 * paranoia);

    // ToM (если уже есть) добавляет “настроение” к отношениям
    const tomTrust = clamp01(getMag(atoms, `tom:dyad:${selfId}:${otherId}:trust`, 0.5));
    const tomThreat = clamp01(getMag(atoms, `tom:dyad:${selfId}:${otherId}:threat`, 0.2));

    const ev = eventDelta(atoms, selfId, otherId);

    // БАЗОВАЯ ИДЕЯ: rel:state близок к rel:base, но плавно корректируется
    // в сторону текущих сигналов. Никакой агрессии к данным: если тома/ивентов нет —
    // остаётся r0.
    const closeness = clamp01(
      0.70 * r0.closeness +
      0.15 * tomTrust +
      0.10 * ev.delta +
      0.05 * (1 - socialPressure)
    );

    const trust = clamp01(
      0.55 * r0.loyalty +
      0.25 * tomTrust +
      0.10 * ev.delta -
      0.20 * tomThreat
    );

    const hostility = clamp01(
      0.60 * r0.hostility +
      0.25 * tomThreat +
      0.10 * (1 - ev.delta) +
      0.15 * socialPressure
    );

    const obligation = clamp01(
      0.50 * r0.dependency +
      0.20 * r0.loyalty +
      0.10 * closeness +
      0.10 * (1 - socialPressure) -
      0.10 * hostility
    );

    const respect = clamp01(
      0.70 * r0.authority +
      0.15 * (1 - hostility) +
      0.15 * (0.5 + 0.5 * tomTrust)
    );

    const used = [
      `rel:base:${selfId}:${otherId}:closeness`,
      `rel:base:${selfId}:${otherId}:loyalty`,
      `rel:base:${selfId}:${otherId}:hostility`,
      `rel:base:${selfId}:${otherId}:dependency`,
      `rel:base:${selfId}:${otherId}:authority`,
      `tom:dyad:${selfId}:${otherId}:trust`,
      `tom:dyad:${selfId}:${otherId}:threat`,
      `feat:char:${selfId}:trait.paranoia`,
      `feat:char:${selfId}:body.stress`,
      `ctx:surveillance:${selfId}`,
      // event ids опциональны — они могут отсутствовать
      `ev:dyad:${selfId}:${otherId}:help`,
      `ev:dyad:${selfId}:${otherId}:harm`,
      `ev:dyad:${selfId}:${otherId}:lie`,
      `ev:dyad:${selfId}:${otherId}:betray`,
    ].filter(id => has(atoms, id));

    out.push(
      mkRelState(selfId, otherId, 'closeness', closeness, used, { r0, tomTrust, ev, socialPressure }),
      mkRelState(selfId, otherId, 'trust', trust, used, { r0, tomTrust, tomThreat, ev, socialPressure }),
      mkRelState(selfId, otherId, 'hostility', hostility, used, { r0, tomThreat, ev, socialPressure }),
      mkRelState(selfId, otherId, 'obligation', obligation, used, { r0, closeness, hostility, socialPressure }),
      mkRelState(selfId, otherId, 'respect', respect, used, { r0, tomTrust, hostility }),
    );
  }

  return out;
}
