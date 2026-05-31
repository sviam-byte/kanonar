from __future__ import annotations

import json
import math
from collections import Counter
from typing import Any

import pandas as pd

from kanonar_behavior_lab.src.annotation.action_rules_v2 import (
    ACTION_ALPHABET_V2,
    STATE_DELTAS_V2,
    OfferState,
    classify_event_v2,
    parse_json_map,
    update_offer_state,
)
from kanonar_behavior_lab.src.ingest.load_casino import build_raw_dialogues
from kanonar_behavior_lab.src.paths import PROCESSED_DIR, RAW_DIALOGUES, ensure_output_dirs


EVENTS_V2 = PROCESSED_DIR / "events_v2.parquet"
OFFER_DYNAMICS = PROCESSED_DIR / "offer_dynamics.parquet"
TRAJECTORY_WINDOWS = PROCESSED_DIR / "trajectory_windows.parquet"
EPISODE_FEATURES_V2 = PROCESSED_DIR / "episode_features_v2.parquet"

START_TRUST = 0.50
START_CONFLICT = 0.10
START_UTILITY = 0.00


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def load_raw() -> pd.DataFrame:
    if RAW_DIALOGUES.exists():
        return pd.read_parquet(RAW_DIALOGUES)
    return build_raw_dialogues()


def allocation_distance(left: dict[str, int], right: dict[str, int]) -> float:
    keys = sorted(set(left) | set(right))
    if not keys:
        return math.nan
    return float(sum(abs(left.get(key, 0) - right.get(key, 0)) for key in keys))


def build_v2_tables() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    ensure_output_dirs()
    raw = load_raw()

    event_rows: list[dict[str, Any]] = []
    offer_rows: list[dict[str, Any]] = []
    trajectory_rows: list[dict[str, Any]] = []

    for episode_id, group in raw.groupby("episode_id", sort=True):
        trust = START_TRUST
        conflict = START_CONFLICT
        utility = START_UTILITY
        offer_state = OfferState()
        last_allocation_by_actor: dict[str, dict[str, int]] = {}
        final_deal: dict[str, int] = {}

        for row in group.sort_values("t").itertuples(index=False):
            decision = classify_event_v2(
                actor=row.actor,
                text=row.text,
                annotations=row.annotations,
                terminal_data=row.terminal_data,
                issue2youget=row.issue2youget,
                issue2theyget=row.issue2theyget,
                state=offer_state,
            )
            deltas = contextual_deltas(decision.action_type, event_rows, episode_id)
            trust_delta = deltas["trust"]
            conflict_delta = deltas["conflict"]
            utility_delta = deltas["utility"]
            trust = clamp01(trust + trust_delta)
            conflict = clamp01(conflict + conflict_delta)
            utility = clamp01(utility + utility_delta)

            outcome = normalize_outcome(row.terminal_data)
            event_rows.append(
                {
                    "episode_id": episode_id,
                    "dialogue_id": int(row.dialogue_id),
                    "t": int(row.t),
                    "actor": row.actor,
                    "target": row.target,
                    "text": row.text,
                    "action_type_v2": decision.action_type,
                    "emotion": decision.emotion,
                    "intent": decision.intent,
                    "offer_present": decision.offer_present,
                    "reject_present": decision.reject_present,
                    "accept_present": decision.accept_present,
                    "concession_present": decision.concession_present,
                    "repair_present": decision.repair_present,
                    "pressure_present": decision.pressure_present,
                    "trust_delta": trust_delta,
                    "conflict_delta": conflict_delta,
                    "utility_delta": utility_delta,
                    "trust": trust,
                    "conflict": conflict,
                    "utility": utility,
                    "outcome": outcome,
                }
            )

            if decision.offer_present:
                you_get = parse_json_map(row.issue2youget)
                previous_actor_allocation = last_allocation_by_actor.get(row.actor, {})
                shift_distance = allocation_distance(previous_actor_allocation, you_get)
                if outcome == "deal" and you_get:
                    final_deal = you_get
                offer_rows.append(
                    {
                        "episode_id": episode_id,
                        "t": int(row.t),
                        "actor": row.actor,
                        "action_type_v2": decision.action_type,
                        "offer_signature": decision.offer_signature,
                        "offer_shift_from_previous": decision.offer_shift_from_previous,
                        "allocation_present": decision.allocation_present,
                        "issue2youget": row.issue2youget,
                        "issue2theyget": row.issue2theyget,
                        "offer_shift_distance": shift_distance if not math.isnan(shift_distance) else -1.0,
                        "distance_to_final_deal": -1.0,
                    }
                )
                if you_get:
                    last_allocation_by_actor[row.actor] = you_get
                update_offer_state(row.actor, decision, offer_state)

            trajectory_rows.append(
                {
                    "episode_id": episode_id,
                    "t": int(row.t),
                    "action_type_v2": decision.action_type,
                    "trust": trust,
                    "conflict": conflict,
                    "utility": utility,
                    "trust_delta": trust_delta,
                    "conflict_delta": conflict_delta,
                    "utility_delta": utility_delta,
                }
            )

        if final_deal:
            for offer in offer_rows:
                if offer["episode_id"] != episode_id or not offer["allocation_present"]:
                    continue
                offer_allocation = parse_json_map(offer["issue2youget"])
                distance = allocation_distance(offer_allocation, final_deal)
                offer["distance_to_final_deal"] = distance if not math.isnan(distance) else -1.0

    events = pd.DataFrame(event_rows)
    offers = pd.DataFrame(offer_rows)
    trajectories = pd.DataFrame(trajectory_rows)
    windows = build_windows(events)
    features = build_features_v2(events, windows)

    events.to_parquet(EVENTS_V2, index=False)
    offers.to_parquet(OFFER_DYNAMICS, index=False)
    windows.to_parquet(TRAJECTORY_WINDOWS, index=False)
    features.to_parquet(EPISODE_FEATURES_V2, index=False)
    return events, offers, windows, features


