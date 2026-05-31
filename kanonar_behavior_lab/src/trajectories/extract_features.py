from __future__ import annotations

import math
from collections import Counter
from typing import Any

import pandas as pd

from kanonar_behavior_lab.src.paths import (
    EPISODE_FEATURES,
    EVENTS,
    TRAJECTORIES,
    ensure_output_dirs,
)
from kanonar_behavior_lab.src.trajectories.build_trajectories import build_events_and_trajectories


def entropy(values: list[str]) -> float:
    if not values:
        return 0.0
    counts = Counter(values)
    total = len(values)
    return -sum((count / total) * math.log2(count / total) for count in counts.values())


def slope(series: pd.Series) -> float:
    if len(series) <= 1:
        return 0.0
    return float((series.iloc[-1] - series.iloc[0]) / (len(series) - 1))


def first_time(events: pd.DataFrame, column: str) -> float:
    hits = events[events[column]]
    if hits.empty:
        return -1.0
    return float(hits["t"].iloc[0])


def classify_attractor(events: pd.DataFrame, trajectory: pd.DataFrame, features: dict[str, Any]) -> str:
    has_pressure = bool((events["action_type"].isin(["pressure", "threaten"])).any())
    if features["conflict_slope"] > 0 and features["final_trust"] < 0.4 and has_pressure:
        return "escalation"
    if features["reject_count"] >= 2 and features["concession_count"] == 0 and features["final_utility"] < 0.2:
        return "deadlock"
    if features["accept_count"] > 0 and features["final_utility"] >= 0.5 and features["final_conflict"] <= 0.2:
        return "cooperation"
    if (
        features["pressure_count"] > 0
        and features["final_conflict"] >= 0.55
        and features["final_trust"] <= 0.35
    ):
        return "escalation"
    return "bargaining"


def deal_outcome(events: pd.DataFrame) -> str:
    if (events["outcome"] == "deal").any():
        return "deal"
    return "no_deal"


def build_episode_features() -> pd.DataFrame:
    ensure_output_dirs()
    if not EVENTS.exists() or not TRAJECTORIES.exists():
        build_events_and_trajectories()

    events = pd.read_parquet(EVENTS)
    trajectories = pd.read_parquet(TRAJECTORIES)
    rows: list[dict[str, Any]] = []

    for episode_id, episode_events in events.groupby("episode_id", sort=True):
        episode_events = episode_events.sort_values("t")
        episode_trajectory = trajectories[trajectories["episode_id"] == episode_id].sort_values("t")
        action_counts = episode_events["action_type"].value_counts()
        final = episode_trajectory.iloc[-1]

        features: dict[str, Any] = {
            "episode_id": episode_id,
            "n_turns": int(len(episode_events)),
            "offer_count": int(action_counts.get("offer", 0) + action_counts.get("counteroffer", 0)),
            "reject_count": int(action_counts.get("reject", 0)),
            "accept_count": int(action_counts.get("accept", 0)),
            "concession_count": int(action_counts.get("concede", 0)),
            "pressure_count": int(action_counts.get("pressure", 0) + action_counts.get("threaten", 0)),
            "repair_count": int(action_counts.get("repair", 0)),
            "final_trust": float(final["trust"]),
            "final_conflict": float(final["conflict"]),
            "final_utility": float(final["utility"]),
            "max_conflict": float(episode_trajectory["conflict"].max()),
            "mean_conflict": float(episode_trajectory["conflict"].mean()),
            "conflict_slope": slope(episode_trajectory["conflict"]),
            "trust_slope": slope(episode_trajectory["trust"]),
            "utility_slope": slope(episode_trajectory["utility"]),
            "first_reject_time": first_time(episode_events, "reject_present"),
            "first_concession_time": first_time(episode_events, "concession_present"),
            "time_to_accept": first_time(episode_events, "accept_present"),
            "action_entropy": entropy(episode_events["action_type"].tolist()),
        }
        features["deal_outcome"] = deal_outcome(episode_events)
        features["attractor_label"] = classify_attractor(episode_events, episode_trajectory, features)
        rows.append(features)

    feature_frame = pd.DataFrame(rows)
    feature_frame.to_parquet(EPISODE_FEATURES, index=False)
    return feature_frame


def main() -> None:
    features = build_episode_features()
    print(f"Saved {EPISODE_FEATURES}")
    print(f"episodes={len(features)}")
    print("deal_outcome", features["deal_outcome"].value_counts().to_dict())
    print("attractor_label", features["attractor_label"].value_counts().to_dict())


if __name__ == "__main__":
    main()
