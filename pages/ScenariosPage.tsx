
// pages/ScenariosPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useAccess } from '../contexts/AccessContext';

interface SimCardProps {
    title: string;
    description: string;
    link: string;
    tags: string[];
}

const SimCard: React.FC<SimCardProps> = ({ title, description, link, tags }) => (
    <Link 
        to={link}
        className="block p-6 bg-canon-bg-light border border-canon-border rounded-lg hover:border-canon-accent hover:shadow-lg hover:shadow-canon-accent/10 transition-all transform hover:-translate-y-1"
    >
        <h3 className="text-2xl font-bold text-canon-accent mb-2">{title}</h3>
        <p className="text-canon-text-light mb-4">{description}</p>
        <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
                <span key={tag} className="text-xs bg-canon-border px-2 py-1 rounded font-mono">{tag}</span>
            ))}
        </div>
    </Link>
);

export const ScenariosPage: React.FC = () => {
    const { isRestricted, activeModule } = useAccess();
    
    const allTools = [
        {
            title: "Социальный симулятор",
            description: "Интерактивная песочница для наблюдения за эмерджентным поведением группы агентов. Исследуйте формирование лидерства, распространение влияния и динамику отношений в реальном времени.",
            link: "/social-simulator",
            tags: ["ToM", "GIL", "Лидерство", "Динамика"],
        },
        {
            title: "Biography Lab",
            description: "Лаборатория Биографии. Исследуйте, как события прошлого формируют личность персонажа через модель биографического латента.",
            link: "/biography-lab",
            tags: ["Math Model", "Identity", "Vectors"],
        },
        {
            title: "Planning Lab",
            description: "Лаборатория Планирования. Визуализация работы System 2: как агент строит цепочки действий для достижения целей и реагирует на препятствия.",
            link: "/planning-lab",
            tags: ["GOAP", "System 2", "Planner"],
        },
        {
            title: "Dialogue Lab",
            description: "Лаборатория Диалога. Тестирование обмена планами и информацией между агентами через контекстные атомы.",
            link: "/dialogue-lab",
            tags: ["Communication", "Shared Plans", "Context"],
        },
        {
            title: "Решатель (Solver)",
            description: "Пошаговая отладка и анализ принятия решений одного агента в заданном сценарии. Позволяет детально изучить внутреннюю логику, вклады параметров и выбор действий.",
            link: "/solver",
            tags: ["Отладка", "Анализ", "Одиночный агент"],
        },
         {
            title: "Runner (Матрица)",
            description: "Пакетный запуск матрицы симуляций 'Персонаж x Стратегия x Сценарий' для агрегированного анализа и сравнения.",
            link: "/runner",
            tags: ["Матричный анализ", "Сравнение"],
        },
        {
            title: "Симуляции Kanonar",
            description: "Набор предустановленных симуляций для различных системных моделей Kanonar, от логистики и эпидемиологии до сетевой динамики и переговоров.",
            link: "/simulations",
            tags: ["Системные модели", "Предиктивный анализ"],
        },
        {
            title: "Диагностический Слой",
            description: "Лаборатория для запуска персонажей через стандартные тест-сценарии и сбора подробных отчетов о поведении под нагрузкой.",
            link: "/diagnostics",
            tags: ["Тестирование", "Анализ", "Портрет поведения"],
        },
    ];
    
    let toolsToShow = allTools;
    if (isRestricted && activeModule) {
        toolsToShow = allTools.filter(t => 
            t.link !== '/solver' && t.link !== '/diagnostics' && t.link !== '/runner'
        );
    }

    return (
        <div className="p-8">
            <div className="text-center mb-12">
                <div className="flex justify-center items-center gap-4 mb-2">
                    <h2 className="text-4xl font-bold">Сценарный Хаб</h2>
                    {isRestricted && activeModule && (
                        <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-500 rounded border border-yellow-500/40 align-middle">
                             Модуль: {activeModule.label}
                        </span>
                    )}
                </div>
                <p className="text-lg text-canon-text-light max-w-4xl mx-auto">
                    Центр управления симуляциями Kanonar 4.0. Выберите инструмент для исследования поведения агентов.
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
                {toolsToShow.map(sim => (
                    <SimCard key={sim.title} {...sim} />
                ))}
            </div>
        </div>
    );
};
