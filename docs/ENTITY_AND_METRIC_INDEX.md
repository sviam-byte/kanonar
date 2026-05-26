# Kanonar: Реестр сущностей и метрик

Этот документ фиксирует, какие сущности и какие именованные пространства метрик вообще существуют в текущем Kanonar runtime.

Документ не заменяет формальные math-spec файлы. Его задача другая: дать полный инвентаризационный список сущностей, параметров, derived-метрик и атомных пространств, чтобы дальше уже можно было документировать каждый блок подробно.

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

## 17. Что не включено в этот реестр

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
