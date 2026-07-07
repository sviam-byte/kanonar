// tests/simkit/mvp0_location_sign.test.ts
//
// I-2.4 Location v1 observation — the A4 location half (KANONAR_TZ §4:
// "предметы и локации — контекстные факторы, меняющие меню и исходы").
// Runs ONLY with MVP0_LOC=1, AFTER the freeze commit; writes
// kanonar_behavior_lab/data/reports/mvp0_location_sign.json.
//
// PRE-REGISTERED (frozen with this file, BEFORE the observation):
//
// Cell A4-LOC (location causality on outcomes; FC.location.propsV1 ON in BOTH
// arms; no threat, no object/communication flags; the ONLY manipulated knob is
// the scene location's `privacy` property):
//   arm P = makeMvp0World (test.safe_room, privacy 'private' in data/locations)
//   arm Q = same world, setLocationPrivacyTransform('public')
//   Readout: BOTH agents at tick 1, pooled (declared now: agents are
//   exchangeable by construction — identical 0.5-baseline entities in the same
//   location; pooling doubles n to 64 readouts per arm).
//   AFFILIATIVE class (frozen now; `talk` deliberately EXCLUDED — it is the
//   q-dominant default, and the mechanism claim is that intimacy lifts
//   high-Δg(affiliation) verbs OVER talk):
//     {help, comfort, encourage, praise, confide, treat, share, cooperate}
//   Mechanism (trace, frozen as the claim): private ⇒ ctx:privacy 0.7·1,
//   ctx:intimacy ↑ ⇒ attachment signal (intimacy·0.85 + privacy·0.25) ⇒
//   affiliation goal energy (attachment·1.2) ⇒ Δg(affiliation) ranks
//   help(0.087) > negotiate(0.061) > talk(0.033) ⇒ affiliative share rises.
//   Prediction: dAffiliative = p(affiliative | private) − p(| public) ≥ +0.10
//   @32 seeds × 2 agents (A4 min-PASS bar, KANONAR_TZ §4 frozen v1 numbers).
// Declared risks (recorded now, not after): (a) saturation — the base scene is
// already prosocial/help-heavy, headroom may compress the delta; (b) the known
// q-dominance wall (talk q≈1.05, Gumbel std 1.28). Grading note (declared
// now): if the sign fires but < 0.10, grade DIRECTIONAL-UNDER-BAR — record,
// do not re-run without a versioned change.

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { FC } from '../../lib/config/formulaConfig';
import { SimKitSimulator } from '../../lib/simkit/core/simulator';
import { makeGoalLabDeciderPlugin } from '../../lib/simkit/plugins/goalLabDeciderPlugin';
import { makeGoalLabPipelinePlugin } from '../../lib/simkit/plugins/goalLabPipelinePlugin';
import { makePerceptionMemoryPlugin } from '../../lib/simkit/plugins/perceptionMemoryPlugin';
import { makeMvp0World, MVP0_AGENT_A, MVP0_AGENT_B } from '../../lib/simkit/scenarios/mvp0Scene';
import { setLocationPrivacyTransform } from '../../lib/simkit/mvp0/runTwins';
import type { SimWorld } from '../../lib/simkit/core/types';

const RUN = process.env.MVP0_LOC === '1';
const REPORTS = path.resolve(__dirname, '../../kanonar_behavior_lab/data/reports');

// Frozen with THIS file.
const AFFILIATIVE = new Set(['help', 'comfort', 'encourage', 'praise', 'confide', 'treat', 'share', 'cooperate']);

type Readout = { seed: number; agentId: string; kind: string };

/** One run per seed per arm; readout = both agents' applied action at tick 1. */
function runTick1Both(seed: number, transform: ((w: SimWorld) => SimWorld) | null): Readout[] {
  const base = makeMvp0World(seed);
  const sim = new SimKitSimulator({
    scenarioId: 'locsign',
    seed,
    initialWorld: transform ? transform(base) : base,
    plugins: [
      makeGoalLabDeciderPlugin({ storePipeline: false }),
      makeGoalLabPipelinePlugin(),
      makePerceptionMemoryPlugin(),
    ],
    maxRecords: 8,
  });
  sim.step();
  const rec = sim.step();
  return [MVP0_AGENT_A, MVP0_AGENT_B].map((agentId) => {
    const applied: any = (rec.trace.actionsApplied || []).find((a: any) => String(a?.actorId) === agentId) ?? null;
    return { seed, agentId, kind: String(applied?.meta?.goalLabKind ?? applied?.kind ?? '') };
  });
}

const share = (rows: Readout[], cls: Set<string>) => rows.filter((r) => cls.has(r.kind)).length / rows.length;
const countBy = (rows: Readout[]) => {
  const m: Record<string, number> = {};
  for (const r of rows) m[r.kind] = (m[r.kind] ?? 0) + 1;
  return m;
};

describe.runIf(RUN)('Location v1 observation (32 seeds, pre-registered)', () => {
  it('cell A4-LOC; writes the report', () => {
    const locFlag = (FC as any).location.propsV1;
    const seeds = Array.from({ length: 32 }, (_, i) => i + 1);

    locFlag.enabled = true;
    let priv: Readout[], pub: Readout[];
    try {
      priv = seeds.flatMap((s) => runTick1Both(s, null));
      pub = seeds.flatMap((s) => runTick1Both(s, setLocationPrivacyTransform('public')));
    } finally {
      locFlag.enabled = false;
    }

    const dAffiliative = share(priv, AFFILIATIVE) - share(pub, AFFILIATIVE);

    const report = {
      metadata: {
        generated_by: 'tests/simkit/mvp0_location_sign.test.ts',
        date: new Date().toISOString().slice(0, 10),
        seeds,
        scene: 'makeMvp0World (test.safe_room), single knob: location privacy private↔public',
        readout: 'both agents pooled at tick 1 (declared at freeze: exchangeable by construction)',
        frozen_predictions: {
          A4_LOC: 'dAffiliative = p(affiliative | private) − p(| public) ≥ +0.10 @32 seeds × 2 agents',
          affiliative_class: [...AFFILIATIVE].sort(),
        },
      },
      cellA4Loc: {
        p_private: { affiliative: share(priv, AFFILIATIVE) },
        p_public: { affiliative: share(pub, AFFILIATIVE) },
        dAffiliative,
        kinds_private: countBy(priv),
        kinds_public: countBy(pub),
        signs_observed: { A4_LOC_sign: dAffiliative > 0, A4_LOC_bar: dAffiliative >= 0.1 },
      },
    };

    writeFileSync(path.join(REPORTS, 'mvp0_location_sign.json'), JSON.stringify(report, null, 1), 'utf8');
    console.log(
      'A4-LOC:', JSON.stringify(report.cellA4Loc.signs_observed),
      'dAff =', dAffiliative.toFixed(3),
      'private:', JSON.stringify(report.cellA4Loc.kinds_private),
      'public:', JSON.stringify(report.cellA4Loc.kinds_public),
    );

    expect(priv).toHaveLength(64);
    expect(pub).toHaveLength(64);
  }, 600000);
});
