"""Run the first SAPA/SPI validation pass for Kanonar derived traits.

This script does not change the runtime trait model. It exports local,
regenerable CSV/Markdown artifacts under `kanonar_trait_validation/`.
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import yaml
from sklearn.decomposition import FactorAnalysis, PCA
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = ROOT / "kanonar_trait_validation"
DEFAULT_REGISTRY = ROOT / "docs" / "axis_validation_registry.yaml"
TRAITS = [
    "care",
    "harshness",
    "agency",
    "submission",
    "trust",
    "paranoia",
    "stability",
    "novelty_seeking",
]
N_FACTORS = 5
STICKY_CORRELATION = 0.8


@dataclass(frozen=True)
class WeightedScale:
    scale: str
    sign: int = 1


PROXY_AXIS_MAP: dict[str, list[WeightedScale]] = {
    "A_Safety_Care": [
        WeightedScale("Compassion"),
        WeightedScale("Agree"),
        WeightedScale("Trust"),
    ],
    "C_dominance_empathy": [
        WeightedScale("Compassion", -1),
        WeightedScale("Agree", -1),
        WeightedScale("Irritability"),
    ],
    "C_reciprocity_index": [
        WeightedScale("Trust"),
        WeightedScale("Honesty"),
        WeightedScale("Agree"),
    ],
    "C_betrayal_cost": [
        WeightedScale("Trust", -1),
        WeightedScale("Anxiety"),
        WeightedScale("Irritability"),
    ],
    "A_Power_Sovereignty": [
        WeightedScale("Authoritarianism"),
        WeightedScale("Charisma"),
        WeightedScale("AttentionSeeking"),
    ],
    "G_Narrative_agency": [
        WeightedScale("Industry"),
        WeightedScale("SelfControl"),
        WeightedScale("Charisma"),
        WeightedScale("Extra"),
    ],
    "A_Liberty_Autonomy": [
        WeightedScale("Conformity", -1),
        WeightedScale("SensationSeeking"),
        WeightedScale("Open"),
    ],
    "A_Legitimacy_Procedure": [
        WeightedScale("Conformity"),
        WeightedScale("Authoritarianism"),
        WeightedScale("Order"),
    ],
    "C_coalition_loyalty": [
        WeightedScale("Conformity"),
        WeightedScale("Agree"),
        WeightedScale("Trust"),
    ],
    "A_Transparency_Secrecy": [
        WeightedScale("Honesty", -1),
        WeightedScale("Trust", -1),
    ],
    "C_reputation_sensitivity": [
        WeightedScale("Anxiety"),
        WeightedScale("AttentionSeeking"),
    ],
    "B_cooldown_discipline": [
        WeightedScale("SelfControl"),
        WeightedScale("Consc"),
        WeightedScale("Impulsivity", -1),
    ],
    "A_Tradition_Continuity": [
        WeightedScale("Conservatism"),
        WeightedScale("Conformity"),
        WeightedScale("SensationSeeking", -1),
    ],
    "B_goal_coherence": [
        WeightedScale("Industry"),
        WeightedScale("SelfControl"),
        WeightedScale("Order"),
    ],
    "B_exploration_rate": [
        WeightedScale("SensationSeeking"),
        WeightedScale("Open"),
        WeightedScale("Creativity"),
    ],
    "F_Plasticity": [
        WeightedScale("Adaptability"),
        WeightedScale("Open"),
        WeightedScale("Creativity"),
    ],
}


TRAIT_WEIGHTS: dict[str, dict[str, float]] = {
    "care": {
        "A_Safety_Care": 1.0,
        "C_dominance_empathy": -0.5,
        "C_reciprocity_index": 0.3,
    },
    "harshness": {
        "A_Safety_Care": -0.8,
        "C_betrayal_cost": 0.4,
        "A_Power_Sovereignty": 0.5,
    },
    "agency": {
        "G_Narrative_agency": 1.0,
        "A_Liberty_Autonomy": 0.8,
        "A_Power_Sovereignty": 0.4,
    },
    "submission": {
        "A_Legitimacy_Procedure": 0.6,
        "C_coalition_loyalty": 0.7,
        "A_Liberty_Autonomy": -0.5,
    },
    "trust": {
        "C_reciprocity_index": 0.8,
        "A_Transparency_Secrecy": -0.3,
        "C_reputation_sensitivity": 0.2,
    },
    "paranoia": {
        "C_betrayal_cost": 1.0,
        "A_Transparency_Secrecy": 0.6,
        "C_reciprocity_index": -0.4,
    },
    "stability": {
        "B_cooldown_discipline": 0.8,
        "A_Tradition_Continuity": 0.6,
        "B_goal_coherence": 0.5,
    },
    "novelty_seeking": {
        "B_exploration_rate": 1.0,
        "A_Tradition_Continuity": -0.6,
        "F_Plasticity": 0.4,
    },
}


SPI_TRAIT_SCALE_MAP: dict[str, list[WeightedScale]] = {
    "care": [
        WeightedScale("Compassion"),
        WeightedScale("Agree"),
        WeightedScale("Trust"),
    ],
    "harshness": [
        WeightedScale("Compassion", -1),
        WeightedScale("Agree", -1),
        WeightedScale("Authoritarianism"),
        WeightedScale("Irritability"),
    ],
    "agency": [
        WeightedScale("Industry"),
        WeightedScale("SelfControl"),
        WeightedScale("Charisma"),
        WeightedScale("Extra"),
    ],
    "submission": [
        WeightedScale("Conformity"),
        WeightedScale("Authoritarianism"),
        WeightedScale("SensationSeeking", -1),
    ],
    "trust": [
        WeightedScale("Trust"),
        WeightedScale("Honesty"),
        WeightedScale("Neuro", -1),
        WeightedScale("Anxiety", -1),
    ],
    "paranoia": [
        WeightedScale("Trust", -1),
        WeightedScale("Anxiety"),
        WeightedScale("Irritability"),
        WeightedScale("EmotionalStability", -1),
    ],
    "stability": [
        WeightedScale("EmotionalStability"),
        WeightedScale("SelfControl"),
        WeightedScale("Neuro", -1),
        WeightedScale("Impulsivity", -1),
    ],
    "novelty_seeking": [
        WeightedScale("SensationSeeking"),
        WeightedScale("Open"),
        WeightedScale("Creativity"),
        WeightedScale("Conservatism", -1),
    ],
}


DIRTY_TRAITS = {
    "submission": "mixed proceduralism, loyalty, low autonomy, and authority deference",
    "harshness": "mixed low care, punitive response, power, and defensive harshness",
    "paranoia": "use nonclinical defensive_suspicion; mixed distrust, anxiety, secrecy, and threat bias",
    "stability": "mixed goal, affective, cooldown, and identity stability",
}


def sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-2.0 * value))


def normalize_items(raw: pd.DataFrame, item_cols: list[str]) -> pd.DataFrame:
    items = raw[item_cols].astype(float)
    return ((items - 1.0) / 5.0).clip(0.0, 1.0)


def score_spi_scales(items01: pd.DataFrame, keys: pd.DataFrame) -> pd.DataFrame:
    scores: dict[str, pd.Series] = {}
    for scale, group in keys.groupby("scale", sort=False):
        parts: list[pd.Series] = []
        for row in group.itertuples(index=False):
            item_id = str(row.item_id)
            if item_id not in items01:
                raise ValueError(f"Scale {scale} references missing item {item_id}")
            values = items01[item_id]
            parts.append(1.0 - values if bool(row.reverse_keyed) else values)
        scores[str(scale)] = pd.concat(parts, axis=1).mean(axis=1)
    return pd.DataFrame(scores)


def mean_weighted_scales(
    scale_scores: pd.DataFrame,
    weighted_scales: Iterable[WeightedScale],
) -> pd.Series:
    parts: list[pd.Series] = []
    for weighted in weighted_scales:
        if weighted.scale not in scale_scores:
            raise ValueError(f"Missing SPI scale score: {weighted.scale}")
        values = scale_scores[weighted.scale]
        parts.append(values if weighted.sign > 0 else 1.0 - values)
    return pd.concat(parts, axis=1).mean(axis=1).clip(0.0, 1.0)


def build_proxy_axes(scale_scores: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            axis: mean_weighted_scales(scale_scores, mapping)
            for axis, mapping in PROXY_AXIS_MAP.items()
        }
    )


def compute_traits(proxy_axes: pd.DataFrame) -> pd.DataFrame:
    out: dict[str, pd.Series] = {}
    for trait, weights in TRAIT_WEIGHTS.items():
        score = pd.Series(0.0, index=proxy_axes.index)
        for axis, weight in weights.items():
            if axis not in proxy_axes:
                raise ValueError(f"Missing proxy axis for trait {trait}: {axis}")
            score = score + weight * ((proxy_axes[axis] - 0.5) * 2.0)
        out[trait] = score.map(sigmoid)
    return pd.DataFrame(out)


def build_spi_trait_proxies(scale_scores: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            f"spi_proxy_{trait}": mean_weighted_scales(scale_scores, mapping)
            for trait, mapping in SPI_TRAIT_SCALE_MAP.items()
        }
    )


def factor_loadings(items01: pd.DataFrame, dictionary: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    item_cols = list(items01.columns)
    x = StandardScaler().fit_transform(items01)

    pca = PCA(n_components=N_FACTORS, random_state=0)
    pca.fit(x)
    pca_loadings = pca.components_.T * np.sqrt(pca.explained_variance_)

    fa = FactorAnalysis(n_components=N_FACTORS, random_state=0)
    fa.fit(x)
    fa_loadings = fa.components_.T

    loadings = pd.DataFrame({"item_id": item_cols})
    for idx in range(N_FACTORS):
        loadings[f"pca_factor_{idx + 1}"] = pca_loadings[:, idx]
    for idx in range(N_FACTORS):
        loadings[f"fa_factor_{idx + 1}"] = fa_loadings[:, idx]

    meta = dictionary.copy()
    meta["item_id"] = meta["item_id"].astype(str)
    loadings = meta.merge(loadings, on="item_id", how="right")

    pca_scores = pd.DataFrame(
        pca.transform(x),
        columns=[f"pca_factor_{idx + 1}" for idx in range(N_FACTORS)],
    )
    fa_scores = pd.DataFrame(
        fa.transform(x),
        columns=[f"fa_factor_{idx + 1}" for idx in range(N_FACTORS)],
    )
    return loadings, pca_scores, fa_scores


def strongest_markers(loadings: pd.DataFrame, prefix: str, top_n: int = 5) -> list[str]:
    lines: list[str] = []
    for idx in range(N_FACTORS):
        col = f"{prefix}_factor_{idx + 1}"
        top = loadings.reindex(loadings[col].abs().sort_values(ascending=False).index).head(top_n)
        markers = []
        for row in top.itertuples(index=False):
            markers.append(
                f"{row.item_id} ({getattr(row, 'B5')}, {getattr(row, 'L27')}): {getattr(row, col):+.3f}"
            )
        lines.append(f"- `{col}`: " + "; ".join(markers))
    return lines


def strongest_correlations(corr: pd.DataFrame, trait: str, limit: int = 8) -> list[tuple[str, float]]:
    values = corr.loc[trait].drop(labels=TRAITS, errors="ignore").dropna()
    values = values.reindex(values.abs().sort_values(ascending=False).index)
    return [(str(name), float(value)) for name, value in values.head(limit).items()]


def sticky_pairs(trait_corr: pd.DataFrame) -> list[tuple[str, str, float]]:
    pairs: list[tuple[str, str, float]] = []
    for i, left in enumerate(TRAITS):
        for right in TRAITS[i + 1 :]:
            value = float(trait_corr.loc[left, right])
            if abs(value) >= STICKY_CORRELATION:
                pairs.append((left, right, value))
    return sorted(pairs, key=lambda item: abs(item[2]), reverse=True)


def write_report(
    path: Path,
    raw: pd.DataFrame,
    item_cols: list[str],
    scale_scores: pd.DataFrame,
    loadings: pd.DataFrame,
    trait_scores: pd.DataFrame,
    trait_corr: pd.DataFrame,
    all_corr: pd.DataFrame,
    registry: dict,
) -> None:
    pairs = sticky_pairs(trait_corr)
    lines = [
        "# SPI Trait Validation v1",
        "",
        "## Source and inputs",
        "",
        "- Dataset: SAPA Personality Inventory / SPI from local `psychTools` export.",
        "- Local inputs: `raw_spi.csv`, `spi_dictionary.csv`, `spi_keys.csv`, `docs/axis_validation_registry.yaml`.",
        f"- Rows: {len(raw)}.",
        f"- Item response columns: {len(item_cols)}.",
        f"- SPI keyed scales: {len(scale_scores.columns)}.",
        f"- Registry schema version: {registry.get('schema_version', 'unknown')}.",
        "",
        "## Method",
        "",
        "- SPI item responses were normalized from `1..6` to `0..1`.",
        "- Reverse-keyed SPI items were scored as `1 - normalized`.",
        f"- PCA and `sklearn.decomposition.FactorAnalysis` used {N_FACTORS} factors on all 135 item columns.",
        "- Kanonar trait scores use a Python equivalent of current `lib/traits.ts` over first-pass SPI proxy axes.",
        "- The SPI scale mapping is a first-pass engineering hypothesis, not a fitted psychological model.",
        "",
        "## Top factor markers",
        "",
        "### PCA",
        "",
        *strongest_markers(loadings, "pca"),
        "",
        "### FactorAnalysis",
        "",
        *strongest_markers(loadings, "fa"),
        "",
        "## Derived trait correlations with SPI scales/factors",
        "",
    ]

    for trait in TRAITS:
        lines.append(f"### `{trait}`")
        for name, value in strongest_correlations(all_corr, trait):
            lines.append(f"- `{name}`: {value:+.3f}")
        if trait in DIRTY_TRAITS:
            lines.append(f"- dirty trait note: {DIRTY_TRAITS[trait]}.")
        lines.append("")

    lines.extend(
        [
            "## Trait-to-trait correlation matrix summary",
            "",
            "Sticky threshold: `abs(r) >= 0.8`.",
            "",
        ]
    )
    if pairs:
        for left, right, value in pairs:
            lines.append(f"- `{left}` vs `{right}`: r={value:+.3f}")
    else:
        lines.append("- No derived-trait pair reached `abs(r) >= 0.8` in this SPI proxy run.")

    lines.extend(
        [
            "",
            "## Dirty trait flags",
            "",
            "- `submission` is dirty: split proceduralism, coalitional loyalty, low-autonomy submission, and authority deference.",
            "- `harshness` is dirty: split low-care, punitive, power, and defensive harshness.",
            "- `paranoia` must be treated as nonclinical `defensive_suspicion`, not clinical paranoia.",
            "- `stability` is dirty: split goal, affective, cooldown, and identity stability.",
            "",
            "## Methodological limits",
            "",
            "- SPI does not validate Kanonar `world_internal` axes such as causality sanctity, KB_topos, causal surgery, or topology repair.",
            "- This is a convergent/discriminant smoke check, not psychological validation of Kanonar.",
            "- The current derived trait mapping is preliminary and should be replaced or calibrated with diagnostic scenarios and held-out behavior prediction.",
        ]
    )

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run SPI Trait Validation v1.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    data_dir = args.data_dir

    raw = pd.read_csv(data_dir / "raw_spi.csv")
    dictionary = pd.read_csv(data_dir / "spi_dictionary.csv")
    keys = pd.read_csv(data_dir / "spi_keys.csv")
    registry = yaml.safe_load(args.registry.read_text(encoding="utf-8"))

    item_cols = [column for column in raw.columns if column.startswith("q_")]
    items01 = normalize_items(raw, item_cols)
    scale_scores = score_spi_scales(items01, keys)
    loadings, pca_scores, fa_scores = factor_loadings(items01, dictionary)
    proxy_axes = build_proxy_axes(scale_scores)
    trait_scores = compute_traits(proxy_axes)
    spi_trait_proxies = build_spi_trait_proxies(scale_scores)

    trait_output = pd.concat(
        [
            trait_scores,
            spi_trait_proxies,
            proxy_axes.add_prefix("proxy_axis_"),
            scale_scores.add_prefix("spi_scale_"),
            pca_scores,
            fa_scores,
        ],
        axis=1,
    )
    all_corr_input = pd.concat(
        [
            trait_scores,
            scale_scores.add_prefix("spi_scale_"),
            pca_scores,
            fa_scores,
            spi_trait_proxies,
        ],
        axis=1,
    )
    trait_corr = trait_scores.corr()
    all_corr = all_corr_input.corr()

    loadings.to_csv(data_dir / "item_factor_loadings.csv", index=False, encoding="utf-8")
    trait_output.to_csv(data_dir / "kanonar_trait_scores.csv", index=False, encoding="utf-8")
    trait_corr.to_csv(data_dir / "trait_correlation_matrix.csv", encoding="utf-8")
    write_report(
        data_dir / "trait_validation_report.md",
        raw=raw,
        item_cols=item_cols,
        scale_scores=scale_scores,
        loadings=loadings,
        trait_scores=trait_scores,
        trait_corr=trait_corr,
        all_corr=all_corr,
        registry=registry,
    )

    print("SPI_TRAIT_VALIDATION_OK")
    print(f"rows={len(raw)}")
    print(f"item_response_columns={len(item_cols)}")
    print(f"spi_scales={len(scale_scores.columns)}")
    print(f"derived_traits={len(TRAITS)}")


if __name__ == "__main__":
    main()
