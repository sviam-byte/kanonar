from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from kanonar_behavior_lab.src.annotation.state_deltas import ACTION_ALPHABET


RE_ASK = re.compile(r"\?|what|which|how many|would you|could you|can you|do you need|interested", re.I)
RE_ACCEPT = re.compile(r"\b(accept|accepted|agree|agreed|deal|sounds good|works for me|ok(?:ay)?)\b", re.I)
RE_REJECT = re.compile(r"\b(no|reject|can't|cannot|wont|won't|not enough|doesn't work|do not agree)\b", re.I)
RE_THREAT = re.compile(r"\b(walk away|leave|quit|no deal|end this|take it or leave it)\b", re.I)
RE_PRESSURE = re.compile(r"\b(must|need you to|only way|final offer|fair enough|be reasonable|you should)\b", re.I)
RE_REPAIR = re.compile(r"\b(sorry|understand|i see|fair|both|together|work this out|benefits us both)\b", re.I)
RE_CONCEDE = re.compile(r"\b(i can give|i'll give|you can have|willing to|i can do|i could do|let you have)\b", re.I)
RE_OFFER = re.compile(
    r"\b(offer|trade|give you|you get|i get|split|for you|for me|"
    r"\d+\s*(food|water|firewood)|food|water|firewood)\b",
    re.I,
)
RE_EXPLAIN = re.compile(r"\b(because|since|need|we have|my group|reason|prefer|important)\b", re.I)


@dataclass(frozen=True)
class ActionDecision:
    action_type: str
    emotion: str
    intent: str
    offer_present: bool
    reject_present: bool
    accept_present: bool
    concession_present: bool
    repair_present: bool
    pressure_present: bool


def split_annotations(raw_annotations: object) -> list[str]:
    if raw_annotations is None:
        return []
    labels = [part.strip() for part in str(raw_annotations).split(",")]
    return [label for label in labels if label]


def has_any(labels: Iterable[str], wanted: set[str]) -> bool:
    return any(label in wanted for label in labels)


def classify_event(
    *,
    text: str,
    annotations: object,
    terminal_data: object,
    issue2youget: object,
    issue2theyget: object,
    prior_offer_seen: bool,
) -> ActionDecision:
    labels = set(split_annotations(annotations))
    text_value = text or ""
    terminal = "" if terminal_data is None else str(terminal_data)
    has_allocation = bool(issue2youget) or bool(issue2theyget)

    if terminal == "accept_deal" or RE_ACCEPT.search(text_value) and "deal" in text_value.lower():
        action = "accept"
    elif terminal == "reject_deal":
        action = "reject"
    elif terminal == "walk_away" or RE_THREAT.search(text_value):
        action = "threaten"
    elif RE_PRESSURE.search(text_value):
        action = "pressure"
    elif has_allocation:
        action = "counteroffer" if prior_offer_seen else "offer"
    elif RE_CONCEDE.search(text_value):
        action = "concede"
    elif has_any(labels, {"vouch-fair"}) and prior_offer_seen:
        action = "concede"
    elif RE_OFFER.search(text_value):
        action = "counteroffer" if prior_offer_seen else "offer"
    elif RE_REJECT.search(text_value):
        action = "reject"
    elif has_any(labels, {"showing-empathy"}) or RE_REPAIR.search(text_value):
        action = "repair"
    elif has_any(labels, {"elicit-pref"}) or RE_ASK.search(text_value):
        action = "ask"
    elif has_any(labels, {"self-need", "other-need", "no-need"}) or RE_EXPLAIN.search(text_value):
        action = "explain"
    elif has_any(labels, {"promote-coordination"}):
        action = "repair"
    else:
        action = "neutral"

    if action not in ACTION_ALPHABET:
        action = "neutral"

    return ActionDecision(
        action_type=action,
        emotion=emotion_for_action(action),
        intent=intent_for_action(action),
        offer_present=action in {"offer", "counteroffer", "concede"},
        reject_present=action == "reject",
        accept_present=action == "accept",
        concession_present=action == "concede",
        repair_present=action == "repair",
        pressure_present=action in {"pressure", "threaten"},
    )


def emotion_for_action(action_type: str) -> str:
    if action_type in {"accept", "concede", "repair"}:
        return "cooperative"
    if action_type in {"reject", "pressure", "threaten"}:
        return "frustrated"
    if action_type in {"ask", "explain", "offer", "counteroffer"}:
        return "engaged"
    return "neutral"


def intent_for_action(action_type: str) -> str:
    return {
        "offer": "propose",
        "counteroffer": "propose",
        "accept": "accept",
        "reject": "reject",
        "concede": "concede",
        "ask": "ask",
        "explain": "explain",
        "pressure": "pressure",
        "threaten": "pressure",
        "repair": "repair",
        "neutral": "none",
    }[action_type]

