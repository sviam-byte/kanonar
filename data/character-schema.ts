
// data/character-schema.ts

interface ParamSchema {
  name: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  path?: string; // Optional custom path for the parameter
  importance?: 'core' | 'secondary';
}

export const characterSchema: Record<string, Record<string, ParamSchema>> = {
  A: {
    A_Causality_Sanctity: { name: 'Causality Sanctity (CS)', description: '[ядро] «Святость причинности» (монстро-вето, отношение к ломанию причинности).', min: 0, max: 1, step: 0.01, importance: 'core' },
    A_Memory_Fidelity: { name: 'Memory Fidelity (MF)', description: '[вторичная] Верность свидетельствам/памяти.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    A_Reversibility: { name: 'Reversibility (RV)', description: '[вторичная] Любовь к обратимым ходам.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    A_Legitimacy_Procedure: { name: 'Legitimacy/Procedure (LG)', description: '[ядро] Процедурная легитимность, «делать правильно по правилам».', min: 0, max: 1, step: 0.01, importance: 'core' },
    A_Safety_Care: { name: 'Safety/Care (SC)', description: '[ядро] Забота/безопасность людей и инфраструктуры.', min: 0, max: 1, step: 0.01, importance: 'core' },
    A_Liberty_Autonomy: { name: 'Liberty/Autonomy (LA)', description: '[вторичная] Свобода/автономия, ширина коридора решений.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    A_Justice_Fairness: { name: 'Justice/Fairness (JF)', description: '[вторичная] Справедливость/чувство честности.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    A_Power_Sovereignty: { name: 'Power/Sovereignty (PS)', description: '[ядро] Воля к власти/суверенитету и контролю.', min: 0, max: 1, step: 0.01, importance: 'core' },
    A_Knowledge_Truth: { name: 'Knowledge/Truth (KT)', description: '[ядро] Ось «истина/знание», тяга проверять и понимать мир.', min: 0, max: 1, step: 0.01, importance: 'core' },
    A_Tradition_Continuity: { name: 'Tradition/Continuity (TC)', description: '[вторичная] Традиция/преемственность.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    A_Transparency_Secrecy: { name: 'Transparency/Secrecy (TS)', description: '[вторичная] Открытость vs секретность.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    A_Aesthetic_Meaning: { name: 'Aesthetic/Meaning (AM)', description: '[вторичная] Эстетика/смысл, топо-сигналы.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
  },
  B: {
    B_discount_rate: { name: 'discount_rate', description: '[вторичная] Обесценивание будущего (дискаунтирование во времени).', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    B_exploration_rate: { name: 'exploration_rate', description: '[ядро] Склонность к исследованию, пробованию нового.', min: 0, max: 1, step: 0.01, importance: 'core' },
    B_tolerance_ambiguity: { name: 'tolerance_ambiguity', description: '[вторичная] Терпимость к неопределённости (фактически backlog под эпизоды тумана войны).', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    B_goal_coherence: { name: 'goal_coherence', description: '[ядро] Согласованность целей (насколько портфель целей не рвёт человека).', min: 0, max: 1, step: 0.01, importance: 'core' },
    B_cooldown_discipline: { name: 'cooldown_discipline', description: '[ядро] Дисциплина пауз/кулдаунов, умение останавливаться.', min: 0, max: 1, step: 0.01, importance: 'core' },
    B_decision_temperature: { name: 'decision_temperature', description: '[ядро] «Температура» решений: шум/импульсивность vs холодный расчёт.', min: 0, max: 1, step: 0.01, importance: 'core' },
  },
  C: {
    C_reciprocity_index: { name: 'reciprocity_index', description: '[ядро] Индекс взаимности («я тебе — ты мне»).', min: 0, max: 1, step: 0.01, importance: 'core' },
    C_betrayal_cost: { name: 'betrayal_cost', description: '[вторичная] Внутренняя цена предательства (можно использовать как тонкую поправку к коалиционным решениям).', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    C_reputation_sensitivity: { name: 'reputation_sensitivity', description: '[ядро] Чувствительность к репутации и публичному мнению.', min: 0, max: 1, step: 0.01, importance: 'core' },
    C_dominance_empathy: { name: 'dominance↔empathy', description: '[ядро] Баланс доминантности и эмпатии в стиле взаимодействия.', min: 0, max: 1, step: 0.01, importance: 'core' },
    C_coalition_loyalty: { name: 'coalition_loyalty', description: '[ядро] Лояльность коалиции/фракции.', min: 0, max: 1, step: 0.01, importance: 'core' },
  },
  D: {
    D_fine_motor: { name: 'fine_motor', description: '[вторичная] Тонкая моторика (важна для специальных действий, но не базовая для всех).', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    D_stamina_reserve: { name: 'stamina_reserve', description: '[ядро] Запас выносливости, сколько нагрузок выдерживает до развала.', min: 0, max: 1, step: 0.01, importance: 'core' },
    D_pain_tolerance: { name: 'pain_tolerance', description: '[вторичная] Толерантность к боли (осмысленно держать под будущие модули пыток/ранений).', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    D_HPA_reactivity: { name: 'HPA_reactivity', description: '[ядро] Реактивность HPA-оси (насколько резко и сильно реагирует на стресс).', min: 0, max: 1, step: 0.01, importance: 'core' },
    D_sleep_resilience: { name: 'sleep_resilience', description: '[ядро] Устойчивость сна/восстановления (как быстро «поднимается» после нагрузок).', min: 0, max: 1, step: 0.01, importance: 'core' },
  },
  E: {
    E_KB_stem: { name: 'KB_stem', description: '[ядро] STEM-знания (физика/инженерия/медицина).', min: 0, max: 1, step: 0.01, importance: 'core' },
    E_KB_civic: { name: 'KB_civic', description: '[ядро] Гражданско-правовая грамотность (право, процедуры).', min: 0, max: 1, step: 0.01, importance: 'core' },
    E_KB_topos: { name: 'KB_topos', description: '[вторичная] Мифо-топологические знания (можно использовать в спец-сюжетах/Аншархах).', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    E_Model_calibration: { name: 'Model_calibration', description: '[ядро] Калиброванность моделей (насколько внутренние модели мира совпадают с реальностью).', min: 0, max: 1, step: 0.01, importance: 'core' },
    E_Skill_repair_topology: { name: 'Skill_repair_topology', description: '[вторичная] Навык ремонта топологии.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    E_Skill_causal_surgery: { name: 'Skill_causal_surgery', description: '[вторичная] Навык «каузальной хирургии» (операции на графах причинности).', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    E_Skill_chronicle_verify: { name: 'Skill_chronicle_verify', description: '[вторичная] Навык проверки хроник/архивов.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    E_Skill_diplomacy_negotiation: { name: 'Skill_diplomacy_negotiation', description: '[вторичная] Навык дипломатии/переговоров.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    E_Skill_ops_fieldcraft: { name: 'Skill_ops_fieldcraft', description: '[вторичная] Полевые оперативные навыки.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    E_Skill_opsec_hacking: { name: 'Skill_opsec_hacking', description: '[вторичная] ОПСЕК/взлом.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    E_Epi_volume: { name: 'Epi_volume', description: '[вторичная] Объём эпизодической памяти.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    E_Epi_recency: { name: 'Epi_recency', description: '[вторичная] «Свежесть» эпизодов.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    E_Epi_schema_strength: { name: 'Epi_schema_strength', description: '[ядро] Сила эпизодических схем (насколько опыт структурирован в устойчивые паттерны).', min: 0, max: 1, step: 0.01, importance: 'core' },
  },
  F: {
    F_Plasticity: { name: 'Plasticity', description: '[ядро] Общая пластичность/обучаемость.', min: 0, max: 1, step: 0.01, importance: 'core' },
    F_Value_update_rate: { name: 'Value_update_rate', description: '[ядро] Скорость обновления ценностей/оценок.', min: 0, max: 1, step: 0.01, importance: 'core' },
    F_Extinction_rate: { name: 'Extinction_rate', description: '[вторичная] Скорость угасания старых реакций/знаний.', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    F_Trauma_plasticity: { name: 'Trauma_plasticity', description: '[ядро] Пластичность под травмой (насколько травма переписывает профиль, архетип, ценности — концептуально ядро, даже если в коде пока не подключена).', min: 0, max: 1, step: 0.01, importance: 'core' },
    F_Skill_learning_rate: { name: 'Skill_learning_rate', description: '[вторичная] Скорость обучения конкретным навыкам (backlog под модуль явного роста skill’ов).', min: 0, max: 1, step: 0.01, importance: 'secondary' },
    F_Forgetting_noise: { name: 'Forgetting_noise', description: '[вторичная] Шум забывания (дрожь памяти).', min: 0, max: 1, step: 0.01, importance: 'secondary' },
  },
  G: {
    G_Self_concept_strength: { name: 'Self_concept_strength', description: '[ядро] Сила self-концепта, «насколько я вообще знаю, кто я».', min: 0, max: 1, step: 0.01, importance: 'core' },
    G_Identity_rigidity: { name: 'Identity_rigidity', description: '[ядро] Жёсткость идентичности (гибкость vs хрупкость и фанатизм).', min: 0, max: 1, step: 0.01, importance: 'core' },
    G_Self_consistency_drive: { name: 'Self_consistency_drive', description: '[ядро] Тяга к нарративной согласованности себя.', min: 0, max: 1, step: 0.01, importance: 'core' },
    G_Metacog_accuracy: { name: 'Metacog_accuracy', description: '[ядро] Точность метапознания, адекватность самооценки.', min: 0, max: 1, step: 0.01, importance: 'core' },
    G_Narrative_agency: { name: 'Narrative_agency', description: '[ядро] Способность строить долгие планы. ↑Pv, ↑CL.', min: 0, max: 1, step: 0.01, importance: 'core' },
  },
  
  // Body & Capabilities
  body_capacity: {
    fine_motor: { name: 'Мелкая моторика', description: 'Точность и контроль мелких движений (0-1).', min: 0, max: 1, step: 0.01, path: 'body.capacity.fine_motor' },
    VO2max: { name: 'VO2max', description: 'Максимальное потребление кислорода.', min: 10, max: 90, step: 1, unit: 'мл·кг⁻¹·мин⁻¹', path: 'body.capacity.VO2max' },
  },
  body_reserves: {
    energy_store_kJ: { name: 'Запас энергии', description: 'Энергетический резерв (кДж).', min: 0, max: 3000, step: 10, path: 'body.reserves.energy_store_kJ' },
    hydration: { name: 'Гидратация', description: 'Уровень воды в организме (0-1).', min: 0, max: 1, step: 0.01, path: 'body.reserves.hydration' },
    glycemia_mmol: { name: 'Гликемия', description: 'Уровень глюкозы в крови.', min: 2.5, max: 12, step: 0.1, unit: 'ммоль/л', path: 'body.reserves.glycemia_mmol' },
    O2_margin: { name: 'Кислородный запас', description: 'Резерв кислорода (0-1).', min: 0, max: 1, step: 0.01, path: 'body.reserves.O2_margin' },
    sleep_homeostat_S: { name: 'Гомеостат сна (S)', description: 'Давление сна (0-1).', min: 0, max: 1, step: 0.01, path: 'body.reserves.sleep_homeostat_S' },
    circadian_phase_h: { name: 'Циркадная фаза', description: 'Фаза суточного цикла (0-24).', min: 0, max: 24, step: 0.5, unit: 'ч', path: 'body.reserves.circadian_phase_h' },
    sleep_debt_h: { name: 'Долг сна', description: 'Накопленный недосып (ч).', min: 0, max: 72, step: 0.5, unit: 'ч', path: 'body.reserves.sleep_debt_h' },
    immunity_tone: { name: 'Иммунный тонус', description: 'Сила иммунитета (0-1).', min: 0, max: 1, step: 0.01, path: 'body.reserves.immunity_tone' },
  },
  body_acute: {
    hp: { name: 'Здоровье (HP)', description: 'Общие очки здоровья.', min: 0, max: 100, step: 1, path: 'body.acute.hp' },
    injuries_severity: { name: 'Тяжесть травм', description: 'Степень тяжести текущих травм (0-100).', min: 0, max: 100, step: 1, path: 'body.acute.injuries_severity' },
    pain_now: { name: 'Боль (текущая)', description: 'Уровень боли (0-100).', min: 0, max: 100, step: 1, path: 'body.acute.pain_now' },
    temperature_c: { name: 'Температура', description: 'Температура тела (°C).', min: 34, max: 42, step: 0.1, path: 'body.acute.temperature_c' },
    tremor: { name: 'Тремор', description: 'Дрожь/тремор (0-1).', min: 0, max: 1, step: 0.01, path: 'body.acute.tremor' },
    reaction_time_ms: { name: 'Время реакции', description: 'Время реакции (мс).', min: 100, max: 1000, step: 10, path: 'body.acute.reaction_time_ms' },
    fatigue: { name: 'Усталость', description: 'Уровень усталости (0-100).', min: 0, max: 100, step: 1, path: 'body.acute.fatigue' },
    stress: { name: 'Стресс', description: 'Уровень стресса (0-100).', min: 0, max: 100, step: 1, path: 'body.acute.stress' },
    moral_injury: { name: 'Моральная травма', description: 'Уровень моральной травмы (0-100).', min: 0, max: 100, step: 1, path: 'body.acute.moral_injury' },
  },
  body_regulation: {
    HPA_axis: { name: 'Активность ГГН-оси', description: 'Уровень активности стрессовой оси (0-1).', min: 0, max: 1, step: 0.01, path: 'body.regulation.HPA_axis' },
    arousal: { name: 'Возбуждение', description: 'Общий уровень возбуждения (0-1).', min: 0, max: 1, step: 0.01, path: 'body.regulation.arousal' },
  },

  // Legacy & System
  legacy_state: {
    loyalty: { name: 'Лояльность', description: 'Преданность фракции или лидеру (0-100).', min: 0, max: 100, step: 1, path: 'state.loyalty' },
    dark_exposure: { name: 'Темное воздействие', description: 'Накопленное влияние "тьмы" (0-100).', min: 0, max: 100, step: 1, path: 'state.dark_exposure' },
    backlog_load: { name: 'Загрузка задачами', description: 'Когнитивная нагрузка от очереди задач (0-100).', min: 0, max: 100, step: 1, path: 'state.backlog_load' },
  },
  legacy_competencies: {
    topo_affinity: { name: 'Топо-чуткость', description: 'Чувствительность к топологическим аномалиям (0-100).', min: 0, max: 100, step: 1, path: 'competencies.topo_affinity' },
    causal_sensitivity: { name: 'Каузальная чувств.', description: 'Способность воспринимать причинно-следственные связи (0-100).', min: 0, max: 100, step: 1, path: 'competencies.causal_sensitivity' },
  },
  legacy_memory: {
    retrieval_noise: { name: 'Шум памяти', description: 'Уровень шума при извлечении воспоминаний (0-1).', min: 0, max: 1, step: 0.01, path: 'memory.retrieval_noise' },
  },
  resources: {
    attention_E: { name: 'Внимание (E)', description: 'Текущий уровень внимания.', min: 0, max: 500, step: 1, path: 'memory.attention.E' },
    attention_Astar: { name: 'Опт. внимание (A*)', description: 'Целевой (оптимальный) уровень внимания.', min: 0, max: 500, step: 1, path: 'memory.attention.A_star' },
    time_budget_h: { name: 'Бюджет времени', description: 'Доступное время (часов/период).', min: 0, max: 168, step: 1, path: 'resources.time_budget_h' },
    risk_budget_cvar: { name: 'Бюджет риска (CVaR)', description: 'Допустимый уровень хвостового риска (0-1).', min: 0, max: 1, step: 0.01, path: 'resources.risk_budget_cvar' },
    infra_budget: { name: 'Инфра-бюджет', description: 'Доступ к инфраструктурным ресурсам (0-1).', min: 0, max: 1, step: 0.01, path: 'resources.infra_budget' },
    dark_quota: { name: 'Квота тёмного слоя', description: 'Лимит на взаимодействие с "тьмой" (0-1).', min: 0, max: 1, step: 0.01, path: 'resources.dark_quota' },
  },
  identity: {
    clearance_level: { name: 'Уровень допуска', description: 'Уровень доступа к информации и зонам (0-5).', min: 0, max: 5, step: 1, path: 'identity.clearance_level' },
  },
  authority: {
    'signature_weight.causal': { name: 'Вес подписи (каузал)', description: 'Вес в каузальном домене.', min: 0, max: 1, step: 0.01, path: 'authority.signature_weight.causal' },
    'signature_weight.topo': { name: 'Вес подписи (топо)', description: 'Вес в топологическом домене.', min: 0, max: 1, step: 0.01, path: 'authority.signature_weight.topo' },
    co_sign_threshold: { name: 'Порог ко-подписи', description: 'Сколько подписей нужно для валидации действий.', min: 0, max: 5, step: 1, path: 'authority.co_sign_threshold' },
  },
  evidence: {
    witness_pull: { name: 'Сила свидетельства', description: 'Способность убеждать как свидетель (0-1).', min: 0, max: 1, step: 0.01, path: 'evidence.witness_pull' },
    evidence_quality: { name: 'Качество доказательств', description: 'Качество собираемых доказательств (0-1).', min: 0, max: 1, step: 0.01, path: 'evidence.evidence_quality' },
    visibility_lag_days: { name: 'Задержка видимости', description: 'Задержка появления в инфополе (дни).', min: 0, max: 30, step: 1, path: 'memory.visibility_lag_days' },
    visibility_zone: { name: 'Зона видимости', description: 'Насколько персонаж на виду (0-100).', min: 0, max: 100, step: 1, path: 'memory.visibility_zone' },
    memory_write_rights: { name: 'Права на запись', description: 'Уровень прав на запись в хронику (0-5).', min: 0, max: 5, step: 1, path: 'memory.memory_write_rights' },
  },
  observation: {
    noise: { name: 'Шум наблюдения', description: 'Уровень шума при восприятии (0-1).', min: 0, max: 1, step: 0.01, path: 'observation.noise' },
    report_noise: { name: 'Шум отчётов', description: 'Искажения при передаче информации (0-1).', min: 0, max: 1, step: 0.01, path: 'observation.report_noise' },
  },
  compute: {
    budget: { name: 'Выч. бюджет', description: 'Вычислительный ресурс (0-100).', min: 0, max: 100, step: 1, path: 'compute.compute_budget' },
    decision_deadline_s: { name: 'Дедлайн решения', description: 'Время на принятие решения (сек).', min: 0.1, max: 60, step: 0.1, path: 'compute.decision_deadline_s' },
    tom_depth: { name: 'Глубина ToM', description: 'Глубина рекурсии моделирования разума (0-4).', min: 0, max: 4, step: 1, path: 'compute.tom_depth' },
  },
};
