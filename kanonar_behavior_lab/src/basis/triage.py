"""Phase 3 triage of the static-basis sign-audit.

Run:  python -m kanonar_behavior_lab.src.basis.triage

Reads kanonar_behavior_lab/data/reports/basis_sweep.csv (long-format
{axis,value,scene,layer,readout,result} from lib/goal-lab/probe) and, for each
PRE-REGISTERED prediction, reports:

  - verdict on the literally pre-registered readout (catches mis-specified
    readout LAYER, e.g. an axis that is dead on goal-domain but alive on act:prior);
  - the top data-driven movers in that scene (where the construct actually
    expresses), with Spearman rho and endpoint delta;
  - a scene-leak check against the S_neutral control.

The ACTIVE_PREDICTIONS below MIRROR lib/goal-lab/probe/signTable.ts (frozen
2026-06-18). They are NOT edited to match results — a missed prediction is a
finding to record.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from kanonar_behavior_lab.src.paths import REPORTS_DIR

SWEEP_CSV = REPORTS_DIR / "basis_sweep.csv"
TRIAGE_JSON = REPORTS_DIR / "basis_triage.json"

EPS_DEAD = 0.03      # range below this = no movement
MONO_RHO = 0.90      # |Spearman| above this = monotone
ENTROPY_PASS = 0.30  # action_entropy range above this = variance prediction holds
CONTROL = "S_neutral"


@dataclass(frozen=True)
class Prediction:
    axis: str
    scene: str
    direction: str   # up | down | inverted_u | variance | interaction
    readout: str     # pre-registered target token(s), '|' = alternatives
    confidence: str


# Mirror of signTable.ts active rows (frozen 2026-06-18).
ACTIVE_PREDICTIONS = [
    Prediction("A_Care_Compassion", "S_vulnerable", "up", "goal:affiliation", "S"),
    Prediction("A_Power_Sovereignty", "S_hierarchy", "up", "act:dominate|assert", "S"),
    Prediction("A_Safety_Care", "S_threat", "up", "goal:safety", "S"),
    Prediction("A_Liberty_Autonomy", "S_hierarchy", "up", "act:challenge_authority", "S"),
    Prediction("C_betrayal_cost", "S_threat", "inverted_u", "goal:safety", "W"),
    Prediction("B_decision_temperature", "S_neutral", "variance", "action_entropy", "S"),
    Prediction("D_HPA_reactivity", "S_threat", "interaction", "stress->behavior slope", "W"),
]


def _tokens(readout: str) -> list[str]:
    toks: list[str] = []
    for raw in readout.replace("act:", "").replace("goal:", "").split("|"):
        raw = raw.strip()
        if not raw:
            continue
        toks.append(raw)
        if "_" in raw:
            toks.append(raw.split("_")[0])  # 'challenge_authority' -> 'challenge'
    return toks


def _series(group: pd.DataFrame, readout: str) -> tuple[np.ndarray, np.ndarray]:
    sub = group[group["readout"] == readout].sort_values("value")
    return sub["value"].to_numpy(float), sub["result"].to_numpy(float)


def _rho(xs: np.ndarray, ys: np.ndarray) -> float:
    if len(xs) < 3 or np.allclose(ys, ys[0]):
        return 0.0
    r = spearmanr(xs, ys).correlation
    return float(r) if np.isfinite(r) else 0.0


def _cliff(ys: np.ndarray) -> bool:
    if len(ys) < 3:
        return False
    rng = float(ys.max() - ys.min())
    if rng < EPS_DEAD:
        return False
    steps = np.abs(np.diff(ys))
    clamped = ys.min() <= 1e-6 or ys.max() >= 0.999
    return bool(steps.max() > 0.6 * rng and clamped)


def _classify(xs: np.ndarray, ys: np.ndarray, direction: str) -> dict[str, Any]:
    if len(ys) == 0:
        return {"verdict": "READOUT_ABSENT"}
    rng = float(ys.max() - ys.min())
    rho = _rho(xs, ys)
    delta = float(ys[-1] - ys[0])
    flags = ["BUG?"] if _cliff(ys) else []

    if direction == "variance":
        verdict = "PASS" if rng >= ENTROPY_PASS else "DEAD"
    elif rng < EPS_DEAD:
        verdict = "DEAD"
    elif direction == "inverted_u":
        verdict = "NON_MONOTONE(as-pred)" if abs(rho) < MONO_RHO else "MONOTONE(not-inv-U)"
    elif abs(rho) < MONO_RHO:
        verdict = "NON_MONOTONE"
    else:
        expected = 1 if direction == "up" else -1
        verdict = "PASS" if np.sign(rho) == expected else "MISLABELED"

    return {"verdict": verdict, "rho": round(rho, 3), "delta": round(delta, 3),
            "range": round(rng, 3), "flags": flags}


def _top_movers(group: pd.DataFrame, k: int = 6) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for readout in group["readout"].unique():
        xs, ys = _series(group, readout)
        if len(ys) < 3:
            continue
        rng = float(ys.max() - ys.min())
        if rng < EPS_DEAD:
            continue
        rho = _rho(xs, ys)
        rows.append({"readout": readout, "rho": round(rho, 3),
                     "delta": round(float(ys[-1] - ys[0]), 3), "range": round(rng, 3),
                     "_score": abs(rho) * rng})
    rows.sort(key=lambda r: r["_score"], reverse=True)
    for r in rows:
        r.pop("_score", None)
    return rows[:k]


def run_triage() -> dict[str, Any]:
    df = pd.read_csv(SWEEP_CSV)
    report: dict[str, Any] = {"predictions": []}

    for p in ACTIVE_PREDICTIONS:
        scene_grp = df[(df["axis"] == p.axis) & (df["scene"] == p.scene)]
        ctrl_grp = df[(df["axis"] == p.axis) & (df["scene"] == CONTROL)]

        if p.direction == "interaction":
            entry = {**asdict(p), "prereg": {"verdict": "INTERACTION_SKIP"}, "top_movers": []}
            report["predictions"].append(entry)
            continue

        # Verdict on the literally pre-registered readout(s).
        toks = _tokens(p.readout)

        def _matches(r: str) -> bool:
            # Exact pre-registered target: r == token, r ends with ':<verb>'
            # (act:prior verbs), or r is the goal-domain 'goal:<token>'.
            return any(r == t or r.endswith(":" + t) or r == "goal:" + t for t in toks)

        matched = [r for r in scene_grp["readout"].unique() if _matches(r)]
        if matched:
            def _rng_of(r: str) -> float:
                ys = _series(scene_grp, r)[1]
                return float(ys.max() - ys.min()) if len(ys) else 0.0
            primary = max(matched, key=_rng_of)
            xs, ys = _series(scene_grp, primary)
            prereg = {"readout": primary, **_classify(xs, ys, p.direction)}
            # leak check
            cxs, cys = _series(ctrl_grp, primary)
            if len(cys) >= 3:
                crng = float(cys.max() - cys.min())
                prereg["control_range"] = round(crng, 3)
                if crng > 0.5 * max(EPS_DEAD, prereg.get("range", 0)):
                    prereg.setdefault("flags", []).append("LEAK")
        else:
            prereg = {"verdict": "READOUT_ABSENT", "matched": []}

        report["predictions"].append({
            **asdict(p),
            "prereg": prereg,
            "top_movers": _top_movers(scene_grp),
        })

    TRIAGE_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    report = run_triage()
    for e in report["predictions"]:
        pr = e["prereg"]
        v = pr.get("verdict", "?")
        head = f"{e['axis']:24} @ {e['scene']:12} [{e['direction']:11} {e['confidence']}]"
        extra = ""
        if "rho" in pr:
            extra = f" rho={pr['rho']:+.2f} d={pr['delta']:+.3f} range={pr['range']:.3f}"
        flags = pr.get("flags", [])
        print(f"{head}  prereg '{pr.get('readout', e['readout'])}': {v}{extra}"
              + (f"  {flags}" if flags else ""))
        for m in e["top_movers"][:5]:
            print(f"        mover {m['readout']:28} rho={m['rho']:+.2f} d={m['delta']:+.3f}")
    print(f"\nwrote {TRIAGE_JSON}")


if __name__ == "__main__":
    main()
