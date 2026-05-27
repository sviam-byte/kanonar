# Kanonar: Реестр сущностей и метрик

Этот документ фиксирует, какие сущности и какие именованные пространства метрик вообще существуют в текущем Kanonar runtime.

Документ не заменяет глубокие главные главы из `docs/agents/*`, но является энциклопедией сущностей и метрик. Для каждой metric family здесь должны быть: смысл, диапазон/единица, source path, формула или явная пометка raw/input, trace/test статус.

## Источники истины

Используйте этот порядок доверия:

1. runtime implementation
2. type contracts
3. schema / registries
4. tests
5. docs

Главные source-of-truth paths для этого реестра:

- `types.ts`
- `data/character-schema.ts`
- `data/latent-schema.ts`
- `lib/features/extractCharacter.ts`
- `lib/features/extractLocation.ts`
- `lib/features/extractScene.ts`
- `lib/biography.ts`
- `lib/biography/features.ts`
- `lib/archetypes/metrics.ts`
- `lib/tom/dyad-metrics.ts`
- `lib/tom/base/applyRelationPriors.ts`
- `lib/character-metrics-v4.2.ts`
- `lib/tom-metrics.ts`
- `lib/agents/motivationProfile.ts`

## 1. Канонические виды сущностей

Source of truth: `types.ts`, `EntityType`.

- `character`
- `object`
- `concept`
- `place`
- `location`
- `protocol`
- `event`
- `document`
- `essence`
- `social_event`

## 2. Главные entity-интерфейсы

### 2.1. Базовые сущности

Source of truth: `types.ts`.

- `BaseEntity`
- `AnyEntity`
- `ObjectEntity`
- `ConceptEntity`
- `LocationEntity`
- `CharacterEntity`
- `EssenceEntity`

### 2.2. Событийные и социальные сущности

Source of truth: `types.ts`.

- `SocialEvent`
- `BiographicalEvent`
- `PersonalEvent`
- `Biography`
- `BiographyState`

### 2.3. Runtime-состояния вокруг персонажа

Source of truth: `types.ts`.

- `BodyModel`
- `IdentityCaps`
- `CharacterStaticState`
- `SocialProfile`
- `Relationship`
- `TomState`
- `AgentMemory`
- `MassMembership`
- `ArchetypeState`
- `PlanState`
- `GoalState`
- `GoalEcology`

## 3. Feature-сущности после materialization

Source of truth: `lib/features/types.ts`, `lib/features/registry.ts`.

### 3.1. Feature kinds

- `character`
- `location`
- `scene`

### 3.2. Mods layers

- `characters`
- `locations`
- `scenes`

## 4. Пространство входных параметров персонажа: `characterSchema`

Source of truth: `data/character-schema.ts`.

Это главный именованный реестр параметров персонажа и тела. Ниже перечислены все группы и все ключи, которые явно заведены в схеме.

### 4.1. Группа `A`

- `A_Causality_Sanctity`
- `A_Memory_Fidelity`
- `A_Reversibility`
- `A_Legitimacy_Procedure`
- `A_Safety_Care`
- `A_Liberty_Autonomy`
- `A_Justice_Fairness`
- `A_Power_Sovereignty`
- `A_Knowledge_Truth`
- `A_Tradition_Continuity`
- `A_Transparency_Secrecy`
- `A_Aesthetic_Meaning`

### 4.2. Группа `B`

- `B_discount_rate`
- `B_exploration_rate`
- `B_tolerance_ambiguity`
- `B_goal_coherence`
- `B_cooldown_discipline`
- `B_decision_temperature`

### 4.3. Группа `C`

- `C_reciprocity_index`
- `C_betrayal_cost`
- `C_reputation_sensitivity`
- `C_dominance_empathy`
- `C_coalition_loyalty`

### 4.4. Группа `D`

- `D_fine_motor`
- `D_stamina_reserve`
- `D_pain_tolerance`
- `D_HPA_reactivity`
- `D_sleep_resilience`

### 4.5. Группа `E`

- `E_KB_stem`
- `E_KB_civic`
- `E_KB_topos`
- `E_Model_calibration`
- `E_Skill_repair_topology`
- `E_Skill_causal_surgery`
- `E_Skill_chronicle_verify`
- `E_Skill_diplomacy_negotiation`
- `E_Skill_ops_fieldcraft`
- `E_Skill_opsec_hacking`
- `E_Epi_volume`
- `E_Epi_recency`
- `E_Epi_schema_strength`

### 4.6. Группа `F`

- `F_Plasticity`
- `F_Value_update_rate`
- `F_Extinction_rate`
- `F_Trauma_plasticity`
- `F_Skill_learning_rate`
- `F_Forgetting_noise`

### 4.7. Группа `G`

- `G_Self_concept_strength`
- `G_Identity_rigidity`
- `G_Self_consistency_drive`
- `G_Metacog_accuracy`
- `G_Narrative_agency`

### 4.8. `body_capacity`

- `fine_motor`
- `VO2max`

### 4.9. `body_reserves`

- `energy_store_kJ`
- `hydration`
- `glycemia_mmol`
- `O2_margin`
- `sleep_homeostat_S`
- `circadian_phase_h`
- `sleep_debt_h`
- `immunity_tone`

### 4.10. `body_acute`

- `hp`
- `injuries_severity`
- `pain_now`
- `temperature_c`
- `tremor`
- `reaction_time_ms`
- `fatigue`
- `stress`
- `moral_injury`

### 4.11. `body_regulation`

- `HPA_axis`
- `arousal`

### 4.12. `legacy_state`

- `loyalty`
- `dark_exposure`
- `backlog_load`

### 4.13. `legacy_competencies`

- `topo_affinity`
- `causal_sensitivity`

### 4.14. `legacy_memory`

- `retrieval_noise`

### 4.15. `resources`

- `attention_E`
- `attention_Astar`
- `time_budget_h`
- `risk_budget_cvar`
- `infra_budget`
- `dark_quota`

### 4.16. `identity`

