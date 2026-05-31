# Behavior Lab: CaSiNo / ConvoKit

This document defines the first checkable external-data layer for Kanonar. It
does not change the deterministic runtime. It creates local analysis tables from
the CaSiNo negotiation corpus so future experiments can compare Kanonar's
internal simulation variables against annotated dialogue data.

For the full cross-dataset summary of the CaSiNo Behavior Lab and SAPA/SPI
Trait Validation wave, see `docs/EXTERNAL_DATA_VALIDATION_SUMMARY.md`.

## Scope

Current layer:

- dataset source: ConvoKit download name `casino-corpus`
- local script: `scripts/download_casino.py`
- Python dependencies: `requirements-behavior-lab.txt`
- generated outputs:
  - `data/processed/casino_utterances.parquet`
  - `data/processed/casino_conversations.parquet`
  - `data/processed/casino_speakers.parquet`
  - `data/processed/casino_manifest.json`

Generated data files are ignored by git and should be regenerated locally.

## Official links and recommended attribution

Use these links when documenting, publishing, or presenting CaSiNo-based
experiments:

- ConvoKit CaSiNo corpus page:
  [https://convokit.cornell.edu/documentation/casino-corpus.html](https://convokit.cornell.edu/documentation/casino-corpus.html)
- ConvoKit root project:
  [https://convokit.cornell.edu/](https://convokit.cornell.edu/)
- ACL Anthology paper:
  [https://aclanthology.org/2021.naacl-main.254/](https://aclanthology.org/2021.naacl-main.254/)
- Direct dataset ZIP used by ConvoKit:
  [https://zissou.infosci.cornell.edu/convokit/datasets/casino-corpus/casino-corpus.zip](https://zissou.infosci.cornell.edu/convokit/datasets/casino-corpus/casino-corpus.zip)
- CC BY 4.0 license text:
  [https://creativecommons.org/licenses/by/4.0/](https://creativecommons.org/licenses/by/4.0/)

Recommended citation:

```bibtex
@inproceedings{chawla-etal-2021-casino,
    title = "{C}a{S}i{N}o: A Corpus of Campsite Negotiation Dialogues for Automatic Negotiation Systems",
    author = "Chawla, Kushal  and
      Ramirez, Jaysa  and
      Clever, Rene  and
      Lucas, Gale  and
      May, Jonathan  and
      Gratch, Jonathan",
    booktitle = "Proceedings of the 2021 Conference of the North American Chapter of the Association for Computational Linguistics: Human Language Technologies",
    year = "2021",
    publisher = "Association for Computational Linguistics",
    url = "https://aclanthology.org/2021.naacl-main.254/",
    doi = "10.18653/v1/2021.naacl-main.254",
    pages = "3167--3185",
}
```

Attribution rule for Kanonar notes: name the dataset as CaSiNo, name ConvoKit as
the access layer, cite the ACL paper above, and keep the CC BY 4.0 license link.
Do not commit the downloaded corpus or present derived Kanonar variables as
measured CaSiNo labels.

Attribution template for derived Kanonar artifacts:

```text
This artifact uses derived tables generated from CaSiNo: A Corpus of Campsite
Negotiation Dialogues for Automatic Negotiation Systems (Chawla et al., NAACL
2021), accessed through ConvoKit `casino-corpus`.

Source:
https://convokit.cornell.edu/documentation/casino-corpus.html

Paper:
https://aclanthology.org/2021.naacl-main.254/

License:
Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/

Changes:
The original ConvoKit corpus was converted into local Parquet tables and
metadata JSON columns for Kanonar behavior-lab preprocessing.
```

## Setup

Windows PowerShell:

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-behavior-lab.txt
python scripts/download_casino.py
```

Linux, macOS, or Git Bash:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-behavior-lab.txt
python scripts/download_casino.py
```

The script uses:

```python
from convokit import Corpus, download

corpus = Corpus(filename=download("casino-corpus"))
```

## Output contract

`casino_utterances.parquet` contains:

- `utterance_id`
- `conversation_id`
- `reply_to`
- `speaker_id`
- `text`
- `meta_json`

`casino_conversations.parquet` contains:

- `conversation_id`
- `meta_json`

`casino_speakers.parquet` contains:

- `speaker_id`
- `meta_json`

`meta_json` is deterministic JSON text. This is deliberate: ConvoKit metadata can
contain nested or irregular dictionaries, while Parquet prefers stable column
types.

## Inspected data summary

Local export produced:

| Table | Rows | File |
| --- | ---: | --- |
| utterances | 14,297 | `data/processed/casino_utterances.parquet` |
| conversations | 1,030 | `data/processed/casino_conversations.parquet` |
| speakers | 846 | `data/processed/casino_speakers.parquet` |

Important ID note: in this ConvoKit export, `conversation_id` is the root
utterance id, such as `utterance_0`. The numeric CaSiNo dialogue id is stored in
`meta_json.dialogue_id`. Downstream preprocessing should promote `dialogue_id`
to an explicit column.

### Utterance layer

Each row is one dialogue event. The inspected metadata keys are:

- `annotations` - strategy labels; non-empty on 4,615 utterances.
- `dialogue_id` - numeric CaSiNo dialogue id.
- `speaker_id` - ConvoKit speaker id.
- `speaker_internal_id` - participant role id such as `mturk_agent_1`.
- `data` - terminal negotiation action metadata on 1,197 utterances.
- `issue2youget` / `issue2theyget` - submitted allocation maps on 1,181
  utterances.

Annotated dialogues: 396.

Top strategy components after splitting comma-separated `annotations`:

| Strategy component | Count |
| --- | ---: |
| `non-strategic` | 1,455 |
| `small-talk` | 1,054 |
| `self-need` | 964 |
| `promote-coordination` | 579 |
| `vouch-fair` | 439 |
| `other-need` | 409 |
| `elicit-pref` | 377 |
| `showing-empathy` | 254 |
| `no-need` | 196 |
| `uv-part` | 131 |

Terminal action metadata:

| Value | Count |
| --- | ---: |
| `accept_deal` | 1,005 |
| `reject_deal` | 167 |
| `walk_away` | 25 |

### Conversation layer

Each row is one negotiation dialogue. The inspected metadata keys are:

- `dialogue_id`
- `participant_info`

`participant_info` contains `mturk_agent_1` and `mturk_agent_2`. Each participant
entry contains:

- `value2issue` - maps `High`, `Medium`, `Low` to `Food`, `Water`, `Firewood`.
- `value2reason` - natural-language reasons for those preferences.
- `outcomes` - `points_scored`, `satisfaction`, and `opponent_likeness`.

Participant points in the inspected export:

```text
min = 5
max = 32
mean = 18.637
```

### Speaker layer

Each row is one ConvoKit speaker. The inspected metadata keys are:

- `demographics`
- `personality`
- `speaker_id`

`demographics` contains:

- `age`
- `education`
- `ethnicity`
- `gender`

`personality` contains:

- `big-five`
- `svo`

SVO counts:

| SVO class | Count |
| --- | ---: |
| `prosocial` | 463 |
| `proself` | 364 |
| `unclassified` | 19 |

## Behavioral dataset v1

The first implemented behavior-lab dataset lives under `kanonar_behavior_lab/`.
It translates CaSiNo into an interpretable event and trajectory layer:

```text
dialogue text -> event sequence -> T/C/U trajectory -> episode features -> labels
```

Generated outputs:

- `kanonar_behavior_lab/data/processed/raw_dialogues.parquet`
- `kanonar_behavior_lab/data/processed/events.parquet`
- `kanonar_behavior_lab/data/processed/trajectories.parquet`
- `kanonar_behavior_lab/data/processed/episode_features.parquet`
- `kanonar_behavior_lab/data/reports/behavior_report.md`

Refined v2 outputs:

- `kanonar_behavior_lab/data/processed/events_v2.parquet`
- `kanonar_behavior_lab/data/processed/offer_dynamics.parquet`
- `kanonar_behavior_lab/data/processed/trajectory_windows.parquet`
- `kanonar_behavior_lab/data/processed/episode_features_v2.parquet`
- `kanonar_behavior_lab/data/reports/behavior_report_v2.md`

Validation:

```bash
python -m kanonar_behavior_lab.src.reports.validate_dataset
```

The validator checks row counts, required columns, action alphabet, non-empty
event fields, trajectory bounds, one feature row per episode, label coverage, and
report existence.

v2 validation:

```bash
python -m kanonar_behavior_lab.src.reports.validate_dataset_v2
```

v2 keeps v1 as a baseline but separates soft/terminal acceptance, offer
micro-moves, offer dynamics, and segment-level attractor windows.

v3/v4 artifacts add manual validation samples, local transition probabilities,
observed allocation progress, actor-level behavior profiles, trait-like axes,
and negotiation behavior clusters. These clusters are not personality traits;
they are repeated behavioral signatures in this dataset.

Detailed results page:

- `docs/BEHAVIOR_LAB_CASINO_RESULTS.md`

## Preprocessing rules

Normalization rules:

- Trim annotation labels and drop empty labels.
- Treat missing annotations as missing data, not as `non-strategic`.
- Keep `speaker_internal_id` because it links utterances to
  `participant_info`.
- Keep text as UTF-8; CaSiNo utterances can contain emoji.
- Keep all Kanonar-derived variables in separate columns or tables with a
  `kanonar_*` prefix until calibration is explicitly defined.

## Mapping to Kanonar

The first preprocessing pass should keep dataset facts separate from Kanonar
model variables:

```text
CaSiNo utterances -> observed dialogue events
CaSiNo conversation meta -> hidden goals, preferences, outcomes
CaSiNo speaker meta -> participant traits / demographics / personality inputs
```

Do not present derived Kanonar variables such as `trust`, `controlNeed`,
`affiliationNeed`, `stress`, or `resentment` as measured CaSiNo labels. They are
internal simulation scalars unless an explicit experimental calibration layer is
added later.

## Verification path

Cheap local checks:

```bash
python -m py_compile scripts/download_casino.py
python scripts/download_casino.py --help
```

Full data check after dependencies are installed:

```bash
python scripts/download_casino.py
python - <<'PY'
import pandas as pd

utterances = pd.read_parquet("data/processed/casino_utterances.parquet")
conversations = pd.read_parquet("data/processed/casino_conversations.parquet")
speakers = pd.read_parquet("data/processed/casino_speakers.parquet")

print("utterances", len(utterances))
print("conversations", len(conversations))
print("speakers", len(speakers))
print(utterances.columns.tolist())
PY
```

The expected corpus scale is about 1,030 conversations and 14,297 utterances.
Annotated negotiation strategies are available only for a subset of the corpus,
so experimental code must tolerate missing annotations.

## Attribution and license

CaSiNo is distributed through ConvoKit and uses CC BY 4.0 terms. Any public use
of derived results must keep dataset attribution and cite the CaSiNo paper /
dataset source. This repository should not commit the downloaded corpus by
default.

## Assumptions and limitations

Kanonar is a research/prototype simulation system. Variables such as trust, fear,
stress, resentment, affiliation need, or control need are internal simulation
scalars. They are not clinical, psychometric, or experimentally calibrated
measurements.

The CaSiNo layer can support deterministic preprocessing, annotation coverage
checks, dialogue-event extraction, and later calibration experiments. It is not
by itself a validation of Kanonar as a real-world behavioral prediction model.
