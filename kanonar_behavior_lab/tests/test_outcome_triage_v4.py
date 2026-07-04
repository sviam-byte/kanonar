from __future__ import annotations

import unittest

import pandas as pd

from kanonar_behavior_lab.src.basis.outcome_triage_v4 import (
    PredictionV4,
    _classify_interaction,
)


class OutcomeTriageV4InteractionTest(unittest.TestCase):
    def test_committed_series_uses_ols_and_is_not_a_pass(self) -> None:
        values = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1]
        low_t = [0.03125, 0.0625, 0.0625, 0.0625, 0.0625, 0.09375, 0.09375]
        high_t = [0.1875, 0.1875, 0.1875, 0.1875, 0.28125, 0.28125, 0.21875]
        rows = []
        for temperature, results in (("0.1", low_t), ("0.9", high_t)):
            for value, result in zip(values, results, strict=True):
                rows.append({
                    "axis": "A_Power_Sovereignty",
                    "value": value,
                    "scene": f"S_contest_pressure@T{temperature}",
                    "readout": "outcome:self_favoring",
                    "result": result,
                })

        prediction = PredictionV4(
            "A_Power_Sovereignty",
            "S_contest_pressure",
            "interaction",
            "outcome:self_favoring",
            "W",
        )
        result = _classify_interaction(pd.DataFrame(rows), prediction)

        self.assertEqual(result["verdict"], "MISLABELED")
        self.assertEqual(result["cells"]["S_contest_pressure@T0.1"]["slope"], 0.054)
        self.assertEqual(result["cells"]["S_contest_pressure@T0.9"]["slope"], 0.08)
        self.assertEqual(result["slope_difference"], -0.027)


if __name__ == "__main__":
    unittest.main()
