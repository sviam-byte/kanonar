from __future__ import annotations

import math
from collections import Counter

import pandas as pd

from kanonar_behavior_lab.src.paths import PROCESSED_DIR, ensure_output_dirs
from kanonar_behavior_lab.src.trajectories.build_v2 import (
    EPISODE_FEATURES_V2,
    EVENTS_V2,
    OFFER_DYNAMICS,
    TRAJECTORY_WINDOWS,
    build_v2_tables,
)


ACTOR_EPISODE_PROFILES = PROCESSED_DIR / "actor_episode_profiles.parquet"


ACTION_COLUMNS = {
    "initial_offer": "offer_rate",
    "counteroffer": "counteroffer_rate",
    "concession_offer": "concession_offer_rate",
    "demand": "demand_rate",
    "self_favoring_offer": "self_favoring_offer_rate",
    "soft_accept": "soft_accept_rate",
    "terminal_accept": "terminal_accept_rate",
    "reject": "reject_rate",
    "repair": "repair_rate",
    "acknowledge": "acknowledge_rate",
}


def load_inputs() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if not all(path.exists() for path in (EVENTS_V2, OFFER_DYNAMICS, TRAJECTORY_WINDOWS, EPISODE_FEATURES_V2)):
        build_v2_tables()
    return (
        pd.read_parquet(EVENTS_V2),
        pd.read_parquet(OFFER_DYNAMICS),
        pd.read_parquet(TRAJECTORY_WINDOWS),
        pd.read_parquet(EPISODE_FEATURES_V2),
    )


def entropy(actions: list[str]) -> float:
    if not actions:
        return 0.0
    counts = Counter(actions)
    total = len(actions)
    return -sum((count / total) * math.log2(count / total) for count in counts.values())


def strategy_switch_rate(actions: list[str]) -> float:
    if len(actions) <= 1:
        return 0.0
    switches = sum(1 for left, right in zip(actions, actions[1:], strict=False) if left != right)
    return switches / (len(actions) - 1)


def first_time(frame: pd.DataFrame, action: str) -> float:
    hits = frame[frame["action_type_v2"] == action]
    if hits.empty:
        return -1.0
    return float(hits["t"].iloc[0])


def build_actor_profiles() -> pd.DataFrame:
    ensure_output_dirs()
    events, offers, windows, episode_features = load_inputs()
    rows = []
    episode_outcomes = episode_features.set_index("episode_id")[["deal_outcome", "attractor_label_v2"]].to_dict("index")

    for episode_id, episode_events in events.groupby("episode_id", sort=True):
        for actor in ("A", "B"):
            actor_events = episode_events[episode_events["actor"] == actor].sort_values("t")
            actions = actor_events["action_type_v2"].tolist()
            n_turns = len(actor_events)
            counts = actor_events["action_type_v2"].value_counts()
            actor_offers = offers[(offers["episode_id"] == episode_id) & (offers["actor"] == actor)]
            observed_offers = actor_offers[actor_offers["allocation_present"]]
            episode_windows = windows[windows["episode_id"] == episode_id]

            profile = {
                "episode_id": episode_id,
                "actor": actor,
                "n_actor_turns": int(n_turns),
                "pressure_rate": rate(counts.get("pressure", 0) + counts.get("threaten", 0) + counts.get("demand", 0), n_turns),
                "threaten_rate": rate(counts.get("threaten", 0), n_turns),
                "repeat_offer_rate": rate(counts.get("repeat_offer", 0), n_turns),
                "action_entropy": entropy(actions),
                "strategy_switch_rate": strategy_switch_rate(actions),
                "first_offer_time": first_any_time(actor_events, {"initial_offer", "counteroffer", "concession_offer", "self_favoring_offer", "demand"}),
                "first_concession_time": first_time(actor_events, "concession_offer"),
                "first_pressure_time": first_any_time(actor_events, {"pressure", "threaten", "demand"}),
                "mean_offer_shift": mean_nonnegative(actor_offers, "offer_shift_distance"),
                "mean_concession_magnitude": mean_action_shift(actor_offers, "concession_offer"),
                "mean_self_favoring_shift": mean_action_shift(actor_offers, "self_favoring_offer"),
                "mean_partner_favoring_shift": mean_action_shift(actor_offers, "concession_offer"),
                "repair_after_escalation_rate": response_after_windows(actor_events, episode_windows, "escalation_window", {"repair"}),
                "concede_after_reject_rate": response_after_partner_action(events, episode_id, actor, "reject", {"concession_offer"}),
                "pressure_after_deadlock_rate": response_after_windows(actor_events, episode_windows, "deadlock_window", {"pressure", "threaten", "demand"}),
                "mean_trust_delta_after_actor": float(actor_events["trust_delta"].mean()) if n_turns else 0.0,
                "mean_conflict_delta_after_actor": float(actor_events["conflict_delta"].mean()) if n_turns else 0.0,
                "mean_utility_delta_after_actor": float(actor_events["utility_delta"].mean()) if n_turns else 0.0,
                "observed_allocation_offer_count": int(len(observed_offers)),
                "deal_outcome": episode_outcomes[episode_id]["deal_outcome"],
                "attractor_label_v2": episode_outcomes[episode_id]["attractor_label_v2"],
            }
            for action, column in ACTION_COLUMNS.items():
                profile[column] = rate(counts.get(action, 0), n_turns)
            profile["rigidity_score"] = max(
                0.0,
                profile["repeat_offer_rate"] + (1.0 - profile["strategy_switch_rate"]) * 0.5 - profile["concession_offer_rate"],
            )
            rows.append(profile)

    profiles = pd.DataFrame(rows)
    profiles.to_parquet(ACTOR_EPISODE_PROFILES, index=False)
    return profiles