def contextual_deltas(action: str, prior_rows: list[dict[str, Any]], episode_id: str) -> dict[str, float]:
    base = dict(STATE_DELTAS_V2[action])
    recent = [row for row in prior_rows[-6:] if row["episode_id"] == episode_id]
    recently_rejected = any(row["action_type_v2"] == "reject" for row in recent[-3:])
    if action == "concession_offer" and recently_rejected:
        base["conflict"] -= 0.04
        base["utility"] += 0.04
    if action == "pressure":
        recent_accept = any(row["action_type_v2"] == "terminal_accept" for row in recent[-2:])
        if recent_accept:
            base["utility"] += 0.10
        else:
            base["conflict"] += 0.05
            base["utility"] -= 0.05
    return base


def normalize_outcome(terminal_data: object) -> str:
    value = "" if terminal_data is None else str(terminal_data)
    if value == "accept_deal":
        return "deal"
    if value in {"reject_deal", "walk_away"}:
        return "no_deal"
    return ""


def build_windows(events: pd.DataFrame, window_size: int = 5) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for episode_id, group in events.groupby("episode_id", sort=True):
        group = group.sort_values("t").reset_index(drop=True)
        for start in range(0, len(group), window_size):
            window = group.iloc[start : start + window_size]
            if window.empty:
                continue
            label = classify_window(window)
            rows.append(
                {
                    "episode_id": episode_id,
                    "window_id": len(rows),
                    "start_t": int(window["t"].iloc[0]),
                    "end_t": int(window["t"].iloc[-1]),
                    "n_turns": int(len(window)),
                    "window_label": label,
                    "reject_count": int((window["action_type_v2"] == "reject").sum()),
                    "concession_count": int((window["action_type_v2"] == "concession_offer").sum()),
                    "pressure_count": int(window["action_type_v2"].isin(["pressure", "threaten", "demand"]).sum()),
                    "repair_count": int((window["action_type_v2"] == "repair").sum()),
                    "utility_slope": simple_slope(window["utility"]),
                    "conflict_slope": simple_slope(window["conflict"]),
                    "trust_slope": simple_slope(window["trust"]),
                }
            )
    return pd.DataFrame(rows)


def classify_window(window: pd.DataFrame) -> str:
    pressure_count = int(window["action_type_v2"].isin(["pressure", "threaten", "demand"]).sum())
    repair_count = int((window["action_type_v2"] == "repair").sum())
    concession_count = int((window["action_type_v2"] == "concession_offer").sum())
    reject_count = int((window["action_type_v2"] == "reject").sum())
    utility_slope = simple_slope(window["utility"])
    conflict_slope = simple_slope(window["conflict"])
    trust_slope = simple_slope(window["trust"])

    if pressure_count > 0 and conflict_slope >= 0.05 and trust_slope <= 0:
        return "escalation_window"
    if reject_count + int((window["action_type_v2"] == "repeat_offer").sum()) >= 2 and concession_count == 0 and utility_slope <= 0.02:
        return "deadlock_window"
    if repair_count > 0 and conflict_slope < 0:
        return "repair_window"
    if concession_count > 0 or utility_slope > 0.08:
        return "cooperation_window"
    return "bargaining_window"


