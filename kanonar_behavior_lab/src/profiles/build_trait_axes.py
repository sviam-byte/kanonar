from __future__ import annotations

import pandas as pd

from kanonar_behavior_lab.src.paths import PROCESSED_DIR, ensure_output_dirs
from kanonar_behavior_lab.src.profiles.build_actor_profiles import ACTOR_EPISODE_PROFILES, build_actor_profiles


TRAIT_AXES = PROCESSED_DIR / "trait_axes.parquet"
AXIS_COLUMNS = [
    "cooperativeness",
    "assertiveness",
    "aggressive_pressure",
    "flexibility",
    "repair_orientation",
    "rigidity",
    "fairness_orientation",
]


def robust_scale(series: pd.Series) -> pd.Series:
    lo = series.quantile(0.05)
    hi = series.quantile(0.95)
    if hi == lo:
        return pd.Series([0.0] * len(series), index=series.index)
    return ((series.clip(lo, hi) - lo) / (hi - lo)).fillna(0.0)


def build_trait_axes() -> pd.DataFrame:
    ensure_output_dirs()
    if not ACTOR_EPISODE_PROFILES.exists():
        build_actor_profiles()
    profiles = pd.read_parquet(ACTOR_EPISODE_PROFILES)
    scaled = profiles.copy()
    numeric_columns = [
        column
        for column in profiles.columns
        if column not in {"episode_id", "actor", "deal_outcome", "attractor_label_v2"}
        and pd.api.types.is_numeric_dtype(profiles[column])
    ]
    for column in numeric_columns:
        scaled[column] = robust_scale(profiles[column])

    axes = pd.DataFrame(
        {
            "episode_id": profiles["episode_id"],
            "actor": profiles["actor"],
            "cooperativeness": clamp01(
                0.35 * scaled["concession_offer_rate"]
                + 0.25 * scaled["repair_rate"]
                + 0.20 * scaled["acknowledge_rate"]
                + 0.20 * scaled["soft_accept_rate"]
                - 0.25 * scaled["demand_rate"]
                - 0.20 * scaled["pressure_rate"]
            ),
            "assertiveness": clamp01(
                0.35 * scaled["demand_rate"]
                + 0.25 * scaled["self_favoring_offer_rate"]
                + 0.25 * scaled["reject_rate"]
                + 0.15 * scaled["counteroffer_rate"]
                - 0.25 * scaled["concession_offer_rate"]
            ),
            "aggressive_pressure": clamp01(
                0.45 * scaled["pressure_rate"]
                + 0.25 * scaled["threaten_rate"]
                + 0.20 * scaled["mean_conflict_delta_after_actor"]
                + 0.10 * scaled["demand_rate"]
            ),
            "flexibility": clamp01(
                0.35 * scaled["strategy_switch_rate"]
                + 0.25 * scaled["mean_concession_magnitude"]
                + 0.25 * scaled["concede_after_reject_rate"]
                + 0.15 * scaled["action_entropy"]
                - 0.25 * scaled["rigidity_score"]
            ),
            "repair_orientation": clamp01(
                0.45 * scaled["repair_rate"]
                + 0.35 * scaled["repair_after_escalation_rate"]
                + 0.20 * scaled["acknowledge_rate"]
                - 0.20 * scaled["pressure_rate"]
            ),
            "rigidity": clamp01(
                0.35 * scaled["repeat_offer_rate"]
                + 0.25 * scaled["rigidity_score"]
                + 0.20 * scaled["counteroffer_rate"]
                + 0.20 * (1.0 - scaled["strategy_switch_rate"])
                - 0.20 * scaled["concession_offer_rate"]
            ),
            "fairness_orientation": clamp01(
                0.40 * scaled["mean_partner_favoring_shift"]
                + 0.25 * scaled["concession_offer_rate"]
                + 0.20 * scaled["repair_rate"]
                - 0.25 * scaled["mean_self_favoring_shift"]
                - 0.20 * scaled["demand_rate"]
            ),
            "deal_outcome": profiles["deal_outcome"],
            "attractor_label_v2": profiles["attractor_label_v2"],
        }
    )
    axes.to_parquet(TRAIT_AXES, index=False)
    return axes


def clamp01(series: pd.Series) -> pd.Series:
    return series.clip(0.0, 1.0).fillna(0.0)


def main() -> None:
    axes = build_trait_axes()
    print(f"Saved {TRAIT_AXES}")
    print(f"rows={len(axes)} axis_means={axes[AXIS_COLUMNS].mean().round(3).to_dict()}")


if __name__ == "__main__":
    main()

