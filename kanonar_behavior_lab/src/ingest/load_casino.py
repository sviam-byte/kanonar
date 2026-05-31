from __future__ import annotations

import json
from typing import Any

import pandas as pd

from kanonar_behavior_lab.src.paths import (
    CASINO_CONVERSATIONS,
    CASINO_SPEAKERS,
    CASINO_UTTERANCES,
    RAW_DIALOGUES,
    ensure_output_dirs,
)


def parse_meta(meta_json: str) -> dict[str, Any]:
    if not meta_json:
        return {}
    return json.loads(meta_json)


def normalize_json_value(value: Any) -> str:
    if value in (None, "", [], {}):
        return ""
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def actor_from_internal_id(speaker_internal_id: str) -> str:
    if speaker_internal_id == "mturk_agent_1":
        return "A"
    if speaker_internal_id == "mturk_agent_2":
        return "B"
    return speaker_internal_id or "unknown"


def target_for_actor(actor: str) -> str:
    if actor == "A":
        return "B"
    if actor == "B":
        return "A"
    return "unknown"


def build_raw_dialogues() -> pd.DataFrame:
    ensure_output_dirs()
    for path in (CASINO_UTTERANCES, CASINO_CONVERSATIONS, CASINO_SPEAKERS):
        if not path.exists():
            raise FileNotFoundError(f"Missing CaSiNo source parquet: {path}")

    utterances = pd.read_parquet(CASINO_UTTERANCES)
    rows: list[dict[str, Any]] = []

    for source_order, row in enumerate(utterances.itertuples(index=False)):
        meta = parse_meta(row.meta_json)
        dialogue_id = int(meta["dialogue_id"])
        speaker_internal_id = str(meta.get("speaker_internal_id", ""))
        actor = actor_from_internal_id(speaker_internal_id)
        rows.append(
            {
                "episode_id": f"casino_{dialogue_id:04d}",
                "dialogue_id": dialogue_id,
                "source_order": source_order,
                "utterance_id": row.utterance_id,
                "actor": actor,
                "target": target_for_actor(actor),
                "speaker_id": row.speaker_id,
                "speaker_internal_id": speaker_internal_id,
                "text": row.text,
                "annotations": meta.get("annotations") or "",
                "terminal_data": meta.get("data") or "",
                "issue2youget": normalize_json_value(meta.get("issue2youget")),
                "issue2theyget": normalize_json_value(meta.get("issue2theyget")),
            }
        )

    raw = pd.DataFrame(rows).sort_values(["dialogue_id", "source_order"]).reset_index(drop=True)
    raw["t"] = raw.groupby("episode_id").cumcount() + 1
    raw = raw[
        [
            "episode_id",
            "dialogue_id",
            "t",
            "utterance_id",
            "actor",
            "target",
            "speaker_id",
            "speaker_internal_id",
            "text",
            "annotations",
            "terminal_data",
            "issue2youget",
            "issue2theyget",
        ]
    ]
    raw.to_parquet(RAW_DIALOGUES, index=False)
    return raw


def main() -> None:
    raw = build_raw_dialogues()
    print(f"Saved {RAW_DIALOGUES}")
    print(f"rows={len(raw)} episodes={raw['episode_id'].nunique()}")


if __name__ == "__main__":
    main()
