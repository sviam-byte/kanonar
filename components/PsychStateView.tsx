
import React from 'react';
import type { ThinkingProfile, ActivityCaps } from '../types';
import { AgentState, AgentPsychState, CopingProfile, DistortionProfile, AttachmentProfile, MoralDissonance, V42Metrics, DerivedMetrics, ToMDashboardMetrics, ToMV2DashboardMetrics } from '../types';
import { MetricDisplay } from './MetricDisplay';
import { ArchetypeDerivation } from './ArchetypeDerivation';

interface AllMetricsViewProps {
    agent: AgentState;
}

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = "bg-canon-bg/40 border border-canon-border/30 rounded-lg p-3" }) => (
    <div className={className}>
        <h4 className="font-bold text-xs text-canon-accent uppercase mb-3 tracking-wider border-b border-canon-border/20 pb-1">{title}</h4>
        <div className="space-y-2">{children}</div>
    </div>
);

const GridSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Section title={title}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {children}
        </div>
    </Section>
);

const CognitionView: React.FC<{ thinking?: ThinkingProfile; caps?: ActivityCaps }> = ({ thinking, caps }) => {
    if (!thinking && !caps) return null;
    return (
        <Section title="Мышление / Деятельность (Character Sheet)">
            {thinking && (
                <div className="space-y-2">
                    <div className="text-xs text-canon-text-light">
                        Доминирует: A={thinking.dominantA} · B={thinking.dominantB} · C={thinking.dominantC} · D={thinking.dominantD} · meta={thinking.metacognitiveGain.toFixed(2)}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <MetricDisplay name="A enactive" value={thinking.representation.enactive} />
                        <MetricDisplay name="A imagery" value={thinking.representation.imagery} />
                        <MetricDisplay name="A verbal" value={thinking.representation.verbal} />
                        <MetricDisplay name="A formal" value={thinking.representation.formal} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <MetricDisplay name="B deduct" value={thinking.inference.deductive} />
                        <MetricDisplay name="B induct" value={thinking.inference.inductive} />
                        <MetricDisplay name="B abduct" value={thinking.inference.abductive} />
                        <MetricDisplay name="B causal" value={thinking.inference.causal} />
                        <MetricDisplay name="B bayes" value={thinking.inference.bayesian} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <MetricDisplay name="C intuitive" value={thinking.control.intuitive} />
                        <MetricDisplay name="C analytic" value={thinking.control.analytic} />
                        <MetricDisplay name="C meta" value={thinking.control.metacognitive} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                        <MetricDisplay name="D understand" value={thinking.function.understanding} />
                        <MetricDisplay name="D plan" value={thinking.function.planning} />
                        <MetricDisplay name="D critical" value={thinking.function.critical} />
                        <MetricDisplay name="D creative" value={thinking.function.creative} />
                        <MetricDisplay name="D norm" value={thinking.function.normative} />
                        <MetricDisplay name="D social" value={thinking.function.social} />
                    </div>
                </div>
            )}
            {caps && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <MetricDisplay name="Ops" value={caps.operations} />
                    <MetricDisplay name="Actions" value={caps.actions} />
                    <MetricDisplay name="Activity" value={caps.activity} />
                    <MetricDisplay name="Proactive" value={caps.proactive} />
                    <MetricDisplay name="Regulatory" value={caps.regulatory} />
                    <MetricDisplay name="Reflective" value={caps.reflective} />
                    <MetricDisplay name="Communicative" value={caps.communicative} />
                    <MetricDisplay name="Constructor" value={caps.constructor} />
                    <MetricDisplay name="Creative" value={caps.creative} />
                    <MetricDisplay name="Normative" value={caps.normative} />
                    <MetricDisplay name="Existential" value={caps.existential} />
                    <MetricDisplay name="Reactive" value={caps.reactive} />
                </div>
            )}
        </Section>
    );
};