- `clearance_level`

### 4.17. `authority`

- `signature_weight.causal`
- `signature_weight.topo`
- `co_sign_threshold`

### 4.18. `evidence`

- `witness_pull`
- `evidence_quality`
- `visibility_lag_days`
- `visibility_zone`
- `memory_write_rights`

### 4.19. `observation`

- `noise`
- `report_noise`

### 4.20. `compute`

- `budget`
- `decision_deadline_s`
- `tom_depth`

## 5. Стандартизованные location / scene входы

Source of truth: `types.ts`, `LocationEntity`, `InputAxis`.

### 5.1. `InputAxis`

- `temperature`
- `comfort`
- `hygiene`
- `crowdDensity`
- `privacy`
- `authorityPresence`
- `aesthetics`
- `noiseLevel`
- `visibility`
- `controlLevel`

### 5.2. Ключевые location properties, которые реально участвуют в нормализации

Source of truth: `types.ts`, `lib/features/extractLocation.ts`.

- `privacy`
- `control_level`
- `visibility`
- `noise`
- `social_visibility`
- `normative_pressure`
- `crowd_level`
- `temperature`
- `comfort`
- `hygiene`
- `aesthetics`
- `authority_presence`
- `crowdDensity`
- `noiseLevel`

### 5.3. Scene metrics / norms, которые materialize в feature-слой

Source of truth: `lib/features/extractScene.ts`.

- `scene.crowd`
- `scene.hostility`
- `scene.urgency`
- `scene.scarcity`
- `scene.novelty`
- `scene.loss`
- `scene.resourceAccess`
- `norm.surveillance`
- `norm.proceduralStrict`
- `ctx.publicness`
- `ctx.privacy`

## 6. Feature-метрики после extraction

### 6.1. Character features

Source of truth: `lib/features/extractCharacter.ts`.

- `body.pain`
- `body.fatigue`
- `body.stress`
- `body.sleepDebt`
- `body.energy`
- `body.regulation`
- `trait.paranoia`
- `trait.sensitivity`
- `trait.experience`
- `trait.ambiguityTolerance`
- `trait.hpaReactivity`
- `trait.decisionTemperature`
- `trait.discountRate`
- `trait.care`
- `trait.safety`
- `trait.powerDrive`
- `trait.formalism`
- `trait.order`
- `trait.autonomy`
- `trait.truthNeed`
- `trait.normSensitivity`
- `role.clearance`

### 6.2. Location features

Source of truth: `lib/features/extractLocation.ts`.

- `loc.privacy`
- `loc.visibility`
- `loc.noise`
- `loc.socialVisibility`
- `loc.normPressure`
- `loc.controlLevel`
- `loc.crowd`
- `map.width`
- `map.height`
- `tag.private`
- `tag.safeHub`
- `tag.public`

### 6.3. Scene features

Source of truth: `lib/features/extractScene.ts`.

- `scene.crowd`
- `scene.hostility`
- `scene.urgency`
- `scene.scarcity`
- `scene.novelty`
- `scene.loss`
- `scene.resourceAccess`
- `norm.surveillance`
- `norm.proceduralStrict`
- `ctx.publicness`
- `ctx.privacy`

## 7. Контекстные оси

Source of truth: `types.ts`, `ContextAxisId`, `lib/context/codex/quarkCodex.ts`.

- `danger`
- `control`
- `intimacy`
- `hierarchy`
- `publicness`
- `normPressure`
- `surveillance`
- `scarcity`
- `timePressure`
- `uncertainty`
- `legitimacy`
- `secrecy`
- `grief`
- `pain`

## 8. Биографические и исторические метрики

### 8.1. Базовые biography-latent каналы

Source of truth: `lib/biography.ts`, `BIO_FEATURES`.

- `TRAUMA`
- `TRUST`
- `POWER`
- `AGENCY`
- `ORDER`
- `CHAOS`

### 8.2. Расширенные биографические feature-флаги

Source of truth: `lib/life-goals/v4-types.ts`, `lib/biography/features.ts`.

- `B_saved_others`
- `B_parent_role`
- `B_betrayed_system`
- `B_betrayed_by_peer`
- `B_raised_in_strict_order`
- `B_exposed_to_chaos`
- `B_leader_exp`
- `B_chronic_pain`
- `B_chronic_stress`
- `B_attachment_trauma`
- `B_exile`
- `B_moral_injury`
- `B_humiliation`
- `B_coercion`
- `B_strict_moral_upbringing`
- `B_abandonment`
- `B_bullying`
- `B_approval_deprivation`
- `B_military_socialization`
- `B_status_loss_history`
- `B_group_trauma`
- `B_witnessed_injustice`
- `B_long_term_commitments`
- `B_lied_to_history`
- `B_existential_crises`
- `B_dissociation_history`
- `B_no_safe_place_childhood`
- `B_sleep_disorders`
- `B_burnout`
- `B_sensory_sensitivity`
- `B_identity_threats`
- `B_trauma_overwhelm`
- `B_trauma_overload`
- `B_trauma_with_X_type`
- `B_torture`
- `B_injury`
- `B_overwork`
- `B_scarcity`
- `B_survival_mode`
- `B_high_responsibility`
- `B_failed_rescue`
- `B_captivity`
- `B_oath_taken`
- `B_loss`
- `B_political_prisoner`
- `B_hero_complex`
- `B_success`
- `B_betrayal_committed`
- `B_rel_devotion`

### 8.3. Реляционные biography features

Source of truth: `lib/life-goals/v4-types.ts`, `lib/biography/features.ts`.

- `B_rel_saved`
- `B_rel_failed_save`
- `B_rel_harmed`
- `B_rel_betrayed_by`
- `B_rel_obeyed`
- `B_rel_controlled_by`
- `B_rel_humiliated_by`
- `B_rel_care_from`
- `B_rel_shared_trauma`
- `B_rel_approval_deprivation`
- `B_rel_devotion`
- `B_rel_romance`
- `B_rel_friendship`

