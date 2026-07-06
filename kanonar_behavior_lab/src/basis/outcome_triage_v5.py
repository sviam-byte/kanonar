"""Triage of the v5 PAM-v2 cells (I-0.2: challenge/defy, versioned).

Run:      python -m kanonar_behavior_lab.src.basis.outcome_triage_v5
Selftest: python -m kanonar_behavior_lab.src.basis.outcome_triage_v5 --selftest

Reads the four v5 CSVs (512 seeds, exported with OUTCOME_SWEEP=1 AFTER the v5
freeze commit). Rows MIRROR lib/goal-lab/probe/outcomeSignTableV5.ts (frozen
2026-07-06). NOT edited to match results.

FROZEN ESTIMATORS (2026-07-06, committed BEFORE the run):

  R0 (flat control, OFF cell): _classify_flat convention of outcome_triage_v3
     on the zero-filled grid series — PASS(flat) iff range < EPS_DEAD.
  R1 (wiring, ON cell, S8 prior:B:challenge): triage._classify 'up'
     (Spearman rho >= MONO_RHO, delta > EPS_DEAD) — deterministic layer.
  R2 (ON cell, outcome:defied, seed-aware):
     y_s(x)  indicator of outcome:defied, seed s, frozen grid linspace(0,1,7),
             structural zero-fill (p=0 labels are never emitted)
     b_s     OLS slope with intercept (interaction_perseed._ols_slope — the
             SAME frozen formula, imported, not copied)
     b̄ = mean_s b_s;  CI95 = percentile bootstrap over seeds, B = 10000,
             rng = numpy default_rng(20260706)
     INVALID_DESIGN  grid != 7, attested seeds != 512 anywhere, seed sets
                     differ, or |b̄ − b_aggregate| > 1e-9
     DEAD            |b̄| < EPS_DEAD (0.03, inherited from triage.py)
     PASS            b̄ > EPS_DEAD AND CI_lo > 0
     MISLABELED      otherwise
  R3 (attribution contrast, CRN-paired):
     d_s = b_on,s − b_off,s (same seed in both cells — defy adds no candidate,
     so the candidate count and the per-seed Gumbel stream are flag-invariant)
     D = mean_s d_s; same bootstrap;
     PASS ⇔ b̄_on > 0 AND D > EPS_DEAD AND CI_lo > 0;
     DEAD ⇔ max(|b̄_on|, |b̄_off|) < EPS_DEAD; else MISLABELED.

Power, declared at freeze (I-0.1 recorded bound): sd(b_s) ≈ 0.27–0.45 ⇒ at
n=512 the 95% CI half-width ≈ 0.024–0.039 ≈ 0.8–1.3 × EPS_DEAD (less for R3
via CRN pairing).
"""

from __future__ import annotations

import hashlib
import json
import sys
from typing import Any

import numpy as np
import pandas as pd

from kanonar_behavior_lab.src.paths import REPORTS_DIR
from kanonar_behavior_lab.src.basis.triage import EPS_DEAD, MONO_RHO, _classify, _series
from kanonar_behavior_lab.src.basis.interaction_perseed import _ols_slope

OFF_AGG_CSV = REPORTS_DIR / "outcome_sweep_on_v5_off.csv"
OFF_SEED_CSV = REPORTS_DIR / "outcome_sweep_on_v5_off_perseed.csv"
ON_AGG_CSV = REPORTS_DIR / "outcome_sweep_on_v5_on.csv"
ON_SEED_CSV = REPORTS_DIR / "outcome_sweep_on_v5_on_perseed.csv"
TRIAGE_JSON = REPORTS_DIR / "outcome_triage_v5.json"

# The freeze commit that preceded the run (filled at the results commit,
# v4 precedent).
V5_FREEZE_COMMIT = "c15d6b4ea024a841e387ba9d212739d734287132"

AXIS = "A_Liberty_Autonomy"
CELL_OFF = "S_coercive_order@pamV2off"
CELL_ON = "S_coercive_order@pamV2on"
READOUT_OUTCOME = "outcome:defied"
READOUT_PRIOR = "prior:B:challenge"

