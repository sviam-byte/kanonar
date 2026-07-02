"""Triage of the T1.5 factorial (v3 pre-registered predictions).

Run:  python -m kanonar_behavior_lab.src.basis.outcome_triage_v3

Reads outcome_sweep_off.csv / outcome_sweep_on.csv (exported by
tests/goals/outcome_sweep_export.test.ts with OUTCOME_SWEEP=1) and grades each
frozen row of lib/goal-lab/probe/outcomeSignTableV3.ts.

Directions: up/down reuse triage._classify; 'flat' PASSes when the readout's
range is below the dead-band (a pre-registered NO-effect); 'interaction'
compares the endpoint delta between the @T0.1 and @T0.9 cells (NOISE-DOM).

V3_PREDICTIONS MIRROR outcomeSignTableV3.ts (frozen 2026-07-02). NOT edited to
match results — a miss is a ledger row.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from typing import Any

import pandas as pd

from kanonar_behavior_lab.src.paths import REPORTS_DIR
from kanonar_behavior_lab.src.basis.triage import EPS_DEAD, _classify, _series, _top_movers

CSV_BY_FLAG = {
    "off": REPORTS_DIR / "outcome_sweep_off.csv",
    "on": REPORTS_DIR / "outcome_sweep_on.csv",
}
TRIAGE_JSON = REPORTS_DIR / "outcome_triage_v3.json"


@dataclass(frozen=True)
class PredictionV3:
    flag: str        # 'on' | 'off'
    axis: str
    scene: str
    direction: str   # up | down | flat | interaction
    readout: str
    confidence: str


# Mirror of OUTCOME_SIGN_TABLE_V3 (frozen 2026-07-02).
V3_PREDICTIONS = [
    PredictionV3("off", "A_Power_Sovereignty", "S_contest", "flat", "outcome:self_favoring", "S"),
    PredictionV3("off", "A_Power_Sovereignty", "S_contest_pressure", "flat", "outcome:self_favoring", "W"),
    PredictionV3("on", "A_Power_Sovereignty", "S_contest", "flat", "outcome:self_favoring", "W"),
    PredictionV3("on", "A_Care_Compassion", "S_defection", "up", "coop_rate", "W"),
    PredictionV3("on", "A_Power_Sovereignty", "S_contest_pressure", "up", "outcome:self_favoring", "S"),
    PredictionV3("on", "A_Power_Sovereignty", "S_contest_pressure", "down", "outcome_mean_other", "W"),
    PredictionV3("on", "A_Care_Compassion", "S_defection_pressure", "up", "coop_rate", "W"),
    PredictionV3("on", "A_Liberty_Autonomy", "S_coercive_order", "up", "outcome:defied", "W"),
    PredictionV3("on", "A_Power_Sovereignty", "S_contest_pressure", "interaction", "outcome:self_favoring", "W"),
]


def _classify_flat(xs, ys) -> dict[str, Any]:
    if len(ys) == 0:
        # readout absent = label never chosen = zero probability everywhere:
        # that IS flat (labels with p=0 are not emitted into the CSV).
        return {"verdict": "PASS(flat: absent)", "range": 0.0}
    rng = float(ys.max() - ys.min())
    return {
        "verdict": "PASS(flat)" if rng < EPS_DEAD else "MOVED(not-flat)",
        "range": round(rng, 3),
        "delta": round(float(ys[-1] - ys[0]), 3),
    }


def _classify_interaction(df: pd.DataFrame, p: PredictionV3) -> dict[str, Any]:
    out: dict[str, Any] = {"cells": {}}
    deltas: dict[str, float] = {}
    for t in ("0.1", "0.9"):
        cell = f"{p.scene}@T{t}"
        grp = df[(df["axis"] == p.axis) & (df["scene"] == cell)]
        xs, ys = _series(grp, p.readout)
        d = float(ys[-1] - ys[0]) if len(ys) >= 2 else 0.0
        deltas[t] = d
        out["cells"][cell] = {"delta": round(d, 3), "points": int(len(ys))}
    # prediction: |slope| larger at low temperature
    out["verdict"] = "PASS" if abs(deltas["0.1"]) > abs(deltas["0.9"]) + EPS_DEAD else (
        "DEAD" if max(abs(deltas["0.1"]), abs(deltas["0.9"])) < EPS_DEAD else "MISLABELED"
    )
    return out


def run_triage() -> dict:
    frames = {flag: pd.read_csv(path) for flag, path in CSV_BY_FLAG.items()}
    report: dict = {"predictions": []}

    for p in V3_PREDICTIONS:
        df = frames[p.flag]
        if p.direction == "interaction":
            prereg = {"readout": p.readout, **_classify_interaction(df, p)}
            movers: list = []
        else:
            grp = df[(df["axis"] == p.axis) & (df["scene"] == p.scene)]
            xs, ys = _series(grp, p.readout)
            if p.direction == "flat":
                prereg = {"readout": p.readout, **_classify_flat(xs, ys)}
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
        elif "range" in pr:
            extra = f" range={pr['range']:.3f}" + (f" d={pr['delta']:+.3f}" if "delta" in pr else "")
        elif "cells" in pr:
            extra = " " + " ".join(f"{k}:d={v['delta']:+.3f}" for k, v in pr["cells"].items())
        print(f"[{e['flag']:3}] {e['axis']:22} @ {e['scene']:22} [{e['direction']:11} {e['confidence']}]  "
              f"'{pr['readout']}': {pr['verdict']}{extra}")
        for m in e["top_movers"][:4]:
            print(f"          mover {m['readout']:28} rho={m['rho']:+.2f} d={m['delta']:+.3f}")
    print(f"\nwrote {TRIAGE_JSON}")


if __name__ == "__main__":
    main()
