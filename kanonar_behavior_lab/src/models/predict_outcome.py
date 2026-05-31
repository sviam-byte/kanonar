from __future__ import annotations

import json
from typing import Any

import pandas as pd

from kanonar_behavior_lab.src.paths import EPISODE_FEATURES, EVENTS, PREDICTION_REPORT, ensure_output_dirs
from kanonar_behavior_lab.src.trajectories.extract_features import build_episode_features


FEATURE_COLUMNS = [
    "n_turns",
    "offer_count",
    "reject_count",
    "accept_count",
    "concession_count",
    "pressure_count",
    "repair_count",
    "max_conflict",
    "mean_conflict",
    "conflict_slope",
    "trust_slope",
    "utility_slope",
    "first_reject_time",
    "first_concession_time",
    "time_to_accept",
    "action_entropy",
]


def build_prefix_features(prefix_fraction: float) -> pd.DataFrame:
    if not EVENTS.exists():
        build_episode_features()
    events = pd.read_parquet(EVENTS)
    rows: list[dict[str, Any]] = []
    for episode_id, group in events.groupby("episode_id", sort=True):
        group = group.sort_values("t")
        cutoff = max(1, int(len(group) * prefix_fraction))
        prefix = group.head(cutoff)
        counts = prefix["action_type"].value_counts()
        rows.append(
            {
                "episode_id": episode_id,
                "n_turns": int(len(prefix)),
                "offer_count": int(counts.get("offer", 0) + counts.get("counteroffer", 0)),
                "reject_count": int(counts.get("reject", 0)),
                "accept_count": int(counts.get("accept", 0)),
                "concession_count": int(counts.get("concede", 0)),
                "pressure_count": int(counts.get("pressure", 0) + counts.get("threaten", 0)),
                "repair_count": int(counts.get("repair", 0)),
                "max_conflict": float(prefix["conflict_delta"].cumsum().max()),
                "mean_conflict": float(prefix["conflict_delta"].mean()),
                "conflict_slope": simple_delta_slope(prefix["conflict_delta"]),
                "trust_slope": simple_delta_slope(prefix["trust_delta"]),
                "utility_slope": simple_delta_slope(prefix["utility_delta"]),
                "first_reject_time": first_flag_time(prefix, "reject_present"),
                "first_concession_time": first_flag_time(prefix, "concession_present"),
                "time_to_accept": first_flag_time(prefix, "accept_present"),
                "action_entropy": action_entropy(prefix["action_type"].tolist()),
            }
        )
    return pd.DataFrame(rows)


def simple_delta_slope(series: pd.Series) -> float:
    if len(series) <= 1:
        return 0.0
    cumulative = series.cumsum()
    return float((cumulative.iloc[-1] - cumulative.iloc[0]) / (len(cumulative) - 1))


def first_flag_time(frame: pd.DataFrame, column: str) -> float:
    hits = frame[frame[column]]
    if hits.empty:
        return -1.0
    return float(hits["t"].iloc[0])


def action_entropy(actions: list[str]) -> float:
    from kanonar_behavior_lab.src.trajectories.extract_features import entropy

    return entropy(actions)


def fit_or_fallback(features: pd.DataFrame, target: str) -> dict[str, Any]:
    try:
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import accuracy_score, balanced_accuracy_score
        from sklearn.model_selection import train_test_split
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import make_pipeline
    except ImportError:
        return fallback_feature_summary(features, target)

    X = features[FEATURE_COLUMNS].fillna(-1.0)
    y = features[target]
    if y.nunique() < 2:
        return {"mode": "skipped", "reason": f"target {target} has one class"}

    stratify = y if y.value_counts().min() >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.25,
        random_state=42,
        stratify=stratify,
    )
    model = make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42),
    )
    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    logistic = model.named_steps["logisticregression"]
    if len(logistic.classes_) == 2:
        coefs = logistic.coef_[0]
        ranked = sorted(
            zip(FEATURE_COLUMNS, coefs, strict=True),
            key=lambda item: abs(item[1]),
            reverse=True,
        )[:8]
        top_features = [{"feature": name, "weight": float(weight)} for name, weight in ranked]
    else:
        coefs = abs(logistic.coef_).mean(axis=0)
        ranked = sorted(
            zip(FEATURE_COLUMNS, coefs, strict=True),
            key=lambda item: item[1],
            reverse=True,
        )[:8]
        top_features = [{"feature": name, "mean_abs_weight": float(weight)} for name, weight in ranked]

    return {
        "mode": "logistic_regression",
        "target": target,
        "classes": list(map(str, logistic.classes_)),
        "accuracy": float(accuracy_score(y_test, predictions)),
        "balanced_accuracy": float(balanced_accuracy_score(y_test, predictions)),
        "top_features": top_features,
    }


def fallback_feature_summary(features: pd.DataFrame, target: str) -> dict[str, Any]:
    grouped = features.groupby(target)[FEATURE_COLUMNS].mean(numeric_only=True)
    return {
        "mode": "fallback_group_means",
        "target": target,
        "class_means": json.loads(grouped.to_json(orient="index")),
    }


def run_predictions() -> dict[str, Any]:
    ensure_output_dirs()
    if not EPISODE_FEATURES.exists():
        build_episode_features()
    labels = pd.read_parquet(EPISODE_FEATURES)[["episode_id", "deal_outcome", "attractor_label"]]

    report: dict[str, Any] = {"prefixes": {}}
    for fraction in (0.2, 0.4):
        prefix_features = build_prefix_features(fraction).merge(labels, on="episode_id", how="left")
        report["prefixes"][str(fraction)] = {
            "deal_outcome": fit_or_fallback(prefix_features, "deal_outcome"),
            "attractor_label": fit_or_fallback(prefix_features, "attractor_label"),
        }

    PREDICTION_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    report = run_predictions()
    print(f"Saved {PREDICTION_REPORT}")
    print(json.dumps(report, ensure_ascii=False, indent=2)[:2000])


if __name__ == "__main__":
    main()

