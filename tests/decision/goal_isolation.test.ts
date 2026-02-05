import { describe, expect, it } from "vitest";

import type { ContextAtom } from "@/lib/context/v2/types";
import type { Possibility } from "@/lib/context/possibilities/types";
import { decideAction } from "@/lib/decision/decide";
import { makeRng } from "@/lib/simkit/core/rng";

function mkAtom(id: string, magnitude: number): ContextAtom {
  const ns: ContextAtom["ns"] = id.startsWith("goal:")
    ? "goal"
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
    ];

    const possibilities: Possibility[] = [
      {
        actionId: "hide",
        planTags: ["hide"],
        label: "hide",
        params: {},
      },
      {
        actionId: "explore",
        planTags: ["explore"],
        label: "explore",
        params: {},
      },
    ];

    const res = decideAction({
      selfId,
      atoms,
      possibilities,
      rng: makeRng(123),
      temperature: 0.2,
    });

    expect(res.best?.actionId).toBe("hide");

    const actionAtom = res.best?.atoms?.find((a) => a.id.startsWith("action:"));
    const used = actionAtom?.trace?.usedAtomIds ?? [];
    expect(used.some((id) => id.startsWith("goal:"))).toBe(false);
  });
});
