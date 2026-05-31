from __future__ import annotations

from typing import Any

import pandas as pd

from kanonar_behavior_lab.src.annotation.action_rules import classify_event
from kanonar_behavior_lab.src.annotation.state_deltas import STATE_DELTAS
from kanonar_behavior_lab.src.ingest.load_casino import build_raw_dialogues
from kanonar_behavior_lab.src.paths import EVENTS, RAW_DIALOGUES, TRAJECTORIES, ensure_output_dirs


START_TRUST = 0.50
START_CONFLICT = 0.10
START_UTILITY = 0.00


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def load_or_build_raw_dialogues() -> pd.DataFrame:
    if RAW_DIALOGUES.exists():
        return pd.read_parquet(RAW_DIALOGUES)
    return build_raw_dialogues()


def build_events_and_trajectories() -> tuple[pd.DataFrame, pd.DataFrame]:
    ensure_output_dirs()
    raw = load_or_build_raw_dialogues()

    event_rows: list[dict[str, Any]] = []
    trajectory_rows: list[dict[str, Any]] = []

    for episode_id, group in raw.groupby("episode_id", sort=True):
        trust = START_TRUST
        conflict = START_CONFLICT
        utility = START_UTILITY
        prior_offer_seen = False

        for row in group.sort_values("t").itertuples(index=False):
            decision = classify_event(
                text=row.text,
                annotations=row.annotations,
                terminal_data=row.terminal_data,
                issue2youget=row.issue2youget,
                issue2theyget=row.issue2theyget,
                prior_offer_seen=prior_offer_seen,
            )
            deltas = STATE_DELTAS[decision.action_type]
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
                    "t": int(row.t),
                    "actor": row.actor,
                    "target": row.target,
                    "text": row.text,
                    "action_type": decision.action_type,
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
                    "outcome": outcome,
                }
            )
            trajectory_rows.append(
                {
                    "episode_id": episode_id,
                    "t": int(row.t),
                    "action_type": decision.action_type,
                    "trust": trust,
                    "conflict": conflict,
                    "utility": utility,
                    "trust_delta": trust_delta,
                    "conflict_delta": conflict_delta,
                    "utility_delta": utility_delta,
                }
            )
            if decision.offer_present:
                prior_offer_seen = True

    events = pd.DataFrame(event_rows)
    trajectories = pd.DataFrame(trajectory_rows)
    events.to_parquet(EVENTS, index=False)
    trajectories.to_parquet(TRAJECTORIES, index=False)
    return events, trajectories


def normalize_outcome(terminal_data: object) -> str:
    value = "" if terminal_data is None else str(terminal_data)
    if value == "accept_deal":
        return "deal"
    if value in {"reject_deal", "walk_away"}:
        return "no_deal"
    return ""


def main() -> None:
    events, trajectories = build_events_and_trajectories()
    print(f"Saved {EVENTS}")
    print(f"Saved {TRAJECTORIES}")
    print(f"events={len(events)} trajectories={len(trajectories)} episodes={events['episode_id'].nunique()}")


if __name__ == "__main__":
    main()

