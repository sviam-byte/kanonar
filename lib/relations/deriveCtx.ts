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

function mk(selfId: string, otherId: string, name: string, v: number, usedAtomIds: string[], parts: any): ContextAtom {
  return normalizeAtom({
    id: `rel:ctx:${selfId}:${otherId}:${name}`,
    ns: 'rel',
    kind: 'relation_ctx' as any,
    origin: 'derived',
    source: 'rel_ctx',
    magnitude: clamp01(v),
    confidence: 1,
    subject: selfId,
    target: otherId,
    tags: ['rel', 'ctx', name],
    label: `rel.ctx.${name}=${Math.round(clamp01(v) * 100)}%`,
    trace: { usedAtomIds, notes: ['derived rel:ctx'], parts }
  } as any);
}

/**
 * rel:ctx — "ситуативная социальная связь"
 * Источники (детерминированно):
 * - рядом/в одной сцене (obs:nearby, scene participants)
 * - свежие события "он сделал мне X" (event/ev dyad)
 * - публичность/наблюдение усиливают формальность (authority/obligation), но не делают всех avoid
 * - наследование: берём прошлую rel:ctx:* из памяти персонажа (через relCtxAtoms input), и затухаем
 */
export function deriveRelCtxAtoms(args: {
  selfId: string;
  otherIds: string[];
  atoms: ContextAtom[];
  // если ты положила в stage0 atomizeRelCtx(...) — оно попадёт сюда и даст наследование
}): ContextAtom[] {
  const { selfId, otherIds, atoms } = args;
  const out: ContextAtom[] = [];

  const pub = clamp01(getMag(atoms, `ctx:publicness:${selfId}`, 0));
  const surv = clamp01(getMag(atoms, `ctx:surveillance:${selfId}`, 0));
  const danger = clamp01(getMag(atoms, `ctx:danger:${selfId}`, 0));

  for (const otherId of otherIds) {
    if (!otherId || otherId === selfId) continue;

    // 1) inheritance: already-atomized rel:ctx from memory (previous ticks)
    const inh = {
      closeness: clamp01(getMag(atoms, `rel:ctx:${selfId}:${otherId}:closeness`, 0)),
      loyalty: clamp01(getMag(atoms, `rel:ctx:${selfId}:${otherId}:loyalty`, 0)),
      hostility: clamp01(getMag(atoms, `rel:ctx:${selfId}:${otherId}:hostility`, 0)),
      dependency: clamp01(getMag(atoms, `rel:ctx:${selfId}:${otherId}:dependency`, 0)),
      authority: clamp01(getMag(atoms, `rel:ctx:${selfId}:${otherId}:authority`, 0)),
    };

    // 2) in-scene proximity
    const near = clamp01(getMag(atoms, `obs:nearby:${selfId}:${otherId}`, 0)); // если у тебя 0/1 — норм
    const sameScene = clamp01(getMag(atoms, `obs:inScene:${selfId}:${otherId}`, near)); // optional, fallback to near

    // 3) fresh dyad events (которые уже есть в deriveState)
    const pos = [
      `ev:dyad:${selfId}:${otherId}:help`,
      `ev:dyad:${selfId}:${otherId}:protect`,
      `ev:dyad:${selfId}:${otherId}:support`,
      `ev:dyad:${selfId}:${otherId}:truth`,
      `ev:dyad:${selfId}:${otherId}:gift`,
    ].reduce((s, id) => s + getMag(atoms, id, 0), 0);

    const neg = [
      `ev:dyad:${selfId}:${otherId}:harm`,
      `ev:dyad:${selfId}:${otherId}:betray`,
      `ev:dyad:${selfId}:${otherId}:lie`,
      `ev:dyad:${selfId}:${otherId}:threaten`,
      `ev:dyad:${selfId}:${otherId}:humiliate`,
    ].reduce((s, id) => s + getMag(atoms, id, 0), 0);

    const evPos = clamp01(pos);
    const evNeg = clamp01(neg);

    // 4) contextual shaping
    // - близость в сцене увеличивает "канал контакта" (closeness/obligation слегка вверх)
    // - публичность/наблюдение: усиливают формальность и власть/обязательства
    const formality = clamp01(0.50 * pub + 0.50 * surv);

    // 5) decay: наследование быстро затухает, если нет контакта
    // Если в сцене не пересеклись — ctx стремится к 0.
    const contact = clamp01(0.55 * near + 0.45 * sameScene);
    const keep = clamp01(0.20 + 0.65 * contact); // 0.2..0.85

    const closeness = clamp01(keep * inh.closeness + 0.18 * contact + 0.12 * evPos - 0.10 * evNeg);
    const loyalty = clamp01(keep * inh.loyalty + 0.10 * contact + 0.18 * evPos - 0.15 * evNeg);
    const hostility = clamp01(keep * inh.hostility + 0.08 * danger + 0.28 * evNeg - 0.10 * evPos);

    const dependency = clamp01(
      keep * inh.dependency
      + 0.10 * contact
      + 0.18 * formality
      - 0.10 * hostility
    );

    const authority = clamp01(
      keep * inh.authority
      + 0.30 * formality
      + 0.10 * (1 - contact) // дистанция => ощущение "иерархии/формальности"
    );

    const used = [
      `ctx:publicness:${selfId}`,
      `ctx:surveillance:${selfId}`,
      `ctx:danger:${selfId}`,
      `obs:nearby:${selfId}:${otherId}`,
      `obs:inScene:${selfId}:${otherId}`,
      `rel:ctx:${selfId}:${otherId}:closeness`,
      `rel:ctx:${selfId}:${otherId}:loyalty`,
      `rel:ctx:${selfId}:${otherId}:hostility`,
      `rel:ctx:${selfId}:${otherId}:dependency`,
      `rel:ctx:${selfId}:${otherId}:authority`,
      `ev:dyad:${selfId}:${otherId}:help`,
      `ev:dyad:${selfId}:${otherId}:harm`,
      `ev:dyad:${selfId}:${otherId}:betray`,
    ].filter(id => has(atoms, id));

    out.push(
      mk(selfId, otherId, 'closeness', closeness, used, { inh, contact, evPos, evNeg }),
      mk(selfId, otherId, 'loyalty', loyalty, used, { inh, contact, evPos, evNeg }),
      mk(selfId, otherId, 'hostility', hostility, used, { inh, danger, evPos, evNeg }),
      mk(selfId, otherId, 'dependency', dependency, used, { inh, formality, contact, hostility }),
      mk(selfId, otherId, 'authority', authority, used, { inh, formality, contact }),
    );
  }

  return out;
}
