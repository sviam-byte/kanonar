
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
  description?: string; // коротко для списков
  defaultBaseWeight?: number; // базовый приоритет, если нигде не задан
  // Extended help shown under "?" in Goal Lab.
  help?: {
    what: string; // что это за цель (человечески)
    why: string; // зачем (в нарративе/психике/тактике)
    stationaryPoint: string; // критерий "мы пришли" (аттрактор / стац точка)
    decomposesTo: string[]; // пример фрактальной декомпозиции
    notes?: string[]; // важные условия/ограничения
  };
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
    id: "recover_energy",
    label: "Восстановить энергию",
    domain: "comfort",
    description: "Через транзакцию с объектом довести энергию до нормы.",
    defaultBaseWeight: 0.5,
    help: {
      what: "Агент не 'рестит', а инициирует транзакцию с объектом: выбрать место, подойти, занять, восстанавливаться, отпустить.",
      why: "Энергия — компонент устойчивости. Цель снижает 'внутренний шум' и уменьшает вероятность рефлекс-ошибок.",
      stationaryPoint: "energy >= targetEnergy (например 0.75) И stress <= targetStress (например 0.35) И (нет немедленной угрозы).",
      decomposesTo: [
        "FindObject(tag:sleepable OR tag:restable)",
        "Approach(within=1 cell, prefer low-visibility)",
        "Attach(reserve/occupy объект)",
        "Execute(per-tick: energy += k*(1-energy); stress -= m*stress)",
        "Detach(release объект)"
      ],
      notes: [
        "Precondition: объект достижим (есть путь).",
        "Если threat high — цель уступает 'seek_cover/avoid_detection'."
      ],
    },
  },
  {
    id: "reduce_panic",
    label: "Снизить панику в группе",
    domain: "comfort",
    description: "Стабилизировать эмоциональное состояние окружения.",
    defaultBaseWeight: 0.4,
  },
  {
    id: "initiate_dialogue",
    label: "Инициировать диалог",
    domain: "social",
    description: "Запустить разговор как транзакцию (подойти → приватность → реплика).",
    defaultBaseWeight: 0.45,
    help: {
      what: "Это не 'Talk'. Это сценарий: подойти к цели, выбрать позицию (не у всех на ушах), только затем говорить.",
      why: "Социальные действия должны менять ToM/контекст оппонента, но требуют физики (слышимость/дистанция/свидетели).",
      stationaryPoint: "Состояние диалога активировано И (privacy_ok || accept_witnesses) И получен 'dialogue_response' (успех/отказ).",
      decomposesTo: [
        "SelectPartner(target=agent)",
        "If want_privacy: FindSpot(tag:occluder OR low_audibility)",
        "Approach(target or spot, within=talkRange)",
        "Attach(open_dialogue_channel)",
        "Execute(dialogue ticks: apply ToM deltas, produce offer/request/intimidate)",
        "Detach(close_channel)"
      ],
      notes: [
        "Precondition: canHear || canSee within talkRange.",
        "Если свидетели нежелательны: вставить SeekPrivacy перед Attach."
      ],
    },
  },
  {
    id: "scout_area",
    label: "Разведать сектор",
    domain: "knowledge",
    description: "Собрать информацию и обновить внутреннюю карту.",
    defaultBaseWeight: 0.4,
    help: {
      what: "Серия микрошагов: пройти точки обзора → собрать наблюдения → обновить память/уверенность.",
      why: "Уменьшает неопределённость и снижает 'галлюцинации' памяти (confidence decay).",
      stationaryPoint: "KnowledgeAge(sector) <= T И обновлены ключевые факты (threat/paths/resources).",
      decomposesTo: [
        "PickWaypoints(frontier nodes / vantage points)",
        "Approach(waypoint)",
        "Execute(observe: write memory facts; boost confidence)",
        "Repeat until coverage >= target"
      ],
      notes: [
        "Если threat high — разведка становится stealth-версией (avoid_detection)."
      ],
    },
  },
];
