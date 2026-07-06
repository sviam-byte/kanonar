from __future__ import annotations

import hashlib
import unittest

import numpy as np

from kanonar_behavior_lab.src.basis.interaction_perseed import _ols_slope
from kanonar_behavior_lab.src.basis.outcome_triage_v5 import (
    OFF_AGG_CSV,
    OFF_SEED_CSV,
    ON_AGG_CSV,
    ON_SEED_CSV,
    run_triage,
    selftest,
)

# Pinned at the v5 results commit (2026-07-06): the graded artifacts of the
# v5 run. Estimator frozen by commit c15d6b4 BEFORE the run; the same run
# reproduced outcome_sweep_on_v4.csv byte-identically (test_interaction_perseed
# pin held), so the OFF gate is witnessed end-to-end. If any CSV changes,
# this test MUST fail — regrade + re-pin is a deliberate act.
FROZEN_SHA256 = {
    "outcome_sweep_on_v5_off.csv": "3619dfe97aa4c41e5dc3dbd377d30975cc89bfde32c8fede2b159a5539cdd0af",
    "outcome_sweep_on_v5_off_perseed.csv": "dcde3c5e65b45fbd2ba969ce04615233d2ae22de47ddf53b5f71a5012cad806a",
    "outcome_sweep_on_v5_on.csv": "ca18e0f09e6bfc4adb7d2597af68d0fc0b48f634b2bc6181c299e2e7fde010a3",
    "outcome_sweep_on_v5_on_perseed.csv": "bf32508b63a14362528954144ae0ed19ab2a0f9baaa57f5df8f7efbda7da4ec4",
}


class OutcomeTriageV5Test(unittest.TestCase):
    def test_selftest_is_green(self) -> None:
        """Closed-form synthetic branches for R0/R1/R2/R3, all verdicts."""
        self.assertEqual(selftest(), 0)

    def test_ols_linearity_mean_of_slopes_equals_slope_of_means(self) -> None:
        """mean_s b_s == b(mean_s y): the identity behind the R2/R3 consistency gate."""
        rng = np.random.default_rng(11)
        grid = np.linspace(0, 1, 7)
        ys = rng.random((512, 7))
        per_seed = np.array([_ols_slope(grid, y) for y in ys])
        self.assertAlmostEqual(float(per_seed.mean()), _ols_slope(grid, ys.mean(axis=0)), places=12)

    def test_frozen_artifacts_grade_as_recorded(self) -> None:
        for path in (OFF_AGG_CSV, OFF_SEED_CSV, ON_AGG_CSV, ON_SEED_CSV):
            self.assertEqual(
                hashlib.sha256(path.read_bytes()).hexdigest(),
                FROZEN_SHA256[path.name],
                f"{path.name} changed — regrade and re-pin deliberately",
            )
        report = run_triage()
        p = report["predictions"]

        self.assertEqual(p["R0"]["verdict"], "PASS(flat)")
        self.assertEqual(p["R0"]["range"], 0.0)

        self.assertEqual(p["R1"]["verdict"], "PASS")
        self.assertEqual(p["R1"]["rho"], 1.0)
        self.assertEqual(p["R1"]["delta"], 0.336)

        self.assertEqual(p["R2"]["verdict"], "DEAD")
        self.assertEqual(p["R2"]["mean_slope"], -0.0167)
        self.assertEqual(p["R2"]["ci95"], [-0.0372, 0.0038])
        self.assertTrue(p["R2"]["aggregate_consistency"]["ok"])
        self.assertEqual(p["R2"]["seeds"], 512)

        self.assertEqual(p["R3"]["verdict"], "DEAD")
        self.assertEqual(p["R3"]["mean_slope_off"], 0.0)
        self.assertEqual(p["R3"]["D"], -0.0167)


if __name__ == "__main__":
    unittest.main()
