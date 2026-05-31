from __future__ import annotations

import json

import pandas as pd

from kanonar_behavior_lab.src.paths import PROCESSED_DIR, REPORTS_DIR, ensure_output_dirs
from kanonar_behavior_lab.src.trajectories.build_v2 import (
    EVENTS_V2,
    OFFER_DYNAMICS,
    TRAJECTORY_WINDOWS,
    build_v2_tables,
)


TRANSITION_MATRIX = PROCESSED_DIR / "transition_matrix.parquet"
ALLOCATION_PROGRESS = PROCESSED_DIR / "allocation_progress.parquet"
TRANSITION_REPORT = REPORTS_DIR / "transition_report.md"


def load_inputs() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if not all(path.exists() for path in (EVENTS_V2, OFFER_DYNAMICS, TRAJECTORY_WINDOWS)):
        build_v2_tables()
    return (
        pd.read_parquet(EVENTS_V2),
        pd.read_parquet(OFFER_DYNAMICS),
        pd.read_parquet(TRAJECTORY_WINDOWS),
    )


def build_transition_matrix() -> tuple[pd.DataFrame, pd.DataFrame]:
    ensure_output_dirs()
    events, offers, windows = load_inputs()
    transitions = []
    enriched_windows = add_window_action_flags(events, windows)

    for _, group in enriched_windows.sort_values(["episode_id", "start_t"]).groupby("episode_id"):
        labels = group["window_label"].tolist()
        for idx in range(len(labels) - 1):
            current = labels[idx]
            nxt = labels[idx + 1]
            transitions.append({"current_window": current, "next_window": nxt, "count": 1})

    transition_counts = pd.DataFrame(transitions)
    if transition_counts.empty:
        matrix = pd.DataFrame(columns=["current_window", "next_window", "count", "probability"])
    else:
        matrix = (
            transition_counts.groupby(["current_window", "next_window"], as_index=False)["count"]
            .sum()
            .sort_values(["current_window", "next_window"])
        )
        totals = matrix.groupby("current_window")["count"].transform("sum")
        matrix["probability"] = matrix["count"] / totals

    allocation_progress = build_allocation_progress(events, offers)
    matrix.to_parquet(TRANSITION_MATRIX, index=False)
    allocation_progress.to_parquet(ALLOCATION_PROGRESS, index=False)
    write_transition_report(matrix, enriched_windows, allocation_progress)
    return matrix, allocation_progress


