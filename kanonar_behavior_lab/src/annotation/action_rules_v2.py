from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from kanonar_behavior_lab.src.annotation.action_rules import split_annotations


ACTION_ALPHABET_V2 = (
    "initial_offer",
    "counteroffer",
    "repeat_offer",
    "concession_offer",
    "self_favoring_offer",
    "demand",
    "deal_formalization",
    "terminal_accept",
    "soft_accept",
    "acknowledge",
    "reject",
    "pressure",
    "threaten",
    "repair",
    "explain_preference",
    "ask_preference",
    "neutral",
)

STATE_DELTAS_V2: dict[str, dict[str, float]] = {
    "initial_offer": {"trust": 0.00, "conflict": 0.00, "utility": 0.10},
    "counteroffer": {"trust": 0.00, "conflict": 0.04, "utility": 0.05},
    "repeat_offer": {"trust": -0.02, "conflict": 0.08, "utility": 0.00},
    "concession_offer": {"trust": 0.08, "conflict": -0.10, "utility": 0.18},
    "self_favoring_offer": {"trust": -0.02, "conflict": 0.08, "utility": 0.03},
    "demand": {"trust": -0.10, "conflict": 0.18, "utility": 0.00},
    "deal_formalization": {"trust": 0.06, "conflict": -0.10, "utility": 0.18},
    "terminal_accept": {"trust": 0.10, "conflict": -0.20, "utility": 0.30},
    "soft_accept": {"trust": 0.03, "conflict": -0.03, "utility": 0.05},
    "acknowledge": {"trust": 0.02, "conflict": -0.01, "utility": 0.00},
    "reject": {"trust": -0.05, "conflict": 0.15, "utility": -0.10},
    "pressure": {"trust": -0.15, "conflict": 0.25, "utility": 0.00},
    "threaten": {"trust": -0.25, "conflict": 0.35, "utility": -0.10},
    "repair": {"trust": 0.15, "conflict": -0.25, "utility": 0.05},
    "explain_preference": {"trust": 0.05, "conflict": -0.05, "utility": 0.05},
    "ask_preference": {"trust": 0.00, "conflict": 0.00, "utility": 0.02},
    "neutral": {"trust": 0.00, "conflict": 0.00, "utility": 0.00},
}


RE_ACK = re.compile(r"^(ok|okay|yes|yeah|yep|sure|alright|sounds good|i see|got it)[.! ]*$", re.I)
RE_SOFT_ACCEPT = re.compile(r"\b(okay|ok|sounds good|i agree|that works|works for me|fair enough|sure)\b", re.I)
RE_TERMINAL_ACCEPT = re.compile(r"\b(accept|accepted|accepting|deal accepted|submit|submitted)\b", re.I)
RE_REJECT = re.compile(r"\b(no|reject|can't|cannot|wont|won't|not enough|doesn't work|do not agree)\b", re.I)
RE_THREAT = re.compile(r"\b(walk away|leave|quit|no deal|end this|take it or leave it)\b", re.I)
RE_PRESSURE = re.compile(r"\b(must|need you to|only way|final offer|be reasonable|you should)\b", re.I)
RE_DEMAND = re.compile(r"\b(i need|i must have|i want all|i require|only accept|minimum)\b", re.I)
RE_REPAIR = re.compile(r"\b(sorry|understand|i see|fair|both|together|work this out|benefits us both)\b", re.I)
RE_CONCEDE = re.compile(r"\b(i can give|i'll give|you can have|willing to|i can do|i could do|let you have)\b", re.I)
RE_OFFER = re.compile(
    r"\b(offer|trade|give you|you get|i get|split|for you|for me|"
    r"\d+\s*(food|water|firewood)|food|water|firewood)\b",
    re.I,
)
RE_ASK = re.compile(r"\?|what|which|how many|would you|could you|can you|do you need|interested", re.I)
RE_EXPLAIN = re.compile(r"\b(because|since|need|we have|my group|reason|prefer|important)\b", re.I)


@dataclass
class OfferState:
    seen_any_offer: bool = False
    last_offer_by_actor: dict[str, str] | None = None
    last_global_offer: str = ""

    def __post_init__(self) -> None:
        if self.last_offer_by_actor is None:
            self.last_offer_by_actor = {}


@dataclass(frozen=True)
class ActionDecisionV2:
    action_type: str
    emotion: str
    intent: str
    offer_present: bool
    reject_present: bool
    accept_present: bool
    concession_present: bool
    repair_present: bool
    pressure_present: bool
    offer_signature: str
    offer_shift_from_previous: str
    allocation_present: bool


def parse_json_map(raw_value: object) -> dict[str, int]:
    if raw_value in (None, "", {}, []):
        return {}
    if isinstance(raw_value, dict):
        value = raw_value
    else:
        try:
            value = json.loads(str(raw_value))
        except json.JSONDecodeError:
            return {}
    parsed: dict[str, int] = {}
    for key, item in value.items():
        try:
            parsed[str(key)] = int(item)
        except (TypeError, ValueError):
            continue
    return parsed


def build_offer_signature(text: str, issue2youget: object, issue2theyget: object) -> tuple[str, bool]:
    you_get = parse_json_map(issue2youget)
    they_get = parse_json_map(issue2theyget)
    if you_get or they_get:
        return json.dumps({"you_get": you_get, "they_get": they_get}, sort_keys=True), True
    compact = " ".join((text or "").lower().split())
    if not compact:
        return "", False
    return compact[:160], False


