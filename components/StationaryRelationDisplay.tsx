
import React from 'react';
import { StationaryRelation } from '../types';
import { Tabs } from './Tabs';
import { MetricDisplay } from './MetricDisplay';

const ScoreCard: React.FC<{ label: string; value: number; tooltip: string }> = ({ label, value, tooltip }) => {
    const getScoreColor = (v: number) => {
        if (label.includes('Cost') || label.includes('Uncertainty') || label.includes('Conflict')) v = 100 - v;
        if (v > 75) return 'text-canon-green';
        if (v > 40) return 'text-yellow-400';
        return 'text-canon-red';
    };
    const safeValue = value ?? 0;
    return (
        <div className="bg-canon-bg p-3 rounded-lg border border-canon-border/50 text-center" title={tooltip}>
            <div className={`font-mono text-3xl font-bold ${getScoreColor(safeValue)}`}>
                {safeValue.toFixed(0)}
            </div>
            <div className="text-xs text-canon-text-light">{label}</div>
        </div>
    );
};

const ProbabilityRow: React.FC<{ label: string; value: number; tooltip: string }> = ({ label, value, tooltip }) => {
    const safeValue = value ?? 0;
    return (
        <div title={tooltip} className="group">
            <div className="flex justify-between items-center text-xs mb-1">
                <span className="text-canon-text-light group-hover:text-canon-accent">{label}</span>
                <span className="font-mono">{ (safeValue * 100).toFixed(1) }%</span>
            </div>
            <div className="w-full bg-canon-bg rounded-full h-2 border border-canon-border/50">
                <div className="bg-canon-blue h-full rounded-full transition-all duration-300" style={{ width: `${safeValue * 100}%` }}></div>
            </div>
        </div>
    );
};


