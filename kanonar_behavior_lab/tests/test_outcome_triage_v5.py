from __future__ import annotations

import unittest

import numpy as np

from kanonar_behavior_lab.src.basis.interaction_perseed import _ols_slope
from kanonar_behavior_lab.src.basis.outcome_triage_v5 import selftest

# Freeze-stage test (2026-07-06): selftest branches + the linearity identity.
# sha256 pins of the four v5 CSVs and the graded verdicts are added at the
# RESULTS commit (test_interaction_perseed.py pattern) — the run must exist
# before it can be pinned.


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


if __name__ == "__main__":
    unittest.main()
