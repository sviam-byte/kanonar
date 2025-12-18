
// lib/kanonar/reports.ts

import {
    WorldState,
    KanonarReport,
    KanonarReportKind,
    KanonarRiskItem,
    KanonarRecommendation,
} from '../../types';
import {
    collectEpisodesWindow,
    computeMetricSnapshot,
    KanonarAnalyticsConfig,
} from './analytics';

let REPORT_COUNTER = 0;

function assessRisks(metrics: ReturnType<typeof computeMetricSnapshot>): KanonarRiskItem[] {
    const risks: KanonarRiskItem[] = [];

    // Пример 1: риск системной усталости
    if (metrics.meanS < 45 || metrics.meanStress > 60) {
        const level = Math.max(
            (60 - metrics.meanS) / 60,
            (metrics.meanStress - 50) / 50,
        );
        risks.push({
            id: 'system_fatigue',
            label: 'Риск системной усталости',
            level: Math.min(1, Math.max(0, level)),
            drivers: ['meanS', 'meanStress'],
        });
    }

    // Пример 2: риск радикализации / тёмных режимов
    if (metrics.darkShare > 0.1) {
        const level = (metrics.darkShare - 0.1) / 0.4; // 0.1 → 0; 0.5 → 1
        risks.push({
            id: 'dark_risk',
            label: 'Рост тёмных режимов',
            level: Math.min(1, Math.max(0, level)),
            drivers: ['darkShare'],
        });
    }

    // Пример 3: риск фрагментации/гражданского конфликта
    if ((metrics.meanConflict ?? 0) > 0.4 && (metrics.meanTrust ?? 0.5) < 0.5) {
        const level = Math.max(
            ((metrics.meanConflict ?? 0) - 0.4) / 0.6,
            (0.5 - (metrics.meanTrust ?? 0.5)) / 0.5,
        );
        risks.push({
            id: 'civil_conflict',
            label: 'Риск внутреннего конфликта',
            level: Math.min(1, Math.max(0, level)),
            drivers: ['meanConflict', 'meanTrust'],
        });
    }

    // Пример 4: нестабильное лидерство
    if ((metrics.leaderChangeRate ?? 0) > 0.2) {
        risks.push({
            id: 'leadership_instability',
            label: 'Нестабильность лидерства',
            level: Math.min(1, (metrics.leaderChangeRate ?? 0) / 0.5),
            drivers: ['leaderChangeRate', 'leaderContestLevel'],
        });
    }

    return risks;
}

function makeRecommendations(metrics: ReturnType<typeof computeMetricSnapshot>, risks: KanonarRiskItem[]): KanonarRecommendation[] {
    const recs: KanonarRecommendation[] = [];

    const riskMap = Object.fromEntries(risks.map(r => [r.id, r]));

    // Если высокий риск усталости — рекомендовать разгрузку/ротацию
    if (riskMap['system_fatigue'] && riskMap['system_fatigue'].level > 0.4) {
        recs.push({
            id: 'reduce_load',
            label: 'Снижение нагрузки и ротация',
            rationale: 'Средняя стабильность S низкая и/или стресс высок. Рекомендуется перераспределить задачи, ввести окна отдыха и ротацию ключевых лиц.',
            suggestedPolicyId: 'policy_reduce_operational_load', // если есть такая Policy
        });
    }

    // Если растёт darkShare — рекомендовать меры информационной/соц гигиены
    if (riskMap['dark_risk'] && riskMap['dark_risk'].level > 0.3) {
        recs.push({
            id: 'dark_hygiene',
            label: 'Ограничение тёмного воздействия',
            rationale: 'Доля агентов в тёмных режимах выше безопасного порога. Нужны меры гигиены: ограничение экспозиции, поддержка устойчивых лидеров, усиление прозрачности.',
            suggestedPolicyId: 'policy_dark_hygiene',
        });
    }

    return recs;
}

function chooseReportKind(risks: KanonarRiskItem[]): KanonarReportKind {
    const maxLevel = risks.reduce((m, r) => Math.max(m, r.level), 0);
    if (maxLevel > 0.7) return 'alert';
    if (maxLevel > 0.3) return 'trend';
    return 'situation';
}

export function makeKanonarReport(
    world: WorldState,
    cfg: KanonarAnalyticsConfig
): KanonarReport | null {
    const windowEpisodes = collectEpisodesWindow(world, cfg);
    // Allow report generation even if no episodes but agents exist (fallback logic in analytics)
    if (!windowEpisodes.length && (!world.agents || !world.agents.length)) return null;

    const metrics = computeMetricSnapshot(windowEpisodes, world);
    const risks = assessRisks(metrics);
    const recommendations = makeRecommendations(metrics, risks);
    const kind = chooseReportKind(risks);

    const id = `kanonar-report-${++REPORT_COUNTER}-${world.tick}`;

    let summary: string;
    if (kind === 'alert') {
        summary = 'Тревожный отчёт: повышенные системные риски';
    } else if (kind === 'trend') {
        summary = 'Отчёт о тревожных трендах';
    } else {
        summary = 'Ситуационный отчёт о состоянии системы';
    }

    const detailsLines: string[] = [];

    detailsLines.push(`Окно наблюдения: ${cfg.windowSize} тиков.`);
    detailsLines.push(`Средняя стабильность S: ${metrics.meanS.toFixed(1)}.`);
    detailsLines.push(`Средний стресс: ${metrics.meanStress.toFixed(1)}.`);
    detailsLines.push(`Доля тёмных режимов: ${(metrics.darkShare * 100).toFixed(1)}%.`);

    if (metrics.meanTrust !== undefined) {
        detailsLines.push(`Среднее доверие: ${metrics.meanTrust.toFixed(2)}.`);
    }
    if (metrics.meanConflict !== undefined) {
        detailsLines.push(`Средний конфликт: ${metrics.meanConflict.toFixed(2)}.`);
    }
    if (metrics.leaderChangeRate !== undefined) {
        detailsLines.push(`Частота смен лидера: ${(metrics.leaderChangeRate * 100).toFixed(1)}%.`);
    }

    if (risks.length) {
        detailsLines.push('');
        detailsLines.push('Выявленные риски:');
        for (const r of risks) {
            detailsLines.push(`- ${r.label}: ${(r.level * 100).toFixed(0)}% (drivers: ${r.drivers.join(', ')})`);
        }
    }

    if (recommendations.length) {
        detailsLines.push('');
        detailsLines.push('Рекомендации:');
        for (const rec of recommendations) {
            detailsLines.push(`- ${rec.label}: ${rec.rationale}`);
        }
    }

    const report: KanonarReport = {
        id,
        tick: world.tick,
        kind,
        summary,
        details: detailsLines.join('\n'),
        windowSize: cfg.windowSize,
        metrics,
        risks,
        recommendations,
    };

    return report;
}
