# ConflictLab Learning Loop

ConflictLab v2 keeps the existing character utility layer:

```text
U_base = G + R + I + L + S + M + O - X
```

Learning is an additive correction over that prior, not a replacement for
character logic:

```text
U = U_base
  + beta_Q * Q_i(action)
  + beta_E * E_i[opponent_response | action]
  + beta_H * habit(action)
  - beta_V * volatility * risky(action)
  - beta_D * betrayalDebt * trustSensitive(action)
```

The tunable coefficients live in `DILEMMA_LEARNING_FORMULA` in
`lib/config/formulaConfig.ts`.

## Memory

Each directed dyad has a `ConflictLearningMemory`:

```text
agent i -> agent j
```

The memory stores:

- `actionValue`: Q-lite value learned for own actions against this partner.
- `actionCount`: discounted own action counts.
- `opponentActionCount`: discounted counts of the partner's actions.
- `opponentResponseCount`: discounted counts of `my:action|other:action`.
- `betrayalDebt`, `repairCredit`, `conflictMomentum`, `fearTrace`,
  `shameTrace`, `volatility`.
- `lastPredictionError`.

Counts and ledgers are deterministic discounted accumulators. No random source
is introduced by learning.

## Update

After both agents choose actions, the runner computes:

```text
predictionError = 1 - P_i(observedOtherAction | myAction)
reward = w_g goalGain
       + w_s safetyGain
       + w_r relationGain
       + w_p powerGain
       - w_m moralCost
       - w_x stressCost
```

Then memory updates:

```text
Q(action) <- Q(action) + eta * (reward - Q(action))
Count(myAction, otherAction) <- lambda * Count(myAction, otherAction) + 1
BetrayalDebt <- lambda_B * BetrayalDebt + betrayal * PE * trust
RepairCredit <- lambda_R * RepairCredit + repair * credibility * conflict
ConflictMomentum <- lambda_C * Momentum + harm + betrayal + humiliation - repair
```

`computeObservedEffect` uses the existing directed memory to make betrayal,
repair, fear, and conflict effects history-sensitive before `applyStateUpdate`
applies relationship/body deltas.

## Trace

`V2RoundTrace.learning` records the explanation surface for each agent:

- utility terms: `baseU`, `learnedQ`, learned expected response, `finalU`;
- prediction terms: expected/observed action, probability, prediction error;
- decomposed reward;
- memory before/after;
- relation before/after.

This means two identical current relationship snapshots can still lead to
different next choices when their directed memories differ.
