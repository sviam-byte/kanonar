"""Triage of the v4 directional cells (post ORDER-PRIOR-POSS reorder).

Run:  python -m kanonar_behavior_lab.src.basis.outcome_triage_v4

Reads outcome_sweep_on_v4.csv (32 seeds, exported with OUTCOME_SWEEP=1 after
the v4 freeze). V4_PREDICTIONS MIRROR lib/goal-lab/probe/outcomeSignTableV4.ts
(frozen 2026-07-02). NOT edited to match results.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, asdict
from typing import Any

import numpy as np
import pandas as pd

from kanonar_behavior_lab.src.paths import REPORTS_DIR
from kanonar_behavior_lab.src.basis.triage import (
    EPS_DEAD,
    MONO_RHO,
    _classify,
    _rho,
    _series,
    _top_movers,
)

SWEEP_CSV = REPORTS_DIR / "outcome_sweep_on_v4.csv"
TRIAGE_JSON = REPORTS_DIR / "outcome_triage_v4.json"
V4_FREEZE_COMMIT = "3b50ab0a744f1b8f30914af598a35fd9687b0118"
V4_SEEDS = list(range(1, 33))
# Сохраняем замороженный порог эффекта, но применяем его к настоящим OLS slopes.
INTERACTION_SLOPE_MARGIN = EPS_DEAD


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


def _ols_slope(xs: np.ndarray, ys: np.ndarray) -> float:
    """OLS slope со свободным членом по всем доступным точкам оси."""
    if len(xs) < 2 or len(xs) != len(ys):
        return 0.0
    centered_x = xs - xs.mean()
    denominator = float(np.dot(centered_x, centered_x))
    if denominator <= 0:
        return 0.0
    return float(np.dot(centered_x, ys - ys.mean()) / denominator)


def _classify_interaction(df: pd.DataFrame, p: PredictionV4) -> dict[str, Any]:
    out: dict[str, Any] = {"cells": {}}
    slopes: dict[str, float] = {}
    for t in ("0.1", "0.9"):
        cell = f"{p.scene}@T{t}"
        grp = df[(df["axis"] == p.axis) & (df["scene"] == cell)]
        xs, ys = _series(grp, p.readout)
        slope = _ols_slope(xs, ys)
        slopes[t] = slope
        endpoint_delta = float(ys[-1] - ys[0]) if len(ys) >= 2 else 0.0
        out["cells"][cell] = {
            "slope": round(slope, 3),
            "endpoint_delta": round(endpoint_delta, 3),
            "rho": round(_rho(xs, ys), 3),
            "points": int(len(ys)),
        }

    slope_difference = slopes["0.1"] - slopes["0.9"]
    out["slope_difference"] = round(slope_difference, 3)
    if max(abs(slopes["0.1"]), abs(slopes["0.9"])) < EPS_DEAD:
        out["verdict"] = "DEAD"
    elif slopes["0.1"] > 0 and slope_difference > INTERACTION_SLOPE_MARGIN:
        out["verdict"] = "PASS"
    else:
        out["verdict"] = "MISLABELED"
    return out


def run_triage() -> dict:
    df = pd.read_csv(SWEEP_CSV)
    report: dict = {
        "metadata": {
            "schema_version": 2,
            "generated_by": "kanonar_behavior_lab.src.basis.outcome_triage_v4",
            "source_freeze_commit": V4_FREEZE_COMMIT,
            "input_csv": SWEEP_CSV.name,
            "input_sha256": hashlib.sha256(SWEEP_CSV.read_bytes()).hexdigest(),
            "observation_level": "axis-cell aggregates; per-seed outcomes are not retained",
            "seeds": V4_SEEDS,
            "axis_values": sorted(float(v) for v in df["value"].unique()),
            "classification": {
                "eps_dead": EPS_DEAD,
                "mono_rho": MONO_RHO,
                "interaction_model": "OLS slope with intercept over all axis points",
                "interaction_slope_margin": INTERACTION_SLOPE_MARGIN,
            },
        },
        "predictions": [],
    }
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
            extra = " " + " ".join(f"{k}:slope={v['slope']:+.3f}" for k, v in pr["cells"].items())
        print(f"{e['axis']:22} @ {e['scene']:22} [{e['direction']:11} {e['confidence']}]  "
              f"'{pr['readout']}': {pr['verdict']}{extra}")
        for m in e["top_movers"][:4]:
            print(f"        mover {m['readout']:28} rho={m['rho']:+.2f} d={m['delta']:+.3f}")
    print(f"\nwrote {TRIAGE_JSON}")


if __name__ == "__main__":
    main()
