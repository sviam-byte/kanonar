"""Phase 3 triage on the REAL roster (population sign-consistency).

Run:  python -m kanonar_behavior_lab.src.basis.roster_triage

Reads roster_sweep.csv (per-character δ-slope rows from lib/goal-lab/probe/
rosterSweep.ts) and, for each (axis, scene, readout), measures whether the sign
of the effect holds ACROSS the population:

  - STABLE signature: >= MIN_CHARS characters move it and >= STABLE_CONSISTENCY
    of them agree on the sign  -> the axis drives that readout robustly.
  - SIGN-FLIP: enough characters move it but they disagree on sign
    (consistency < FLIP_CONSISTENCY) -> context/character-dependent, a basis
    non-identifiability signal (the spine's compensations / trade-offs).

An axis absent from the sweep moved nothing > MOVE_EPS for any character
(candidate DEAD) — reported in `axes_with_no_movement` requires the axis list,
so here we simply report the axes that DID move; eyeball the expected-but-absent.
"""

from __future__ import annotations

import json
from typing import Any

import pandas as pd

from kanonar_behavior_lab.src.paths import REPORTS_DIR

SWEEP_CSV = REPORTS_DIR / "roster_sweep.csv"
TRIAGE_JSON = REPORTS_DIR / "roster_triage.json"

MIN_CHARS = 4
STABLE_CONSISTENCY = 0.80
FLIP_CONSISTENCY = 0.65


def run_triage() -> dict[str, Any]:
    df = pd.read_csv(SWEEP_CSV)
    n_roster = int(df["characterId"].nunique())
    report: dict[str, Any] = {"n_characters_in_sweep": n_roster, "axes": {}}

    for axis, axdf in df.groupby("axis"):
        sigs: list[dict[str, Any]] = []
        flips: list[dict[str, Any]] = []
        for (scene, readout), g in axdf.groupby(["scene", "readout"]):
            n = int(len(g))
            pos = int((g["sign"] > 0).sum())
            neg = int((g["sign"] < 0).sum())
            dom = 1 if pos >= neg else -1
            consistency = max(pos, neg) / n if n else 0.0
            mean_abs = float(g["slope"].abs().mean())
            row = {
                "scene": str(scene),
                "readout": str(readout),
                "n": n,
                "dominant_sign": dom,
                "consistency": round(consistency, 3),
                "mean_abs_slope": round(mean_abs, 4),
            }
            if n >= MIN_CHARS and consistency >= STABLE_CONSISTENCY:
                row["_score"] = n * consistency * mean_abs
                sigs.append(row)
            elif n >= MIN_CHARS and consistency < FLIP_CONSISTENCY:
                flips.append(row)

        sigs.sort(key=lambda r: r["_score"], reverse=True)
        for r in sigs:
            r.pop("_score", None)

        report["axes"][str(axis)] = {
            "status": "LIVE" if sigs else ("FLIP" if flips else "WEAK"),
            "stable_signatures": sigs[:6],
            "sign_flips": flips[:4],
        }

    TRIAGE_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    report = run_triage()
    print(f"roster: {report['n_characters_in_sweep']} characters\n")
    live = [a for a, e in report["axes"].items() if e["status"] == "LIVE"]
    flip = [a for a, e in report["axes"].items() if e["status"] == "FLIP"]
    print(f"LIVE axes: {len(live)}   FLIP-only axes: {len(flip)}   total moved: {len(report['axes'])}\n")
    for axis, e in sorted(report["axes"].items()):
        if e["status"] != "LIVE":
            continue
        print(f"{axis} [{e['status']}]")
        for s in e["stable_signatures"][:4]:
            arrow = "up" if s["dominant_sign"] > 0 else "dn"
            print(f"    {s['readout']:26} @ {s['scene']:12} {arrow} "
                  f"n={s['n']:2} cons={s['consistency']:.2f} |slope|={s['mean_abs_slope']:.3f}")
        for f in e["sign_flips"][:2]:
            print(f"    [FLIP] {f['readout']:22} @ {f['scene']:12} "
                  f"n={f['n']:2} cons={f['consistency']:.2f}")
    print(f"\nwrote {TRIAGE_JSON}")


if __name__ == "__main__":
    main()
