
import React from 'react';
import { AgentState, AgentPsychState, CopingProfile, DistortionProfile, AttachmentProfile, MoralDissonance, V42Metrics, DerivedMetrics, ToMDashboardMetrics, ToMV2DashboardMetrics, CognitionProfile } from '../types';
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

const CognitionSection: React.FC<{ cognition?: CognitionProfile }> = ({ cognition }) => {
    if (!cognition?.prior) return null;
    const prior = cognition.prior;
    const post = cognition.posterior;
    return (
        <Section title="Мышление / Деятельность (Hybrid: logic + fuzzy + bayes)">
            <div className="text-xs opacity-80">
                Prior доминанты: A={prior.thinking.dominantA} · B={prior.thinking.dominantB} · C={prior.thinking.dominantC} · D={prior.thinking.dominantD} · meta={prior.thinking.metacognitiveGain.toFixed(2)}
            </div>
            {post && (
                <div className="mt-1 text-xs opacity-80">
                    Posterior доминанты: A={post.thinking.dominantA} · B={post.thinking.dominantB} · C={post.thinking.dominantC} · D={post.thinking.dominantD} · meta={post.thinking.metacognitiveGain.toFixed(2)}
                    {post.evidence?.sampleSize ? <span className="opacity-70"> · evidence n={post.evidence.sampleSize}</span> : null}
                </div>
            )}

            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricDisplay name="Policy planFirst" value={prior.policy.planFirst} />
                <MetricDisplay name="Policy actNow" value={prior.policy.actNow} />
                <MetricDisplay name="Policy probeAndUpdate" value={prior.policy.probeAndUpdate} />
                <MetricDisplay name="Scalars horizon(E)" value={prior.scalars.futureHorizon} />
                <MetricDisplay name="Scalars uncert(F)" value={prior.scalars.uncertaintyTolerance} />
                <MetricDisplay name="Scalars norm(G)" value={prior.scalars.normPressureSensitivity} />
                <MetricDisplay name="Scalars actVsFreeze(H)" value={prior.scalars.actionBiasVsFreeze} />
                <MetricDisplay name="R1 confCal" value={prior.scalars.confidenceCalibration} />
                <MetricDisplay name="R2 execCap" value={prior.scalars.executiveCapacity} />
                <MetricDisplay name="R3 experimentalism" value={prior.scalars.experimentalism} />
            </div>

            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricDisplay name="Caps ops" value={prior.activityCaps.operations} />
                <MetricDisplay name="Caps actions" value={prior.activityCaps.actions} />
                <MetricDisplay name="Caps activity" value={prior.activityCaps.activity} />
                <MetricDisplay name="Caps proactive" value={prior.activityCaps.proactive} />
                <MetricDisplay name="Caps regulatory" value={prior.activityCaps.regulatory} />
                <MetricDisplay name="Caps reflective" value={prior.activityCaps.reflective} />
                <MetricDisplay name="Caps communicative" value={prior.activityCaps.communicative} />
                <MetricDisplay name="Caps constructor" value={prior.activityCaps.constructor} />
            </div>
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
                    <CognitionSection cognition={agent.psych.cognition} />
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