def simple_slope(series: pd.Series) -> float:
    if len(series) <= 1:
        return 0.0
    return float((series.iloc[-1] - series.iloc[0]) / (len(series) - 1))


def entropy(actions: list[str]) -> float:
    if not actions:
        return 0.0
    counts = Counter(actions)
    total = len(actions)
    return -sum((count / total) * math.log2(count / total) for count in counts.values())


def first_time(events: pd.DataFrame, action_values: set[str]) -> float:
    hits = events[events["action_type_v2"].isin(action_values)]
    if hits.empty:
        return -1.0
    return float(hits["t"].iloc[0])


def build_features_v2(events: pd.DataFrame, windows: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for episode_id, group in events.groupby("episode_id", sort=True):
        group = group.sort_values("t")
        counts = group["action_type_v2"].value_counts()
        final = group.iloc[-1]
        episode_windows = windows[windows["episode_id"] == episode_id]
        label_counts = episode_windows["window_label"].value_counts()
        rows.append(
            {
                "episode_id": episode_id,
                "n_turns": int(len(group)),
                "initial_offer_count": int(counts.get("initial_offer", 0)),
                "counteroffer_count": int(counts.get("counteroffer", 0)),
                "repeat_offer_count": int(counts.get("repeat_offer", 0)),
                "concession_offer_count": int(counts.get("concession_offer", 0)),
                "self_favoring_offer_count": int(counts.get("self_favoring_offer", 0)),
                "demand_count": int(counts.get("demand", 0)),
                "soft_accept_count": int(counts.get("soft_accept", 0)),
                "terminal_accept_count": int(counts.get("terminal_accept", 0)),
                "acknowledge_count": int(counts.get("acknowledge", 0)),
                "reject_count": int(counts.get("reject", 0)),
                "pressure_count": int(counts.get("pressure", 0) + counts.get("threaten", 0) + counts.get("demand", 0)),
                "repair_count": int(counts.get("repair", 0)),
                "final_trust": float(final["trust"]),
                "final_conflict": float(final["conflict"]),
                "final_utility": float(final["utility"]),
                "max_conflict": float(group["conflict"].max()),
                "mean_conflict": float(group["conflict"].mean()),
                "conflict_slope": simple_slope(group["conflict"]),
                "trust_slope": simple_slope(group["trust"]),
                "utility_slope": simple_slope(group["utility"]),
                "first_reject_time": first_time(group, {"reject"}),
                "first_concession_time": first_time(group, {"concession_offer"}),
                "time_to_terminal_accept": first_time(group, {"terminal_accept"}),
                "action_entropy": entropy(group["action_type_v2"].tolist()),
                "deadlock_window_count": int(label_counts.get("deadlock_window", 0)),
                "escalation_window_count": int(label_counts.get("escalation_window", 0)),
                "cooperation_window_count": int(label_counts.get("cooperation_window", 0)),
                "repair_window_count": int(label_counts.get("repair_window", 0)),
                "deal_outcome": "deal" if (group["outcome"] == "deal").any() else "no_deal",
                "attractor_label_v2": episode_attractor(group, episode_windows),
            }
        )
    return pd.DataFrame(rows)


def episode_attractor(events: pd.DataFrame, windows: pd.DataFrame) -> str:
    labels = set(windows["window_label"]) if not windows.empty else set()
    final = events.iloc[-1]
    if "escalation_window" in labels and final["conflict"] >= 0.45 and final["trust"] <= 0.45:
        return "escalation"
    if "deadlock_window" in labels and not (events["outcome"] == "deal").any():
        return "deadlock"
    if (events["outcome"] == "deal").any() and final["utility"] >= 0.5 and final["conflict"] <= 0.25:
        return "cooperation"
    return "bargaining"


def main() -> None:
    events, offers, windows, features = build_v2_tables()
    print(f"Saved {EVENTS_V2}")
    print(f"Saved {OFFER_DYNAMICS}")
    print(f"Saved {TRAJECTORY_WINDOWS}")
    print(f"Saved {EPISODE_FEATURES_V2}")
    print(f"events={len(events)} offers={len(offers)} windows={len(windows)} episodes={len(features)}")
    print("actions", events["action_type_v2"].value_counts().to_dict())
    print("windows", windows["window_label"].value_counts().to_dict())


if __name__ == "__main__":
    main()

