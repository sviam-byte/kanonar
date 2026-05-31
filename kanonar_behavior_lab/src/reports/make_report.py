from __future__ import annotations

import json
from collections import Counter

import pandas as pd

from kanonar_behavior_lab.src.models.predict_outcome import run_predictions
from kanonar_behavior_lab.src.paths import (
    BEHAVIOR_REPORT,
    EPISODE_FEATURES,
    EVENTS,
    PREDICTION_REPORT,
    TRAJECTORIES,
    ensure_output_dirs,
)
from kanonar_behavior_lab.src.trajectories.extract_features import build_episode_features


def top_action_patterns(events: pd.DataFrame, limit: int = 10) -> list[tuple[str, int]]:
    patterns = []
    for _, group in events.groupby("episode_id", sort=True):
        actions = group.sort_values("t")["action_type"].head(8).tolist()
        patterns.append(" -> ".join(actions))
    return Counter(patterns).most_common(limit)


def choose_example(features: pd.DataFrame, events: pd.DataFrame) -> str:
    candidates = features[
        (features["deal_outcome"] == "deal")
        & (features["reject_count"] > 0)
        & (features["concession_count"] > 0)
    ]
    if candidates.empty:
        candidates = features[features["deal_outcome"] == "deal"]
    if candidates.empty:
        candidates = features
    return str(candidates.sort_values(["attractor_label", "episode_id"]).iloc[0]["episode_id"])


def bool_text(value: bool) -> str:
    return "yes" if value else "no"


def format_example(episode_id: str, events: pd.DataFrame, trajectories: pd.DataFrame, features: pd.DataFrame) -> str:
    episode_events = events[events["episode_id"] == episode_id].sort_values("t")
    episode_trajectory = trajectories[trajectories["episode_id"] == episode_id].sort_values("t")
    feature_row = features[features["episode_id"] == episode_id].iloc[0]

    actions = episode_events["action_type"].tolist()
    trust_values = [0.50] + episode_trajectory["trust"].round(2).tolist()
    conflict_values = [0.10] + episode_trajectory["conflict"].round(2).tolist()
    utility_values = [0.00] + episode_trajectory["utility"].round(2).tolist()
    mid = feature_row["n_turns"] / 2

    return "\n".join(
        [
            f"Dialogue {episode_id}",
            "",
            "Pattern:",
            " -> ".join(actions),
            "",
            "Trajectory:",
            "trust:    " + " -> ".join(f"{value:.2f}" for value in trust_values),
            "conflict: " + " -> ".join(f"{value:.2f}" for value in conflict_values),
            "utility:  " + " -> ".join(f"{value:.2f}" for value in utility_values),
            "",
            "Attractor:",
            str(feature_row["attractor_label"]),
            "",
            "Predictive signs:",
            f"early reject: {bool_text(feature_row['first_reject_time'] != -1 and feature_row['first_reject_time'] <= mid)}",
            f"concession before midpoint: {bool_text(feature_row['first_concession_time'] != -1 and feature_row['first_concession_time'] <= mid)}",
            f"pressure: {bool_text(feature_row['pressure_count'] > 0)}",
            f"final outcome: {feature_row['deal_outcome']}",
        ]
    )


def prediction_section(report: dict) -> str:
    lines = ["## Early Prediction Baseline", ""]
    for prefix, metrics in report["prefixes"].items():
        lines.append(f"### First {int(float(prefix) * 100)}% of turns")
        for target, result in metrics.items():
            lines.append(f"- `{target}` mode: `{result.get('mode')}`")
            if "accuracy" in result:
                lines.append(
                    f"  accuracy={result['accuracy']:.3f}, balanced_accuracy={result['balanced_accuracy']:.3f}"
                )
            top = result.get("top_features", [])[:5]
            if top:
                formatted = ", ".join(item["feature"] for item in top)
                lines.append(f"  top features: {formatted}")
        lines.append("")
    return "\n".join(lines)


def mean_trajectory_section(trajectories: pd.DataFrame) -> list[str]:
    rows = []
    for _, group in trajectories.groupby("episode_id", sort=True):
        group = group.sort_values("t")
        n_turns = len(group)
        for _, row in group.iterrows():
            progress = 1.0 if n_turns <= 1 else (int(row["t"]) - 1) / (n_turns - 1)
            bin_label = round(progress * 4) / 4
            rows.append(
                {
                    "progress": bin_label,
                    "trust": row["trust"],
                    "conflict": row["conflict"],
                    "utility": row["utility"],
                }
            )
    summary = pd.DataFrame(rows).groupby("progress")[["trust", "conflict", "utility"]].mean().reset_index()
    lines = ["## Mean T/C/U Trajectory", ""]
    lines.append("| Progress | Trust | Conflict | Utility |")
    lines.append("| ---: | ---: | ---: | ---: |")
    for row in summary.itertuples(index=False):
        lines.append(f"| {row.progress:.2f} | {row.trust:.3f} | {row.conflict:.3f} | {row.utility:.3f} |")
    lines.append("")
    return lines


def make_report() -> str:
    ensure_output_dirs()
    if not EPISODE_FEATURES.exists():
        build_episode_features()
    if not PREDICTION_REPORT.exists():
        run_predictions()

    events = pd.read_parquet(EVENTS)
    trajectories = pd.read_parquet(TRAJECTORIES)
    features = pd.read_parquet(EPISODE_FEATURES)
    prediction_report = json.loads(PREDICTION_REPORT.read_text(encoding="utf-8"))

    final_means = features[["final_trust", "final_conflict", "final_utility"]].mean()
    attractor_counts = features["attractor_label"].value_counts().to_dict()
    deal_counts = features["deal_outcome"].value_counts().to_dict()
    example_id = choose_example(features, events)

    lines = [
        "# CaSiNo Behavioral Dataset Report",
        "",
        "This report describes a rule-based experimental translation from CaSiNo dialogue text to Kanonar behavior-lab events and T/C/U trajectories.",
        "",
        "CaSiNo attribution: Chawla et al., NAACL 2021, accessed through ConvoKit `casino-corpus`, CC BY 4.0.",
        "",
        "The `trust`, `conflict`, and `utility` values are rule-based simulation scalars, not measured psychological quantities.",
        "",
        "## Dataset Counts",
        "",
        f"- episodes: {features['episode_id'].nunique()}",
        f"- events: {len(events)}",
        f"- trajectory rows: {len(trajectories)}",
        "",
        "## Outcome Distribution",
        "",
        f"- deal outcome: `{deal_counts}`",
        f"- attractor labels: `{attractor_counts}`",
        "",
        "## Mean Final Trajectory State",
        "",
        f"- trust: {final_means['final_trust']:.3f}",
        f"- conflict: {final_means['final_conflict']:.3f}",
        f"- utility: {final_means['final_utility']:.3f}",
        "",
    ]
    lines.extend(mean_trajectory_section(trajectories))
    lines.extend(["## Top Action Prefix Patterns", ""])
    for pattern, count in top_action_patterns(events):
        lines.append(f"- `{pattern}`: {count}")
    lines.extend(["", prediction_section(prediction_report), "## Worked Example", "", "```text"])
    lines.append(format_example(example_id, events, trajectories, features))
    lines.extend(["```", ""])

    content = "\n".join(lines)
    BEHAVIOR_REPORT.write_text(content, encoding="utf-8")
    return content


def main() -> None:
    make_report()
    print(f"Saved {BEHAVIOR_REPORT}")


if __name__ == "__main__":
    main()
