"""Seed-aware re-grade of the v4 interaction cell (WP-A / I-0.1).

FROZEN ESTIMATOR (2026-07-05, committed BEFORE the per-seed re-run; not edited
to match a run — grading-estimator discipline):

  y_{c,s}(x)   indicator of outcome:self_favoring for cell c in {T0.1, T0.9},
               seed s, axis value x on the frozen grid linspace(0,1,7).
               A missing per-seed row at an attested grid point is a
               STRUCTURAL ZERO (p=0 labels are never emitted), not missing data.

  b_{c,s}      OLS slope with intercept over the grid:
               b = sum_i (x_i - xbar)(y_i - ybar) / sum_i (x_i - xbar)^2

  d_s          = b_{T0.1,s} - b_{T0.9,s}
               PAIRED by seed: CRN — the same seed drives the same
               decision-noise stream in both temperature cells, so the
               contrast cancels seed-level noise (variance reduction).

  D            = mean_s d_s
               By linearity of OLS in y, D is EXACTLY the aggregate slope
               difference of outcome_triage_v4.py on the same run — checked
               against outcome_sweep_on_v4.csv as a hard gate, not assumed.

  CI           percentile bootstrap over seeds: B = 10000 resamples with
               replacement of (d_1..d_S), statistic = mean,
               rng = numpy default_rng(20260705), CI = [2.5%, 97.5%].

  Verdict (v4 frozen prediction, row 6: slope larger at T0.1 than at T0.9):
    INVALID_DESIGN  any gate fails: grid != 7 points, seed count != 32 per
                    (cell, value), seed sets differ anywhere, or the
                    aggregate-consistency identity breaks (> 1e-9);
    DEAD            max(|mean_s b_{T0.1,s}|, |mean_s b_{T0.9,s}|) < EPS_DEAD;
    PASS            mean_s b_{T0.1,s} > 0  AND  D > EPS_DEAD  AND  CI_lo > 0;
    MISLABELED      otherwise.

  Thresholds are inherited, not new: EPS_DEAD = 0.03 (triage.py, 2026-06-18).

Run:      python -m kanonar_behavior_lab.src.basis.interaction_perseed
Selftest: python -m kanonar_behavior_lab.src.basis.interaction_perseed --selftest
          (synthetic data with closed-form slopes; exit != 0 on any failure)
"""

from __future__ import annotations

import hashlib
import json
import sys
from typing import Any

import numpy as np
import pandas as pd

from kanonar_behavior_lab.src.paths import REPORTS_DIR
from kanonar_behavior_lab.src.basis.triage import EPS_DEAD

PERSEED_CSV = REPORTS_DIR / "outcome_sweep_on_v4_perseed.csv"
AGGREGATE_CSV = REPORTS_DIR / "outcome_sweep_on_v4.csv"
REPORT_JSON = REPORTS_DIR / "outcome_interaction_perseed.json"

AXIS = "A_Power_Sovereignty"
READOUT = "outcome:self_favoring"
CELLS = ("S_contest_pressure@T0.1", "S_contest_pressure@T0.9")

EXPECTED_AXIS_POINTS = 7
EXPECTED_SEEDS = 32
BOOTSTRAP_B = 10_000
BOOTSTRAP_SEED = 20_260_705
CONSISTENCY_TOL = 1e-9


def _ols_slope(xs: np.ndarray, ys: np.ndarray) -> float:
    """OLS slope with intercept (identical formula to outcome_triage_v4)."""
    centered_x = xs - xs.mean()
    denominator = float(np.dot(centered_x, centered_x))
    if denominator <= 0:
        return 0.0
    return float(np.dot(centered_x, ys - ys.mean()) / denominator)


def _attested_seeds(cell_df: pd.DataFrame) -> dict[float, set[int]]:
    """Seeds attested at each grid point by ANY per-seed row of the cell."""
    out: dict[float, set[int]] = {}
    for value, grp in cell_df.groupby("value"):
        out[float(value)] = set(int(s) for s in grp["seed"].unique())
    return out


def _per_seed_curves(
    cell_df: pd.DataFrame, grid: np.ndarray, seeds: list[int],
) -> dict[int, np.ndarray]:
    """y_{c,s}(x) on the full grid with structural zero-fill for READOUT."""
    hits = cell_df[cell_df["readout"] == READOUT]
    present: dict[tuple[int, float], float] = {
        (int(r.seed), float(r.value)): float(r.result) for r in hits.itertuples()
    }
    return {
        s: np.array([present.get((s, float(v)), 0.0) for v in grid]) for s in seeds
    }


