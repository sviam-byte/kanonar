"""Triage of the OUTCOME-layer (observable B) pre-registered predictions.

Run:  python -m kanonar_behavior_lab.src.basis.outcome_triage

Reads kanonar_behavior_lab/data/reports/outcome_sweep.csv (long-format from
lib/goal-lab/probe, OUTCOME layer per docs/SCENE_BATTERY_v1.md §0-B) and
reports a verdict per frozen v2 prediction, plus top movers and the S_neutral
leak control (S_neutral carries no game, so any OUTCOME row there is a bug).

V2_PREDICTIONS MIRROR lib/goal-lab/probe/outcomeSignTable.ts (frozen
2026-07-02). They are NOT edited to match results — a miss is a ledger row
(docs/FALSIFICATION_LEDGER.md B-POWER-OUTCOME / B-CARE-COOP), not a fix.
"""

from __future__ import annotations

import json
from dataclasses import asdict

import pandas as pd

from kanonar_behavior_lab.src.paths import REPORTS_DIR
from kanonar_behavior_lab.src.basis.triage import (
    CONTROL,
    Prediction,
    _classify,
    _series,
    _top_movers,
)

SWEEP_CSV = REPORTS_DIR / "outcome_sweep.csv"
TRIAGE_JSON = REPORTS_DIR / "outcome_triage.json"

# Mirror of outcomeSignTable.ts (frozen 2026-07-02). Readouts are exact tokens.
V2_PREDICTIONS = [
    Prediction("A_Power_Sovereignty", "S_contest", "up", "outcome:self_favoring", "S"),
    Prediction("A_Power_Sovereignty", "S_contest", "down", "outcome_mean_other", "W"),
    Prediction("A_Care_Compassion", "S_defection", "up", "coop_rate", "W"),
]


def run_triage() -> dict:
    df = pd.read_csv(SWEEP_CSV)
    report: dict = {"predictions": [], "control_outcome_rows": 0}

    # Control sanity: S_neutral must emit zero OUTCOME rows.
    ctrl_outcomes = df[(df["scene"] == CONTROL) & (df["layer"] == "OUTCOME")]
    report["control_outcome_rows"] = int(len(ctrl_outcomes))

    for p in V2_PREDICTIONS:
        grp = df[(df["axis"] == p.axis) & (df["scene"] == p.scene)]
        xs, ys = _series(grp, p.readout)
        prereg = {"readout": p.readout, **_classify(xs, ys, p.direction)}
        report["predictions"].append({
            **asdict(p),
            "prereg": prereg,
            "top_movers": _top_movers(grp[grp["layer"] == "OUTCOME"]),
        })

    TRIAGE_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    report = run_triage()
    print(f"S_neutral OUTCOME rows (must be 0): {report['control_outcome_rows']}")
    for e in report["predictions"]:
        pr = e["prereg"]
        extra = ""
        if "rho" in pr:
            extra = f" rho={pr['rho']:+.2f} d={pr['delta']:+.3f} range={pr['range']:.3f}"
        print(f"{e['axis']:24} @ {e['scene']:12} [{e['direction']:5} {e['confidence']}]  "
              f"prereg '{pr['readout']}': {pr['verdict']}{extra}")
        for m in e["top_movers"][:5]:
            print(f"        mover {m['readout']:28} rho={m['rho']:+.2f} d={m['delta']:+.3f}")
    print(f"\nwrote {TRIAGE_JSON}")


if __name__ == "__main__":
    main()
