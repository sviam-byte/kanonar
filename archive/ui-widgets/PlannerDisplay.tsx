
// components/PlannerDisplay.tsx
import React, { useState, useCallback } from 'react';
import { CharacterEntity, VisualizationPlanStep, SimulationPoint, SocialEventEntity } from '../types';
import { generateIdealPlan, simulateTimeline } from '../lib/planner';
import { TimelineChart } from './charts/TimelineChart';
import { useCharacterCalculations } from '../hooks/useCharacterCalculations';
import { useBranch } from '../contexts/BranchContext';
import { useNavigate } from 'react-router-dom';

interface PlannerDisplayProps {
    character: CharacterEntity;
}

export const PlannerDisplay: React.FC<PlannerDisplayProps> = ({ character }) => {
    const { branch } = useBranch();
    // Social events are not relevant for ideal plan generation, so pass an empty array.
    const { goalEcology, eventAdjustedFlatParams } = useCharacterCalculations(character, branch, []);

    const [plan, setPlan] = useState<VisualizationPlanStep[] | null>(null);
    const [simData, setSimData] = useState<SimulationPoint[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleGeneratePlan = useCallback(() => {
        if (!goalEcology) return;
        setIsLoading(true);
        setTimeout(() => {
            const idealPlan = generateIdealPlan(goalEcology, character);
            const timelineData = simulateTimeline(idealPlan, character, eventAdjustedFlatParams, 30);
            setPlan(idealPlan);
            setSimData(timelineData);
            setIsLoading(false);
        }, 50);
    }, [goalEcology, character, eventAdjustedFlatParams]);

    const handleLaunchScenario = () => {
        // Pre-selects the cave rescue scenario and the current agent in the social simulator
        navigate(`/social-simulator?scenarioId=cave_rescue&agentIds=${character.entityId}`);
    };

    if (!goalEcology) {
        return <div className="p-4 text-canon-text-light">Экология целей не рассчитана.</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center gap-4">
                <div>
                     <h3 className="text-xl font-bold text-canon-accent">Идеальная Временная Прямая</h3>
                     <p className="text-sm text-canon-text-light">Генерация и симуляция последовательности выполнения активных целей.</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                     <button
                        onClick={handleLaunchScenario}
                        className="bg-canon-blue text-canon-bg font-bold rounded px-4 py-2 hover:bg-opacity-80 transition-colors"
                    >
                        Запустить сценарий 'Спасение'
                    </button>
                    <button
                        onClick={handleGeneratePlan}
                        disabled={isLoading}
                        className="bg-canon-accent text-canon-bg font-bold rounded px-4 py-2 hover:bg-opacity-80 transition-colors disabled:bg-canon-border disabled:cursor-wait"
                    >
                        {isLoading ? 'Генерация...' : 'Сгенерировать План'}
                    </button>
                </div>
            </div>
            <div className="h-[70vh] bg-canon-bg border border-canon-border rounded-lg p-4">
                {isLoading && <div className="h-full flex items-center justify-center">Симуляция динамики...</div>}
                {!isLoading && simData && plan && <TimelineChart data={simData} plan={plan} />}
                {!isLoading && !simData && (
                    <div className="h-full flex items-center justify-center text-canon-text-light">
                        Нажмите "Сгенерировать План" для построения временной прямой.
                    </div>
                )}
            </div>
        </div>
    );
};