EXPECTED_AXIS_POINTS = 7
EXPECTED_SEEDS = 512
BOOTSTRAP_B = 10_000
BOOTSTRAP_SEED = 20_260_706
CONSISTENCY_TOL = 1e-9
ZERO_FILL_PREFIXES = ("outcome:",)


def _filled_series(grp: pd.DataFrame, readout: str) -> tuple[np.ndarray, np.ndarray]:
    """Aggregate series on the cell's full grid; structural zero-fill for outcome:*."""
    grid = np.array(sorted(float(v) for v in grp["value"].unique()))
    xs, ys = _series(grp, readout)
    if not readout.startswith(ZERO_FILL_PREFIXES):
        return xs, ys
    present = {float(x): float(y) for x, y in zip(xs, ys)}
    return grid, np.array([present.get(float(v), 0.0) for v in grid])


def _classify_flat(ys: np.ndarray) -> dict[str, Any]:
    """v3 flat convention on the zero-filled series."""
    if len(ys) == 0:
        return {"verdict": "PASS(flat: absent)", "range": 0.0}
    rng = float(ys.max() - ys.min())
    return {
        "verdict": "PASS(flat)" if rng < EPS_DEAD else "MOVED(not-flat)",
        "range": round(rng, 4),
        "delta": round(float(ys[-1] - ys[0]), 4),
    }


def _gates(cell_df: pd.DataFrame, cell: str) -> tuple[np.ndarray | None, list[int], list[str]]:
    """Design-completeness gates for one per-seed cell. Returns (grid, seeds, problems)."""
    problems: list[str] = []
    grid = np.array(sorted(float(v) for v in cell_df["value"].unique()))
    if len(grid) != EXPECTED_AXIS_POINTS:
        problems.append(f"{cell}: {len(grid)}/{EXPECTED_AXIS_POINTS} axis points")
        return None, [], problems
    sets = [set(int(s) for s in g["seed"].unique()) for _, g in cell_df.groupby("value")]
    if any(len(s) != EXPECTED_SEEDS for s in sets) or any(s != sets[0] for s in sets):
        counts = sorted({len(s) for s in sets})
        problems.append(f"{cell}: attested seeds per value {counts} != [{EXPECTED_SEEDS}] or sets differ")
        return None, [], problems
    return grid, sorted(sets[0]), problems


def _seed_slopes(cell_df: pd.DataFrame, grid: np.ndarray, seeds: list[int], readout: str) -> np.ndarray:
    """Per-seed OLS slopes of the zero-filled indicator over the grid."""
    hits = cell_df[cell_df["readout"] == readout]
    present: dict[tuple[int, float], float] = {
        (int(r.seed), float(r.value)): float(r.result) for r in hits.itertuples()
    }
    return np.array([
        _ols_slope(grid, np.array([present.get((s, float(v)), 0.0) for v in grid]))
        for s in seeds
    ])


def _bootstrap_ci(d: np.ndarray) -> tuple[float, float]:
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    boot = np.array([
        d[rng.integers(0, len(d), size=len(d))].mean() for _ in range(BOOTSTRAP_B)
    ])
    return float(np.percentile(boot, 2.5)), float(np.percentile(boot, 97.5))


def _agg_slope(agg_df: pd.DataFrame | None, cell: str, grid: np.ndarray) -> float | None:
    """Aggregate slope zero-filled onto the PER-SEED grid: outcome:* rows with
    p=0 are never emitted, so the aggregate CSV's own value set can be a
    strict subset of the frozen grid — filling onto `grid` keeps the identity
    b̄ == b_aggregate exact (interaction_perseed convention)."""
    if agg_df is None:
        return None
    grp = agg_df[(agg_df["axis"] == AXIS) & (agg_df["scene"] == cell)]
    if not len(grp):
        return None
    xs, ys = _series(grp, READOUT_OUTCOME)
    present = {float(x): float(y) for x, y in zip(xs, ys)}
    filled = np.array([present.get(float(v), 0.0) for v in grid])
    return _ols_slope(grid, filled)


