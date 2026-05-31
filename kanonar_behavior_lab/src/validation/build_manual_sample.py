from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from kanonar_behavior_lab.src.paths import PROCESSED_DIR, REPORTS_DIR, ensure_output_dirs
from kanonar_behavior_lab.src.trajectories.build_v2 import EVENTS_V2, TRAJECTORY_WINDOWS, build_v2_tables


SAMPLE_TARGETS = {
    "counteroffer": 50,
    "concession_offer": 50,
    "demand": 50,
    "self_favoring_offer": 50,
    "soft_accept": 50,
    "terminal_accept": 50,
    "escalation_window": 50,
    "deadlock_window": None,
}

MANUAL_VALIDATION_SAMPLE = PROCESSED_DIR / "manual_validation_sample.parquet"
MANUAL_VALIDATION_TEMPLATE = PROCESSED_DIR / "manual_validation_template.csv"
MANUAL_VALIDATION_RESULTS = PROCESSED_DIR / "manual_validation_results.parquet"
VALIDATION_REPORT = REPORTS_DIR / "validation_report.md"


def load_inputs() -> tuple[pd.DataFrame, pd.DataFrame]:
    if not EVENTS_V2.exists() or not TRAJECTORY_WINDOWS.exists():
        build_v2_tables()
    return pd.read_parquet(EVENTS_V2), pd.read_parquet(TRAJECTORY_WINDOWS)


def build_event_sample(events: pd.DataFrame, label: str, n: int) -> pd.DataFrame:
    subset = events[events["action_type_v2"] == label].copy()
    if len(subset) > n:
        subset = subset.sample(n=n, random_state=42)
    subset = subset.sort_values(["episode_id", "t"])
    return pd.DataFrame(
        {
            "sample_type": "event",
            "episode_id": subset["episode_id"],
            "t": subset["t"],
            "start_t": pd.NA,
            "end_t": pd.NA,
            "actor": subset["actor"],
            "text_or_window_text": subset["text"],
            "predicted_label": subset["action_type_v2"],
        }
    )


def build_window_sample(events: pd.DataFrame, windows: pd.DataFrame, label: str, n: int | None) -> pd.DataFrame:
    subset = windows[windows["window_label"] == label].copy()
    if n is not None and len(subset) > n:
        subset = subset.sample(n=n, random_state=42)
    subset = subset.sort_values(["episode_id", "start_t"])
    texts = []
    actors = []
    for row in subset.itertuples(index=False):
        event_slice = events[
            (events["episode_id"] == row.episode_id)
            & (events["t"] >= row.start_t)
            & (events["t"] <= row.end_t)
        ].sort_values("t")
        texts.append(
            " || ".join(
                f"t={event.t} {event.actor}: {event.text}"
                for event in event_slice.itertuples(index=False)
            )
        )
        actors.append("window")
    return pd.DataFrame(
        {
            "sample_type": "window",
            "episode_id": subset["episode_id"],
            "t": pd.NA,
            "start_t": subset["start_t"],
            "end_t": subset["end_t"],
            "actor": actors,
            "text_or_window_text": texts,
            "predicted_label": subset["window_label"],
        }
    )


def build_manual_validation_sample() -> pd.DataFrame:
    ensure_output_dirs()
    events, windows = load_inputs()

    frames: list[pd.DataFrame] = []
    for label, n in SAMPLE_TARGETS.items():
        if label.endswith("_window"):
            frames.append(build_window_sample(events, windows, label, n))
        else:
            assert n is not None
            frames.append(build_event_sample(events, label, n))

    sample = pd.concat(frames, ignore_index=True)
    sample.insert(0, "sample_id", [f"mv_{idx:04d}" for idx in range(len(sample))])
    sample["human_label"] = ""
    sample["judgment"] = ""
    sample["notes"] = ""

    sample.to_parquet(MANUAL_VALIDATION_SAMPLE, index=False)
    sample.to_csv(MANUAL_VALIDATION_TEMPLATE, index=False, encoding="utf-8")
    if not MANUAL_VALIDATION_RESULTS.exists():
        sample.to_parquet(MANUAL_VALIDATION_RESULTS, index=False)
    write_validation_report(sample)
    return sample


def write_validation_report(sample: pd.DataFrame) -> None:
    results = pd.read_parquet(MANUAL_VALIDATION_RESULTS) if MANUAL_VALIDATION_RESULTS.exists() else sample
    judged = results[results["judgment"].isin(["correct", "partially_correct", "wrong"])]
    lines = [
        "# Manual Validation Report",
        "",
        "This report prepares a human validation sample for CaSiNo v2 labels.",
        "",
        "CaSiNo attribution: Chawla et al., NAACL 2021, ConvoKit `casino-corpus`, CC BY 4.0.",
        "",
        "The labels are behavior-profile annotations, not personality traits.",
        "",
        "## Sample Counts",
        "",
    ]
    for label, count in sample["predicted_label"].value_counts().sort_index().items():
        lines.append(f"- `{label}`: {int(count)}")

    lines.extend(["", "## Precision By Label", ""])
    if judged.empty:
        lines.append("No human judgments filled yet. Precision is pending.")
    else:
        for label, group in judged.groupby("predicted_label"):
            score = ((group["judgment"] == "correct") | (group["judgment"] == "partially_correct")).mean()
            lines.append(f"- `{label}`: {score:.3f} on {len(group)} judged rows")

    lines.extend(
        [
            "",
            "## Required Judgment Values",
            "",
            "`correct`, `partially_correct`, or `wrong`.",
            "",
            "If `wrong`, fill `human_label` with the class a human reader would assign.",
            "",
            "## Machine-readable summary",
            "",
            "```json",
            json.dumps(
                {
                    "sample_rows": int(len(sample)),
                    "judged_rows": int(len(judged)),
                    "sample_counts": {str(k): int(v) for k, v in sample["predicted_label"].value_counts().items()},
                },
                ensure_ascii=False,
                indent=2,
            ),
            "```",
        ]
    )
    VALIDATION_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    sample = build_manual_validation_sample()
    print(f"Saved {MANUAL_VALIDATION_SAMPLE}")
    print(f"Saved {MANUAL_VALIDATION_TEMPLATE}")
    print(f"Saved {MANUAL_VALIDATION_RESULTS}")
    print(f"Saved {VALIDATION_REPORT}")
    print(f"rows={len(sample)} counts={sample['predicted_label'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()

