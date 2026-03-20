# Система диалогов: дизайн

## Принцип

Диалог — не отдельная механика, а **речевое действие** (speech act) внутри общего
action pipeline. Агент выбирает talk/propose/command так же, как выбирает attack/hide —
через Q-функцию. Но **содержание** речи (какие atoms передать, с какой честностью)
решается отдельным модулем ПОСЛЕ выбора действия.

## Поток данных

```
1. Pipeline S8: agent A decides action = talk(B, topic='escape')
   Q(talk) > Q(wait) because affiliationNeed high + trust(A→B) > 0.5

2. TalkSpec.apply(): generates SpeechEventV1 base payload
   act = 'inform' | 'propose' | 'ask' | 'threaten' | 'command'
   atoms = A's relevant belief atoms about topic

3. decideSpeechContent(): transforms atoms based on A's intent
   if A has hidden agenda + low normSensitivity → selective/deceptive
   if A trusts B → truthful
   OUTPUT: atoms (possibly modified), intent label, deception cost

4. applyEvent(speech:v1): routes speech
   routeSpeechEvent() determines recipients by volume:
     whisper → target + nearby (nav distance ≤ 2)
     normal → everyone in same location
     shout → same location + adjacent locations
   Each recipient gets atoms in their inbox with confidence adjusted

5. Trust gating (next tick): recipient B processes inbox
   B's inbox atoms go through accept/quarantine/reject based on:
     trust(B→A), think-vector compatibility, B's stress, observeBoost
   Accepted atoms enter B's belief state → affect B's next decision

6. Response (next tick): if A's speech was 'propose' or 'ask'
   DialogueState creates open exchange
   B's proposeActions() generates respond offers: accept/reject/counter
   B's pipeline scores these alongside other actions
   If B accepts → exchange closed, both get confirmation atoms
   If B rejects → A's affiliationNeed may spike (proposal blocked → frustration)
```

## Типы речевых актов

| Act | Когда | Что передаёт | Ожидает ответ? |
|-----|-------|-------------|---------------|
| `inform` | Agent хочет поделиться фактом | belief atoms as-is | Нет |
| `ask` | Agent хочет узнать | query atom (что хочет знать) | Да (inform back) |
| `propose` | Agent предлагает план/действие | plan atoms | Да (accept/reject/counter) |
| `command` | Agent с authority приказывает | directive atom | Да (accept/reject) |
| `threaten` | Agent запугивает | threat atoms + demand | Нет (но affect trust) |
| `promise` | Agent обещает | commitment atom | Нет (но affect trust) |

## Что определяет ЧТО агент говорит

```
Входы в decideSpeechContent:
  - speakerId, targetId
  - topicAtoms: atoms из belief state, релевантные текущей теме
  - goalScores: текущие goal domain scores агента
  - traits: selfControl, normSensitivity
  - trust(speaker→target)
  - hasHiddenAgenda: bool

Логика выбора:
  Q(truthful) = 0.5 + trust×0.3 + normSensitivity×0.2
  Q(selective) = 0.3 + Σ(harmful_atom_alignment × goal_weight) − normSens×0.15
  Q(deceptive) = 0.2 + goal_gain×1.5 − guilt(normSens) − detectionRisk(1−selfControl)

  deceptive requires: hasHiddenAgenda = true (without agenda, no motive to lie)
```

## Как выбирается ТЕМА

Тема определяется pipeline: какой speech act выбран зависит от какой goal domain
наиболее активен:

| Активная цель | Вероятный speech act | Тема |
|---|---|---|
| safety | inform(danger) или ask(route) | danger, escape, threat |
| affiliation | comfort или propose(help) | feelings, cooperation |
| control | command или negotiate | plan, order, resources |
| status | accuse или praise | reputation, loyalty |
| exploration | ask(info) или inform(discovery) | unknown areas, observations |

## Ложь и раскрытие

Ложь (deceptive intent):
- Agent A занижает magnitude danger atom: говорит B «не так опасно»
- В DialoguePanel автор видит маркер [DECEPTIVE] и реальный vs переданный magnitude
- B может обнаружить ложь если:
  1. B's собственные наблюдения противоречат полученным atoms (contradiction → lower confidence)
  2. Другой agent C передаёт B правдивую версию → B сравнивает
  3. B замечает nonverbal cue: A stressed (body language atom) while claiming calm

Раскрытие:
- Если ложь обнаружена (B получает contradicting atom с higher confidence):
  trust(B→A) drops sharply (expectation violation × deception_severity)
  B может сгенерировать accuse(A) action
  Все свидетели получают suspicion atoms

## Что показывает DialoguePanel

```
[T:12] A → B (normal, inform) [TRUTHFUL]
  «Туннель заблокирован»
  atoms: [danger:tunnel=0.8 ✓, route:blocked=1.0 ✓]
  B: принял (trust=0.72)

[T:15] A → B (whisper, inform) [SELECTIVE]
  «Крыстар ранен»
  atoms: [health:krystar=0.4 ✓]  ← не передал: pain:krystar=0.7
  B: принял (trust=0.72)
  C: подслушал (conf=0.35)

[T:18] C → all (shout, command)
  «Никто не уходит!»
  atoms: [authority=0.9, norm:stay=0.8]
  A: карантин (trust=0.28) | B: принял (trust=0.55) | D: принял (trust=0.70)

[T:22] A → B (whisper, propose)
  «Давай уйдём пока C не смотрит» → ОБМЕН ОТКРЫТ
  atoms: [plan:escape=0.7, danger:C=0.4]

[T:23] B → A (normal, accept)
  «Да, идём» → ОБМЕН ПРИНЯТ
  → A и B получают goal alignment boost: affiliation +0.1
```
