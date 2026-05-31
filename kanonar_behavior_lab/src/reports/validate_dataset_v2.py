from __future__ import annotations

import sys

import pandas as pd

from kanonar_behavior_lab.src.annotation.action_rules_v2 import ACTION_ALPHABET_V2
from kanonar_behavior_lab.src.reports.make_report_v2 import REPORT_V2
from kanonar_behavior_lab.src.trajectories.build_v2 import (
    EPISODE_FEATURES_V2,
    EVENTS_V2,
    OFFER_DYNAMICS,
    TRAJECTORY_WINDOWS,
)


EXPECTED_EPISODES = 1030
EXPECTED_EVENTS = 14297
WINDOW_LABELS = {
    "cooperation_window",
    "bargaining_window",
    "deadlock_window",
    "escalation_window",
    "repair_window",
}


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def validate_dataset_v2() -> list[str]:
    errors: list[str] = []
    for path in (EVENTS_V2, OFFER_DYNAMICS, TRAJECTORY_WINDOWS, EPISODE_FEATURES_V2, REPORT_V2):
        require(path.exists(), f"Missing required v2 output: {path}", errors)
    if errors:
        return errors

    events = pd.read_parquet(EVENTS_V2)
    offers = pd.read_parquet(OFFER_DYNAMICS)
    windows = pd.read_parquet(TRAJECTORY_WINDOWS)
    features = pd.read_parquet(EPISODE_FEATURES_V2)

    require(len(events) == EXPECTED_EVENTS, f"events_v2 rows expected {EXPECTED_EVENTS}, got {len(events)}", errors)
    require(features["episode_id"].nunique() == EXPECTED_EPISODES, "episode_features_v2 episode count mismatch", errors)
    require(len(features) == EXPECTED_EPISODES, f"episode_features_v2 rows expected {EXPECTED_EPISODES}, got {len(features)}", errors)
    require(events["episode_id"].nunique() == EXPECTED_EPISODES, "events_v2 episode count mismatch", errors)
    require(windows["episode_id"].nunique() == EXPECTED_EPISODES, "trajectory_windows episode count mismatch", errors)

    unexpected_actions = set(events["action_type_v2"]) - set(ACTION_ALPHABET_V2)
    require(not unexpected_actions, f"unexpected v2 actions: {sorted(unexpected_actions)}", errors)
    unexpected_windows = set(windows["window_label"]) - WINDOW_LABELS
    require(not unexpected_windows, f"unexpected window labels: {sorted(unexpected_windows)}", errors)

    for column in ("trust", "conflict", "utility"):
        require(events[column].between(0.0, 1.0).all(), f"events_v2 {column} out of bounds", errors)

    require(int((events["action_type_v2"] == "terminal_accept").sum()) > 0, "no terminal_accept events", errors)
    require(int((events["action_type_v2"] == "soft_accept").sum()) > 0, "no soft_accept events", errors)
    require(int((events["action_type_v2"] == "acknowledge").sum()) > 0, "no acknowledge events", errors)
    require(int((windows["window_label"] == "deadlock_window").sum()) > 0, "no deadlock windows", errors)
    require(not offers.empty, "offer_dynamics is empty", errors)

    report_text = REPORT_V2.read_text(encoding="utf-8")
    for phrase in ("Counteroffer Split", "Soft vs Terminal Acceptance", "Window Labels", "Top Window Sequences"):
        require(phrase in report_text, f"v2 report missing phrase: {phrase}", errors)

    return errors


def main() -> None:
    errors = validate_dataset_v2()
    if errors:
        print("DATASET_V2_VALIDATION_FAILED")
        for error in errors:
            print(f"- {error}")
        sys.exit(1)
    print("DATASET_V2_VALIDATION_OK")


if __name__ == "__main__":
    main()
