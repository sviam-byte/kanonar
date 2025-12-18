
// components/ArchetypeGoalVector.tsx
import React from 'react';
import { GoalAxisId, ArchetypeGoalInfo } from '../types';

const GOAL_AXIS_NAMES: Record<GoalAxisId, string> = {
    fix_world: "Исправить мир",
    preserve_order: "Сохранить порядок",
    free_flow: "Свободные потоки",
    control: "Контроль",
    care: "Забота",
    power_status: "Власть/Статус",
    truth: "Истина",
    chaos_change: "Хаос/Изменения",
    efficiency: "Эффективность",
    escape_transcend: "Побег/Выход за пределы",
};

const GoalBar: React.FC<{ name: string; value: number }> = ({ name, value }) => (
    <div className="text-xs">
        <div className="flex justify-between items-baseline mb-0.5">
            <span className="text-canon-text-light">{name}</span>
            <span className="font-mono font-bold text-canon-text">{value.toFixed(2)}</span>
        </div>
        <div className="w-full bg-canon-bg rounded-full h-2 border border-canon-border/50">
            <div className="bg-canon-blue h-full rounded-full" style={{ width: `${value * 100}%` }} />
        </div>
    </div>
);

export const ArchetypeGoalVector: React.FC<{ goals: { primary: ArchetypeGoalInfo } }> = ({ goals }) => {
    if (!goals?.primary?.axes) {
        return null;
    }

    return (
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
            <h3 className="font-bold mb-2 text-canon-text">Вектор Целей Архетипа</h3>
            <p className="text-xs text-canon-text-light italic mb-4">"{goals.primary.description}"</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                {(Object.keys(GOAL_AXIS_NAMES) as GoalAxisId[]).map((key) => (
                    <GoalBar key={key} name={GOAL_AXIS_NAMES[key]} value={goals.primary.axes[key] ?? 0} />
                ))}
            </div>
        </div>
    );
};
