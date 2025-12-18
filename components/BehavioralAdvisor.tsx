
import React from 'react';
import { BehavioralAdvice } from '../types';
import { MetricDisplay } from './MetricDisplay';

interface BehavioralAdvisorProps {
    advice?: BehavioralAdvice;
}

export const BehavioralAdvisor: React.FC<BehavioralAdvisorProps> = ({ advice }) => {
    if (!advice) {
        return null;
    }

    return (
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
            <h3 className="font-bold mb-3 text-canon-text">Поведенческий советник</h3>
            <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-4">
                 <h4 className="text-lg font-bold text-canon-accent mb-2">{advice.recommendation}</h4>
                 <p className="text-sm text-canon-text-light mb-4">{advice.description}</p>
                 <div>
                    <h5 className="text-xs font-semibold text-canon-text-light mb-2">Ключевые метрики:</h5>
                    <div className="flex flex-wrap gap-2">
                        {advice.contributingMetrics.map(metric => (
                            <MetricDisplay 
                                key={metric.name}
                                name={metric.name}
                                value={(metric.value ?? 0).toFixed(2)}
                            />
                        ))}
                    </div>
                 </div>
            </div>
        </div>
    );
};
