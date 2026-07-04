from __future__ import annotations

import hashlib
import unittest

import pandas as pd

from kanonar_behavior_lab.src.basis.outcome_triage_v4 import (
    SWEEP_CSV,
    PredictionV4,
    _classify_interaction,
)

# Pinned at the audit repair (2026-07-04): the graded artifact of the v4 run.
# If the CSV changes, this test MUST fail — regrade + re-pin is a deliberate act.
FROZEN_SWEEP_SHA256 = "cd703aae987cfb02ccd7576b616a71b7c044b268d264b251ee721b3698b019dc"

INTERACTION_PREDICTION = PredictionV4(
    "A_Power_Sovereignty",
    "S_contest_pressure",
    "interaction",
    "outcome:self_favoring",
    "W",
)


class OutcomeTriageV4InteractionTest(unittest.TestCase):
    def _synthetic_rows(self, low_t, high_t):
        values = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1]
        rows = []
        for temperature, results in (("0.1", low_t), ("0.9", high_t)):
            if results is None:
                continue
            for value, result in zip(values, results, strict=True):
                rows.append({
                    "axis": "A_Power_Sovereignty",
                    "value": value,
                    "scene": f"S_contest_pressure@T{temperature}",
                    "readout": "outcome:self_favoring",
                    "result": result,
                })
        return rows

    def test_committed_series_uses_ols_and_is_not_a_pass(self) -> None:
        low_t = [0.03125, 0.0625, 0.0625, 0.0625, 0.0625, 0.09375, 0.09375]
        high_t = [0.1875, 0.1875, 0.1875, 0.1875, 0.28125, 0.28125, 0.21875]
        result = _classify_interaction(
            pd.DataFrame(self._synthetic_rows(low_t, high_t)), INTERACTION_PREDICTION,
        )

        self.assertEqual(result["verdict"], "MISLABELED")
        self.assertEqual(result["cells"]["S_contest_pressure@T0.1"]["slope"], 0.054)
        self.assertEqual(result["cells"]["S_contest_pressure@T0.9"]["slope"], 0.08)
        self.assertEqual(result["slope_difference"], -0.027)

    def test_missing_cell_is_invalid_design_not_mislabeled(self) -> None:
        high_t = [0.1875, 0.1875, 0.1875, 0.1875, 0.28125, 0.28125, 0.21875]
        result = _classify_interaction(
            pd.DataFrame(self._synthetic_rows(None, high_t)), INTERACTION_PREDICTION,
        )
        self.assertEqual(result["verdict"], "INVALID_DESIGN")
        self.assertIn("S_contest_pressure@T0.1: 0/7 axis points", result["problems"])

    def test_partial_grid_is_invalid_design(self) -> None:
        low_t = [0.03125, 0.0625, 0.0625, 0.0625, 0.0625, 0.09375, 0.09375]
        high_t = [0.1875, 0.1875, 0.1875, 0.1875, 0.28125, 0.28125, 0.21875]
        rows = self._synthetic_rows(low_t, high_t)
        # drop two grid points from the T0.9 cell entirely
        rows = [
            r for r in rows
            if not (r["scene"].endswith("@T0.9") and r["value"] in (0, 1))
        ]
        result = _classify_interaction(pd.DataFrame(rows), INTERACTION_PREDICTION)
        self.assertEqual(result["verdict"], "INVALID_DESIGN")
        self.assertIn("S_contest_pressure@T0.9: 5/7 axis points", result["problems"])

    def test_frozen_artifact_still_grades_mislabeled(self) -> None:
        """Grades the ACTUAL frozen CSV, not a hand-copied series.

        Guards against silent artifact drift: any change to the sweep CSV
        breaks the sha256 pin; any change to the classifier that alters the
        committed verdict breaks the assertions.
        """
        self.assertEqual(
            hashlib.sha256(SWEEP_CSV.read_bytes()).hexdigest(),
            FROZEN_SWEEP_SHA256,
            "outcome_sweep_on_v4.csv changed — regrade and re-pin deliberately",
        )
        df = pd.read_csv(SWEEP_CSV)
        result = _classify_interaction(df, INTERACTION_PREDICTION)
        self.assertEqual(result["verdict"], "MISLABELED")
        self.assertEqual(result["cells"]["S_contest_pressure@T0.1"]["slope"], 0.054)
        self.assertEqual(result["cells"]["S_contest_pressure@T0.9"]["slope"], 0.08)
        self.assertEqual(result["cells"]["S_contest_pressure@T0.1"]["zero_filled"], 0)
        self.assertEqual(result["cells"]["S_contest_pressure@T0.9"]["zero_filled"], 0)
        self.assertEqual(result["slope_difference"], -0.027)


if __name__ == "__main__":
    unittest.main()