def grade_r2(seed_df: pd.DataFrame, agg_df: pd.DataFrame | None) -> dict[str, Any]:
    """Seed-aware single-cell slope (ON cell)."""
    out: dict[str, Any] = {"cell": CELL_ON, "readout": READOUT_OUTCOME}
    cell_df = seed_df[(seed_df["axis"] == AXIS) & (seed_df["scene"] == CELL_ON)]
    grid, seeds, problems = _gates(cell_df, CELL_ON)
    if problems:
        out["verdict"] = "INVALID_DESIGN"
        out["problems"] = problems
        return out
    b = _seed_slopes(cell_df, grid, seeds, READOUT_OUTCOME)
    b_mean = float(b.mean())
    agg = _agg_slope(agg_df, CELL_ON, grid)
    if agg is not None:
        delta = abs(b_mean - agg)
        out["aggregate_consistency"] = {"delta": delta, "ok": bool(delta <= CONSISTENCY_TOL)}
        if delta > CONSISTENCY_TOL:
            out["verdict"] = "INVALID_DESIGN"
            out["problems"] = [f"aggregate/per-seed identity broken: |Δ|={delta:.3e}"]
            return out
    ci_lo, ci_hi = _bootstrap_ci(b)
    out["mean_slope"] = round(b_mean, 4)
    out["sd_slope"] = round(float(b.std(ddof=1)), 4)
    out["ci95"] = [round(ci_lo, 4), round(ci_hi, 4)]
    out["seeds"] = len(seeds)
    if abs(b_mean) < EPS_DEAD:
        out["verdict"] = "DEAD"
    elif b_mean > EPS_DEAD and ci_lo > 0:
        out["verdict"] = "PASS"
    else:
        out["verdict"] = "MISLABELED"
    return out


def grade_r3(on_df: pd.DataFrame, off_df: pd.DataFrame) -> dict[str, Any]:
    """CRN-paired contrast D = mean_s(b_on,s − b_off,s)."""
    out: dict[str, Any] = {"cells": [CELL_ON, CELL_OFF], "readout": READOUT_OUTCOME}
    problems: list[str] = []
    parts: dict[str, tuple[np.ndarray, list[int], pd.DataFrame]] = {}
    for cell, df in ((CELL_ON, on_df), (CELL_OFF, off_df)):
        cell_df = df[(df["axis"] == AXIS) & (df["scene"] == cell)]
        grid, seeds, probs = _gates(cell_df, cell)
        problems.extend(probs)
        if grid is not None:
            parts[cell] = (grid, seeds, cell_df)
    if len(parts) == 2:
        if parts[CELL_ON][1] != parts[CELL_OFF][1]:
            problems.append("seed sets differ between cells (CRN pairing broken)")
        if not np.allclose(parts[CELL_ON][0], parts[CELL_OFF][0]):
            problems.append("axis grids differ between cells")
    if problems:
        out["verdict"] = "INVALID_DESIGN"
        out["problems"] = problems
        return out
    grid, seeds, _ = parts[CELL_ON]
    b_on = _seed_slopes(parts[CELL_ON][2], grid, seeds, READOUT_OUTCOME)
    b_off = _seed_slopes(parts[CELL_OFF][2], grid, seeds, READOUT_OUTCOME)
    d = b_on - b_off
    D = float(d.mean())
    ci_lo, ci_hi = _bootstrap_ci(d)
    out["mean_slope_on"] = round(float(b_on.mean()), 4)
    out["mean_slope_off"] = round(float(b_off.mean()), 4)
    out["D"] = round(D, 4)
    out["sd_d"] = round(float(d.std(ddof=1)), 4)
    out["ci95"] = [round(ci_lo, 4), round(ci_hi, 4)]
    out["seeds"] = len(seeds)
    if max(abs(float(b_on.mean())), abs(float(b_off.mean()))) < EPS_DEAD:
        out["verdict"] = "DEAD"
    elif float(b_on.mean()) > 0 and D > EPS_DEAD and ci_lo > 0:
        out["verdict"] = "PASS"
    else:
        out["verdict"] = "MISLABELED"
    return out


