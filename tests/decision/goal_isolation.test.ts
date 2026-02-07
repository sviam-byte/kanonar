import { describe, expect, it } from "vitest";

import type { ContextAtom } from "@/lib/context/v2/types";
import type { ActionCandidate } from "@/lib/decision/actionCandidate";
import { decideAction } from "@/lib/decision/decide";

function mkAtom(id: string, magnitude: number): ContextAtom {
  const ns: ContextAtom["ns"] = id.startsWith("goal:")
    ? "goal"
    : id.startsWith("util:")
      ? "util"
      : id.startsWith("ctx:")
        ? "ctx"
        : "world";

  return {
    id,
    kind: "scalar",
    ns,
    source: { origin: "derived" } as any,
    magnitude,
  };
}

describe("decision: goal atoms are isolated", () => {
  it("does not leak goal atoms into action trace.usedAtomIds", () => {
    const selfId = "A";
    const atoms: ContextAtom[] = [
      mkAtom("ctx:threat:A", 0.9),
      mkAtom("ctx:resource:A", 0.2),

      // Goal atoms (should not end up inside actionAtom.trace.usedAtomIds)
      mkAtom("goal:domain:safety:A", 0.8),
      mkAtom("goal:planTag:hide:A", 1.0),
      mkAtom("goal:planTag:explore:A", 0.1),

      // Util projections (these are allowed to influence Action-layer scoring).
      mkAtom("util:active:safety:A", 0.8),
      mkAtom("util:activeGoal:A:hide", 1.0),
      mkAtom("util:hint:allow:hide:hide", 1.0),
    ];

    const res = decideAction({
      actions: [
        {
          id: "action:hide",
          kind: "hide",
          actorId: selfId,
          deltaGoals: { hide: 1 },
          cost: 0,
          confidence: 1,
          supportAtoms: atoms,
        },
        {
          id: "action:explore",
          kind: "explore",
          actorId: selfId,
          deltaGoals: { explore: 0.2 },
          cost: 0,
          confidence: 1,
          supportAtoms: atoms,
        },
      ] as ActionCandidate[],
      goalEnergy: { hide: 1, explore: 0.2 },
      rng: () => 0.5,
      temperature: 0.2,
    });

    expect(res.best?.id).toBe("action:hide");

    const actionAtom = res.atoms.find((a) => a.id.startsWith("action:score:"));
    const used = actionAtom?.trace?.usedAtomIds ?? [];
    expect(used.some((id) => id.startsWith("goal:"))).toBe(false);
    expect(used.some((id) => id.startsWith("util:"))).toBe(true);
  });
});
