"""Calibrate the frozen d_eff estimator against synthetic systems.

Run:  python -m kanonar_behavior_lab.src.dynamics.calibrate

Hard anchors (estimator FAILS, non-zero exit, if any of these miss):
  - participation_ratio recovers the linear rank of Gaussian blobs;
  - correlation_dimension recovers textbook fractal dimensions on
    Lorenz / Rossler / Henon / logistic map;
  - correlation_dimension does NOT collapse white noise to low dimension.

Soft readouts (reported, never fail): the delay-embedded correlation
dimension of each scalar observable, and the control systems' values.

Writes a long-format table (system, estimator, readout, value, known, band,
passed) to CSV + JSON for the fc analytics stack.
"""

from __future__ import annotations

import csv
import json
import sys
from dataclasses import dataclass
from typing import Any

import numpy as np

from kanonar_behavior_lab.src.paths import (
    DYNAMICS_CALIBRATION_CSV,
    DYNAMICS_CALIBRATION_JSON,
    ensure_output_dirs,
)
from kanonar_behavior_lab.src.dynamics import synthetic as syn
from kanonar_behavior_lab.src.dynamics.estimators import (
    correlation_dimension,
    correlation_dimension_embedded,
    participation_ratio,
)


@dataclass
class Record:
    system: str
    regime: str
    estimator: str
    readout: str
    value: float
    known: float | None
    lo: float | None
    hi: float | None
    hard: bool

    @property
    def passed(self) -> bool | None:
        if self.lo is None or self.hi is None:
            return None
        return bool(self.lo <= self.value <= self.hi)


def _pr_anchors() -> list[Record]:
    out: list[Record] = []
    for rank, tol in ((1, 0.3), (3, 0.7), (5, 0.9)):
        data = syn.gaussian_blob(rank=rank, ambient=8)
        pr = participation_ratio(data)
        out.append(
            Record(f"gaussian_rank{rank}", "linear", "participation_ratio", "PR",
                   pr, float(rank), rank - tol, rank + tol, hard=True)
        )
    return out


def _corr_dim_anchors() -> list[Record]:
    # Per-system tolerance bands around textbook correlation dimension.
    bands = {
        "lorenz": 0.35,
        "rossler": 0.35,
        "henon": 0.30,
        "logistic_r4": 0.25,
    }
    out: list[Record] = []
    for sys_obj in syn.battery():
        native = correlation_dimension(sys_obj.data)
        if sys_obj.name in bands and sys_obj.known_d2 is not None:
            tol = bands[sys_obj.name]
            out.append(
                Record(sys_obj.name, sys_obj.regime, "correlation_dimension", "D2_native",
                       native.d2, sys_obj.known_d2, sys_obj.known_d2 - tol,
                       sys_obj.known_d2 + tol, hard=True)
            )
        elif sys_obj.name == "white_noise":
            # Control: stochastic noise must NOT collapse to low dimension.
            out.append(
                Record(sys_obj.name, sys_obj.regime, "correlation_dimension", "D2_native",
                       native.d2, None, 2.5, float("inf"), hard=True)
            )
        else:
            # periodic / ar1: report only.
            out.append(
                Record(sys_obj.name, sys_obj.regime, "correlation_dimension", "D2_native",
                       native.d2, sys_obj.known_d2, None, None, hard=False)
            )

        # Soft: the delay-embedded scalar path (what Kanonar observables will use).
        try:
            embedded = correlation_dimension_embedded(sys_obj.observable)
            emb_val = embedded.d2
        except ValueError:
            emb_val = float("nan")
        out.append(
            Record(sys_obj.name, sys_obj.regime, "correlation_dimension", "D2_embedded",
                   emb_val, sys_obj.known_d2, None, None, hard=False)
        )
    return out


def run_calibration() -> dict[str, Any]:
    ensure_output_dirs()
    records = _pr_anchors() + _corr_dim_anchors()

    rows = [
        {
            "system": r.system,
            "regime": r.regime,
            "estimator": r.estimator,
            "readout": r.readout,
            "value": round(r.value, 4) if np.isfinite(r.value) else None,
            "known": r.known,
            "lo": None if r.lo is None else (None if not np.isfinite(r.lo) else round(r.lo, 4)),
            "hi": None if r.hi is None else (None if not np.isfinite(r.hi) else round(r.hi, 4)),
            "hard": r.hard,
            "passed": r.passed,
        }
        for r in records
    ]

    hard = [r for r in records if r.hard]
    failures = [r for r in hard if r.passed is False]
    report = {
        "n_hard_anchors": len(hard),
        "n_failures": len(failures),
        "all_hard_passed": len(failures) == 0,
        "failures": [r.readout + ":" + r.system for r in failures],
        "rows": rows,
    }

    DYNAMICS_CALIBRATION_JSON.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    with DYNAMICS_CALIBRATION_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return report


def _fmt(x: Any) -> str:
    if x is None:
        return "   -  "
    if isinstance(x, float):
        return f"{x:6.3f}"
    return str(x)


def main() -> int:
    report = run_calibration()
    print(f"{'system':16} {'estimator':22} {'readout':12} "
          f"{'value':>7} {'known':>7} {'band':>16} {'hard':>5} {'pass':>5}")
    for row in report["rows"]:
        band = "   -  " if row["lo"] is None else f"[{_fmt(row['lo']).strip()},{_fmt(row['hi']).strip()}]"
        passed = {True: "PASS", False: "FAIL", None: " -- "}[row["passed"]]
        print(f"{row['system']:16} {row['estimator']:22} {row['readout']:12} "
              f"{_fmt(row['value'])} {_fmt(row['known'])} {band:>16} "
              f"{str(row['hard']):>5} {passed:>5}")
    print(f"\nhard anchors: {report['n_hard_anchors']}  "
          f"failures: {report['n_failures']}  "
          f"all_hard_passed: {report['all_hard_passed']}")
    print(f"wrote {DYNAMICS_CALIBRATION_CSV}")
    print(f"wrote {DYNAMICS_CALIBRATION_JSON}")
    return 0 if report["all_hard_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