// --- V4.2 Metrics Group ---
const V42Group: React.FC<{ v42: V42Metrics | null | undefined, agent: AgentState }> = ({ v42, agent }) => {
    if (!v42) return null;
    return (
        <GridSection title="V4.2 Metrics (Cognitive & Performance)">
             <MetricDisplay name="V" value={v42.V_t} tooltip="Валентность" formulaKey="V_t" context={agent} />
             <MetricDisplay name="A" value={v42.A_t} tooltip="Активация" formulaKey="A_t" context={agent} />
             <MetricDisplay name="WMcap" value={v42.WMcap_t} tooltip="Рабочая память" formulaKey="WMcap_t" context={agent} />
             <MetricDisplay name="DQ" value={v42.DQ_t} tooltip="Качество решений" formulaKey="DQ_t" context={agent} />
             <MetricDisplay name="Habit" value={v42.Habit_t} tooltip="Привычный контроль" formulaKey="Habit_t" context={agent} />
             <MetricDisplay name="Agency" value={v42.Agency_t} tooltip="Агентность" formulaKey="Agency_t" context={agent} />
             <MetricDisplay name="TailRisk" value={v42.TailRisk_t} tooltip="Хвостовой риск" colorClass="text-red-400" formulaKey="TailRisk_t" context={agent} />
             <MetricDisplay name="Rmargin" value={v42.Rmargin_t} tooltip="Запас обратимости" formulaKey="Rmargin_t" context={agent} />
             <MetricDisplay name="PlanRobust" value={v42.PlanRobust_t} tooltip="Робастность плана" formulaKey="PlanRobust_t" context={agent} />
             <MetricDisplay name="DriveU" value={v42.DriveU_t} tooltip="Гомеостат. нужда" formulaKey="DriveU_t" context={agent} />
             <MetricDisplay name="Exhaust" value={v42.ExhaustRisk_t} tooltip="Риск истощения" colorClass="text-red-400" formulaKey="ExhaustRisk_t" context={agent} />
             <MetricDisplay name="Recovery" value={v42.Recovery_t} tooltip="Скорость восст." formulaKey="Recovery_t" context={agent} />
             <MetricDisplay name="ImpulseCtl" value={v42.ImpulseCtl_t} tooltip="Контроль импульсов" formulaKey="ImpulseCtl_t" context={agent} />
             <MetricDisplay name="InfoHyg" value={v42.InfoHyg_t} tooltip="Инфо-гигиена" formulaKey="InfoHyg_t" context={agent} />
             <MetricDisplay name="RAP" value={v42.RAP_t} tooltip="Risk-Adjusted Performance" formulaKey="RAP_t" context={agent} />
        </GridSection>
    );
};

// --- Derived Metrics Group ---
const DerivedGroup: React.FC<{ derived: DerivedMetrics | null | undefined, agent: AgentState }> = ({ derived, agent }) => {
    if (!derived) return null;
    return (
        <GridSection title="Derived Metrics (Risks & Dynamics)">
            <MetricDisplay name="ρ (Rho)" value={derived.rho} tooltip="Рисковость" formulaKey="rho" context={agent} />
            <MetricDisplay name="λ (Lambda)" value={derived.lambda} tooltip="Эмо-лабильность" formulaKey="lambda" context={agent} />
            <MetricDisplay name="ι (Iota)" value={derived.iota} tooltip="Импульсивность" formulaKey="iota" context={agent} />
            <MetricDisplay name="Resilience" value={derived.resilience} tooltip="Устойчивость" formulaKey="resilience" context={agent} />
            <MetricDisplay name="Antifragile" value={derived.antifragility} tooltip="Антихрупкость" formulaKey="antifragility" context={agent} />
            <MetricDisplay name="Chaos" value={derived.chaosPressure} tooltip="Хаос-давление" formulaKey="chaosPressure" context={agent} />
            <MetricDisplay name="SocFriction" value={derived.socialFriction} tooltip="Соц. трение" formulaKey="socialFriction" context={agent} />
            <MetricDisplay name="RepFragility" value={derived.reputationFragility} tooltip="Реп. хрупкость" formulaKey="reputationFragility" context={agent} />
            <MetricDisplay name="DarkTend" value={derived.darkTendency} tooltip="Тёмная тяга" formulaKey="darkTendency" context={agent} />
        </GridSection>
    );
};

