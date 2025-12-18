
import { GoalId } from "../../types";

export type GoalDomain =
  | "survival"
  | "protection"
  | "hierarchy"
  | "social"
  | "knowledge"
  | "resource"
  | "comfort";

export interface GoalCatalogEntry {
  id: GoalId;
  label: string;
  domain: GoalDomain;
  description: string;
  defaultBaseWeight?: number; // базовый приоритет, если нигде не задан
}

export const GOAL_CATALOG: GoalCatalogEntry[] = [
  // --- Survival / базовая безопасность ---
  {
    id: "survive",
    label: "Выжить",
    domain: "survival",
    description: "Сохранить собственную жизнь и физическую целостность.",
    defaultBaseWeight: 1.0,
  },
  {
    id: "avoid_injury",
    label: "Избежать ранений",
    domain: "survival",
    description: "Свести к минимуму риск получения повреждений.",
    defaultBaseWeight: 0.7,
  },
  {
    id: "evacuate_to_safe_zone",
    label: "Эвакуироваться в безопасную зону",
    domain: "survival",
    description: "Переместиться в локацию, считающуюся безопасной.",
    defaultBaseWeight: 0.8,
  },

  // --- Protection / защита других и группы ---
  {
    id: "protect_self",
    label: "Защитить себя",
    domain: "protection",
    description: "Сделать действия, повышающие защищённость собственного тела и позиции.",
    defaultBaseWeight: 0.9,
  },
  {
    id: "protect_group",
    label: "Защитить группу",
    domain: "protection",
    description: "Сохранить боеспособность / целостность собственной группы.",
    defaultBaseWeight: 0.8,
  },
  {
    id: "protect_leader",
    label: "Защитить лидера",
    domain: "protection",
    description: "Предотвратить вред лидеру / королю.",
    defaultBaseWeight: 0.9,
  },
  {
    id: "protect_ally",
    label: "Защитить союзника",
    domain: "protection",
    description: "Уменьшить риск гибели / ранения конкретного союзника.",
    defaultBaseWeight: 0.7,
  },

  // --- Hierarchy / власть, порядок, подчинение ---
  {
    id: "maintain_order",
    label: "Сохранить порядок",
    domain: "hierarchy",
    description: "Поддерживать дисциплину и структуру командования.",
    defaultBaseWeight: 0.7,
  },
  {
    id: "obey_orders",
    label: "Подчиняться приказам",
    domain: "hierarchy",
    description: "Выполнять прямые приказы авторитетной фигуры.",
    defaultBaseWeight: 0.6,
  },
  {
    id: "avoid_punishment",
    label: "Избежать наказания",
    domain: "hierarchy",
    description: "Минимизировать риск санкций от власти / системы.",
    defaultBaseWeight: 0.5,
  },
  {
    id: "escape_control",
    label: "Избежать контроля",
    domain: "hierarchy",
    description: "Ослабить или обойти внешнее управление и ограничения.",
    defaultBaseWeight: 0.4,
  },
  {
    id: "take_over_control",
    label: "Перехватить управление",
    domain: "hierarchy",
    description: "Получить реальную власть над ситуацией / группой.",
    defaultBaseWeight: 0.3,
  },

  // --- Social / социальные связи, репутация ---
  {
    id: "maintain_reputation",
    label: "Сохранить репутацию",
    domain: "social",
    description: "Избежать потери статуса и уважения.",
    defaultBaseWeight: 0.6,
  },
  {
    id: "improve_status",
    label: "Повысить статус",
    domain: "social",
    description: "Укрепить авторитет, видимость и влияние.",
    defaultBaseWeight: 0.4,
  },
  {
    id: "strengthen_bond_with_ally",
    label: "Укрепить связь с союзником",
    domain: "social",
    description: "Сделать действия, повышающие доверие / привязанность.",
    defaultBaseWeight: 0.5,
  },

  // --- Knowledge / информация ---
  {
    id: "gather_information",
    label: "Собрать информацию",
    domain: "knowledge",
    description: "Уточнить состояние мира, угроз, ресурсов и намерений других.",
    defaultBaseWeight: 0.4,
  },
  {
    id: "reduce_uncertainty",
    label: "Снизить неопределённость",
    domain: "knowledge",
    description: "Получить пояснения, чтобы уменьшить когнитивный дискомфорт.",
    defaultBaseWeight: 0.5,
  },

  // --- Resource / ресурсы, позиции ---
  {
    id: "preserve_resources",
    label: "Сохранить ресурсы",
    domain: "resource",
    description: "Не тратить лишние ресурсы (патроны, время, людей).",
    defaultBaseWeight: 0.4,
  },
  {
    id: "spend_resources_for_speed",
    label: "Пожертвовать ресурсами ради скорости",
    domain: "resource",
    description: "Ускорить достижение цели за счёт затрат.",
    defaultBaseWeight: 0.3,
  },

  // --- Comfort / регуляция состояния ---
  {
    id: "rest_and_recover",
    label: "Отдохнуть и восстановиться",
    domain: "comfort",
    description: "Снизить усталость, стресс или боль.",
    defaultBaseWeight: 0.5,
  },
  {
    id: "reduce_panic",
    label: "Снизить панику в группе",
    domain: "comfort",
    description: "Стабилизировать эмоциональное состояние окружения.",
    defaultBaseWeight: 0.4,
  },
];