def grade(perseed: pd.DataFrame, aggregate: pd.DataFrame | None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "axis": AXIS, "readout": READOUT, "cells": {},
        "estimator": "per-seed OLS slopes; D=mean_s(b_T0.1,s - b_T0.9,s); percentile bootstrap over seeds",
        "eps_dead": EPS_DEAD, "bootstrap_B": BOOTSTRAP_B, "bootstrap_seed": BOOTSTRAP_SEED,
    }
    problems: list[str] = []

    df = perseed[perseed["axis"] == AXIS]
    grids: dict[str, np.ndarray] = {}
    seed_sets: dict[str, set[int]] = {}
    for cell in CELLS:
        cell_df = df[df["scene"] == cell]
        grid = np.array(sorted(float(v) for v in cell_df["value"].unique()))
        grids[cell] = grid
        if len(grid) != EXPECTED_AXIS_POINTS:
            problems.append(f"{cell}: {len(grid)}/{EXPECTED_AXIS_POINTS} axis points")
            continue
        attested = _attested_seeds(cell_df)
        sets = list(attested.values())
        if any(len(s) != EXPECTED_SEEDS for s in sets) or any(s != sets[0] for s in sets):
            counts = sorted({len(s) for s in sets})
            problems.append(f"{cell}: attested seeds per value {counts} != [{EXPECTED_SEEDS}] or sets differ")
            continue
        seed_sets[cell] = sets[0]

    if len(seed_sets) == 2 and seed_sets[CELLS[0]] != seed_sets[CELLS[1]]:
        problems.append("seed sets differ between cells (pairing broken)")
    if len(grids) == 2 and not np.allclose(grids[CELLS[0]], grids[CELLS[1]]):
        problems.append("axis grids differ between cells")

    if problems:
        out["verdict"] = "INVALID_DESIGN"
        out["problems"] = problems
        return out

    grid = grids[CELLS[0]]
    seeds = sorted(seed_sets[CELLS[0]])
    mean_slopes: dict[str, float] = {}
    slopes: dict[str, np.ndarray] = {}
    for cell in CELLS:
        curves = _per_seed_curves(df[df["scene"] == cell], grid, seeds)
        b = np.array([_ols_slope(grid, curves[s]) for s in seeds])
        slopes[cell] = b
        mean_slopes[cell] = float(b.mean())
        out["cells"][cell] = {
            "mean_slope": round(float(b.mean()), 4),
            "sd_slope": round(float(b.std(ddof=1)), 4),
            "seeds": len(seeds),
        }

    d = slopes[CELLS[0]] - slopes[CELLS[1]]
    D = float(d.mean())
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    boot = np.array([
        d[rng.integers(0, len(d), size=len(d))].mean() for _ in range(BOOTSTRAP_B)
    ])
    ci_lo, ci_hi = (float(np.percentile(boot, 2.5)), float(np.percentile(boot, 97.5)))

    out["D"] = round(D, 4)
    out["ci95"] = [round(ci_lo, 4), round(ci_hi, 4)]
    out["d_per_seed"] = {str(s): round(float(v), 4) for s, v in zip(seeds, d)}

    # Hard gate: linearity identity vs the aggregate table of the SAME run.
    if aggregate is not None:
        agg = aggregate[(aggregate["axis"] == AXIS)]
        agg_slopes: dict[str, float] = {}
        for cell in CELLS:
            sub = agg[(agg["scene"] == cell) & (agg["readout"] == READOUT)]
            present = {float(r.value): float(r.result) for r in sub.itertuples()}
            ys = np.array([present.get(float(v), 0.0) for v in grid])
            agg_slopes[cell] = _ols_slope(grid, ys)
        delta = abs(D - (agg_slopes[CELLS[0]] - agg_slopes[CELLS[1]]))
        out["aggregate_consistency"] = {"delta": delta, "ok": bool(delta <= CONSISTENCY_TOL)}
        if delta > CONSISTENCY_TOL:
            out["verdict"] = "INVALID_DESIGN"
            out["problems"] = [f"aggregate/per-seed identity broken: |Δ|={delta:.3e} (files from different runs?)"]
            return out

    if max(abs(mean_slopes[CELLS[0]]), abs(mean_slopes[CELLS[1]])) < EPS_DEAD:
        out["verdict"] = "DEAD"
    elif mean_slopes[CELLS[0]] > 0 and D > EPS_DEAD and ci_lo > 0:
        out["verdict"] = "PASS"
    else:
        out["verdict"] = "MISLABELED"
    return out


def run() -> dict:
    perseed = pd.read_csv(PERSEED_CSV)
    aggregate = pd.read_csv(AGGREGATE_CSV) if AGGREGATE_CSV.exists() else None
    report = {
        "metadata": {
            "schema_version": 1,
            "generated_by": "kanonar_behavior_lab.src.basis.interaction_perseed",
            "input_csv": PERSEED_CSV.name,
            "input_sha256": hashlib.sha256(PERSEED_CSV.read_bytes()).hexdigest(),
            "observation_level": "per-seed outcomes (long format + seed column)",
            "frozen": {
                "eps_dead": EPS_DEAD,
                "expected_axis_points": EXPECTED_AXIS_POINTS,
                "expected_seeds": EXPECTED_SEEDS,
                "bootstrap": {"B": BOOTSTRAP_B, "seed": BOOTSTRAP_SEED, "kind": "percentile, resample seeds"},
                "pass_rule": "mean b_T0.1 > 0 AND D > eps_dead AND ci_lo > 0",
                "dead_rule": "max(|mean b_T0.1|, |mean b_T0.9|) < eps_dead",
            },
        },
        "interaction": grade(perseed, aggregate),
    }
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