## 9. Латентные метрики

Source of truth: `data/latent-schema.ts`, `lib/metrics/latentsQuick.ts`.

- `CH` — Causal Hygiene
- `SD` — Stability Discipline
- `RP` — Risk Posture
- `SO` — Signal Openness
- `EW` — Ethical Weight
- `CL` — Network Multiplier

## 10. Quick-state метрики

Source of truth: `lib/metrics/latentsQuick.ts`.

- `social_support_proxy`
- `DR`
- `SI`
- `dark_susceptibility`
- `phys_fitness`
- `phys_fragility`
- `hormone_tension`
- `ToM_Q`
- `T_topo`
- `prMonstro`

## 11. Архетипические метрики

### 11.1. Координаты архетипа

Source of truth: `data/archetypes.ts`.

- `lambda`
- `domain`
- `func`

### 11.2. Архетипические derived-метрики

Source of truth: `lib/archetypes/metrics.ts`, `METRIC_NAMES`.

- `AGENCY`
- `ACCEPT`
- `ACTION`
- `RADICAL`
- `SCOPE`
- `TRUTH`
- `CARE`
- `MANIP`
- `FORMAL`

### 11.3. Runtime state архетипа

Source of truth: `types.ts`, `ArchetypeState`.

- `mixture`
- `actualId`
- `actualFit`
- `shadowId`
- `shadowFit`
- `shadowActivation`
- `currentMode`
- `phase`

## 12. ToM-метрики

### 12.1. Primitive/static dyad outputs

Source of truth: `lib/tom/dyad-metrics.ts`.

- `liking`
- `trust`
- `fear`
- `respect`
- `closeness`
- `dominance`

### 12.2. Prior-seeded / atomized dyad metrics

Source of truth: `lib/tom/base/applyRelationPriors.ts`.

- `trust`
- `threat`
- `intimacy`
- `uncertainty`
- `alignment`
- `respect`
- `dominance`
- `support`

### 12.3. Event-updated belief traits

Source of truth: `lib/tom/update.traits.ts`.

- `trust`
- `bond`
- `conflict`
- `competence`
- `align`
- `dominance`
- `reliability`
- `obedience`
- `uncertainty`
- `vulnerability`
- `respect`
- `fear`

### 12.4. ToM dashboard metrics

Source of truth: `types.ts`, `lib/tom-metrics.ts`.

- `delegability`
- `toM_DepthEff`
- `toM_Quality`
- `toM_Unc`

### 12.5. ToM v2 dashboard metrics

Source of truth: `types.ts`.

- `irl_fit`
- `kl_act`
- `misattrib`
- `cred_commit`
- `coalition_cohesion`
- `pivotality`
- `rationality_fit`
- `time_horizon`
- `pragmatic_loss`
- `decep_incentive`
- `detect_power`
- `tom_info_gain_rate`
- `identifiability`
- `order_mismatch`
- `prototype_reliance`
- `outlierness`
- `norm_conflict`
- `self_physical_capability`
- `self_perceived_vulnerability`
- `perceived_by_others_vulnerability`

## 13. V4.2-психометрический слой

Source of truth: `types.ts`, `lib/character-metrics-v4.2.ts`.

- `V_t`
- `A_t`
- `WMcap_t`
- `DQ_t`
- `Habit_t`
- `Agency_t`
- `TailRisk_t`
- `Rmargin_t`
- `PlanRobust_t`
- `DriveU_t`
- `ExhaustRisk_t`
- `Recovery_t`
- `ImpulseCtl_t`
- `InfoHyg_t`
- `RAP_t`

## 14. Derived metrics поверх персонажа

Source of truth: `types.ts`.

- `rho`
- `lambda`
- `iota`
- `resilience`
- `antifragility`
- `regulatoryGain`
- `chaosPressure`
- `socialFriction`
- `reputationFragility`
- `darkTendency`
- `goalTension`
- `frustration`
- `sensoriumReliability`
- `sleepPressure`
- `energyMargin`
- `Vsigma_core`
- `Vsigma_body`
- `Vsigma_total`
- `body_tail_risk`
- `load_capacity`

## 15. Motivation profile

Source of truth: `types.ts`, `lib/agents/motivationProfile.ts`.

- `arousal`
- `stress`
- `fatigue`
- `exploration_rate`
- `social_safety`

## 16. Goal / planning classifications, которые не являются скалярами, но являются частью модели

Source of truth: `types.ts`.

### 16.1. Goal categories

- `survival`
- `rest`
- `social`
- `control`
- `identity`
- `mission`
- `learn`
- `other`

### 16.2. Goal layers

- `body`
- `security`
- `social`
- `identity`
- `mission`
- `learn`
- `legacy`
- `scenario`
- `survival`
- `impulse`

### 16.3. Archetype runtime modes

- `default`
- `war`
- `social`
- `management`
- `crisis`
- `burnout`

### 16.4. Archetype runtime phases

- `normal`
- `strain`
- `break`
- `radical`
- `post`

## 17. Формулы и статус покрытия по metric families

Общее правило: психологически звучащие имена в этом разделе являются внутренними simulation scalars. Они не являются измерениями реальных людей.

Статусы:

- `raw/input` — формулы нет; значение приходит из схемы/данных и используется downstream.
- `runtime formula` — формула находится в живом runtime implementation.
- `registry formula` — формула есть в `lib/formulas/registry.ts`; если она расходится с runtime, runtime главнее.
- `trace artifact` — значение появляется как атом, trace part или stage artifact.

### 17.1. Raw entity and schema parameters

Purpose: зафиксировать входные данные до вычислений.

