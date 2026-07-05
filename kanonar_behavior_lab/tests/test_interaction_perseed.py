from __future__ import annotations

import hashlib
import unittest

import numpy as np
import pandas as pd

from kanonar_behavior_lab.src.basis.interaction_perseed import (
    AGGREGATE_CSV,
    CELLS,
    PERSEED_CSV,
    _ols_slope,
    grade,
    selftest,
)

# Pinned at the seed-aware re-grade (2026-07-05): the graded artifact of the
# per-seed re-run. The estimator was frozen by commit BEFORE this run
# (b4aefe8); the re-run reproduced the aggregate CSV byte-identically
# (sha256 cd703aae… unchanged from the v4 pin), so both files are one run.
# If either CSV changes, this test MUST fail — regrade + re-pin deliberately.
FROZEN_PERSEED_SHA256 = "b11b0d64e96e038cda8115bca7edf3e8598dad0b458a20c8218565bedf5e9491"


class InteractionPerseedTest(unittest.TestCase):
    def test_selftest_is_green(self) -> None:
        """Closed-form synthetic branches (PASS/DEAD/MISLABELED/INVALID_DESIGN)."""
        self.assertEqual(selftest(), 0)

    def test_ols_linearity_mean_of_slopes_equals_slope_of_means(self) -> None:
        """The identity the whole design rests on: mean_s b_s == b(mean_s y)."""
        rng = np.random.default_rng(7)
        grid = np.linspace(0, 1, 7)
        ys = rng.random((32, 7))
        per_seed = np.array([_ols_slope(grid, y) for y in ys])
        self.assertAlmostEqual(float(per_seed.mean()), _ols_slope(grid, ys.mean(axis=0)), places=12)

    def test_frozen_artifact_grades_mislabeled_with_ci(self) -> None:
        self.assertEqual(
            hashlib.sha256(PERSEED_CSV.read_bytes()).hexdigest(),
            FROZEN_PERSEED_SHA256,
            "outcome_sweep_on_v4_perseed.csv changed — regrade and re-pin deliberately",
        )
        result = grade(pd.read_csv(PERSEED_CSV), pd.read_csv(AGGREGATE_CSV))

        self.assertEqual(result["verdict"], "MISLABELED")
        self.assertEqual(result["cells"][CELLS[0]]["mean_slope"], 0.0536)
        self.assertEqual(result["cells"][CELLS[1]]["mean_slope"], 0.0804)
        self.assertEqual(result["D"], -0.0268)
        self.assertEqual(result["ci95"], [-0.1607, 0.1071])
        self.assertTrue(result["aggregate_consistency"]["ok"])
        # the ordering fails at the seed level too: d_s > 0 for only 6/32 seeds
        d = np.array([float(v) for v in result["d_per_seed"].values()])
        self.assertEqual(int((d > 0).sum()), 6)
        self.assertEqual(len(d), 32)


if __name__ == "__main__":
    unittest.main()
