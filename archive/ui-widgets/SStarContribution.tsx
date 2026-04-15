
import React, { useMemo, useState, useEffect } from 'react';
import { AnyEntity, CharacterEntity } from '../types';
import { calculateSdeDiagnostics } from '../lib/sde-helpers';
import { useBranch } from '../contexts/BranchContext';
import { calculateLatentsAndQuickStates } from '../lib/metrics';
import { WaterfallChart } from './charts/WaterfallChart';
import { getNestedValue, setNestedValue, flattenObject } from '../lib/param-utils';

interface SStarContributionProps {
    entity: AnyEntity;
}

const paramsToAnalyze = [
    'vector_base.A_Causality_Sanctity', 'vector_base.A_Legitimacy_Procedure', 'vector_base.A_Safety_Care', 'vector_base.A_Knowledge_Truth',
    'vector_base.B_discount_rate', 'vector_base.B_cooldown_discipline', 'vector_base.C_reciprocity_index', 'vector_base.D_HPA_reactivity',
    'vector_base.E_Model_calibration', 'vector_base.G_Metacog_accuracy', 'vector_base.B_goal_coherence', 'vector_base.G_Self_concept_strength'
];

export const SStarContribution: React.FC<SStarContributionProps> = ({ entity }) => {
    const [contributionData, setContributionData] = useState<{ name: string; value: number }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { branch } = useBranch();

    useEffect(() => {
        setIsLoading(true);
        const calculateContributions = () => {
            const charEntity = entity as CharacterEntity;
            if (!charEntity.vector_base) {
                setContributionData([]);
                setIsLoading(false);
                return;
            }

            const impacts: { name: string; value: number }[] = [];

            // 1. Calculate S* with all params at their "neutral" value (0.5)
            const baseEntity = JSON.parse(JSON.stringify(charEntity));
            for (const key of paramsToAnalyze) {
                setNestedValue(baseEntity, key, 0.5);
            }
            const baseFlatParams = flattenObject(baseEntity);
            const baseCalcs = calculateLatentsAndQuickStates(baseFlatParams);
            const baseResult = calculateSdeDiagnostics(baseEntity, baseCalcs.latents, baseCalcs.quickStates);
            const baseSStar = baseResult.S_star;

            impacts.push({ name: "База (0.5)", value: baseSStar });

            // 2. Calculate impact of each parameter deviation from 0.5
            let cumulativeSStar = baseSStar;
            const tempEntity = JSON.parse(JSON.stringify(baseEntity));
            
            for (const key of paramsToAnalyze) {
                const shortName = key.split('.').pop()?.replace(/_/g, ' ') || key;
                const actualValue = getNestedValue(charEntity, key) ?? 0.5;

                // Create a temporary entity with only this parameter changed
                const testEntity = JSON.parse(JSON.stringify(tempEntity));
                setNestedValue(testEntity, key, actualValue);

                const testFlatParams = flattenObject(testEntity);
                const testCalcs = calculateLatentsAndQuickStates(testFlatParams);
                const testResult = calculateSdeDiagnostics(testEntity, testCalcs.latents, testCalcs.quickStates);
                
                const impact = testResult.S_star - cumulativeSStar;
                if (Math.abs(impact) > 0.1) { // Only show significant impacts
                    impacts.push({ name: shortName, value: impact });
                }

                // Update the cumulative entity and S* for the next iteration
                setNestedValue(tempEntity, key, actualValue);
                cumulativeSStar = testResult.S_star;
            }
            
            setContributionData(impacts);
            setIsLoading(false);
        };
        
        const timer = setTimeout(calculateContributions, 50);
        return () => clearTimeout(timer);

    }, [entity, branch]);
    
    if (isLoading) {
        return <div className="text-center text-canon-text-light">Расчет вкладов...</div>
    }
    if (contributionData.length <= 1) {
        return <div className="text-center text-canon-text-light">Нет значимых вкладов для анализа.</div>
    }

    return (
        <div className="w-full h-full">
            <WaterfallChart data={contributionData} />
        </div>
    );
};
