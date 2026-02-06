import { describe, expect, it } from "vitest";

import type { ContextAtom } from "@/lib/context/v2/types";
import type { Possibility } from "@/lib/context/possibilities/types";
import { decideAction } from "@/lib/decision/decide";
import { RNG } from "@/lib/core/noise";

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

    const possibilities: Possibility[] = [
      {
        id: "aff:hide",
        kind: "affordance",
        actionId: "hide",
        label: "hide",
        magnitude: 1,
        enabled: true,
        actionKey: "hide",
      } as any,
      {
        id: "aff:explore",
        kind: "affordance",
        actionId: "explore",
        label: "explore",
        magnitude: 1,
        enabled: true,
        actionKey: "explore",
      } as any,
    ];

    const res = decideAction({
      selfId,
      atoms,
      possibilities,
      rng: new RNG(123),
      temperature: 0.2,
    });

    expect(res.best?.p.actionId).toBe("hide");

    const actionAtom = res.best?.atoms?.find((a) => a.id.startsWith("action:"));
    const used = actionAtom?.trace?.usedAtomIds ?? [];
    expect(used.some((id) => id.startsWith("goal:"))).toBe(false);
    expect(used.some((id) => id.startsWith("util:"))).toBe(true);
  });
});
