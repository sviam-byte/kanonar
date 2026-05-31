# CaSiNo Behavioral Dataset Report v2

This report refines the v1 rule-based translator by separating overloaded acceptance and offer mechanics, then adding local window-level regime labels.

CaSiNo attribution: Chawla et al., NAACL 2021, accessed through ConvoKit `casino-corpus`, CC BY 4.0.

`trust`, `conflict`, and `utility` remain rule-based internal simulation scalars.

## Output Counts

- events_v2 rows: 14297
- offer_dynamics rows: 7447
- trajectory_windows rows: 3329
- episode_features_v2 rows: 1030

## Counteroffer Split

- v2 counteroffer rows: 4346
- v2 offer-family rows: 7447
- counteroffer share inside offer family: 0.584

## Soft vs Terminal Acceptance

- terminal_accept: 1005
- soft_accept: 2016
- acknowledge: 61

## Action Distribution v2

- `counteroffer`: 4346
- `soft_accept`: 2016
- `neutral`: 1617
- `ask_preference`: 1182
- `concession_offer`: 1180
- `initial_offer`: 1030
- `terminal_accept`: 1005
- `demand`: 570
- `reject`: 287
- `repair`: 267
- `self_favoring_offer`: 252
- `explain_preference`: 198
- `threaten`: 140
- `pressure`: 77
- `acknowledge`: 61
- `deal_formalization`: 52
- `repeat_offer`: 17

## Window Labels

- `cooperation_window`: 1537
- `bargaining_window`: 1296
- `escalation_window`: 298
- `repair_window`: 164
- `deadlock_window`: 34

## Episode Attractors v2

- `cooperation`: 791
- `bargaining`: 160
- `escalation`: 77
- `deadlock`: 2

## Top Window Sequences

- `bargaining_window -> bargaining_window -> cooperation_window`: 218
- `bargaining_window -> cooperation_window -> cooperation_window`: 146
- `cooperation_window -> bargaining_window -> cooperation_window`: 75
- `cooperation_window -> cooperation_window -> cooperation_window`: 65
- `escalation_window -> bargaining_window -> cooperation_window`: 46
- `escalation_window -> cooperation_window -> cooperation_window`: 43
- `bargaining_window -> repair_window -> cooperation_window`: 42
- `cooperation_window -> cooperation_window -> bargaining_window`: 37
- `bargaining_window -> escalation_window -> cooperation_window`: 31
- `cooperation_window -> escalation_window -> cooperation_window`: 24

## Offer Dynamics

- allocation_present rows: 1181
- offer_shift_from_previous: `{'changed': 6161, 'initial': 1030, '': 234, 'repeat_by_actor': 17, 'repeat_global': 5}`
- mean allocation shift distance: 4.410

## Early Signals

- no_deal episodes have higher pressure/deadlock-window counts in v2 features; use `episode_features_v2.parquet` for exact modeling.
- deadlock is now observable as a local window label even when the whole dialogue later reaches a deal.