| family | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| `EntityType` | тип сущности в модели | enum | `types.ts` | raw/input; формулы нет | type-level |
| `CharacterEntity` | персонаж как источник `vector_base`, body, state, relations | mixed typed fields | `types.ts`, `data/character-schema.ts` | raw/input; downstream starts at feature extraction, latents, v4.2 | `tests/pipeline/fixtures.ts` |
| `LocationEntity` | локация как источник spatial/context properties | mixed typed fields | `types.ts`, `lib/features/extractLocation.ts` | raw/input; downstream starts at location features and S2 axes | pipeline tests |
| `characterSchema` groups `A...G`, body, resources, identity, authority, evidence, observation, compute | named input parameters | schema-defined min/max/step | `data/character-schema.ts` | raw/input; downstream formulas read flattened paths | indirect metric tests |

Formula:

```text
raw/input metric = value from entity/schema/data
normalized downstream value = mapper-specific clamp/normalization
```

Minimal example:

```text
vector_base.B_decision_temperature = 0.7
trait.decisionTemperature = clamp01(0.7)
```

Failure modes:

- Документировать raw input как вычисленную метрику.
- Не указать downstream formula family.
- Подать schema label как validated psychological measurement.

### 17.2. Feature extraction metrics

Purpose: превратить raw entity fields в normalized `feat:*` values.

| metric family | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| character features | body/trait/role normalized features | `[0,1]` | `lib/features/extractCharacter.ts` | runtime formula | used by S3/lens tests |
| location features | privacy, visibility, noise, norm pressure, map tags | `[0,1]` | `lib/features/extractLocation.ts` | runtime formula | pipeline/context tests |
| scene features | crowd/hostility/urgency/scarcity/norms | `[0,1]` | `lib/features/extractScene.ts` | runtime formula | SimKit/context tests |

Formula:

```text
feature = clamp01(num(raw, default))
trait.care = clamp01(A_Care_Compassion ?? (0.7*A_Safety_Care + 0.3*(1 - A_Power_Sovereignty)))
trait.normSensitivity = clamp01(0.5*trait.formalism + 0.5*trait.order)
trait.experience = clamp01((age - 18) / 60) when age exists, else 0.2
role.clearance = clamp01(clearance_level / 5)
map.width = clamp01(width / 64)
map.height = clamp01(height / 64)
scene.* = clamp01(scale(scene.metrics.*))
```

Variables:

- `raw` — input field from character/location/scene.
- `default` — fallback in extractor.
- `scale` — extractor-specific normalization for scene metrics.

Invariants:

- Feature values are clamped to `[0,1]`.
- Source paths must remain visible in feature metadata.
- Missing data must use explicit defaults, not `NaN`.

Minimal example:

```text
identity.clearance_level = 3
role.clearance = clamp01(3/5) = 0.6
```

Failure modes:

- Feature extraction emits `NaN`.
- Feature source path is dropped.
- A raw body unit is passed downstream without normalization where normalized value is expected.

### 17.3. Context axes and character lens

Purpose: derive base `ctx:*` axes and subjective `ctx:final:*`.

| metric family | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| context axes | danger/control/intimacy/etc. | `[0,1]` | `lib/context/axes/deriveAxes.ts`, `lib/context/codex/quarkCodex.ts` | runtime formula family | `tests/decision/final_ctx_preferred.test.ts` |
| subjective context | character-modulated `ctx:final:*` | `[0,1]` | `lib/context/lens/characterLens.ts` | runtime formula family | `tests/lens/character_lens.test.ts` |

Formula:

```text
ctx:<axis> = clamp01(weighted feature/world/scene signals)
ctx:final:<axis> = clamp01(base ctx:<axis> + lens delta from traits/body/state)
```

Canonical detailed formulas live in `docs/agents/03_CHARACTER_LENS.md`.

Invariants:

- S2 may emit `ctx:*`, not `ctx:final:*`.
- S3 must preserve base `ctx:*` and add `ctx:final:*`.
- Downstream subjective decision path should prefer `ctx:final:*`.

Minimal example:

```text
ctx:danger:A = 0.40
lens delta from stress/paranoia = +0.15
ctx:final:danger:A = clamp01(0.55)
```

Failure modes:

- S7/S8 consumes raw `ctx:*` without documented fallback.
- `ctx:final:*` drops `trace.usedAtomIds`.

### 17.4. Biography and history metrics

Purpose: aggregate personal events into biography latent channels and feature flags.

| metric family | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| `BIO_FEATURES` | `TRAUMA`, `TRUST`, `POWER`, `AGENCY`, `ORDER`, `CHAOS` | `[-1,1]` after `tanh` | `lib/biography.ts` | runtime formula | no narrow direct test found |
| biography feature flags | event-derived `B_*` flags | `[0,1]` aggregated | `lib/biography/features.ts`, `lib/life-goals/v4-types.ts` | runtime formula | no narrow direct test found |
| relational biography flags | target-specific `B_rel_*` | `[0,1]` aggregated | `lib/biography/features.ts` | runtime formula | no narrow direct test found |

Formula:

```text
timeDecay(age, lambda) = exp(-lambda * age)
bioLatent[f] = tanh(sum_events(EVENT_FEATURE_MAP[event.type][f] * intensity * timeDecay(age, lambda)))
B_feature = clamp01(sum matching event contributions)
B_rel_feature(target) = clamp01(sum matching event contributions for target)
effectiveVector[axis] = clamp01(vector_base[axis] + scale * bioLatent[channel])
```

Variables:

- `age` — event age relative to current time.
- `lambda` — decay parameter from biography aggregation params.
- `intensity` — event intensity.
- `scale` — vector bending strength.

Invariants:

- Biography effects are internal simulation modifiers.
- Event aggregation must not overwrite raw `vector_base`.
- Effective vector must remain bounded.

Minimal example:

```text
TRAUMA contribution = 0.8 * intensity(1.0) * exp(-0.1*2)
bioLatent.TRAUMA = tanh(0.655) ~= 0.575
```

Failure modes:

- Treating biography flags as factual diagnosis.
- Losing event provenance.
- Applying biography bending twice without trace.

### 17.5. Latents and quick states

Purpose: compress raw parameters into named latent and quick-state proxies.

