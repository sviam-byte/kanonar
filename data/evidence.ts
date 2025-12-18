
import { Evidence } from '../types';

// Simple Bayes update based on source reliability
function updateConfidence(prior: number, reliability: number): number {
  const peh = reliability;
  const penh = 1 - reliability;
  if (peh * prior + penh * (1 - prior) === 0) return prior; // Avoid division by zero
  return (peh * prior) / (peh * prior + penh * (1 - prior));
}

export const allEvidence: Evidence[] = [
  {
    id: 'ev-rion-patch-plan',
    statement: 'Specializes in "Patch-Plans" and "Localization of Cracks".',
    source: { id: 'source-rectorate-archives', type: 'archive' },
    confidence: updateConfidence(0.8, 0.95), // High prior, high reliability source
    relevance: ['competence_op', 'pv'],
    date: '408 OВ',
  },
  {
    id: 'ev-rion-glass-knife-owner',
    statement: 'Listed as current maintainer and effective owner of the Glass Knife.',
    source: { id: 'source-rectorate-archives', type: 'archive' },
    confidence: updateConfidence(0.9, 0.95),
    relevance: ['mandate_res', 'vsigma'],
    date: '410 OВ',
  },
  {
    id: 'ev-vestar-kainrax-memory',
    statement: 'Vestar is remembered by Kainrax as loyal but conflicted.',
    source: { id: 'source-kainrax-memory', type: 'witness' },
    confidence: updateConfidence(0.6, 0.75), // Lower prior, less reliable source
    relevance: ['loyalty', 'stress'],
    date: '431 OВ',
  },
  {
    id: 'ev-glass-knife-causal-sever',
    statement: 'The artifact severs causal links rather than physical matter.',
    source: { id: 'source-field-report-a12', type: 'document' },
    confidence: updateConfidence(0.7, 0.85),
    relevance: ['causal_penalty', 'vsigma'],
    date: '395 OВ',
  }
];

const evidenceMap = new Map(allEvidence.map(e => [e.id, e]));

export const getEvidenceById = (id: string) => evidenceMap.get(id);
