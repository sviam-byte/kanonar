import { describe, it, expect } from 'vitest';

import { runProbe } from '@/lib/goal-lab/probe/runProbe';
import { S_contest, S_defection } from '@/lib/goal-lab/probe/scenes';

// Step 1 (2026-06-19): the payoff scenes. These assert what the scenes
// EMPIRICALLY do on the chosen observable (act:prior), verified on the toy
// probe agent. They are harness/behavior contracts, not the frozen sign
// predictions (goal:control / defend_ally), which are tested by Phase 3 triage.

/** act:prior keys are `<target>:<verb>`; collect the verb tails. */
function verbs(actPriors: Record<string, number>): Set<string> {
  const out = new Set<string>();
  for (const k of Object.keys(actPriors)) {
    const v = k.split(':').pop();
    if (v) out.add(v);
  }
  return out;
}

/** Highest act:prior magnitude whose verb tail === `verb`. */
function priorOf(actPriors: Record<string, number>, verb: string): number {
  let best = 0;
  for (const [k, v] of Object.entries(actPriors)) if (k.split(':').pop() === verb) best = Math.max(best, v);
  return best;
}

describe('S_contest: scarce-resource contest expresses Power', () => {
  it('runs and surfaces negotiation/coercion verbs on act:prior', () => {
    const r = runProbe({ scene: S_contest, seeds: [1, 2, 3] });
    expect(r.ok).toBe(true);
    const v = verbs(r.actPriors);
    expect(['negotiate', 'command', 'threaten', 'confront', 'share_resource'].some(x => v.has(x))).toBe(true);
  });

  it('A_Power_Sovereignty 0.1→0.9 raises command and threaten', () => {
    const lo = runProbe({ scene: S_contest, axisOverrides: { A_Power_Sovereignty: 0.1 }, seeds: [1] }).actPriors;
    const hi = runProbe({ scene: S_contest, axisOverrides: { A_Power_Sovereignty: 0.9 }, seeds: [1] }).actPriors;
    // Power's real verbs are command / threaten (worklog: Power visible on act:prior).
    expect(priorOf(hi, 'command') - priorOf(lo, 'command')).toBeGreaterThan(0.1);
    expect(priorOf(hi, 'threaten') - priorOf(lo, 'threaten')).toBeGreaterThan(0.1);
  });
});

describe('S_defection: cooperation frame + documented observable limit', () => {
  it('runs and surfaces cooperation verbs on act:prior', () => {
    const r = runProbe({ scene: S_defection, seeds: [1, 2, 3] });
    expect(r.ok).toBe(true);
    const v = verbs(r.actPriors);
    expect(['share_resource', 'propose_trade', 'praise', 'help', 'guard', 'negotiate'].some(x => v.has(x))).toBe(true);
  });

  it('OBSERVABLE LIMIT: native defect verbs are absent from act:prior', () => {
    // The act:prior vocabulary (deriveActionPriors ∪ PERSONALITY_ACTION_MAP) is
    // prosocial-biased. betray/deceive/loot/defend_ally are NOT emitted, so
    // defection is only observable as reduced cooperation + harm/avoid/confront.
    // This guard documents the limit; extending the action map is a separate
    // (behavior-affecting) decision. See FALSIFICATION_LEDGER row OBS-VOCAB.
    const r = runProbe({ scene: S_defection, seeds: [1] });
    const v = verbs(r.actPriors);
    for (const defect of ['betray', 'deceive', 'loot', 'defend_ally']) {
      expect(v.has(defect), `${defect} unexpectedly present`).toBe(false);
    }
  });

  it('both scenes carry a scorer-facing payoff descriptor (not a pipeline input)', () => {
    expect(S_contest.payoff?.outcomes.fair_split).toEqual([5, 5]);
    expect(S_defection.payoff?.outcomes.both_cooperate).toEqual([3, 3]);
  });
});