def classify_event_v2(
    *,
    actor: str,
    text: str,
    annotations: object,
    terminal_data: object,
    issue2youget: object,
    issue2theyget: object,
    state: OfferState,
) -> ActionDecisionV2:
    labels = set(split_annotations(annotations))
    text_value = text or ""
    terminal = "" if terminal_data is None else str(terminal_data)
    offer_signature, allocation_present = build_offer_signature(text_value, issue2youget, issue2theyget)
    offer_like = bool(offer_signature) and (allocation_present or bool(RE_OFFER.search(text_value)))

    if terminal == "accept_deal":
        action = "terminal_accept"
    elif terminal == "reject_deal":
        action = "reject"
    elif terminal == "walk_away" or RE_THREAT.search(text_value):
        action = "threaten"
    elif RE_ACK.search(text_value):
        action = "acknowledge"
    elif RE_SOFT_ACCEPT.search(text_value):
        action = "soft_accept"
    elif RE_PRESSURE.search(text_value):
        action = "pressure"
    elif offer_like:
        action = classify_offer(actor, offer_signature, allocation_present, text_value, labels, state)
    elif RE_TERMINAL_ACCEPT.search(text_value) and "deal" in text_value.lower():
        action = "deal_formalization"
    elif RE_DEMAND.search(text_value):
        action = "demand"
    elif RE_CONCEDE.search(text_value) or "vouch-fair" in labels:
        action = "concession_offer"
    elif RE_REJECT.search(text_value):
        action = "reject"
    elif "showing-empathy" in labels or RE_REPAIR.search(text_value):
        action = "repair"
    elif "elicit-pref" in labels or RE_ASK.search(text_value):
        action = "ask_preference"
    elif labels.intersection({"self-need", "other-need", "no-need"}) or RE_EXPLAIN.search(text_value):
        action = "explain_preference"
    elif "promote-coordination" in labels:
        action = "repair"
    else:
        action = "neutral"

    if action not in ACTION_ALPHABET_V2:
        action = "neutral"

    offer_shift = offer_shift_for(actor, offer_signature, state) if offer_like else ""
    return ActionDecisionV2(
        action_type=action,
        emotion=emotion_for_action_v2(action),
        intent=intent_for_action_v2(action),
        offer_present=action
        in {
            "initial_offer",
            "counteroffer",
            "repeat_offer",
            "concession_offer",
            "self_favoring_offer",
            "demand",
            "deal_formalization",
        },
        reject_present=action == "reject",
        accept_present=action in {"terminal_accept", "soft_accept"},
        concession_present=action == "concession_offer",
        repair_present=action == "repair",
        pressure_present=action in {"pressure", "threaten", "demand"},
        offer_signature=offer_signature if offer_like else "",
        offer_shift_from_previous=offer_shift,
        allocation_present=allocation_present,
    )


def classify_offer(
    actor: str,
    offer_signature: str,
    allocation_present: bool,
    text: str,
    labels: set[str],
    state: OfferState,
) -> str:
    if not state.seen_any_offer:
        return "initial_offer"
    if state.last_offer_by_actor and state.last_offer_by_actor.get(actor) == offer_signature:
        return "repeat_offer"
    if RE_DEMAND.search(text):
        return "demand"
    if allocation_present and "accept" in text.lower():
        return "deal_formalization"
    if RE_CONCEDE.search(text) or "vouch-fair" in labels:
        return "concession_offer"
    if labels.intersection({"self-need"}) and not labels.intersection({"other-need", "vouch-fair"}):
        return "self_favoring_offer"
    if labels.intersection({"other-need", "vouch-fair"}):
        return "concession_offer"
    return "counteroffer"


def offer_shift_for(actor: str, offer_signature: str, state: OfferState) -> str:
    if not offer_signature:
        return ""
    if not state.seen_any_offer:
        return "initial"
    if state.last_offer_by_actor and state.last_offer_by_actor.get(actor) == offer_signature:
        return "repeat_by_actor"
    if state.last_global_offer == offer_signature:
        return "repeat_global"
    return "changed"


def update_offer_state(actor: str, decision: ActionDecisionV2, state: OfferState) -> None:
    if not decision.offer_present or not decision.offer_signature:
        return
    state.seen_any_offer = True
    assert state.last_offer_by_actor is not None
    state.last_offer_by_actor[actor] = decision.offer_signature
    state.last_global_offer = decision.offer_signature


def emotion_for_action_v2(action: str) -> str:
    if action in {"terminal_accept", "soft_accept", "concession_offer", "repair", "acknowledge"}:
        return "cooperative"
    if action in {"reject", "pressure", "threaten", "demand"}:
        return "frustrated"
    if action in {"initial_offer", "counteroffer", "repeat_offer", "self_favoring_offer", "deal_formalization"}:
        return "engaged"
    if action in {"ask_preference", "explain_preference"}:
        return "engaged"
    return "neutral"


def intent_for_action_v2(action: str) -> str:
    if action in {"initial_offer", "counteroffer", "repeat_offer", "self_favoring_offer"}:
        return "propose"
    if action == "concession_offer":
        return "concede"
    if action == "deal_formalization":
        return "formalize_deal"
    if action == "terminal_accept":
        return "accept_deal"
    if action == "soft_accept":
        return "accept_local"
    if action == "acknowledge":
        return "acknowledge"
    if action == "reject":
        return "reject"
    if action in {"pressure", "threaten", "demand"}:
        return "pressure"
    if action == "repair":
        return "repair"
    if action == "ask_preference":
        return "ask"
    if action == "explain_preference":
        return "explain"
    return "none"