def add_window_action_flags(events: pd.DataFrame, windows: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for row in windows.itertuples(index=False):
        event_slice = events[
            (events["episode_id"] == row.episode_id)
            & (events["t"] >= row.start_t)
            & (events["t"] <= row.end_t)
        ]
        action_set = set(event_slice["action_type_v2"])
        rows.append(
            {
                **row._asdict(),
                "has_concession_offer": "concession_offer" in action_set,
                "has_repeat_offer": "repeat_offer" in action_set,
                "has_demand": "demand" in action_set,
                "has_pressure": bool(action_set.intersection({"pressure", "threaten", "demand"})),
            }
        )
    return pd.DataFrame(rows)


def build_allocation_progress(events: pd.DataFrame, offers: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for _, group in offers.sort_values(["episode_id", "t"]).groupby("episode_id"):
        observed = group[group["allocation_present"]].copy()
        final_allocation = {}
        if not observed.empty:
            final_allocation = parse_offer_allocation(observed.iloc[-1]["issue2youget"])
        previous_distance = None
        first_distance = None
        for offer in group.itertuples(index=False):
            event_row = events[(events["episode_id"] == offer.episode_id) & (events["t"] == offer.t)].iloc[0]
            observed_row = bool(offer.allocation_present)
            offer_allocation = parse_offer_allocation(offer.issue2youget)
            distance = allocation_distance(offer_allocation, final_allocation) if observed_row and final_allocation else -1.0
            if observed_row and distance >= 0:
                if first_distance is None:
                    first_distance = distance
                distance_delta = 0.0 if previous_distance is None else previous_distance - distance
                previous_distance = distance
                if first_distance == 0:
                    observed_proxy = 1.0
                else:
                    observed_proxy = max(0.0, min(1.0, 1.0 - distance / max(first_distance, 1.0)))
            else:
                distance_delta = 0.0
                observed_proxy = float("nan")
            rows.append(
                {
                    "episode_id": offer.episode_id,
                    "t": int(offer.t),
                    "actor": offer.actor,
                    "action_type_v2": offer.action_type_v2,
                    "allocation_observed": observed_row,
                    "allocation_distance_to_final": distance if observed_row else -1.0,
                    "allocation_distance_delta": distance_delta if observed_row else 0.0,
                    "offer_progress_observed": observed_proxy,
                    "concession_magnitude_observed": max(0.0, distance_delta) if observed_row else 0.0,
                    "mutual_closure_rate_observed": observed_proxy if observed_row else float("nan"),
                    "utility_rule_based": float(event_row["utility"]),
                    "utility_observed_proxy": observed_proxy,
                }
            )
    return pd.DataFrame(rows)


def parse_offer_allocation(raw_value) -> dict[str, int]:
    if raw_value in (None, "", {}, []):
        return {}
    try:
        value = json.loads(str(raw_value)) if not isinstance(raw_value, dict) else raw_value
    except json.JSONDecodeError:
        return {}
    parsed = {}
    for key, item in value.items():
        try:
            parsed[str(key)] = int(item)
        except (TypeError, ValueError):
            continue
    return parsed


def allocation_distance(left: dict[str, int], right: dict[str, int]) -> float:
    keys = sorted(set(left) | set(right))
    if not keys:
        return -1.0
    return float(sum(abs(left.get(key, 0) - right.get(key, 0)) for key in keys))


def conditional_probability(
    windows: pd.DataFrame,
    *,
    current_filter,
    next_filter,
) -> tuple[int, int, float]:
    total = 0
    hits = 0
    for _, group in windows.sort_values(["episode_id", "start_t"]).groupby("episode_id"):
        records = list(group.to_dict("records"))
        for idx in range(len(records) - 1):
            current = records[idx]
            nxt = records[idx + 1]
            if current_filter(current):
                total += 1
                if next_filter(nxt):
                    hits += 1
    return hits, total, hits / total if total else float("nan")


def write_transition_report(matrix: pd.DataFrame, windows: pd.DataFrame, allocation_progress: pd.DataFrame) -> None:
    lines = [
        "# Window Transition Report",
        "",
        "This report summarizes local regime transitions from CaSiNo v2 trajectory windows.",
        "",
        "CaSiNo attribution: Chawla et al., NAACL 2021, ConvoKit `casino-corpus`, CC BY 4.0.",
        "",
        "`trust`, `conflict`, and `utility` are rule-based simulation scalars.",
        "",
        "## Transition Matrix",
        "",
    ]
    for row in matrix.itertuples(index=False):
        lines.append(f"- `{row.current_window}` -> `{row.next_window}`: count={int(row.count)}, p={row.probability:.3f}")

    named = {
        "P(cooperation next | repair current)": conditional_probability(
            windows,
            current_filter=lambda row: row["window_label"] == "repair_window",
            next_filter=lambda row: row["window_label"] == "cooperation_window",
        ),
        "P(escalation next | deadlock current)": conditional_probability(
            windows,
            current_filter=lambda row: row["window_label"] == "deadlock_window",
            next_filter=lambda row: row["window_label"] == "escalation_window",
        ),
        "P(cooperation next | concession_offer in previous window)": conditional_probability(
            windows,
            current_filter=lambda row: row["has_concession_offer"],
            next_filter=lambda row: row["window_label"] == "cooperation_window",
        ),
        "P(deadlock next | repeat_offer + no concession)": conditional_probability(
            windows,
            current_filter=lambda row: row["has_repeat_offer"] and not row["has_concession_offer"],
            next_filter=lambda row: row["window_label"] == "deadlock_window",
        ),
        "P(escalation next | demand + pressure)": conditional_probability(
            windows,
            current_filter=lambda row: row["has_demand"] and row["has_pressure"],
            next_filter=lambda row: row["window_label"] == "escalation_window",
        ),
    }
    lines.extend(["", "## Named Conditional Probabilities", ""])
    for name, (hits, total, prob) in named.items():
        value = "nan" if pd.isna(prob) else f"{prob:.3f}"
        lines.append(f"- {name}: {value} ({hits}/{total})")

    observed = allocation_progress[allocation_progress["allocation_observed"]].copy()
    lines.extend(["", "## Allocation Progress Calibration", ""])
    lines.append(f"- allocation observed rows: {len(observed)}")
    if len(observed) >= 2:
        corr = observed[["utility_rule_based", "utility_observed_proxy"]].corr().iloc[0, 1]
        lines.append(f"- corr(utility_rule_based, utility_observed_proxy): {corr:.3f}")
        if pd.isna(corr) or corr < 0.2:
            lines.append("- calibration warning: weak or missing correlation; do not retune deltas automatically.")
    else:
        lines.append("- calibration warning: not enough observed allocation rows.")

    lines.extend(["", "## Machine-readable named probabilities", "", "```json"])
    lines.append(
        json.dumps(
            {
                name: {"hits": hits, "total": total, "probability": None if pd.isna(prob) else prob}
                for name, (hits, total, prob) in named.items()
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    lines.extend(["```", ""])
    TRANSITION_REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    matrix, allocation_progress = build_transition_matrix()
    print(f"Saved {TRANSITION_MATRIX}")
    print(f"Saved {ALLOCATION_PROGRESS}")
    print(f"Saved {TRANSITION_REPORT}")
    print(f"transitions={len(matrix)} allocation_rows={len(allocation_progress)}")


if __name__ == "__main__":
    main()
