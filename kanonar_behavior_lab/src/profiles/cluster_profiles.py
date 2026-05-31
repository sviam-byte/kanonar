from __future__ import annotations

import json
from collections import Counter

import pandas as pd

from kanonar_behavior_lab.src.paths import PROCESSED_DIR, REPORTS_DIR, ensure_output_dirs
from kanonar_behavior_lab.src.profiles.build_trait_axes import AXIS_COLUMNS, TRAIT_AXES, build_trait_axes


CLUSTER_ASSIGNMENTS = PROCESSED_DIR / "cluster_assignments.parquet"
CLUSTER_REPORT = REPORTS_DIR / "cluster_report.md"


def load_axes() -> pd.DataFrame:
    if not TRAIT_AXES.exists():
        build_trait_axes()
    return pd.read_parquet(TRAIT_AXES)


def cluster_name(row: pd.Series) -> str:
    top = row[AXIS_COLUMNS].sort_values(ascending=False).head(2)
    primary = top.index[0]
    secondary = top.index[1]
    if primary == "cooperativeness" and secondary in {"repair_orientation", "fairness_orientation"}:
        return "cooperative_integrator"
    if primary == "assertiveness" and secondary == "rigidity":
        return "hard_bargainer"
    if primary == "aggressive_pressure":
        return "pressuring_escalator"
    if primary == "repair_orientation":
        return "repair_mediator"
    if primary == "rigidity":
        return "rigid_repeater"
    if primary == "flexibility":
        return "flexible_adapter"
    if primary == "fairness_orientation":
        return "conciliatory_adapter"
    return f"{primary}_profile"


def run_clustering() -> pd.DataFrame:
    ensure_output_dirs()
    axes = load_axes()
    try:
        from sklearn.cluster import KMeans
        from sklearn.metrics import adjusted_rand_score, silhouette_score
    except ImportError as exc:
        raise SystemExit("scikit-learn is required for cluster_profiles") from exc

    X = axes[AXIS_COLUMNS].fillna(0.0)
    candidates = []
    for k in range(2, 8):
        model = KMeans(n_clusters=k, random_state=42, n_init=20)
        labels = model.fit_predict(X)
        score = silhouette_score(X, labels)
        candidates.append({"k": k, "silhouette": float(score), "labels": labels})
    best = max(candidates, key=lambda item: item["silhouette"])
    labels = best["labels"]

    assignments = axes[["episode_id", "actor", "deal_outcome", "attractor_label_v2"] + AXIS_COLUMNS].copy()
    assignments["cluster_id"] = labels

    centers = assignments.groupby("cluster_id")[AXIS_COLUMNS].mean()
    names = {cluster_id: cluster_name(row) for cluster_id, row in centers.iterrows()}
    assignments["cluster_name"] = assignments["cluster_id"].map(names)
    assignments.to_parquet(CLUSTER_ASSIGNMENTS, index=False)

    stability = bootstrap_stability(X, int(best["k"]), labels, adjusted_rand_score)
    write_cluster_report(assignments, candidates, int(best["k"]), names, stability)
    return assignments


def bootstrap_stability(X: pd.DataFrame, k: int, reference_labels, adjusted_rand_score) -> dict[str, float]:
    from sklearn.cluster import KMeans

    scores = []
    for seed in range(20):
        sample = X.sample(frac=0.8, replace=False, random_state=seed)
        model = KMeans(n_clusters=k, random_state=seed, n_init=10)
        labels = model.fit_predict(sample)
        reference_subset = pd.Series(reference_labels, index=X.index).loc[sample.index].to_numpy()
        scores.append(float(adjusted_rand_score(reference_subset, labels)))
    return {"mean_ari": sum(scores) / len(scores), "min_ari": min(scores), "max_ari": max(scores)}


def write_cluster_report(
    assignments: pd.DataFrame,
    candidates: list[dict],
    best_k: int,
    names: dict[int, str],
    stability: dict[str, float],
) -> None:
    lines = [
        "# Trait-Like Behavioral Profile Clusters",
        "",
        "These clusters are negotiation behavior profiles, not personality traits.",
        "",
        "CaSiNo attribution: Chawla et al., NAACL 2021, ConvoKit `casino-corpus`, CC BY 4.0.",
        "",
        "Clustering input uses trait-like axes only. Direct outcomes and final T/C/U states are excluded from clustering input and used only for external validation.",
        "",
        "## K Selection",
        "",
    ]
    for candidate in candidates:
        lines.append(f"- k={candidate['k']}: silhouette={candidate['silhouette']:.3f}")
    lines.extend(
        [
            "",
            f"Selected k: `{best_k}`",
            f"Bootstrap stability ARI: mean={stability['mean_ari']:.3f}, min={stability['min_ari']:.3f}, max={stability['max_ari']:.3f}",
            "",
            "## Cluster Profiles",
            "",
        ]
    )

    for cluster_id, group in assignments.groupby("cluster_id"):
        axis_means = group[AXIS_COLUMNS].mean().sort_values(ascending=False)
        outcome_counts = group["deal_outcome"].value_counts().to_dict()
        attractor_counts = group["attractor_label_v2"].value_counts().to_dict()
        examples = group[["episode_id", "actor"]].head(5).to_dict("records")
        lines.append(f"### Cluster {cluster_id}: {names[int(cluster_id)]}")
        lines.append("")
        lines.append(f"- rows: {len(group)}")
        lines.append(f"- top axes: {', '.join(f'{idx}={val:.3f}' for idx, val in axis_means.head(3).items())}")
        lines.append(f"- deal outcomes: `{outcome_counts}`")
        lines.append(f"- attractors: `{attractor_counts}`")
        lines.append(f"- representative examples: `{examples}`")
        lines.append("")

    lines.extend(["## Machine-readable cluster names", "", "```json"])
    lines.append(json.dumps({int(k): v for k, v in names.items()}, ensure_ascii=False, indent=2))
    lines.extend(["```", ""])
    CLUSTER_REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    assignments = run_clustering()
    print(f"Saved {CLUSTER_ASSIGNMENTS}")
    print(f"Saved {CLUSTER_REPORT}")
    print(f"rows={len(assignments)} clusters={assignments['cluster_name'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()

