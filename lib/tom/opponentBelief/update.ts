import { FC } from '../../config/formulaConfig';
import { codeUnitCompare } from '../../utils/compare';
import { APPROVED_BELIEF_KEYS_V1, type BeliefEvidenceV1, type BeliefUpdateTraceV1, type EstimateV1, type OpponentBeliefV1 } from './types';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const copyEstimate = (value: EstimateV1): EstimateV1 => ({ ...value, evidenceIds: [...value.evidenceIds] });

function digest(belief: OpponentBeliefV1): string {
  return APPROVED_BELIEF_KEYS_V1.map(key => {
    const e = belief.estimates[key];
    return `${key}:${e.value.toFixed(12)}:${e.confidence.toFixed(12)}:${e.uncertainty.toFixed(12)}:${e.evidenceIds.join(',')}`;
  }).join('|');
}

export function updateOpponentBeliefV1(prior: OpponentBeliefV1, evidenceInput: BeliefEvidenceV1[], tick: number): OpponentBeliefV1 {
  const existingEvidenceIds = new Set(prior.evidence.map(item => item.evidenceId));
  const evidence = [...evidenceInput]
    .filter(item => !existingEvidenceIds.has(item.evidenceId) && item.observerId === prior.observerId && item.targetId === prior.targetId && item.tick <= tick)
    .sort((a, b) => a.tick - b.tick || codeUnitCompare(a.evidenceId, b.evidenceId));
  const estimates = Object.fromEntries(APPROVED_BELIEF_KEYS_V1.map(key => [key, copyEstimate(prior.estimates[key])])) as OpponentBeliefV1['estimates'];
  const changes: BeliefUpdateTraceV1['axisChanges'] = [];

  for (const item of evidence) for (const key of APPROVED_BELIEF_KEYS_V1) {
    const signal = item.payload[key];
    if (typeof signal !== 'number' || !Number.isFinite(signal) || signal < 0 || signal > 1) continue;
    const before = copyEstimate(estimates[key]);
    const weight = item.reliability;
    const denominator = before.confidence + weight;
    const value = denominator > 0 ? (before.value * before.confidence + signal * weight) / denominator : signal;
    const confidence = 1 - (1 - before.confidence) * (1 - FC.opponentBeliefV1.confidenceGain * weight);
    const disagreement = Math.abs(signal - before.value);
    const uncertainty = clamp01(before.uncertainty * (1 - FC.opponentBeliefV1.uncertaintyDecay * weight) + disagreement * FC.opponentBeliefV1.disagreementWeight * weight);
    const after: EstimateV1 = { value: clamp01(value), confidence: clamp01(confidence), uncertainty, evidenceIds: [...new Set([...before.evidenceIds, item.evidenceId])].sort(codeUnitCompare), updatedAtTick: tick };
    estimates[key] = after;
    changes.push({ key, before, after: copyEstimate(after), ruleId: 'opponent-belief:evidence-weighted-v1', contributorIds: [item.evidenceId] });
  }

  let ledger = [...prior.evidence, ...evidence]
    .filter((item, index, all) => all.findIndex(other => other.evidenceId === item.evidenceId) === index)
    .sort((a, b) => a.tick - b.tick || codeUnitCompare(a.evidenceId, b.evidenceId));
  if (ledger.length > FC.opponentBeliefV1.evidenceLimit) {
    const compactCount = ledger.length - FC.opponentBeliefV1.evidenceLimit + 1;
    const compacted = ledger.slice(0, compactCount);
    const compactedIds = new Set(compacted.map(item => item.evidenceId));
    const evidenceId = `belief:evidence:compacted:${prior.observerId}:${prior.targetId}:${compacted[0].tick}-${compacted[compacted.length - 1].tick}`;
    const summary: BeliefEvidenceV1 = {
      schemaVersion: 1, evidenceId, kind: 'compatibility_prior', observerId: prior.observerId, targetId: prior.targetId,
      payload: { compactedEvidenceIds: [...compactedIds].sort(codeUnitCompare) },
      reliability: compacted.reduce((sum, item) => sum + item.reliability, 0) / compacted.length,
      tick: compacted[compacted.length - 1].tick,
      provenance: {
        sourceIds: [...new Set(compacted.flatMap(item => item.provenance.sourceIds))].sort(codeUnitCompare),
        adapterSteps: [...compacted.flatMap(item => item.provenance.adapterSteps), { adapterId: 'opponent-belief-evidence-compaction', adapterVersion: 1, inputIds: [...compactedIds].sort(codeUnitCompare) }],
      },
    };
    ledger = [summary, ...ledger.slice(compactCount)].sort((a, b) => a.tick - b.tick || codeUnitCompare(a.evidenceId, b.evidenceId));
    for (const key of APPROVED_BELIEF_KEYS_V1) {
      if (estimates[key].evidenceIds.some(id => compactedIds.has(id))) estimates[key].evidenceIds = [...new Set([evidenceId, ...estimates[key].evidenceIds.filter(id => !compactedIds.has(id))])].sort(codeUnitCompare);
    }
  }
  const base: OpponentBeliefV1 = { ...prior, estimates, evidence: ledger, updatedAtTick: tick, summary: { confidence: 0, uncertainty: 0 } };
  base.summary = {
    confidence: APPROVED_BELIEF_KEYS_V1.reduce((sum, key) => sum + estimates[key].confidence, 0) / APPROVED_BELIEF_KEYS_V1.length,
    uncertainty: APPROVED_BELIEF_KEYS_V1.reduce((sum, key) => sum + estimates[key].uncertainty, 0) / APPROVED_BELIEF_KEYS_V1.length,
  };
  const beforeDigest = digest(prior);
  const afterDigest = digest(base);
  base.lastUpdateTrace = {
    traceId: `belief:update:${prior.observerId}:${prior.targetId}:${tick}`,
    tick, observerId: prior.observerId, targetId: prior.targetId, beforeDigest,
    evidenceIds: evidence.map(item => item.evidenceId), axisChanges: changes, afterDigest,
    adapterSteps: evidence.flatMap(item => item.provenance.adapterSteps),
  };
  return base;
}
