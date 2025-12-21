
// lib/contextMind/scoreboard.ts
import { ContextAtom } from '../context/v2/types';

const SOC_SUPPORT_PREFIX = 'soc:support:';
const SOC_THREAT_PREFIX  = 'soc:threat:';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function maxMag(atoms: ContextAtom[], pred: (a: ContextAtom) => boolean) {
  let m = 0;
  for (const a of atoms) if (pred(a)) m = Math.max(m, clamp01((a as any).magnitude ?? 0));
  return m;
}

function getMag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function firstByPrefix(atoms: ContextAtom[], prefix: string): string | null {
  const a = atoms.find(x => typeof x.id === 'string' && x.id.startsWith(prefix));
  return a ? a.id : null;
}

function allByPrefix(atoms: ContextAtom[], prefix: string): string[] {
  return atoms.filter(x => typeof x.id === 'string' && x.id.startsWith(prefix)).map(x => x.id);
}

export type MindMetric = {
  key: 'threat' | 'pressure' | 'support' | 'crowd';
  value: number;
  label: string;
  parts: Record<string, number>;
  usedAtomIds: string[];
};

export type ContextMindScoreboard = {
  schemaVersion: number;
  selfId: string;
  metrics: MindMetric[];
};

export function computeContextMindScoreboard(args: {
  selfId: string;
  atoms: ContextAtom[];
}): ContextMindScoreboard {
  const { selfId, atoms } = args;

  // ---------- THREAT ----------
  // Prefer canonical threat:final:selfId ; fallback: max of threat:ch:* if exists
  const threatFinalId =
    firstByPrefix(atoms, `threat:final:${selfId}`) ||
    firstByPrefix(atoms, `threat:final:`) ||
    null;

  let threat = threatFinalId ? getMag(atoms, threatFinalId, 0) : 0;
  let threatUsed = threatFinalId ? [threatFinalId] : [];

  if (!threatFinalId) {
    const chans = allByPrefix(atoms, `threat:ch:`); // if you use that naming
    if (chans.length) {
      let mx = 0; let mxId = chans[0];
      for (const id of chans) {
        const v = getMag(atoms, id, 0);
        if (v > mx) { mx = v; mxId = id; }
      }
      threat = mx;
      threatUsed = [mxId, ...chans.slice(0, 6)];
    } else {
      // last resort: use ctx:danger if you have it
      const dangerId = firstByPrefix(atoms, `ctx:danger:${selfId}`) || firstByPrefix(atoms, `ctx:danger:`);
      if (dangerId) {
        threat = getMag(atoms, dangerId, 0);
        threatUsed = [dangerId];
      }
    }
  }

  // ---------- PRESSURE ----------
  // authority + protocol strict + surveillance + urgency
  const ids = {
    authority: firstByPrefix(atoms, `threat:ch:authority:`) || firstByPrefix(atoms, `ctx:hierarchy:`) || firstByPrefix(atoms, `world:loc:control_level:`),
    protocol: firstByPrefix(atoms, `norm:proceduralStrict:`) || firstByPrefix(atoms, `scene:proceduralStrict:`),
    surveillance: firstByPrefix(atoms, `world:loc:control_level:`) || firstByPrefix(atoms, `norm:surveillance:`),
    urgency: firstByPrefix(atoms, `scene:urgency:`),
    normPressure: firstByPrefix(atoms, `world:loc:normative_pressure:${selfId}`) || firstByPrefix(atoms, `world:loc:normative_pressure:`) || firstByPrefix(atoms, `loc:normPressure:`) || firstByPrefix(atoms, `feat:loc:`) 
  };

  const authority = ids.authority ? getMag(atoms, ids.authority, 0) : 0;
  const protocol = ids.protocol ? getMag(atoms, ids.protocol, 0) : 0;
  const surveillance = ids.surveillance ? getMag(atoms, ids.surveillance, 0) : 0;
  const urgency = ids.urgency ? getMag(atoms, ids.urgency, 0) : 0;
  const normPressure = ids.normPressure ? getMag(atoms, ids.normPressure, 0) : 0;

  const pressure = clamp01(
    0.30 * authority +
    0.25 * protocol +
    0.20 * surveillance +
    0.15 * urgency +
    0.10 * normPressure
  );

  const pressureUsed = [ids.authority, ids.protocol, ids.surveillance, ids.urgency, ids.normPressure].filter(Boolean) as string[];

  // ---------- SUPPORT ----------
  // trusted presence + offers help + high trust dyads (if you have tom:dyad:*:trust)
  const helpOfferIds = atoms.filter(a => a.id.startsWith('off:') && a.id.includes('help')).map(a => a.id);

  const allyNearIds = atoms
    .filter(a => a.id.startsWith(`tom:trusted_ally_near:${selfId}:`) || a.id.startsWith(`soc:support_near:${selfId}:`))
    .map(a => a.id);
  const allyNear = Math.max(
    maxMag(atoms, a => typeof a.id === 'string' && a.id.startsWith(`tom:trusted_ally_near:${selfId}:`)),
    maxMag(atoms, a => typeof a.id === 'string' && a.id.startsWith(`soc:support_near:${selfId}:`)),
  );

  // NEW: explicit social atoms (nearby support/threat)
  const socSupportIds = atoms
    .filter(a => a.id.startsWith(`${SOC_SUPPORT_PREFIX}${selfId}:`))
    .map(a => a.id);
  const socThreatIds = atoms
    .filter(a => a.id.startsWith(`${SOC_THREAT_PREFIX}${selfId}:`))
    .map(a => a.id);
  const trustDyads = atoms
    .filter(a =>
      (a.id.startsWith('tom:effective:dyad:') && a.id.endsWith(':trust')) ||
      (a.id.startsWith('tom:dyad:') && a.id.endsWith(':trust'))
    )
    .slice(0, 80)
    .map(a => a.id);

  // A simple proxy:
  // support = max(helpOffer) OR avg(top trusted dyads) OR ctx:support if exists.
  const supportAxisId = firstByPrefix(atoms, `ctx:support:${selfId}`) || firstByPrefix(atoms, `ctx:socialSupport:${selfId}`) || null;

  let support = supportAxisId ? getMag(atoms, supportAxisId, 0) : 0;
  let supportUsed: string[] = supportAxisId ? [supportAxisId] : [];

  if (!supportAxisId) {
    const help = helpOfferIds.length ? Math.max(...helpOfferIds.map(id => getMag(atoms, id, 0))) : 0;
    const trusts = trustDyads.length ? trustDyads.map(id => getMag(atoms, id, 0)).sort((a,b)=>b-a).slice(0, 5) : [];
    const trustAvg = trusts.length ? trusts.reduce((s,v)=>s+v,0)/trusts.length : 0;

    const socSup = socSupportIds.length
      ? socSupportIds.map(id => getMag(atoms, id, 0)).sort((a,b)=>b-a).slice(0, 5).reduce((s,v)=>s+v,0) / Math.min(5, socSupportIds.length)
      : 0;
    const socThr = socThreatIds.length
      ? socThreatIds.map(id => getMag(atoms, id, 0)).sort((a,b)=>b-a).slice(0, 5).reduce((s,v)=>s+v,0) / Math.min(5, socThreatIds.length)
      : 0;

    // support boosted by nearby allies, reduced by nearby hostile presence
    support = clamp01(0.35 * help + 0.25 * trustAvg + 0.55 * socSup - 0.25 * socThr);

    supportUsed = [
      ...(helpOfferIds.slice(0, 6)),
      ...(trustDyads.slice(0, 6)),
      ...(socSupportIds.slice(0, 6)),
      ...(socThreatIds.slice(0, 6)),
    ];
  }

  support = clamp01(Math.max(support, allyNear));
  supportUsed = Array.from(new Set([...supportUsed, ...allyNearIds.slice(0, 6)]));

  // ---------- CROWD ----------
  // Canonical ID first, legacy fallback
  const crowdLocId = firstByPrefix(atoms, `world:loc:crowd:${selfId}`) || firstByPrefix(atoms, `world:loc:crowd:`);
  const crowdSceneId = firstByPrefix(atoms, `scene:crowd:`);
  const crowdCtxId = firstByPrefix(atoms, `ctx:crowd:`);

  const crowdLoc = crowdLocId ? getMag(atoms, crowdLocId, 0) : 0;
  const crowdScene = crowdSceneId ? getMag(atoms, crowdSceneId, 0) : 0;
  const crowdCtx = crowdCtxId ? getMag(atoms, crowdCtxId, 0) : 0;

  const crowd = clamp01(Math.max(crowdLoc, crowdScene, crowdCtx));
  const crowdUsed = [crowdLocId, crowdSceneId, crowdCtxId].filter(Boolean) as string[];

  return {
    schemaVersion: 1,
    selfId,
    metrics: [
      {
        key: 'threat',
        label: 'Угроза',
        value: clamp01(threat),
        parts: { threat },
        usedAtomIds: threatUsed
      },
      {
        key: 'pressure',
        label: 'Давление',
        value: pressure,
        parts: { authority, protocol, surveillance, urgency, normPressure },
        usedAtomIds: pressureUsed
      },
      {
        key: 'support',
        label: 'Поддержка',
        value: clamp01(support),
        parts: { support },
        usedAtomIds: supportUsed
      },
      {
        key: 'crowd',
        label: 'Толпа',
        value: crowd,
        parts: { crowdLoc, crowdScene, crowdCtx },
        usedAtomIds: crowdUsed
      }
    ]
  };
}
