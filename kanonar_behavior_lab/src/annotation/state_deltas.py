from __future__ import annotations


STATE_DELTAS: dict[str, dict[str, float]] = {
    "offer": {"trust": 0.00, "conflict": 0.00, "utility": 0.10},
    "counteroffer": {"trust": 0.00, "conflict": 0.05, "utility": 0.05},
    "accept": {"trust": 0.10, "conflict": -0.20, "utility": 0.30},
    "reject": {"trust": -0.05, "conflict": 0.15, "utility": -0.10},
    "concede": {"trust": 0.10, "conflict": -0.10, "utility": 0.20},
    "ask": {"trust": 0.00, "conflict": 0.00, "utility": 0.02},
    "explain": {"trust": 0.05, "conflict": -0.05, "utility": 0.05},
    "pressure": {"trust": -0.15, "conflict": 0.25, "utility": 0.00},
    "threaten": {"trust": -0.25, "conflict": 0.35, "utility": -0.10},
    "repair": {"trust": 0.15, "conflict": -0.25, "utility": 0.05},
    "neutral": {"trust": 0.00, "conflict": 0.00, "utility": 0.00},
}

ACTION_ALPHABET = tuple(STATE_DELTAS.keys())

