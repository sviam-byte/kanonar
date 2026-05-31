"""Run SPI Trait Validation v2 for split Kanonar derived traits.

This script is intentionally offline-only: it does not import or change the
runtime trait model in `lib/traits.ts`. It writes regenerable CSV/JSON/Markdown
artifacts under `kanonar_trait_validation/`.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import yaml


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = ROOT / "kanonar_trait_validation"
DEFAULT_REGISTRY = ROOT / "docs" / "axis_validation_registry.yaml"
STICKY_CORRELATION = 0.85

V2_TRAITS = [
    "low_care_harshness",
    "punitive_harshness",
    "power_harshness",
    "defensive_harshness",
    "proceduralism",
    "authority_deference",
    "coalitional_loyalty",
    "low_autonomy_submission",
    "defensive_suspicion",
    "affective_stability",
    "goal_stability",
    "cooldown_stability",
    "identity_stability",
]

LEGACY_TRAITS = [
    "legacy_care",
    "legacy_trust",
    "legacy_harshness",
    "legacy_submission",
    "legacy_paranoia",
    "legacy_stability",
]


@dataclass(frozen=True)
class WeightedScale:
    scale: str
    sign: int = 1


TRAIT_CONTRACTS: dict[str, dict[str, list[str]]] = {
    "low_care_harshness": {
        "expected_effects": ["low compassion/care", "higher irritability", "lower easy-goingness"],
        "negative_controls": ["power-only", "betrayal-only"],
        "anchors": ["Compassion-", "Irritability+", "EasyGoingness-"],
    },
    "punitive_harshness": {
        "expected_effects": ["authoritarian punishment", "irritability", "lower cooldown"],
        "negative_controls": ["generic low care"],
        "anchors": ["Authoritarianism+", "Irritability+", "SelfControl-"],
    },
    "power_harshness": {
        "expected_effects": ["power/status pressure", "low autonomy-cost concern"],
        "negative_controls": ["suspicion", "anxiety"],
        "anchors": ["Authoritarianism+", "Charisma+", "Anxiety-"],
    },
    "defensive_harshness": {
        "expected_effects": ["threat-reactive harsh response", "retaliatory irritability", "low cooldown"],
        "negative_controls": ["dominance-only"],
        "anchors": ["Irritability+", "Anxiety+", "Impulsivity+"],
    },
    "proceduralism": {
        "expected_effects": ["procedure following", "order", "conformity with autonomy intact"],
        "negative_controls": ["low autonomy"],
        "anchors": ["Conformity+", "Order+", "SelfControl+"],
    },
    "authority_deference": {
        "expected_effects": ["authority deference", "tradition", "lower autonomy"],
        "negative_controls": ["coalition loyalty"],
        "anchors": ["Authoritarianism+", "Conservatism+", "SensationSeeking-"],
    },
    "coalitional_loyalty": {
        "expected_effects": ["ingroup cooperation", "trust", "agreeableness"],
        "negative_controls": ["proceduralism"],
        "anchors": ["Agree+", "Trust+", "Conformity+"],
    },
    "low_autonomy_submission": {
        "expected_effects": ["low autonomy", "low narrative agency", "deference under constraint"],
        "negative_controls": ["proceduralism"],
        "anchors": ["SensationSeeking-", "Open-", "Industry-"],
    },
    "defensive_suspicion": {
        "expected_effects": ["low trust", "secrecy", "threat bias", "betrayal exposure proxy"],
        "negative_controls": ["clinical paranoia", "dominance-only"],
        "anchors": ["Trust-", "Honesty-", "Anxiety+"],
    },
    "affective_stability": {
        "expected_effects": ["emotional stability", "low anxiety", "wellbeing"],
        "negative_controls": ["goal coherence"],
        "anchors": ["EmotionalStability+", "Neuro-", "Anxiety-"],
    },
    "goal_stability": {
        "expected_effects": ["industry", "goal coherence", "plan persistence"],
        "negative_controls": ["affective calm"],
        "anchors": ["Industry+", "SelfControl+", "Perfectionism+"],
    },
    "cooldown_stability": {
        "expected_effects": ["impulse control", "cooldown discipline", "lower sensation seeking"],
        "negative_controls": ["tradition/order"],
        "anchors": ["Impulsivity-", "SelfControl+", "SensationSeeking-"],
    },
    "identity_stability": {
        "expected_effects": ["self-concept continuity", "identity consistency", "moderate rigidity"],
        "negative_controls": ["emotional stability alone"],
        "anchors": ["Conservatism+", "Introspection+", "Adaptability-"],
    },
}


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


def invert(values: pd.Series) -> pd.Series:
    return 1.0 - values


def mean_series(*parts: pd.Series) -> pd.Series:
    return pd.concat(parts, axis=1).mean(axis=1).clip(0.0, 1.0)


def sigmoid(values: pd.Series) -> pd.Series:
    return 1.0 / (1.0 + np.exp(-2.0 * values))


def trait_score(weighted_parts: Iterable[tuple[float, pd.Series]]) -> pd.Series:
    parts = list(weighted_parts)
    if not parts:
        raise ValueError("Trait score requires at least one weighted part")
    score = pd.Series(0.0, index=parts[0][1].index)
    for weight, values in parts:
        score = score + weight * ((values - 0.5) * 2.0)
    return sigmoid(score).clip(0.0, 1.0)


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
    return mean_series(*parts)


def build_proxy_axes(scale_scores: pd.DataFrame) -> pd.DataFrame:
    s = scale_scores
    axes = {
        "A_Safety_Care": mean_series(s.Compassion, s.Agree, s.Trust),
        "C_dominance_empathy": mean_series(invert(s.Compassion), invert(s.Agree), s.Irritability),
        "C_reciprocity_index": mean_series(s.Trust, s.Honesty, s.Agree),
        "C_betrayal_cost": mean_series(invert(s.Trust), s.Anxiety, s.Irritability),
        "A_Power_Sovereignty": mean_series(s.Authoritarianism, s.Charisma, s.AttentionSeeking),
        "G_Narrative_agency": mean_series(s.Industry, s.SelfControl, s.Charisma, s.Extra),
        "A_Liberty_Autonomy": mean_series(invert(s.Conformity), s.SensationSeeking, s.Open),
        "A_Legitimacy_Procedure": mean_series(s.Conformity, s.Authoritarianism, s.Order),
        "C_coalition_loyalty": mean_series(s.Conformity, s.Agree, s.Trust),
        "A_Transparency_Secrecy": mean_series(invert(s.Honesty), invert(s.Trust)),
        "C_reputation_sensitivity": mean_series(s.Anxiety, s.AttentionSeeking),
        "B_cooldown_discipline": mean_series(s.SelfControl, s.Consc, invert(s.Impulsivity)),
        "A_Tradition_Continuity": mean_series(s.Conservatism, s.Conformity, invert(s.SensationSeeking)),
        "B_goal_coherence": mean_series(s.Industry, s.SelfControl, s.Order),
        "B_exploration_rate": mean_series(s.SensationSeeking, s.Open, s.Creativity),
        "F_Plasticity": mean_series(s.Adaptability, s.Open, s.Creativity),
        "spi_proxy_trust_bias": mean_series(invert(s.Trust), invert(s.Honesty), s.Anxiety),
        "spi_proxy_threat_bias": mean_series(s.Anxiety, s.Neuro, s.Irritability, invert(s.EmotionalStability)),
        "spi_proxy_betrayal_exposure": mean_series(s.Anxiety, s.Irritability, invert(s.WellBeing)),
        "spi_proxy_self_concept": mean_series(s.EmotionalStability, s.SelfControl, s.WellBeing),
    }
    return pd.DataFrame(axes)


def compute_v2_traits(scale_scores: pd.DataFrame, proxy_axes: pd.DataFrame) -> pd.DataFrame:
    s = scale_scores
    p = proxy_axes
    out = {
        "low_care_harshness": trait_score([
            (0.75, invert(s.Compassion)),
            (0.20, s.Irritability),
            (0.15, invert(s.EasyGoingness)),
            (-0.15, p.A_Power_Sovereignty),
        ]),
        "punitive_harshness": trait_score([
            (0.35, s.Authoritarianism),
            (0.35, s.Irritability),
            (0.20, p.C_betrayal_cost),
            (-0.30, p.B_cooldown_discipline),
            (0.20, s.Order),
            (0.10, invert(s.EasyGoingness)),
        ]),
        "power_harshness": trait_score([
            (0.70, p.A_Power_Sovereignty),
            (0.30, invert(p.A_Liberty_Autonomy)),
            (0.20, s.Charisma),
            (-0.20, p.C_betrayal_cost),
            (-0.10, s.Anxiety),
        ]),
        "defensive_harshness": trait_score([
            (0.30, s.Irritability),
            (0.25, p.spi_proxy_threat_bias),
            (0.20, invert(p.B_cooldown_discipline)),
            (0.20, p.C_betrayal_cost),
            (0.15, invert(s.EasyGoingness)),
            (-0.20, p.A_Transparency_Secrecy),
        ]),
        "proceduralism": trait_score([
            (0.45, p.A_Legitimacy_Procedure),
            (0.25, s.Order),
            (0.15, p.B_cooldown_discipline),
            (0.25, s.Conformity),
            (0.15, p.A_Liberty_Autonomy),
            (-0.20, s.Authoritarianism),
        ]),
        "authority_deference": trait_score([
            (0.50, s.Authoritarianism),
            (0.30, p.A_Tradition_Continuity),
            (0.25, invert(p.A_Liberty_Autonomy)),
            (0.15, s.Conformity),
            (-0.20, p.C_coalition_loyalty),
            (-0.10, s.Order),
        ]),
        "coalitional_loyalty": trait_score([
            (0.45, p.C_coalition_loyalty),
            (0.25, s.Agree),
            (0.25, s.Trust),
            (0.15, s.Conformity),
            (-0.25, p.A_Legitimacy_Procedure),
        ]),
        "low_autonomy_submission": trait_score([
            (0.55, invert(p.A_Liberty_Autonomy)),
            (0.40, invert(p.G_Narrative_agency)),
            (0.15, s.Conformity),
            (-0.30, p.A_Legitimacy_Procedure),
            (-0.10, s.Authoritarianism),
        ]),
        "defensive_suspicion": trait_score([
            (0.25, p.C_betrayal_cost),
            (0.25, p.A_Transparency_Secrecy),
            (0.15, p.C_reputation_sensitivity),
            (0.25, p.spi_proxy_trust_bias),
            (0.10, p.spi_proxy_threat_bias),
            (0.10, p.spi_proxy_betrayal_exposure),
            (-0.10, s.Authoritarianism),
        ]),
        "affective_stability": trait_score([
            (0.55, s.EmotionalStability),
            (0.35, invert(s.Neuro)),
            (0.25, invert(s.Anxiety)),
            (0.20, s.WellBeing),
            (-0.20, p.B_cooldown_discipline),
        ]),
        "goal_stability": trait_score([
            (0.45, s.Industry),
            (0.25, p.G_Narrative_agency),
            (0.20, p.B_goal_coherence),
            (0.15, s.Perfectionism),
            (-0.25, s.EmotionalStability),
            (-0.10, s.Order),
        ]),
        "cooldown_stability": trait_score([
            (0.45, invert(s.Impulsivity)),
            (0.30, s.SelfControl),
            (0.25, p.B_cooldown_discipline),
            (0.15, invert(s.SensationSeeking)),
            (-0.20, p.A_Tradition_Continuity),
            (-0.10, s.Order),
        ]),
        "identity_stability": trait_score([
            (0.35, p.spi_proxy_self_concept),
            (0.30, s.Conservatism),
            (0.20, invert(s.Adaptability)),
            (0.20, s.Introspection),
            (-0.25, s.EmotionalStability),
            (-0.20, p.A_Legitimacy_Procedure),
        ]),
    }
    return pd.DataFrame(out)


def compute_legacy_traits(proxy_axes: pd.DataFrame) -> pd.DataFrame:
    p = proxy_axes
    out = {
        "legacy_care": trait_score([
            (1.0, p.A_Safety_Care),
            (-0.5, p.C_dominance_empathy),
            (0.3, p.C_reciprocity_index),
        ]),
        "legacy_harshness": trait_score([
            (-0.8, p.A_Safety_Care),
            (0.4, p.C_betrayal_cost),
            (0.5, p.A_Power_Sovereignty),
        ]),
        "legacy_submission": trait_score([
            (0.6, p.A_Legitimacy_Procedure),
            (0.7, p.C_coalition_loyalty),
            (-0.5, p.A_Liberty_Autonomy),
        ]),
        "legacy_trust": trait_score([
            (0.8, p.C_reciprocity_index),
            (-0.3, p.A_Transparency_Secrecy),
            (0.2, p.C_reputation_sensitivity),
        ]),
        "legacy_paranoia": trait_score([
            (1.0, p.C_betrayal_cost),
            (0.6, p.A_Transparency_Secrecy),
            (-0.4, p.C_reciprocity_index),
        ]),
        "legacy_stability": trait_score([
            (0.8, p.B_cooldown_discipline),
            (0.6, p.A_Tradition_Continuity),
            (0.5, p.B_goal_coherence),
        ]),
    }
    return pd.DataFrame(out)[LEGACY_TRAITS]


def sticky_pairs(trait_corr: pd.DataFrame, traits: list[str]) -> list[tuple[str, str, float]]:
    pairs: list[tuple[str, str, float]] = []
    for i, left in enumerate(traits):
        for right in traits[i + 1 :]:
            value = float(trait_corr.loc[left, right])
            if abs(value) >= STICKY_CORRELATION:
                pairs.append((left, right, value))
    return sorted(pairs, key=lambda item: abs(item[2]), reverse=True)


def strongest_correlations(corr: pd.DataFrame, trait: str, limit: int = 8) -> list[tuple[str, float]]:
    values = corr.loc[trait].drop(labels=V2_TRAITS + LEGACY_TRAITS, errors="ignore").dropna()
    values = values.reindex(values.abs().sort_values(ascending=False).index)
    return [(str(name), float(value)) for name, value in values.head(limit).items()]


def build_anchor_correlations(
    trait_scores: pd.DataFrame,
    scale_scores: pd.DataFrame,
    proxy_axes: pd.DataFrame,
) -> pd.DataFrame:
    anchors = pd.concat(
        [
            scale_scores.add_prefix("spi_scale_"),
            proxy_axes.add_prefix("proxy_axis_"),
        ],
        axis=1,
    )
    corr = pd.concat([trait_scores, anchors], axis=1).corr()
    return corr.loc[V2_TRAITS, anchors.columns]


def build_checks(
    trait_corr: pd.DataFrame,
    legacy_corr: pd.DataFrame,
    anchor_corr: pd.DataFrame,
) -> dict:
    primary_pairs = sticky_pairs(trait_corr, V2_TRAITS)
    legacy_block = ["legacy_care", "legacy_trust", "legacy_harshness", "legacy_paranoia"]
    legacy_pairs = sticky_pairs(legacy_corr, legacy_block)
    missing_contracts = [trait for trait in V2_TRAITS if trait not in TRAIT_CONTRACTS]
    weak_anchor_traits = [
        trait
        for trait in V2_TRAITS
        if float(anchor_corr.loc[trait].abs().max()) < 0.25
    ]
    return {
        "sticky_threshold": STICKY_CORRELATION,
        "primary_trait_count": len(V2_TRAITS),
        "primary_sticky_pairs": [
            {"left": left, "right": right, "r": value}
            for left, right, value in primary_pairs
        ],
        "legacy_dirty_block_sticky_pairs": [
            {"left": left, "right": right, "r": value}
            for left, right, value in legacy_pairs
        ],
        "missing_trait_contracts": missing_contracts,
        "weak_anchor_traits": weak_anchor_traits,
        "sticky_correlations_pass": len(primary_pairs) == 0,
        "anchor_coverage_pass": len(missing_contracts) == 0 and len(weak_anchor_traits) == 0,
        "duplicate_review_pass": len(primary_pairs) == 0,
        "legacy_block_reduction_pass": len(primary_pairs) < len(legacy_pairs),
    }


def write_report(
    path: Path,
    raw: pd.DataFrame,
    scale_scores: pd.DataFrame,
    trait_scores: pd.DataFrame,
    legacy_scores: pd.DataFrame,
    trait_corr: pd.DataFrame,
    legacy_corr: pd.DataFrame,
    all_corr: pd.DataFrame,
    checks: dict,
    registry: dict,
) -> None:
    lines = [
        "# SPI Trait Validation v2",
        "",
        "## Source and Scope",
        "",
        "- Dataset: SAPA Personality Inventory / SPI from local `psychTools` export.",
        f"- Rows: {len(raw)}.",
        f"- SPI keyed scales: {len(scale_scores.columns)}.",
        f"- Registry schema version: {registry.get('schema_version', 'unknown')}.",
        "- Runtime unchanged: this runner does not import or update `lib/traits.ts`.",
        "- Primary v2 matrix excludes legacy dirty containers.",
        "",
        "## Primary V2 Trait Set",
        "",
        f"- Primary traits: {len(V2_TRAITS)}.",
        f"- Sticky threshold: `abs(r) >= {STICKY_CORRELATION}`.",
        "",
    ]

    primary_pairs = checks["primary_sticky_pairs"]
    if primary_pairs:
        lines.append("Primary sticky pairs:")
        for pair in primary_pairs:
            lines.append(f"- `{pair['left']}` vs `{pair['right']}`: r={pair['r']:+.3f}")
    else:
        lines.append("- No primary v2 trait pair reached the sticky threshold.")
    lines.append("")

    lines.extend(["## Trait Contracts and Anchors", ""])
    for trait in V2_TRAITS:
        contract = TRAIT_CONTRACTS[trait]
        lines.append(f"### `{trait}`")
        lines.append("- expected effects: " + "; ".join(contract["expected_effects"]) + ".")
        lines.append("- negative controls: " + "; ".join(contract["negative_controls"]) + ".")
        lines.append("- anchor intent: " + "; ".join(contract["anchors"]) + ".")
        for name, value in strongest_correlations(all_corr, trait):
            lines.append(f"- `{name}`: {value:+.3f}")
        lines.append("")

    lines.extend(["## Legacy Dirty Block Comparison", ""])
    lines.append("- Legacy dirty containers are diagnostic only, not primary v2 traits.")
    legacy_pairs = checks["legacy_dirty_block_sticky_pairs"]
    if legacy_pairs:
        for pair in legacy_pairs:
            lines.append(f"- legacy `{pair['left']}` vs `{pair['right']}`: r={pair['r']:+.3f}")
    else:
        lines.append("- No legacy dirty block pair reached the sticky threshold.")
    lines.append(
        f"- Legacy block reduction pass: `{checks['legacy_block_reduction_pass']}` "
        f"(primary sticky pairs={len(primary_pairs)}, legacy sticky pairs={len(legacy_pairs)})."
    )
    lines.append("")

    lines.extend(["## Checks", ""])
    for key in [
        "sticky_correlations_pass",
        "anchor_coverage_pass",
        "duplicate_review_pass",
        "legacy_block_reduction_pass",
    ]:
        lines.append(f"- `{key}`: `{checks[key]}`")
    if checks["weak_anchor_traits"]:
        lines.append("- weak anchor traits: " + ", ".join(checks["weak_anchor_traits"]))
    lines.append("")

    lines.extend(
        [
            "## Methodological Limits",
            "",
            "- SPI anchors are a convergent/discriminant smoke check, not final psychological validation.",
            "- `defensive_suspicion` is nonclinical wording and must not be presented as a clinical construct.",
            "- Social Chemistry remains out of scope until this split layer is accepted.",
        ]
    )

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run SPI Trait Validation v2.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    data_dir = args.data_dir

    raw = pd.read_csv(data_dir / "raw_spi.csv")
    keys = pd.read_csv(data_dir / "spi_keys.csv")
    registry = yaml.safe_load(args.registry.read_text(encoding="utf-8"))

    item_cols = [column for column in raw.columns if column.startswith("q_")]
    items01 = normalize_items(raw, item_cols)
    scale_scores = score_spi_scales(items01, keys)
    proxy_axes = build_proxy_axes(scale_scores)
    trait_scores = compute_v2_traits(scale_scores, proxy_axes)
    legacy_scores = compute_legacy_traits(proxy_axes)

    trait_corr = trait_scores.corr()
    legacy_corr = legacy_scores.corr()
    anchor_corr = build_anchor_correlations(trait_scores, scale_scores, proxy_axes)
    all_corr_input = pd.concat(
        [
            trait_scores,
            legacy_scores,
            scale_scores.add_prefix("spi_scale_"),
            proxy_axes.add_prefix("proxy_axis_"),
        ],
        axis=1,
    )
    all_corr = all_corr_input.corr()
    checks = build_checks(trait_corr, legacy_corr, anchor_corr)

    trait_output = pd.concat(
        [
            trait_scores,
            legacy_scores,
            proxy_axes.add_prefix("proxy_axis_"),
            scale_scores.add_prefix("spi_scale_"),
        ],
        axis=1,
    )

    trait_output.to_csv(data_dir / "kanonar_trait_scores_v2.csv", index=False, encoding="utf-8")
    trait_corr.to_csv(data_dir / "trait_correlation_matrix_v2.csv", encoding="utf-8")
    anchor_corr.to_csv(data_dir / "trait_anchor_correlations_v2.csv", encoding="utf-8")
    (data_dir / "trait_validation_checks_v2.json").write_text(
        json.dumps(checks, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    write_report(
        data_dir / "trait_validation_report_v2.md",
        raw=raw,
        scale_scores=scale_scores,
        trait_scores=trait_scores,
        legacy_scores=legacy_scores,
        trait_corr=trait_corr,
        legacy_corr=legacy_corr,
        all_corr=all_corr,
        checks=checks,
        registry=registry,
    )

    print("SPI_TRAIT_VALIDATION_V2_OK")
    print(f"rows={len(raw)}")
    print(f"item_response_columns={len(item_cols)}")
    print(f"spi_scales={len(scale_scores.columns)}")
    print(f"primary_traits={len(V2_TRAITS)}")
    print(f"primary_sticky_pairs={len(checks['primary_sticky_pairs'])}")
    print(f"legacy_dirty_block_sticky_pairs={len(checks['legacy_dirty_block_sticky_pairs'])}")
    print(f"checks_pass={all(bool(checks[key]) for key in ['sticky_correlations_pass', 'anchor_coverage_pass', 'duplicate_review_pass', 'legacy_block_reduction_pass'])}")


if __name__ == "__main__":
    main()
