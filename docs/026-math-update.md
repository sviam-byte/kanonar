# Math Update (Batch 4: Patches 023–025)

## S7 Goal Saturation

Added a new GoalState variable:

- `saturation[t] = clamp01(0.95 * saturation[t-1] + satUp - satDown)`
- `satUp = upBase + upActivation * activation` when active
- `satDown = downActive` when active, `downInactive` when inactive

Config defaults:

- `upBase = 0.04`
- `upActivation = 0.06`
- `downActive = 0.01`
- `downInactive = 0.15`
- `inertia = 0.95`

S7 score dampening now includes:

- `antiFatigue = 1 - antiFatiguePenalty * fatigue`
- `antiSaturation = 1 - saturationPenalty * saturation`
- `score *= antiFatigue * antiSaturation`

With `saturationPenalty = 0.45`, sustained goal dominance is naturally reduced over time,
then restored after short inactivity periods.

## S7 Surprise Mode Override

A 1-tick startle response is applied before mode gating:

1. Compute `maxSurprise = max(belief:surprise:*:<selfId>)`
2. If `maxSurprise >= threshold`, map `feature -> mode`
3. Blend mode weights with `overrideMix`

Defaults:

- `threshold = 0.45`
- `overrideMix = 0.75`
- mapping:
  - `threat -> threat_mode`
  - `socialTrust -> social_mode`
  - `emotionValence -> care_mode`
  - `resourceAccess -> resource_mode`
  - `scarcity -> resource_mode`

This creates immediate correction on sharp prediction errors while keeping regular
mode selection as the long-term controller.

## S8 Cognitive Action Effects (Projection Table)

Added non-zero feature effects for cognitive action kinds:

- `monologue: { stress: -0.04, fatigue: +0.01 }`
- `verify: { stress: +0.01, socialTrust: +0.03 }`

Also extended pattern matching:

- `monologue|self.talk|think|reflect|plan -> monologue`
- `verify|check|confirm|validate -> verify`

This ensures cognitive possibilities can generate small but non-zero Q-value impact,
so reflection/verification choices are available when context favors them.
