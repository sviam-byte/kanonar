from __future__ import annotations

import sys

import pandas as pd

from kanonar_behavior_lab.src.annotation.state_deltas import ACTION_ALPHABET
from kanonar_behavior_lab.src.paths import (
    BEHAVIOR_REPORT,
    EPISODE_FEATURES,
    EVENTS,
    RAW_DIALOGUES,
    TRAJECTORIES,
)


EXPECTED_EPISODES = 1030
EXPECTED_UTTERANCES = 14297

RAW_REQUIRED = {
    "episode_id",
    "dialogue_id",
    "t",
    "utterance_id",
    "actor",
    "target",
    "speaker_id",
    "speaker_internal_id",
    "text",
    "annotations",
    "terminal_data",
    "issue2youget",
    "issue2theyget",
}
EVENT_REQUIRED = {
    "episode_id",
    "t",
    "actor",
    "target",
    "text",
    "action_type",
    "emotion",
    "intent",
    "offer_present",
    "reject_present",
    "accept_present",
    "concession_present",
    "repair_present",
    "pressure_present",
    "trust_delta",
    "conflict_delta",
    "utility_delta",
    "outcome",
}
TRAJECTORY_REQUIRED = {
    "episode_id",
    "t",
    "action_type",
    "trust",
    "conflict",
    "utility",
    "trust_delta",
    "conflict_delta",
    "utility_delta",
}
FEATURE_REQUIRED = {
    "episode_id",
    "n_turns",
    "offer_count",
    "reject_count",
    "accept_count",
    "concession_count",
    "pressure_count",
    "repair_count",
    "final_trust",
    "final_conflict",
    "final_utility",
    "max_conflict",
    "mean_conflict",
    "conflict_slope",
    "trust_slope",
    "utility_slope",
    "first_reject_time",
    "first_concession_time",
    "time_to_accept",
    "action_entropy",
    "deal_outcome",
    "attractor_label",
}


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def validate_dataset() -> list[str]:
    errors: list[str] = []
    for path in (RAW_DIALOGUES, EVENTS, TRAJECTORIES, EPISODE_FEATURES, BEHAVIOR_REPORT):
        require(path.exists(), f"Missing required output: {path}", errors)
    if errors:
        return errors

    raw = pd.read_parquet(RAW_DIALOGUES)
    events = pd.read_parquet(EVENTS)
    trajectories = pd.read_parquet(TRAJECTORIES)
    features = pd.read_parquet(EPISODE_FEATURES)

    require(RAW_REQUIRED.issubset(raw.columns), f"raw missing columns: {RAW_REQUIRED - set(raw.columns)}", errors)
    require(EVENT_REQUIRED.issubset(events.columns), f"events missing columns: {EVENT_REQUIRED - set(events.columns)}", errors)
    require(
        TRAJECTORY_REQUIRED.issubset(trajectories.columns),
        f"trajectories missing columns: {TRAJECTORY_REQUIRED - set(trajectories.columns)}",
        errors,
    )
    require(
        FEATURE_REQUIRED.issubset(features.columns),
        f"features missing columns: {FEATURE_REQUIRED - set(features.columns)}",
        errors,
    )

    require(len(raw) == EXPECTED_UTTERANCES, f"raw rows expected {EXPECTED_UTTERANCES}, got {len(raw)}", errors)
    require(len(events) == EXPECTED_UTTERANCES, f"event rows expected {EXPECTED_UTTERANCES}, got {len(events)}", errors)
    require(
        len(trajectories) == EXPECTED_UTTERANCES,
        f"trajectory rows expected {EXPECTED_UTTERANCES}, got {len(trajectories)}",
        errors,
    )
    for name, frame in (("raw", raw), ("events", events), ("trajectories", trajectories), ("features", features)):
        require(
            frame["episode_id"].nunique() == EXPECTED_EPISODES,
            f"{name} episodes expected {EXPECTED_EPISODES}, got {frame['episode_id'].nunique()}",
            errors,
        )
    require(len(features) == EXPECTED_EPISODES, f"feature rows expected {EXPECTED_EPISODES}, got {len(features)}", errors)

    allowed_actions = set(ACTION_ALPHABET)
    unexpected_actions = set(events["action_type"]) - allowed_actions
    require(not unexpected_actions, f"unexpected action types: {sorted(unexpected_actions)}", errors)

    for column in ("episode_id", "actor", "target", "text", "action_type"):
        require(events[column].notna().all(), f"events column has nulls: {column}", errors)
        if events[column].dtype == object:
            require((events[column].astype(str).str.len() > 0).all(), f"events column has empty strings: {column}", errors)

    for column in ("trust", "conflict", "utility"):
        require(trajectories[column].between(0.0, 1.0).all(), f"trajectory column out of bounds: {column}", errors)

    key_feature_columns = [
        column for column in FEATURE_REQUIRED if column not in {"episode_id"}
    ]
    require(not features[key_feature_columns].isna().any().any(), "episode_features has nulls in required features", errors)
    require(set(features["deal_outcome"]) <= {"deal", "no_deal"}, "invalid deal_outcome labels", errors)
    require(
        set(features["attractor_label"]) <= {"cooperation", "bargaining", "deadlock", "escalation"},
        "invalid attractor labels",
        errors,
    )
    require(features["deal_outcome"].nunique() >= 2, "deal_outcome has less than two classes", errors)
    require(features["attractor_label"].nunique() >= 2, "attractor_label has less than two classes", errors)

    report_text = BEHAVIOR_REPORT.read_text(encoding="utf-8")
    for phrase in (
        "Top Action Prefix Patterns",
        "Mean Final Trajectory State",
        "Mean T/C/U Trajectory",
        "Early Prediction Baseline",
        "Worked Example",
        "rule-based simulation scalars",
        "CaSiNo attribution",
    ):
        require(phrase in report_text, f"report missing phrase: {phrase}", errors)

    return errors


def main() -> None:
    errors = validate_dataset()
    if errors:
        print("DATASET_VALIDATION_FAILED")
        for error in errors:
            print(f"- {error}")
        sys.exit(1)
    print("DATASET_VALIDATION_OK")


if __name__ == "__main__":
    main()