| metric | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| `CH`, `SD`, `RP`, `SO`, `EW`, `CL` | latent schema averages | `[0,1]` | `data/latent-schema.ts`, `lib/metrics/latentsQuick.ts` | runtime formula | indirect metric tests |
| `social_support_proxy` | reciprocity/loyalty/secrecy support proxy | `[0,1]` | `lib/metrics/latentsQuick.ts` | runtime formula | indirect |
| `DR` | decision readiness | `[0,1]` | `lib/metrics/latentsQuick.ts` | runtime formula | indirect |
| `SI` | stability index | `[0,1]` | `lib/metrics/latentsQuick.ts` | runtime formula | indirect |
| `dark_susceptibility` | susceptibility proxy | `[0,1]` | `lib/metrics/latentsQuick.ts` | runtime formula | indirect |
| `phys_fitness`, `phys_fragility`, `hormone_tension`, `ToM_Q`, `T_topo`, `prMonstro` | quick state proxies | `[0,1]` | `lib/metrics/latentsQuick.ts`, `lib/formulas.ts` | runtime formula | indirect |

Formula:

```text
latent[key] = average(comp.weight > 0 ? value(comp.key) : 1 - value(comp.key))
social_support_proxy = (C_reciprocity_index + C_coalition_loyalty + (1 - A_Transparency_Secrecy)) / 3
DR = (B_cooldown_discipline + B_goal_coherence + E_Model_calibration) / 3
SI = (A_Tradition_Continuity + A_Legitimacy_Procedure + A_Safety_Care) / 3
dark_susceptibility = (C_reputation_sensitivity + state.dark_exposure/100 + body.acute.moral_injury/100) / 3
phys_fitness = (body.functional.strength_upper + body.functional.aerobic_capacity) / 2
phys_fragility = (injury_risk.knees + injury_risk.lower_back) / 2
hormone_tension = (body.regulation.HPA_axis + body.acute.stress/100) / 2
ToM_Q = (G_Metacog_accuracy + CH) / 2
T_topo = E_KB_topos
prMonstro = sigmoid(2.2*stress + 1.6*fatigue + 1.4*darkness + 1.2*moral_injury - 1.5*loyalty - 0.8*social_support_proxy - 0.3*SD - 0.3*EW - 3.0)
```

Invariants:

- Missing vector parameters default to `0.5`.
- Percent body/state values are normalized by `/100` before formulas.
- `prMonstro` is internal risk-like simulation probability, not a real-world prediction.

Minimal example:

```text
DR = (0.6 + 0.7 + 0.5) / 3 = 0.6
```

Failure modes:

- Mixing raw `0..100` values with normalized `0..1`.
- Treating `prMonstro` as calibrated probability.

### 17.6. Archetype metrics

Purpose: derive archetype coordinates and runtime archetype-like metrics.

| metric family | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| archetype coordinates `lambda`, `domain`, `func` | archetype coordinate system | enum/index | `data/archetypes.ts` | raw/config | no direct test found |
| `AGENCY`, `ACCEPT`, `ACTION`, `RADICAL`, `SCOPE`, `TRUTH`, `CARE`, `MANIP`, `FORMAL` | archetype metric vector | `[0,1]` | `lib/archetypes/metrics.ts` | runtime formula | no direct test found |
| `ArchetypeState` fields | mixture/state fields | mixed | `types.ts` | raw/runtime state | no direct test found |

Formula:

```text
pureMetric[key] = clip(MU_VECTORS[mu][key] + DOMAIN_BIASES[domain][key] + FUNC_BIASES[func][key] + LAMBDA_BIASES[lambda][key])

AGENCY = clip((G_Narrative_agency + A_Liberty_Autonomy - C_coalition_loyalty + 1) / 3)
ACCEPT = clip((A_Legitimacy_Procedure + A_Tradition_Continuity + B_cooldown_discipline - B_exploration_rate + 1) / 4)
ACTION = clip((B_decision_temperature + (1 - B_cooldown_discipline) + D_HPA_reactivity) / 3)
RADICAL = clip((B_exploration_rate + F_Value_update_rate + (1 - A_Tradition_Continuity) + (1 - A_Legitimacy_Procedure)) / 4)
SCOPE = clip((A_Power_Sovereignty + G_Narrative_agency + E_Model_calibration) / 3)
TRUTH = clip((A_Knowledge_Truth + A_Memory_Fidelity + E_Skill_chronicle_verify - deception_propensity/100 + 1) / 4)
CARE = clip((A_Safety_Care + (1 - C_dominance_empathy) + C_reciprocity_index) / 3)
MANIP = clip(((1 - A_Transparency_Secrecy) + deception_skill/100 + empathyDeficit) / 3)
FORMAL = clip((A_Legitimacy_Procedure + E_KB_civic + protocol_fidelity/100) / 3)
```

Minimal example:

```text
ACTION = (0.7 + (1 - 0.4) + 0.8) / 3 = 0.7
```

Failure modes:

- Confusing archetype metrics with personality diagnosis.
- Ignoring whether metrics came from pure coordinate mode or vector-base mode.

### 17.7. ToM and relation metrics

Purpose: model internal dyadic beliefs and relation-derived ToM atoms.

| metric family | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| static dyad outputs: `liking`, `trust`, `fear`, `respect`, `closeness`, `dominance` | primitive/static ToM | mostly `[0,1]`, some intermediates `[-1,1]` | `lib/tom/dyad-metrics.ts`, `docs/agents/04_TOM_DYAD_MODEL.md` | runtime formula | indirect ToM/lens tests |
| prior-seeded dyads: `trust`, `threat`, `intimacy`, `uncertainty`, `alignment`, `respect`, `dominance`, `support` | relation priors into `tom:dyad:*` atoms | `[0,1]` | `lib/tom/base/applyRelationPriors.ts` | runtime formula | pipeline/SimKit indirect |
| event-updated traits: `trust`, `bond`, `conflict`, `competence`, `align`, `dominance`, `reliability`, `obedience`, `uncertainty`, `vulnerability`, `respect`, `fear` | event-driven belief updates | `[0,1]` deltas then bounded state | `lib/tom/update.traits.ts` | runtime formula | no narrow direct test found |
| ToM dashboard: `delegability`, `toM_DepthEff`, `toM_Quality`, `toM_Unc` | dashboard/runtime ToM summary | `[0,1]` | `lib/tom-metrics.ts`, `lib/tom/core.ts` | runtime formula | indirect |

