"""Triage of the v4 directional cells (post ORDER-PRIOR-POSS reorder).

Run:  python -m kanonar_behavior_lab.src.basis.outcome_triage_v4

Reads outcome_sweep_on_v4.csv (32 seeds, exported with OUTCOME_SWEEP=1 after
the v4 freeze). V4_PREDICTIONS MIRROR lib/goal-lab/probe/outcomeSignTableV4.ts
(frozen 2026-07-02). NOT edited to match results.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from typing import Any

import pandas as pd

from kanonar_behavior_lab.src.paths import REPORTS_DIR
from kanonar_behavior_lab.src.basis.triage import EPS_DEAD, _classify, _series, _top_movers

SWEEP_CSV = REPORTS_DIR / "outcome_sweep_on_v4.csv"
TRIAGE_JSON = REPORTS_DIR / "outcome_triage_v4.json"


@dataclass(frozen=True)
class PredictionV4:
    axis: str
    scene: str
    direction: str
    readout: str
    confidence: str


V4_PREDICTIONS = [
    PredictionV4("A_Care_Compassion", "S_defection", "up", "coop_rate", "W"),
    PredictionV4("A_Power_Sovereignty", "S_contest_pressure", "up", "outcome:self_favoring", "S"),
    PredictionV4("A_Power_Sovereignty", "S_contest_pressure", "down", "outcome_mean_other", "W"),
    PredictionV4("A_Care_Compassion", "S_defection_pressure", "up", "coop_rate", "W"),
    PredictionV4("A_Liberty_Autonomy", "S_coercive_order", "up", "outcome:defied", "W"),
    PredictionV4("A_Power_Sovereignty", "S_contest_pressure", "interaction", "outcome:self_favoring", "W"),
]


def _classify_interaction(df: pd.DataFrame, p: PredictionV4) -> dict[str, Any]:
    out: dict[str, Any] = {"cells": {}}
    deltas: dict[str, float] = {}
    for t in ("0.1", "0.9"):
        cell = f"{p.scene}@T{t}"
        grp = df[(df["axis"] == p.axis) & (df["scene"] == cell)]
        xs, ys = _series(grp, p.readout)
        d = float(ys[-1] - ys[0]) if len(ys) >= 2 else 0.0
        deltas[t] = d
        out["cells"][cell] = {"delta": round(d, 3), "points": int(len(ys))}
    out["verdict"] = "PASS" if abs(deltas["0.1"]) > abs(deltas["0.9"]) + EPS_DEAD else (
        "DEAD" if max(abs(deltas["0.1"]), abs(deltas["0.9"])) < EPS_DEAD else "MISLABELED"
    )
    return out


def run_triage() -> dict:
    df = pd.read_csv(SWEEP_CSV)
    report: dict = {"predictions": []}
    for p in V4_PREDICTIONS:
        if p.direction == "interaction":
            prereg = {"readout": p.readout, **_classify_interaction(df, p)}
            movers: list = []
        else:
            grp = df[(df["axis"] == p.axis) & (df["scene"] == p.scene)]
            xs, ys = _series(grp, p.readout)
            if len(ys) == 0:
                prereg = {"readout": p.readout, "verdict": "READOUT_ABSENT"}
            else:
                prereg = {"readout": p.readout, **_classify(xs, ys, p.direction)}
            movers = _top_movers(grp[grp["layer"] == "OUTCOME"])
        report["predictions"].append({**asdict(p), "prereg": prereg, "top_movers": movers})
    TRIAGE_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    report = run_triage()
    for e in report["predictions"]:
        pr = e["prereg"]
        extra = ""
        if "rho" in pr:
            extra = f" rho={pr['rho']:+.2f} d={pr['delta']:+.3f} range={pr['range']:.3f}"
        elif "cells" in pr:
            extra = " " + " ".join(f"{k}:d={v['delta']:+.3f}" for k, v in pr["cells"].items())
        print(f"{e['axis']:22} @ {e['scene']:22} [{e['direction']:11} {e['confidence']}]  "
              f"'{pr['readout']}': {pr['verdict']}{extra}")
        for m in e["top_movers"][:4]:
            print(f"        mover {m['readout']:28} rho={m['rho']:+.2f} d={m['delta']:+.3f}")
    print(f"\nwrote {TRIAGE_JSON}")


if __name__ == "__main__":
    main()
