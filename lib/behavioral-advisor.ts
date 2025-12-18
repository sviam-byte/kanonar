import { V42Metrics, ToMDashboardMetrics, BehavioralAdvice } from '../types';

export function calculateBehavioralAdvice(
    v42: V42Metrics,
    tom: ToMDashboardMetrics
): BehavioralAdvice {
    // --- Rule-based decision logic ---

    // 1. Critical Recovery State
    if (v42.ExhaustRisk_t > 0.8 || v42.DriveU_t > 0.85) {
        return {
            recommendation: "Критическое восстановление",
            description: "Критически высокий риск истощения или запредельный уровень гомеостатических потребностей. Необходимо немедленно снизить нагрузку и восстановить базовые ресурсы (сон, питание).",
            contributingMetrics: [
                { name: "ExhaustRisk", value: v42.ExhaustRisk_t },
                { name: "DriveU", value: v42.DriveU_t },
            ]
        };
    }

    // 2. Autopilot / Habitual State
    if (v42.Habit_t > 0.75 && v42.Agency_t < 0.4) {
        return {
            recommendation: "Действие по привычке",
            description: "Высокая доля привычного контроля и низкая агентность. Персонаж действует на 'автопилоте', полагаясь на заученные схемы, что рискованно в нестандартных ситуациях.",
            contributingMetrics: [
                { name: "Habit", value: v42.Habit_t },
                { name: "Agency", value: v42.Agency_t },
            ]
        };
    }
    
    // 3. Delegation State
    if (tom.delegability > 0.6 && (v42.WMcap_t < 0.4 || v42.ExhaustRisk_t > 0.6)) {
         return {
            recommendation: "Делегирование задач",
            description: "Высокая склонность к делегированию на фоне сниженной когнитивной емкости или риска истощения. Эффективно передать часть задач другим агентам, чтобы избежать ошибок.",
            contributingMetrics: [
                { name: "Delegability", value: tom.delegability },
                { name: "WMcap", value: v42.WMcap_t },
                { name: "ExhaustRisk", value: v42.ExhaustRisk_t },
            ]
        };
    }

    // 4. Probing for Information State
    if (tom.toM_Unc > 0.6 && v42.Agency_t > 0.5 && v42.TailRisk_t < 0.6) {
        return {
            recommendation: "Зондирование информации",
            description: "Высокая неопределенность в отношении других агентов при достаточной собственной агентности. Рекомендуется предпринять низкорисковые действия для сбора информации.",
            contributingMetrics: [
                { name: "ToM Unc", value: tom.toM_Unc },
                { name: "Agency", value: v42.Agency_t },
                { name: "TailRisk", value: v42.TailRisk_t },
            ]
        };
    }

    // 5. Decisive Action State
    if (v42.Agency_t > 0.7 && v42.PlanRobust_t > 0.7 && tom.toM_Unc < 0.4 && v42.TailRisk_t < 0.4) {
         return {
            recommendation: "Решительные действия",
            description: "Высокая агентность, робастность плана и низкая неопределенность создают окно возможностей. Оптимальный момент для реализации ключевых целей.",
            contributingMetrics: [
                { name: "Agency", value: v42.Agency_t },
                { name: "PlanRobust", value: v42.PlanRobust_t },
                { name: "ToM Unc", value: tom.toM_Unc },
            ]
        };
    }
    
    // Default/Neutral State
    return {
        recommendation: "Сбалансированное состояние",
        description: "Персонаж находится в относительно стабильном состоянии без явных поведенческих перекосов. Возможны действия в соответствии с текущими целями.",
        contributingMetrics: [
            { name: "Agency", value: v42.Agency_t },
            { name: "Delegability", value: tom.delegability },
        ]
    };
}