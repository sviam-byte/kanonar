// data/latent-schema.ts

interface LatentComponent {
    key: string;
    weight: number;
}

interface LatentSchema {
    name: string;
    description: string;
    components: LatentComponent[];
}

// Weights are simplified to 1 or -1 based on the spec "растят" (increase) or "подавляется" (suppressed)
export const latentSchema: Record<string, LatentSchema> = {
    CH: {
        name: 'Causal Hygiene (CH)',
        description: '«Гигиена причинности». Аккуратность с DAG/валидациями, анти-апофения.',
        components: [
            { key: 'A_Causality_Sanctity', weight: 1 },
            { key: 'A_Knowledge_Truth', weight: 1 },
            { key: 'A_Justice_Fairness', weight: 1 },
            { key: 'E_Model_calibration', weight: 1 },
            { key: 'E_KB_civic', weight: 1 },
            { key: 'E_Skill_causal_surgery', weight: 1 },
        ]
    },
    SD: {
        name: 'Stability Discipline (SD)',
        description: '«Дисциплина стабильности». Процедуры, кулдауны, низкий операционный шум.',
        components: [
            { key: 'A_Legitimacy_Procedure', weight: 1 },
            { key: 'A_Tradition_Continuity', weight: 1 },
            { key: 'B_cooldown_discipline', weight: 1 },
            { key: 'E_KB_civic', weight: 1 },
            { key: 'E_Skill_chronicle_verify', weight: 1 },
            { key: 'G_Self_consistency_drive', weight: 1 },
        ]
    },
    RP: {
        name: 'Risk Posture (RP)',
        description: '«Поза риска». Склонность к хвостовым исходам.',
        components: [
            { key: 'A_Liberty_Autonomy', weight: 1 },
            { key: 'A_Power_Sovereignty', weight: 1 },
            { key: 'B_discount_rate', weight: 1 },
            { key: 'G_Metacog_accuracy', weight: -1 }, // Suppressed by
        ]
    },
    SO: {
        name: 'Signal Openness (SO)',
        description: '«Открытость сигналу». Берёт новизну без уноса.',
        components: [
            { key: 'A_Knowledge_Truth', weight: 1 },
            { key: 'B_exploration_rate', weight: 1 },
            { key: 'B_tolerance_ambiguity', weight: 1 },
            { key: 'E_KB_topos', weight: 1 },
            { key: 'E_Epi_volume', weight: 1 },
        ]
    },
    EW: {
        name: 'Ethical Weight (EW)',
        description: '«Этическая масса». Внутренняя цена воздействий.',
        components: [
            { key: 'A_Safety_Care', weight: 1 },
            { key: 'A_Justice_Fairness', weight: 1 },
            { key: 'A_Aesthetic_Meaning', weight: 1 },
            { key: 'C_betrayal_cost', weight: 1 },
            { key: 'G_Self_concept_strength', weight: 1 }, // Enhanced by
        ]
    },
    CL: {
        name: 'Network Multiplier (CL)',
        description: 'Сетевой множитель (прокси). Отражает социальный капитал и доверие.',
        components: [
            { key: 'A_Legitimacy_Procedure', weight: 1 },
            { key: 'A_Memory_Fidelity', weight: 1 },
            { key: 'A_Power_Sovereignty', weight: 1 },
            { key: 'C_reciprocity_index', weight: 1 },
            { key: 'C_dominance_empathy', weight: 0.5 }, // Assuming empathy part of the axis
            { key: 'C_coalition_loyalty', weight: 1 },
            { key: 'E_Skill_diplomacy_negotiation', weight: 1 },
            { key: 'E_KB_civic', weight: 1 },
            { key: 'G_Narrative_agency', weight: 1 },
        ]
    }
};