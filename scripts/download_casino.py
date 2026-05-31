"""Download CaSiNo through ConvoKit and export stable analysis tables.

The generated files are intentionally local artifacts. They are ignored by git
and can be regenerated from the ConvoKit dataset name `casino-corpus`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DATASET_NAME = "casino-corpus"
DEFAULT_OUT_DIR = Path("data/processed")


def to_jsonable(value: Any) -> Any:
    """Convert ConvoKit metadata containers into JSON-serializable values."""
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]
    if isinstance(value, set):
        return sorted(to_jsonable(item) for item in value)
    if isinstance(value, Path):
        return str(value)
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def meta_json(meta: Any) -> str:
    return json.dumps(to_jsonable(dict(meta)), ensure_ascii=False, sort_keys=True)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Download ConvoKit CaSiNo and export Parquet tables.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help="Directory for generated parquet files and manifest.",
    )
    parser.add_argument(
        "--dataset",
        default=DATASET_NAME,
        help="ConvoKit download name. Defaults to casino-corpus.",
    )
    return parser


def load_corpus(dataset: str):
    try:
        from convokit import Corpus, download
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: convokit. Install behavior-lab dependencies with "
            "`python -m pip install -r requirements-behavior-lab.txt`."
        ) from exc

    return Corpus(filename=download(dataset))


def export_casino(dataset: str, out_dir: Path) -> dict[str, Any]:
    try:
        import pandas as pd
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: pandas. Install behavior-lab dependencies with "
            "`python -m pip install -r requirements-behavior-lab.txt`."
        ) from exc

    out_dir.mkdir(parents=True, exist_ok=True)
    corpus = load_corpus(dataset)

    utterance_rows = [
        {
            "utterance_id": utterance.id,
            "conversation_id": utterance.conversation_id,
            "reply_to": utterance.reply_to,
            "speaker_id": utterance.speaker.id,
            "text": utterance.text,
            "meta_json": meta_json(utterance.meta),
        }
        for utterance in corpus.iter_utterances()
    ]

    conversation_rows = [
        {
            "conversation_id": conversation.id,
            "meta_json": meta_json(conversation.meta),
        }
        for conversation in corpus.iter_conversations()
    ]

    speaker_rows = [
        {
            "speaker_id": speaker.id,
            "meta_json": meta_json(speaker.meta),
        }
        for speaker in corpus.iter_speakers()
    ]

    utterances_path = out_dir / "casino_utterances.parquet"
    conversations_path = out_dir / "casino_conversations.parquet"
    speakers_path = out_dir / "casino_speakers.parquet"
    manifest_path = out_dir / "casino_manifest.json"

    pd.DataFrame(utterance_rows).to_parquet(utterances_path, index=False)
    pd.DataFrame(conversation_rows).to_parquet(conversations_path, index=False)
    pd.DataFrame(speaker_rows).to_parquet(speakers_path, index=False)

    manifest = {
        "dataset": dataset,
        "source": "ConvoKit",
        "download_name": DATASET_NAME,
        "license": "CC BY 4.0",
        "counts": {
            "utterances": len(utterance_rows),
            "conversations": len(conversation_rows),
            "speakers": len(speaker_rows),
        },
        "files": {
            "utterances": str(utterances_path),
            "conversations": str(conversations_path),
            "speakers": str(speakers_path),
        },
        "notes": [
            "Metadata is stored as deterministic JSON text in meta_json columns.",
            "Generated files are local artifacts and should not be committed.",
            "Keep CaSiNo attribution when using derived analysis results.",
        ],
    }

    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    args = build_arg_parser().parse_args()
    manifest = export_casino(args.dataset, args.out_dir)

    print("Saved CaSiNo exports:")
    for file_path in manifest["files"].values():
        print(file_path)
    print(args.out_dir / "casino_manifest.json")
    print("Counts:", json.dumps(manifest["counts"], sort_keys=True))


if __name__ == "__main__":
    main()