export const StationaryRelationDisplay: React.FC<{ relation: StationaryRelation }> = ({ relation }) => {
    const { scores100, probabilities, compatibility, rapport, influence } = relation;

    const compatibilityTab = (
        <div className="space-y-2">
            <MetricDisplay name="Косинусное сходство" value={compatibility.cosine.toFixed(3)} tooltip="Геометрическое сходство векторов целей. 1 = идентичны, 0 = ортогональны, -1 = противоположны." />
            <MetricDisplay name="Ранговая корреляция" value={compatibility.rankCorrelation.toFixed(3)} tooltip="Насколько совпадают приоритеты (порядок) целей." />
            <MetricDisplay name="Допустимое пересечение" value={compatibility.feasibleOverlap.toFixed(3)} tooltip="Доля общих целей, не заблокированных клятвами/капами." />
            <MetricDisplay name="Цена компромисса" value={compatibility.compromiseCost.toFixed(3)} tooltip="Насколько далеко нужно отойти от своих целей для компромисса." colorClass="text-yellow-400" />
            <MetricDisplay name="Заблокированная масса" value={compatibility.blockedMass.toFixed(3)} tooltip="Доля целей одного, заблокированных правилами другого." colorClass="text-yellow-500" />
        </div>
    );

    const rapportTab = (
        <div className="space-y-2">
            <MetricDisplay name="Базовое доверие" value={rapport.trust_base.toFixed(3)} tooltip="Долгосрочная оценка надежности и предсказуемости." />
            <MetricDisplay name="Правдоподобие обещаний" value={rapport.credcommit_base.toFixed(3)} tooltip="Насколько цель склонна выполнять свои обещания." />
            <MetricDisplay name="Конфликт норм" value={rapport.norm_conflict.toFixed(3)} tooltip="Насколько нормы цели противоречат нормам наблюдателя." colorClass="text-yellow-500" />
            <MetricDisplay name="Волатильность связи" value={rapport.volatility.toFixed(3)} tooltip="Изменчивость доверия со временем." colorClass="text-yellow-400" />
            <MetricDisplay name="Сохранность связи" value={rapport.tie_survival.toFixed(3)} tooltip="Вероятность, что связь переживет заданный горизонт." />
        </div>
    );
    
    const influenceTab = (
        <div className="space-y-2">
            <MetricDisplay name="Вес ребра" value={influence.edge_weight.toFixed(3)} tooltip="Интегральный вес связи в социальном графе." />
            <MetricDisplay name="Эффективная полоса" value={influence.bandwidth_eff.toFixed(3)} tooltip="Пропускная способность канала связи с поправкой на шум и неопределенность." />
            <MetricDisplay name="Транзакционная стоимость" value={influence.tx_cost.toFixed(3)} tooltip="Усилия, необходимые для успешного взаимодействия." colorClass="text-yellow-400" />
        </div>
    );

    const probTab = (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
                <h5 className="font-bold text-canon-accent mb-3">Кооперация и Иерархия</h5>
                <div className="space-y-3">
                    <ProbabilityRow label="P(Follow)" value={probabilities.p_follow} tooltip="i→j: Вероятность, что i будет следовать целям j." />
                    <ProbabilityRow label="P(Donate Goals)" value={probabilities.p_donate_goals} tooltip="j→i: Вероятность, что j пожертвует ресурсы/усилия на цели i." />
                    <ProbabilityRow label="P(Task Assign)" value={probabilities.p_task_assign} tooltip="i→j: Вероятность, что i поручит задачу j." />
                    <ProbabilityRow label="P(Task Accept)" value={probabilities.p_task_accept} tooltip="j|i: Вероятность, что j примет задачу от i." />
                    <ProbabilityRow label="P(Coalition Form)" value={probabilities.p_coalition_form} tooltip="i+j: Вероятность, что i и j сформируют устойчивую коалицию." />
                    <ProbabilityRow label="P(Compromise)" value={probabilities.p_compromise} tooltip="i↔j: Вероятность достижения компромисса без полномасштабной сцены." />
                </div>
            </div>
             <div>
                <h5 className="font-bold text-canon-accent mb-3">Власть и Влияние</h5>
                 <div className="space-y-3">
                    <ProbabilityRow label="P(Mandate Grant)" value={probabilities.p_mandate_grant} tooltip="j→i: Вероятность, что j предоставит мандат i." />
                    <ProbabilityRow label="P(Mandate Revoke)" value={probabilities.p_mandate_revoke} tooltip="j→i: Вероятность, что j отзовет мандат у i." />
                    <ProbabilityRow label="P(Public Endorse)" value={probabilities.p_public_endorse} tooltip="i→j: Вероятность, что i публично поддержит j." />
                    <ProbabilityRow label="P(Public Distance)" value={probabilities.p_public_distance} tooltip="i→j: Вероятность, что i публично дистанцируется от j." />
                </div>
            </div>
             <div className="md:col-span-2 border-t border-canon-border/50 pt-4">
                <h5 className="font-bold text-canon-accent mb-3">Конфликт и Информация</h5>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                    <ProbabilityRow label="P(Conflict Escalation)" value={probabilities.p_conflict_escalation} tooltip="i↔j: Вероятность эскалации существующего конфликта." />
                    <ProbabilityRow label="P(Tie Survival)" value={probabilities.p_tie_survival} tooltip="i↔j: Вероятность сохранения связи на заданном горизонте." />
                    <ProbabilityRow label="P(Deception by j)" value={probabilities.p_deception_by_j} tooltip="j: Вероятность, что j попытается обмануть i." />
                    <ProbabilityRow label="P(Detection by i)" value={probabilities.p_detection_by_i} tooltip="i|j: Вероятность, что i распознает обман со стороны j." />
                    <ProbabilityRow label="P(Share Sensitive)" value={probabilities.p_share_sensitive} tooltip="i→j: Вероятность, что i поделится с j чувствительной информацией." />
                    <ProbabilityRow label="P(Posterior Shift)" value={probabilities.p_posterior_shift} tooltip="i about j: Вероятность, что i значительно изменит свое мнение о j." />
                </div>
            </div>
        </div>
    );


    const tabs = [
        { label: "Совместимость", content: compatibilityTab },
        { label: "Раппорт", content: rapportTab },
        { label: "Влияние", content: influenceTab },
        { label: "Вероятности", content: probTab },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <ScoreCard label="Strength" value={scores100.relation_strength} tooltip="Общая сила связи, учитывающая доверие, совместимость и определенность." />
                <ScoreCard label="Alignment" value={scores100.alignment_quality} tooltip="Насколько хорошо совпадают цели и их приоритеты." />
                <ScoreCard label="Stability" value={scores100.relation_stability} tooltip="Вероятность сохранения связи в долгосрочной перспективе." />
                <ScoreCard label="TxCost" value={scores100.tx_cost} tooltip="Транзакционные издержки на взаимодействие (чем ниже, тем лучше)." />
                <ScoreCard label="Uncertainty" value={scores100.uncertainty} tooltip="Неопределенность в модели цели (чем ниже, тем лучше)." />
            </div>
            <Tabs tabs={tabs} />
        </div>
    );
};