# ── selftest: synthetic data with closed-form slopes ────────────────────────

def _synthetic(grid: np.ndarray, seeds: list[int], y_by_cell: dict[str, np.ndarray]) -> pd.DataFrame:
    rows = []
    for cell, y in y_by_cell.items():
        for s in seeds:
            for x, v in zip(grid, y):
                # attestation row (the chosen action) at every grid point
                rows.append({"axis": AXIS, "value": x, "scene": cell, "layer": "S8",
                             "readout": "act:aff:talk:A:B", "result": 1, "seed": s})
                if v > 0:
                    rows.append({"axis": AXIS, "value": x, "scene": cell, "layer": "OUTCOME",
                                 "readout": READOUT, "result": 1, "seed": s})
    return pd.DataFrame(rows)


def selftest() -> int:
    grid = np.linspace(0, 1, 7)
    seeds = list(range(1, 33))
    step = np.array([0.0, 0, 0, 1, 1, 1, 1])       # y = 1[x >= 0.5]
    flat = np.zeros(7)

    failures: list[str] = []

    def check(name: str, cond: bool) -> None:
        print(f"  {'PASS' if cond else 'FAIL'}  {name}")
        if not cond:
            failures.append(name)

    # closed form: slope of the step on this grid, cross-checked with polyfit
    b_step = _ols_slope(grid, step)
    check("ols matches polyfit", abs(b_step - float(np.polyfit(grid, step, 1)[0])) < 1e-12)

    r = grade(_synthetic(grid, seeds, {CELLS[0]: step, CELLS[1]: flat}), None)
    check("PASS when b_T0.1=step, b_T0.9=0", r["verdict"] == "PASS")
    check("D equals closed-form slope", abs(r["D"] - round(b_step, 4)) < 1e-3)
    check("degenerate CI collapses to D", abs(r["ci95"][0] - r["ci95"][1]) < 1e-9)

    r = grade(_synthetic(grid, seeds, {CELLS[0]: flat, CELLS[1]: flat}), None)
    check("DEAD when both cells flat", r["verdict"] == "DEAD")

    r = grade(_synthetic(grid, seeds, {CELLS[0]: flat, CELLS[1]: step}), None)
    check("MISLABELED when slopes reversed", r["verdict"] == "MISLABELED")

    df = _synthetic(grid, seeds, {CELLS[0]: step, CELLS[1]: flat})
    df = df[~((df["seed"] == 7) & (df["scene"] == CELLS[0]))]
    r = grade(df, None)
    check("INVALID_DESIGN on a missing seed", r["verdict"] == "INVALID_DESIGN")

    # linearity identity against a constructed aggregate of the same data
    agg_rows = []
    for cell, y in {CELLS[0]: step, CELLS[1]: flat}.items():
        for x, v in zip(grid, y):
            if v > 0:
                agg_rows.append({"axis": AXIS, "value": x, "scene": cell, "layer": "OUTCOME",
                                 "readout": READOUT, "result": v})
    r = grade(_synthetic(grid, seeds, {CELLS[0]: step, CELLS[1]: flat}), pd.DataFrame(agg_rows))
    check("aggregate identity holds on same data", r.get("aggregate_consistency", {}).get("ok") is True)
    check("verdict unchanged by consistency gate", r["verdict"] == "PASS")

    print(f"selftest: {'OK' if not failures else f'{len(failures)} FAILURES'}")
    return 0 if not failures else 1


def main() -> None:
    if "--selftest" in sys.argv:
        raise SystemExit(selftest())
    report = run()
    ia = report["interaction"]
    print(f"{AXIS} @ interaction '{READOUT}': {ia['verdict']}")
    for cell, c in ia.get("cells", {}).items():
        print(f"  {cell}: mean_slope={c['mean_slope']:+.4f} sd={c['sd_slope']:.4f} (n={c['seeds']})")
    if "D" in ia:
        print(f"  D={ia['D']:+.4f}  CI95=[{ia['ci95'][0]:+.4f}, {ia['ci95'][1]:+.4f}]  eps_dead={EPS_DEAD}")
    if ia.get("problems"):
        print("  problems: " + "; ".join(ia["problems"]))
    print(f"wrote {REPORT_JSON}")


if __name__ == "__main__":
    main()