Formula:

```text
trust0 = clamp01(0.15 + 0.65*loyalty + 0.25*closeness - 0.85*hostility)
threat0 = clamp01(0.90*hostility + 0.15*(1 - closeness)*(1 - loyalty))
intimacy0 = clamp01(0.10 + 0.85*closeness + 0.25*loyalty - 0.80*hostility)
uncertainty0 = clamp01(0.15 + 0.35*(1 - closeness) + 0.25*(1 - loyalty))
alignment0 = clamp01(0.20 + 0.70*loyalty + 0.20*closeness - 0.70*hostility)
respect0 = clamp01(0.10 + 0.85*authority + 0.15*loyalty)
dominance0 = clamp01(0.10 + 0.90*authority + 0.10*hostility)
support0 = clamp01((0.55*trust0 + 0.45*intimacy0) * (1 - threat0))
effectiveDyad = clamp01(min(cap, max(base, floor)))
```

ToM dashboard formula family:

```text
Q,U,depth = computeToMCore(coreInput)
Anchors = sigmoid(2.6*(0.45*Self_concept_strength + 0.30*Identity_rigidity + 0.15*goal_coherence))
Mandate = clamp01(0.6*Authority + 0.25*chain_of_command + 0.15*Clearance)
Urgency = sigmoid(2.4*(0.5*ExhaustRisk_t + 0.5*TailRisk_t - 0.5))
TrustEnv = sigmoid(2.8*(0.35*InfoHyg_t + 0.25*evidenceQuality + 0.20*CL - 0.20*darkExposure - 0.5))
ToM_gain = sigmoid(3*(0.6*Q - 0.4*U - 0.5))
delegability = clamp01(BaseDel * (0.8 + 0.4*ToM_gain) * (1 - 0.5*Anchors) + 0.25*Mandate + 0.25*TrustEnv)
```

Invariants:

- Dyad atoms must carry provenance.
- Relation priors seed sparse ToM matrices but should not hide base relation source.
- Event-updated traits must remain bounded.

Minimal example:

```text
loyalty=0.6 closeness=0.5 hostility=0.1
trust0 = clamp01(0.15 + 0.39 + 0.125 - 0.085) = 0.58
```

Failure modes:

- Sparse dyad silently treated as zero without prior/fallback note.
- ToM dashboard metrics described as validated mind-reading quality.

### 17.8. V4.2 metrics

Purpose: compute short-horizon internal cognitive/body/state metrics from normalized parameters, latents and optional ToM v2 metrics.

| metric | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| `V_t`, `A_t`, `WMcap_t`, `DQ_t`, `Habit_t`, `Agency_t`, `TailRisk_t`, `Rmargin_t`, `PlanRobust_t`, `DriveU_t`, `ExhaustRisk_t`, `Recovery_t`, `ImpulseCtl_t`, `InfoHyg_t`, `RAP_t` | v4.2 internal state metrics | mostly `[0,1]` | `lib/character-metrics-v4.2.ts`, `lib/formulas/registry.ts` | runtime formula | indirect metric tests |

Formula:

```text
V_t = sigmoid(2.2*(0.22*AM + 0.16*SO + 0.12*exploration_rate + 0.12*Epi_recency + 0.10*sleep_resilience - 0.14*Stress - 0.10*Fatigue - 0.08*SleepDebt - 0.08*Pain - 0.08*MI_load - 0.5))
A_t = sigmoid(3.0*(0.62*Arousal + 0.20*HPA - 0.10*SleepDebt - 0.08*Fatigue - 0.5))
WMcap_t = sigmoid(3.0*(0.30*ComputeBudget + 0.22*sleep_resilience + 0.18*goal_coherence - 0.16*Stress - 0.07*Fatigue - 0.07*SleepDebt - 0.5)) * yerkes_arousal(A_t) * yerkes_stress(Stress)
DQ_t = sigmoid(3.0*(0.30*CH + 0.22*Metacog_accuracy + 0.18*SD + 0.10*KB_stem - 0.10*decision_temperature - 0.05*Stress - 0.05*SleepDebt - 0.5)) * (0.6 + 0.4*WMcap_t) * yerkes_stress(Stress)
Habit_t = sigmoid(2.8*(0.28*decision_temperature + 0.22*SleepDebt + 0.18*Stress + 0.16*Epi_schema_strength - 0.10*Cal - 0.10*cooldown_discipline - 0.5))
Agency_t = sigmoid(3.0*(0.34*Narrative_agency + 0.22*Self_concept_strength + 0.18*goal_coherence + 0.10*SD - 0.08*Drift - 0.06*Overshoot - 0.5)) * (1 - 0.45*Habit_t)
TailRisk_t = sigmoid(3.0*(0.30*RP + 0.20*A_t + 0.15*decision_temperature + 0.15*HPA + 0.10*MetaU - 0.20*SD - 0.10*OPSEC - 0.5))
Rmargin_t = clamp01(sigmoid(3.0*(h_mean(RV, SD) - 0.25*RP - 0.15*decision_temperature - 0.5)) + 0.5)
PlanRobust_t = sigmoid(3.0*(0.28*SD + 0.22*CH + 0.22*WMcap_t - 0.18*TailRisk_t - 0.10*DoseFrag - 0.5))
DriveU_t = 1 - exp(-2.2*(0.28*DefE + 0.18*DefH + 0.16*DefG + 0.16*DefO + 0.12*Pain + 0.10*SleepP))
ExhaustRisk_t = sigmoid(3.2*(0.30*SleepDebt + 0.25*Fatigue + 0.18*HPA - 0.18*stamina_reserve - 0.09*sleep_resilience - 0.5) + 1.2*synergy)
Recovery_t = sigmoid(3.0*(0.34*sleep_resilience + 0.24*stamina_reserve + 0.16*Extinction_rate - 0.18*SleepDebt - 0.10*Stress - 0.5)) * (1 - 0.5*ExhaustRisk_t)
ImpulseCtl_t = sigmoid(3.0*(0.30*SD + 0.26*cooldown_discipline + 0.10*KB_civic - 0.18*decision_temperature - 0.12*HPA - 0.5)) * (0.7 + 0.3*WMcap_t)
InfoHyg_t = sigmoid(3.0*(0.50*g_mean(CH, 0.6 + 0.4*OPSEC) + 0.18*ChronV + 0.12*MFid - 0.12*TS_dark_exposure - 0.10*ObsNoise - 0.08*ReportNoise - 0.5))
RAP_t = clamp01(Perf * RiskPenalty * PlanBoost) with optional ToM v2 modifiers
```

