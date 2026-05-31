from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
LAB_ROOT = REPO_ROOT / "kanonar_behavior_lab"

SOURCE_PROCESSED_DIR = REPO_ROOT / "data" / "processed"
PROCESSED_DIR = LAB_ROOT / "data" / "processed"
REPORTS_DIR = LAB_ROOT / "data" / "reports"

CASINO_UTTERANCES = SOURCE_PROCESSED_DIR / "casino_utterances.parquet"
CASINO_CONVERSATIONS = SOURCE_PROCESSED_DIR / "casino_conversations.parquet"
CASINO_SPEAKERS = SOURCE_PROCESSED_DIR / "casino_speakers.parquet"

RAW_DIALOGUES = PROCESSED_DIR / "raw_dialogues.parquet"
EVENTS = PROCESSED_DIR / "events.parquet"
TRAJECTORIES = PROCESSED_DIR / "trajectories.parquet"
EPISODE_FEATURES = PROCESSED_DIR / "episode_features.parquet"
PREDICTION_REPORT = PROCESSED_DIR / "prediction_metrics.json"
BEHAVIOR_REPORT = REPORTS_DIR / "behavior_report.md"


def ensure_output_dirs() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

