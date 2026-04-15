
import React from 'react';
import { SimulationPoint } from '../../types';
import { SparklineChart } from '../visuals/SparklineChart';

interface EarlyWarningIndicatorsProps {
    data: SimulationPoint[];
}

export const EarlyWarningIndicators: React.FC<EarlyWarningIndicatorsProps> = ({ data }) => {
    if (!data || data.length === 0 || data[0].varianceS === undefined) {
        return (
            <div className="h-full flex items-center justify-center text-canon-text-light text-sm">
                Нет данных для отображения индикаторов. Запустите симуляцию с ансамблем &gt; 1.
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="border-b border-canon-border/50 pb-4">
                <h4 className="font-bold text-canon-text mb-2">Дисперсия стабильности (Var(S))</h4>
                <p className="text-xs text-canon-text-light mb-2">
                    Дисперсия S по ансамблю симуляций. Резкий рост может указывать на "критическое замедление" — признак того, что система приближается к точке бифуркации (срыву).
                </p>
                <div className="h-32">
                    <SparklineChart 
                        title="Var(S)"
                        data={data}
                        dataKey="varianceS"
                        color="#ff4444"
                    />
                </div>
            </div>
             <div className="border-b border-canon-border/50 pb-4 opacity-50">
                <h4 className="font-bold text-canon-text mb-2">Автокорреляция (ACF(1)) - в разработке</h4>
                <p className="text-xs text-canon-text-light mb-2">
                    Корреляция стабильности с ее значением на предыдущем шаге. Рост ACF(1) к 1.0 также является сильным индикатором критического замедления, показывая, что система теряет способность быстро возвращаться к равновесию.
                </p>
                 <div className="h-32 flex items-center justify-center">
                    <p className="text-sm">Скоро</p>
                </div>
            </div>
        </div>
    );
};