def rate(count: float, total: int) -> float:
    return float(count) / total if total else 0.0


def mean_nonnegative(frame: pd.DataFrame, column: str) -> float:
    values = frame[frame[column] >= 0][column]
    return float(values.mean()) if not values.empty else 0.0


def mean_action_shift(frame: pd.DataFrame, action: str) -> float:
    subset = frame[(frame["action_type_v2"] == action) & (frame["offer_shift_distance"] >= 0)]
    return float(subset["offer_shift_distance"].mean()) if not subset.empty else 0.0


def first_any_time(frame: pd.DataFrame, actions: set[str]) -> float:
    hits = frame[frame["action_type_v2"].isin(actions)]
    if hits.empty:
        return -1.0
    return float(hits["t"].iloc[0])


def response_after_windows(
    actor_events: pd.DataFrame,
    windows: pd.DataFrame,
    window_label: str,
    response_actions: set[str],
) -> float:
    relevant = windows[windows["window_label"] == window_label]
    if relevant.empty:
        return 0.0
    hits = 0
    for window in relevant.itertuples(index=False):
        next_actions = actor_events[(actor_events["t"] > window.end_t) & (actor_events["t"] <= window.end_t + 3)]
        if next_actions["action_type_v2"].isin(response_actions).any():
            hits += 1
    return hits / len(relevant)


def response_after_partner_action(
    events: pd.DataFrame,
    episode_id: str,
    actor: str,
    partner_action: str,
    response_actions: set[str],
) -> float:
    episode = events[events["episode_id"] == episode_id].sort_values("t")
    partner_hits = episode[(episode["actor"] != actor) & (episode["action_type_v2"] == partner_action)]
    if partner_hits.empty:
        return 0.0
    hits = 0
    actor_events = episode[episode["actor"] == actor]
    for hit in partner_hits.itertuples(index=False):
        responses = actor_events[(actor_events["t"] > hit.t) & (actor_events["t"] <= hit.t + 3)]
        if responses["action_type_v2"].isin(response_actions).any():
            hits += 1
    return hits / len(partner_hits)


def main() -> None:
    profiles = build_actor_profiles()
    print(f"Saved {ACTOR_EPISODE_PROFILES}")
    print(f"rows={len(profiles)} actors={profiles['actor'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()