def run_triage() -> dict:
    off_agg = pd.read_csv(OFF_AGG_CSV)
    on_agg = pd.read_csv(ON_AGG_CSV)
    off_seed = pd.read_csv(OFF_SEED_CSV)
    on_seed = pd.read_csv(ON_SEED_CSV)

    # R0: flat control on the OFF aggregate (zero-filled).
    grp_off = off_agg[(off_agg["axis"] == AXIS) & (off_agg["scene"] == CELL_OFF)]
    _, ys0 = _filled_series(grp_off, READOUT_OUTCOME)
    r0 = {"cell": CELL_OFF, "readout": READOUT_OUTCOME, **_classify_flat(ys0)}

    # R1: deterministic wiring on the ON aggregate prior layer.
    grp_on = on_agg[(on_agg["axis"] == AXIS) & (on_agg["scene"] == CELL_ON)]
    xs1, ys1 = _series(grp_on, READOUT_PRIOR)
    r1 = {"cell": CELL_ON, "readout": READOUT_PRIOR}
    r1.update(_classify(xs1, ys1, "up") if len(ys1) else {"verdict": "READOUT_ABSENT"})

    r2 = grade_r2(on_seed, on_agg)
    r3 = grade_r3(on_seed, off_seed)

    report = {
        "metadata": {
            "schema_version": 1,
            "generated_by": "kanonar_behavior_lab.src.basis.outcome_triage_v5",
            "source_freeze_commit": V5_FREEZE_COMMIT,
            "inputs": {
                p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                for p in (OFF_AGG_CSV, OFF_SEED_CSV, ON_AGG_CSV, ON_SEED_CSV)
            },
            "observation_level": "aggregate + per-seed (long format + seed column)",
            "frozen": {
                "eps_dead": EPS_DEAD,
                "mono_rho": MONO_RHO,
                "expected_axis_points": EXPECTED_AXIS_POINTS,
                "expected_seeds": EXPECTED_SEEDS,
                "bootstrap": {"B": BOOTSTRAP_B, "seed": BOOTSTRAP_SEED, "kind": "percentile, resample seeds"},
                "r2_pass_rule": "mean b > eps_dead AND ci_lo > 0",
                "r3_pass_rule": "mean b_on > 0 AND D > eps_dead AND ci_lo > 0",
            },
        },
        "predictions": {"R0": r0, "R1": r1, "R2": r2, "R3": r3},
    }
    TRIAGE_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


# ── selftest: synthetic data with closed-form slopes ────────────────────────

def _synthetic_seed_df(grid: np.ndarray, seeds: list[int], y_by_cell: dict[str, np.ndarray]) -> pd.DataFrame:
    rows = []
    for cell, y in y_by_cell.items():
        for s in seeds:
            for x, v in zip(grid, y):
                rows.append({"axis": AXIS, "value": x, "scene": cell, "layer": "S8",
                             "readout": "act:aff:talk:A:B", "result": 1, "seed": s})
                if v > 0:
                    rows.append({"axis": AXIS, "value": x, "scene": cell, "layer": "OUTCOME",
                                 "readout": READOUT_OUTCOME, "result": 1, "seed": s})
    return pd.DataFrame(rows)


def _synthetic_agg_df(grid: np.ndarray, cell: str, y: np.ndarray) -> pd.DataFrame:
    rows = [
        {"axis": AXIS, "value": x, "scene": cell, "layer": "OUTCOME",
         "readout": READOUT_OUTCOME, "result": v}
        for x, v in zip(grid, y) if v > 0
    ]
    return pd.DataFrame(rows, columns=["axis", "value", "scene", "layer", "readout", "result"])