Minimal example:

```text
Arousal=0.5 HPA=0.5 SleepDebt=0 Fatigue=0
A_t = sigmoid(3*(0.31 + 0.10 - 0.5)) = sigmoid(-0.27) ~= 0.433
```

Failure modes:

- Using raw stress `0..100` instead of normalized `0..1`.
- Treating `RAP_t` as real performance measurement.
- Ignoring optional ToM v2 modifiers when present.

### 17.9. Derived character metrics

Purpose: compute derived scalar summaries over latents, quick states, body state, state deltas and goal ecology.

| metric family | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| `rho`, `lambda`, `iota`, `resilience`, `antifragility`, `regulatoryGain`, `chaosPressure`, `socialFriction`, `reputationFragility`, `darkTendency`, `goalTension`, `frustration`, `sensoriumReliability`, `sleepPressure`, `energyMargin`, `Vsigma_core`, `Vsigma_body`, `Vsigma_total`, `body_tail_risk`, `load_capacity` | derived character summary metrics | mostly `[0,1]`, `frustration` scaled by `*10` | `lib/derived-metrics.ts`, `lib/formulas/registry.ts` | runtime formula | indirect |

Formula:

```text
rho = sigmoid(0.35*RP + 0.15*A_Liberty_Autonomy + 0.10*A_Power_Sovereignty - 0.15*EW - 0.10*CH - 0.10*C_reputation_sensitivity + 0.05*B_decision_temperature)
lambda = sigmoid(0.30*D_HPA_reactivity + 0.15*stress_ema_delta + 0.10*arousal_ema_delta + 0.15*F_Forgetting_noise + 0.10*B_decision_temperature - 0.10*D_sleep_resilience - 0.10*G_Self_concept_strength)
iota = sigmoid(0.35*B_decision_temperature + 0.25*B_discount_rate - 0.20*B_cooldown_discipline - 0.10*G_Metacog_accuracy + 0.10*fatigue/100)
resilience = sigmoid(0.30*kappa_base + 0.20*DR + 0.15*SD + 0.10*EW + 0.10*CL - 0.10*h_base - 0.05*backlog_load/100 - 0.05*sleep_debt_h/72)
antifragility = sigmoid(0.20*(latents.U ?? 0.5) + 0.15*A_Aesthetic_Meaning + 0.15*G_Narrative_agency + 0.15*E_Model_calibration + 0.10*CH + 0.10*SD - 0.15*dark_susceptibility)
regulatoryGain = sigmoid(0.30*B_cooldown_discipline + 0.20*B_goal_coherence + 0.15*E_KB_civic + 0.15*G_Metacog_accuracy + 0.10*EW + 0.10*CH)
chaosPressure = sigmoid(0.40*max(0, SO - CH) + 0.20*observation.noise + 0.15*observation.report_noise - 0.10*E_Skill_chronicle_verify - 0.05*E_KB_stem)
socialFriction = sigmoid(0.25*dominance - 0.20*empathy - 0.15*C_reciprocity_index - 0.10*C_coalition_loyalty + 0.15*(1 - C_betrayal_cost) + 0.10*dark_susceptibility)
reputationFragility = sigmoid(0.30*C_reputation_sensitivity + 0.20*lagFactor - 0.20*E_Skill_opsec_hacking - 0.15*diplomacyAuth + 0.15*dark_exposure/100)
darkTendency = sigmoid(0.30*dark_exposure/100 + 0.20*moral_injury/100 + 0.20*HPA_axis - 0.15*EW - 0.10*SD - 0.05*E_KB_civic)
goalTension = goalEcology.tension ?? 0
frustration = (goalEcology.frustration ?? 0) * 10
sensoriumReliability = sigmoid(-0.35*observation.noise - 0.15*observation.report_noise + 0.20*E_KB_stem + 0.10*E_Epi_volume + 0.10*E_Epi_recency + 0.10*vision_acuity - 0.10*hearing_db/80)
sleepPressure = sigmoid(sleep_debt_h/72 + sleep_homeostat_S - D_sleep_resilience)
energyMargin = sigmoid(energy_store_kJ/2000 + hydration + O2_margin - backlog_load/100)
Vsigma_body = clamp01(0.3*(1 - phys_fitness) + 0.5*phys_fragility + 0.2*hormone_tension)
Vsigma_core = sigmoid(RP)
Vsigma_total = clamp01(Vsigma_core * (1 + 0.5*Vsigma_body))
body_tail_risk = clamp01(0.5*phys_fragility + 0.3*(1 - phys_fitness) + 0.2*hormone_tension)
load_capacity = clamp01(phys_fitness * (1 - phys_fragility))
```

Note: `lib/derived-metrics.ts` currently uses `h_base = sigmoid(RP)` for `Vsigma_core`; `lib/formulas/registry.ts` describes `Vsigma_core` as `latents.RP (proxy)`. Runtime implementation is authoritative.

Failure modes:

- Ignoring the runtime/registry drift for `Vsigma_core`.
- Treating placeholder `latents.U ?? 0.5` as a fully specified latent.

### 17.10. Motivation profile

