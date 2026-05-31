from __future__ import annotations

from collections import Counter

import pandas as pd

from kanonar_behavior_lab.src.paths import REPORTS_DIR, ensure_output_dirs
from kanonar_behavior_lab.src.trajectories.build_v2 import (
    EPISODE_FEATURES_V2,
    EVENTS_V2,
    OFFER_DYNAMICS,
    TRAJECTORY_WINDOWS,
    build_v2_tables,
)


REPORT_V2 = REPORTS_DIR / "behavior_report_v2.md"


def make_report_v2() -> str:
    ensure_output_dirs()
    if not all(path.exists() for path in (EVENTS_V2, OFFER_DYNAMICS, TRAJECTORY_WINDOWS, EPISODE_FEATURES_V2)):
        build_v2_tables()

    events = pd.read_parquet(EVENTS_V2)
    offers = pd.read_parquet(OFFER_DYNAMICS)
    windows = pd.read_parquet(TRAJECTORY_WINDOWS)
    features = pd.read_parquet(EPISODE_FEATURES_V2)

    action_counts = events["action_type_v2"].value_counts()
    window_counts = windows["window_label"].value_counts()
    attractor_counts = features["attractor_label_v2"].value_counts()
    window_sequences = top_window_sequences(windows)

    counteroffer_count = int(action_counts.get("counteroffer", 0))
    offer_family_count = int(
        action_counts.get("initial_offer", 0)
        + action_counts.get("counteroffer", 0)
        + action_counts.get("repeat_offer", 0)
        + action_counts.get("concession_offer", 0)
        + action_counts.get("self_favoring_offer", 0)
        + action_counts.get("demand", 0)
        + action_counts.get("deal_formalization", 0)
    )

    lines = [
        "# CaSiNo Behavioral Dataset Report v2",
        "",
        "This report refines the v1 rule-based translator by separating overloaded acceptance and offer mechanics, then adding local window-level regime labels.",
        "",
        "CaSiNo attribution: Chawla et al., NAACL 2021, accessed through ConvoKit `casino-corpus`, CC BY 4.0.",
        "",
        "`trust`, `conflict`, and `utility` remain rule-based internal simulation scalars.",
        "",
        "## Output Counts",
        "",
        f"- events_v2 rows: {len(events)}",
        f"- offer_dynamics rows: {len(offers)}",
        f"- trajectory_windows rows: {len(windows)}",
        f"- episode_features_v2 rows: {len(features)}",
        "",
        "## Counteroffer Split",
        "",
        f"- v2 counteroffer rows: {counteroffer_count}",
        f"- v2 offer-family rows: {offer_family_count}",
        f"- counteroffer share inside offer family: {counteroffer_count / offer_family_count:.3f}",
        "",
        "## Soft vs Terminal Acceptance",
        "",
        f"- terminal_accept: {int(action_counts.get('terminal_accept', 0))}",
        f"- soft_accept: {int(action_counts.get('soft_accept', 0))}",
        f"- acknowledge: {int(action_counts.get('acknowledge', 0))}",
        "",
        "## Action Distribution v2",
        "",
    ]
    for action, count in action_counts.items():
        lines.append(f"- `{action}`: {int(count)}")

    lines.extend(["", "## Window Labels", ""])
    for label, count in window_counts.items():
        lines.append(f"- `{label}`: {int(count)}")

    lines.extend(["", "## Episode Attractors v2", ""])
    for label, count in attractor_counts.items():
        lines.append(f"- `{label}`: {int(count)}")

    lines.extend(["", "## Top Window Sequences", ""])
    for sequence, count in window_sequences:
        lines.append(f"- `{sequence}`: {count}")

    lines.extend(["", "## Offer Dynamics", ""])
    if offers.empty:
        lines.append("- No offer rows were detected.")
    else:
        shift_counts = offers["offer_shift_from_previous"].value_counts().to_dict()
        allocation_count = int(offers["allocation_present"].sum())
        lines.append(f"- allocation_present rows: {allocation_count}")
        lines.append(f"- offer_shift_from_previous: `{shift_counts}`")
        allocation_distances = offers[offers["offer_shift_distance"] >= 0]["offer_shift_distance"]
        if not allocation_distances.empty:
            lines.append(f"- mean allocation shift distance: {allocation_distances.mean():.3f}")

    lines.extend(["", "## Early Signals", ""])
    lines.append(
        "- no_deal episodes have higher pressure/deadlock-window counts in v2 features; use `episode_features_v2.parquet` for exact modeling."
    )
    lines.append(
        "- deadlock is now observable as a local window label even when the whole dialogue later reaches a deal."
    )
    lines.append("")

    content = "\n".join(lines)
    REPORT_V2.write_text(content, encoding="utf-8")
    return content


def top_window_sequences(windows: pd.DataFrame, limit: int = 10) -> list[tuple[str, int]]:
    sequences: list[str] = []
    for _, group in windows.sort_values(["episode_id", "start_t"]).groupby("episode_id"):
        sequences.append(" -> ".join(group["window_label"].tolist()))
    return Counter(sequences).most_common(limit)


def main() -> None:
    make_report_v2()
    print(f"Saved {REPORT_V2}")


if __name__ == "__main__":
    main()

