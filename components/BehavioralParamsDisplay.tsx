import React from 'react';
import { CharacterParams } from '../types';

const Metric: React.FC<{ label: string; value: string | number; tooltip?: string }> = ({ label, value, tooltip }) => (
    <div className="flex justify-between text-xs py-1 border-b border-canon-border/30" title={tooltip}>
        <span className="text-canon-text-light">{label}</span>
        <span className="font-mono text-canon-text">{typeof value === 'number' ? value.toFixed(3) : value}</span>
    </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mb-4">
        <h4 className="font-bold text-sm text-canon-accent mb-2">{title}</h4>
        <div className="space-y-1">{children}</div>
    </div>
);

export const BehavioralParamsDisplay: React.FC<{ params: CharacterParams | null }> = ({ params }) => {
    if (!params) {
        return <div className="p-4 text-canon-text-light">Параметры поведения не рассчитаны.</div>;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
            <div>
                <Section title="Основные">
                    <Metric label="Базовая температура (T₀)" value={params.T0} />
                    <Metric label="Горизонт планир. (κ)" value={params.kappa.toFixed(0)} />
                    <Metric label="Масштаб Gumbel (β)" value={params.gumbel_beta} />
                </Section>
                <Section title="Динамика (τ)">
                    <Metric label="τ (Энергия)" value={params.tau.energy} />
                    <Metric label="τ (Стресс)" value={params.tau.stress} />
                    <Metric label="τ (Внимание)" value={params.tau.attention} />
                    <Metric label="τ (Воля)" value={params.tau.will} />
                </Section>
                 <Section title="Шум (σ)">
                    <Metric label="Базовый шум (σ₀)" value={params.sigma0} />
                    <Metric label="a_HPA" value={params.h_coeffs.a_HPA} tooltip="Коэфф. влияния ГГН-оси на шум" />
                    <Metric label="a_stress" value={params.h_coeffs.a_stress} tooltip="Коэфф. влияния стресса на шум" />
                    <Metric label="a_sleep" value={params.h_coeffs.a_sleep} tooltip="Коэфф. влияния недосыпа на шум" />
                    <Metric label="a_dark" value={params.h_coeffs.a_dark} tooltip="Коэфф. влияния 'тьмы' на шум" />
                </Section>
            </div>
            <div>
                <Section title="Риск и Принятие Решений">
                    <Metric label="Коэфф. CVaR (λ)" value={params.cvar_lambda} />
                    <Metric label="γ (Выигрыш)" value={params.prospect.gamma} tooltip="Степень в функции ценности для выигрышей"/>
                    <Metric label="δ (Проигрыш)" value={params.prospect.delta} tooltip="Степень в функции ценности для проигрышей"/>
                    <Metric label="λ (Неприятие потерь)" value={params.prospect.lambda_loss} tooltip="Коэффициент неприятия потерь"/>
                </Section>
                 <Section title="Адаптация">
                    <Metric label="ρ (Адаптация целей)" value={params.rho_goals} />
                    <Metric label="ζ (Обновление убеждений)" value={params.zeta_belief} />
                </Section>
            </div>
             <div>
                <Section title="Социальное Влияние (GIL)">
                    <Metric label="Макс. доля наследия (φₘₐₓ)" value={params.phi_max} />
                    <Metric label="β (Trust)" value={params.phi_beta.bTrust} />
                    <Metric label="β (Power)" value={params.phi_beta.bPower} />
                    <Metric label="β (Conflict)" value={-params.phi_beta.bConflict} />
                </Section>
                <Section title="Шоковые События">
                    <Metric label="Интенсивность шоков (λ)" value={params.shock_lambda} />
                    <Metric label="J (Стресс)" value={params.shock_profile_J.stress} tooltip="Амплитуда шока по стрессу" />
                    <Metric label="J (Энергия)" value={params.shock_profile_J.energy} tooltip="Амплитуда шока по энергии" />
                </Section>
            </div>
        </div>
    );
};