def selftest() -> int:
    grid = np.linspace(0, 1, 7)
    seeds = list(range(1, EXPECTED_SEEDS + 1))
    step = np.array([0.0, 0, 0, 1, 1, 1, 1])
    flat = np.zeros(7)
    failures: list[str] = []

    def check(name: str, cond: bool) -> None:
        print(f"  {'PASS' if cond else 'FAIL'}  {name}")
        if not cond:
            failures.append(name)

    b_step = _ols_slope(grid, step)
    check("ols matches polyfit", abs(b_step - float(np.polyfit(grid, step, 1)[0])) < 1e-12)

    # R0 flat convention
    check("R0 PASS(flat) on flat series", _classify_flat(flat)["verdict"] == "PASS(flat)")
    check("R0 MOVED on step series", _classify_flat(step)["verdict"] == "MOVED(not-flat)")

    # R1 up on a clean monotone series
    xs = grid
    ys = 0.1 + 0.3 * grid
    check("R1 PASS on monotone prior", _classify(xs, ys, "up")["verdict"] == "PASS")

    # R2 branches
    on_step = _synthetic_seed_df(grid, seeds, {CELL_ON: step})
    r = grade_r2(on_step, _synthetic_agg_df(grid, CELL_ON, step))
    check("R2 PASS on step (agg identity holds)", r["verdict"] == "PASS"
          and r["aggregate_consistency"]["ok"] and abs(r["mean_slope"] - round(b_step, 4)) < 1e-3)
    r = grade_r2(_synthetic_seed_df(grid, seeds, {CELL_ON: flat}), None)
    check("R2 DEAD on flat", r["verdict"] == "DEAD")
    r = grade_r2(_synthetic_seed_df(grid, seeds, {CELL_ON: step[::-1]}), None)
    check("R2 MISLABELED on downward step", r["verdict"] == "MISLABELED")
    broken = on_step[~((on_step["seed"] == 7))]
    r = grade_r2(broken, None)
    check("R2 INVALID_DESIGN on a missing seed", r["verdict"] == "INVALID_DESIGN")

    # R3 branches
    on = _synthetic_seed_df(grid, seeds, {CELL_ON: step})
    off = _synthetic_seed_df(grid, seeds, {CELL_OFF: flat})
    r = grade_r3(on, off)
    check("R3 PASS on=step off=flat", r["verdict"] == "PASS" and abs(r["D"] - round(b_step, 4)) < 1e-3)
    check("R3 degenerate CI collapses to D", abs(r["ci95"][0] - r["ci95"][1]) < 1e-9)
    r = grade_r3(_synthetic_seed_df(grid, seeds, {CELL_ON: flat}),
                 _synthetic_seed_df(grid, seeds, {CELL_OFF: flat}))
    check("R3 DEAD both flat", r["verdict"] == "DEAD")
    r = grade_r3(_synthetic_seed_df(grid, seeds, {CELL_ON: flat}),
                 _synthetic_seed_df(grid, seeds, {CELL_OFF: step}))
    check("R3 MISLABELED on=flat off=step", r["verdict"] == "MISLABELED")
    r = grade_r3(on, _synthetic_seed_df(grid, seeds[:-1], {CELL_OFF: flat}))
    check("R3 INVALID_DESIGN on seed-set mismatch", r["verdict"] == "INVALID_DESIGN")

    print(f"selftest: {'OK' if not failures else f'{len(failures)} FAILURES'}")
    return 0 if not failures else 1


def main() -> None:
    if "--selftest" in sys.argv:
        raise SystemExit(selftest())
    report = run_triage()
    for rid, pr in report["predictions"].items():
        extra = ""
        # ASCII-only console output: cp1251 terminals cannot encode U+0304.
        if "mean_slope" in pr:
            extra = f" b_mean={pr['mean_slope']:+.4f} sd={pr['sd_slope']:.4f} CI95=[{pr['ci95'][0]:+.4f},{pr['ci95'][1]:+.4f}]"
        elif "D" in pr:
            extra = (f" b_on={pr['mean_slope_on']:+.4f} b_off={pr['mean_slope_off']:+.4f}"
                     f" D={pr['D']:+.4f} CI95=[{pr['ci95'][0]:+.4f},{pr['ci95'][1]:+.4f}]")
        elif "rho" in pr:
            extra = f" rho={pr['rho']:+.2f} d={pr['delta']:+.3f}"
        elif "range" in pr:
            extra = f" range={pr['range']}"
        if pr.get("problems"):
            extra += "  problems: " + "; ".join(pr["problems"])
        print(f"{rid} '{pr.get('readout', '')}': {pr['verdict']}{extra}")
    print(f"wrote {TRIAGE_JSON}")


if __name__ == "__main__":
    main()
