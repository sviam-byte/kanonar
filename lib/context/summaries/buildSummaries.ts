// lib/context/summaries/buildSummaries.ts
import { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

type SummaryResult = {
  atoms: ContextAtom[];
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function pickTop(atoms: ContextAtom[], filter: (a: ContextAtom) => boolean, n: number) {
  return atoms
    .filter(filter)
    .filter(a => typeof a.magnitude === 'number' && Number.isFinite(a.magnitude))
    .sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0))
    .slice(0, n);
}

function atomLabel(a: ContextAtom) {
  return a.label || a.id;
}

export function buildSummaryAtoms(frameAtoms: ContextAtom[], opts: { selfId: string }): SummaryResult {
  const { selfId } = opts;
  const out: ContextAtom[] = [];

  // 1) ctx banner: top axes
  const topCtx = pickTop(
    frameAtoms,
    (a) => (a.ns === 'ctx' || a.id.startsWith('ctx:')) && !a.id.startsWith('ctx:banner'),
    4
  );

  const ctxText = topCtx.map(a => `${a.id.replace('ctx:', '')}:${Math.round((a.magnitude ?? 0) * 100)}%`).join(' · ');

  out.push(normalizeAtom({
    id: 'ctx:banner',
    kind: 'summary_banner',
    ns: 'ctx',
    origin: 'derived',
    source: 'summaries',
    magnitude: clamp01(topCtx[0]?.magnitude ?? 0),
    label: ctxText || 'no ctx axes',
    tags: ['summary', 'banner', 'ctx'],
    confidence: 1,
    trace: { sourceAtomIds: topCtx.map(a => a.id), notes: ['top ctx axes'] },
    meta: { top: topCtx.map(a => ({ id: a.id, magnitude: a.magnitude, label: atomLabel(a) })) }
  } as any));

  // 2) threat banner: main channel + final
  // Prefer per-agent canonical IDs (threat:*:${selfId}), fallback to legacy unsuffixed.
  const threatFinal = 
    frameAtoms.find(a => a.id === `threat:final:${selfId}`) || 
    frameAtoms.find(a => a.id === 'threat:final');
  
  const threatChannelsAll = frameAtoms.filter(a => (a.ns === 'threat' || a.id.startsWith('threat:')) && a.id.startsWith('threat:ch:'));
  const threatChannelsSelf = threatChannelsAll.filter(a => String(a.id || '').endsWith(`:${selfId}`));
  const threatChannels = threatChannelsSelf.length ? threatChannelsSelf : threatChannelsAll;
  
  const topCh = threatChannels.sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0))[0];

  const thrText = [
    topCh ? `${topCh.id.replace('threat:ch:', '').replace(`:${selfId}`, '')}:${Math.round((topCh.magnitude ?? 0) * 100)}%` : 'no channels',
    threatFinal ? `final:${Math.round((threatFinal.magnitude ?? 0) * 100)}%` : 'final:missing'
  ].join(' · ');

  out.push(normalizeAtom({
    id: 'threat:banner',
    kind: 'summary_banner',
    ns: 'threat',
    origin: 'derived',
    source: 'summaries',
    magnitude: clamp01(threatFinal?.magnitude ?? topCh?.magnitude ?? 0),
    label: thrText,
    tags: ['summary', 'banner', 'threat'],
    confidence: 1,
    trace: { sourceAtomIds: [topCh?.id, threatFinal?.id].filter(Boolean) as string[], notes: ['top threat channel + final'] },
    meta: { topChannel: topCh ? { id: topCh.id, magnitude: topCh.magnitude, label: atomLabel(topCh) } : null }
  } as any));

  // 3) emo banner: dominant emotion (prefer discrete affect:e:/emotion: over valence)
  const emoCandidates = frameAtoms
    .filter(a => (a.ns === 'emo' || a.kind === 'emotion' || String(a.id).startsWith('affect:e:') || String(a.id).startsWith('emotion:')) && !String(a.id).includes('banner'))
    .map(a => ({ id: a.id, magnitude: typeof a.magnitude === 'number' ? a.magnitude : 0, label: a.label ?? a.id }));

  const discreteEmos = emoCandidates.filter(e => e.id.startsWith('affect:e:') || e.id.startsWith('emotion:'));
  const valenceEmo = emoCandidates.find(e => e.id.startsWith('affect:valence:'));
  const topDiscrete = discreteEmos.sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0))[0];
  const topEmo = topDiscrete && (topDiscrete.magnitude ?? 0) > 0.05 ? topDiscrete : valenceEmo || emoCandidates[0];

  out.push(normalizeAtom({
    id: 'emo:banner',
    kind: 'summary_banner',
    ns: 'emo',
    origin: 'derived',
    source: 'summaries',
    magnitude: clamp01(topEmo?.magnitude ?? 0),
    label: topEmo ? `${topEmo.label || topEmo.id}:${Math.round((topEmo.magnitude ?? 0) * 100)}%` : 'no emotions',
    tags: ['summary', 'banner', 'emo'],
    confidence: 1,
    trace: { sourceAtomIds: topEmo ? [topEmo.id] : [], notes: ['dominant emotion'] },
    meta: { top: topEmo ? { id: topEmo.id, magnitude: topEmo.magnitude, label: topEmo.label } : null }
  } as any));

  // 4) tom banner per target (who is this person for me now)
  // Inputs:
  // - rel:label self->other
  // - tom dyad trust/threat if exists
  const relLabels = frameAtoms.filter(a => a.id.startsWith(`rel:label:${selfId}:`));
  for (const rel of relLabels) {
    const otherId = (rel.id.split(':').slice(-1)[0]) || '';
    if (!otherId) continue;

    const trust = frameAtoms.find(a => a.id === `tom:dyad:${selfId}:${otherId}:trust`) ||
                  frameAtoms.find(a => a.id === `tom:dyad:${selfId}:${otherId}:trust_ctx`);
    const dyThreat = frameAtoms.find(a => a.id === `tom:dyad:${selfId}:${otherId}:threat`) ||
                     frameAtoms.find(a => a.id === `tom:dyad:${selfId}:${otherId}:threat_ctx`);

    const bits: string[] = [];
    const relTag = (rel.tags || []).find(t => ['lover','friend','ally','rival','enemy','neutral','subordinate','superior'].includes(t));
    if (relTag) bits.push(relTag);
    if (trust) bits.push(`trust:${Math.round((trust.magnitude ?? 0) * 100)}%`);
    if (dyThreat) bits.push(`threat:${Math.round((dyThreat.magnitude ?? 0) * 100)}%`);

    out.push(normalizeAtom({
      id: `tom:banner:${selfId}:${otherId}`,
      kind: 'summary_banner',
      ns: 'tom',
      origin: 'derived',
      source: 'summaries',
      magnitude: clamp01(Math.max(rel.magnitude ?? 0, trust?.magnitude ?? 0)),
      label: bits.join(' · ') || `target:${otherId}`,
      tags: ['summary', 'banner', 'tom', 'dyad'],
      confidence: 1,
      subject: selfId,
      target: otherId,
      trace: { sourceAtomIds: [rel.id, trust?.id, dyThreat?.id].filter(Boolean) as string[], notes: ['rel + tom dyad'] },
      meta: { otherId }
    } as any));
  }

  return { atoms: out };
}