Purpose: expose a small operational summary for agent motivation.

| metric | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| `arousal`, `stress`, `fatigue`, `exploration_rate`, `social_safety` | compact motivation profile | mostly `[0,1]` | `lib/agents/motivationProfile.ts` | runtime formula/raw projection | indirect |

Formula:

```text
arousal = agent.body.regulation.arousal or derived/default source
stress = agent.body.acute.stress normalized or profile source
fatigue = agent.body.acute.fatigue normalized or profile source
exploration_rate = vector_base.B_exploration_rate or default
social_safety = derivedMetrics.socialFriction ? 1 - socialFriction : 0.5
```

Failure modes:

- Reporting profile values without explaining whether they came from existing metrics or recalculated fallback.

### 17.11. Drivers, goals, utilities and actions

Purpose: describe runtime metrics after context/lens.

| metric family | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| `drv:*` | need/driver pressure | `[0,1]` | `lib/drivers/deriveDrivers.ts`, `lib/config/formulaConfig.ts` | runtime formula | `tests/pipeline/drivers_physics.test.ts` |
| `ctx:prio:*` | attention priority weights | `[0,1]` | `lib/goal-lab/pipeline/runPipelineV1.ts` | runtime formula/artifact | pipeline tests |
| `goal:*` | goal/domain pressure and state | `[0,1]` plus atoms | `lib/goals/goalAtoms.ts`, `lib/goals/selectActive.ts`, `lib/goals/goalState.ts` | runtime formula | `tests/goals/*`, `tests/pipeline/s6_s7_bridge.test.ts` |
| `util:*` | goal-to-action bridge | internal utility mass | `lib/goals/*`, `lib/decision/*` | runtime formula | `tests/decision/goal_isolation.test.ts` |
| `action:*` and `decisionSnapshot` | ranked/selected action | Q/internal score | `lib/decision/*`, `lib/goal-lab/pipeline/runPipelineV1.ts` | runtime formula | `tests/decision/*` |

Formula:

```text
drivers = raw linear -> curve shaping -> cross-inhibition -> temporal accumulation -> surprise boost -> clamp01
goal score = weighted ctx:final + drv + modifiers -> hysteresis/state update
util = explainable projection from goal layer to action layer
Q_raw(a) = sum_g E_g * Delta_g(a) - cost(a)
Q(a) = Q_raw(a) - k * abs(Q_raw(a)) * (1 - confidence)
```

Invariants:

- `action:*` must not read `goal:*` directly; only `util:*`.
- Driver trace parts include `rawLinear`, `curveSpec`, `shaped`, `inhibition`, `postInhibition`, `accumulation`, `surpriseBoost`.
- Numeric coefficients belong in `lib/config/formulaConfig.ts`.

Minimal example:

```text
raw safetyNeed = 0.6
postInhibition = 0.5
accumulation = 0.55
surpriseBoost = 0.10
drv:safetyNeed = clamp01(0.65)
```

Failure modes:

- Hidden `goal -> action` dependency.
- Driver formula constants outside config.
- Missing trace parts.

### 17.12. SimKit, dilemma and conflict metrics

Purpose: map simulation/comparison/conflict runtime metrics without making them the source of truth for GoalLab stages.

| metric family | meaning | range/unit | source | formula/status | trace/test |
| --- | --- | --- | --- | --- | --- |
| SimKit tension/stress/action counts | scenario comparison summaries | internal scalars/counts | `lib/simkit/compare/batchRunner.ts`, `lib/simkit/core/simulator.ts` | runtime formula/artifact | `tests/simkit/*` |
| conflict pairs/resolutions | action conflict resolution | enum + actions/events | `lib/simkit/resolution/conflictDetector.ts` | runtime formula | `tests/simkit/conflict_detector.test.ts` |
| dilemma payoffs/analysis | game payoff, cooperation, Nash/Pareto | internal payoff units | `lib/dilemma/*` | runtime formula | `tests/dilemma/*` |

Formula:

```text
firstDivergenceTick = first t where abs(tensionA[t] - tensionB[t]) > 0.15, else null
uniqueActionsA = sort(actionKindsA - actionKindsB)
combatStrength(agent) = clamp01(health)*0.4 + clamp01(energy)*0.3 + (1 - clamp01(stress))*0.3
payoff_t(player0, player1) = payoffMatrix[action0][action1]
cumulativePayoff_i(t+1) = cumulativePayoff_i(t) + payoff_i(action0, action1)
```

Failure modes:

- Treating comparison divergence as causal proof.
- Treating dilemma payoff as real-world moral/psychological outcome.
- Resolving conflicts with unseeded randomness.

### 17.13. Formula registry status

`lib/formulas/registry.ts` is useful for display and formula lookup, but live runtime is more authoritative. Known policy:

```text
if FORMULA_REGISTRY[key] != runtime implementation:
  document runtime implementation
  note registry drift
```

Do not document a metric solely from its registry string if a runtime implementation exists.

## 18. Что не включено в этот реестр

Этот документ перечисляет именованные сущности и metric spaces, но намеренно не разворачивает:

- все отдельные экземпляры персонажей из `data/entities/*`
- все отдельные локации из `data/locations.ts`
- все goal definitions и action catalogs
- все atom ids, которые materialize динамически от конкретных `selfId` / `otherId`

Для них нужны отдельные реестры:

- instance registry
- action/goal registry
- atom/quark registry

## Assumptions and limitations

Kanonar — исследовательская и прототипная simulation system.

Переменные вроде trust, fear, stress, shame, dominance, affiliation, loyalty,
identity rigidity, narrative agency и похожие величины являются внутренними
скалярами симуляции. Это не клинические, не психометрически валидированные и не
экспериментально калиброванные измерения реальных людей.

Документ полезен как карта того, какие сущности и какие metric spaces реально
есть в кодовой базе. Его нельзя трактовать как доказательство того, что все эти
метрики одинаково полно используются, одинаково хорошо протестированы или
являются внешне валидированной моделью поведения.