// --- ToM Metrics Group ---
const TomGroup: React.FC<{ tom: ToMDashboardMetrics | null, tomV2: ToMV2DashboardMetrics | null, agent: AgentState }> = ({ tom, tomV2, agent }) => {
    if (!tom) return null;
    return (
        <GridSection title="Self-ToM Metrics (Reflexive)">
             <MetricDisplay name="Delegability" value={tom.delegability} tooltip="Склонность делегировать" formulaKey="delegability" context={agent} />
             <MetricDisplay name="ToM Quality" value={tom.toM_Quality} tooltip="Качество моделирования других" formulaKey="toM_Quality" context={agent} />
             <MetricDisplay name="ToM Unc" value={tom.toM_Unc} tooltip="Неопределенность в моделях" formulaKey="toM_Unc" context={agent} />
             {tomV2 && (
                 <>
                    <MetricDisplay name="Detect Power" value={tomV2.detect_power} tooltip="Способность обнаружить обман" context={agent} />
                    <MetricDisplay name="Cred Commit" value={tomV2.cred_commit} tooltip="Способность к обязательствам" context={agent} />
                    <MetricDisplay name="Info Gain" value={tomV2.tom_info_gain_rate} tooltip="Скорость обучения о других" context={agent} />
                 </>
             )}
        </GridSection>
    );
};

// --- Psych Components ---
export const CopingView: React.FC<{ coping: CopingProfile }> = ({ coping }) => (
    <GridSection title="Coping Strategies">
        <MetricDisplay name="Avoid" value={coping.avoid} />
        <MetricDisplay name="Control" value={coping.hyperControl} />
        <MetricDisplay name="Aggression" value={coping.aggression} />
        <MetricDisplay name="SelfHarm" value={coping.selfHarm} colorClass="text-red-400" />
        <MetricDisplay name="Helper" value={coping.helper} />
    </GridSection>
);

export const DistortionsView: React.FC<{ distortion: DistortionProfile }> = ({ distortion }) => (
    <GridSection title="Cognitive Distortions">
        <MetricDisplay name="Mistrust" value={distortion.trustBias} />
        <MetricDisplay name="Threat" value={distortion.threatBias} />
        <MetricDisplay name="SelfBlame" value={distortion.selfBlameBias} />
        <MetricDisplay name="ControlIll" value={distortion.controlIllusion} />
        <MetricDisplay name="B/W Think" value={distortion.blackWhiteThinking} />
        <MetricDisplay name="Catastroph" value={distortion.catastrophizing} />
    </GridSection>
);

export const AttachmentView: React.FC<{ attachment: AttachmentProfile }> = ({ attachment }) => (
    <GridSection title="Attachment Style">
        <MetricDisplay name="Secure" value={attachment.secure} colorClass="text-green-400" />
        <MetricDisplay name="Anxious" value={attachment.anxious} />
        <MetricDisplay name="Avoidant" value={attachment.avoidant} />
        <MetricDisplay name="Disorg" value={attachment.disorganized} colorClass="text-red-400" />
    </GridSection>
);

export const MoralView: React.FC<{ moral: MoralDissonance }> = ({ moral }) => (
    <GridSection title="Moral Dissonance">
        <MetricDisplay name="Total Gap" value={moral.valueBehaviorGapTotal} />
        <MetricDisplay name="Guilt" value={moral.guilt} colorClass="text-orange-400" />
        <MetricDisplay name="Shame" value={moral.shame} colorClass="text-red-400" />
    </GridSection>
);

export const AllMetricsView: React.FC<AllMetricsViewProps> = ({ agent }) => {
    return (
        <div className="space-y-6">
            {/* Derivation View (Collapsible inside) */}
            <ArchetypeDerivation agent={agent} psych={agent.psych} />

            <V42Group v42={agent.v42metrics} agent={agent} />
            <DerivedGroup derived={agent.derivedMetrics} agent={agent} />
            <TomGroup tom={agent.tomMetrics} tomV2={agent.tomV2Metrics} agent={agent} />
            
            {agent.psych && (
                <>
                    <CognitionView thinking={agent.psych.thinking} caps={agent.psych.activityCaps} />
                    <CopingView coping={agent.psych.coping} />
                    <DistortionsView distortion={agent.psych.distortion} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <AttachmentView attachment={agent.psych.attachment} />
                         <MoralView moral={agent.psych.moral} />
                    </div>
                </>
            )}
        </div>
    );
};

// Legacy component stub
export const PsychStateView: React.FC<{ psych: AgentPsychState }> = ({ psych }) => {
     return <div className="text-red-500">Deprecated. Use AllMetricsView.</div>;
}
