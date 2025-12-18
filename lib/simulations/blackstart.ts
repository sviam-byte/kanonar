export interface BlackstartNode {
    id: string;
    name: string;
    description: string;
    dependencies: string[];
}

export interface BlackstartEdge {
    source: string;
    target: string;
}

export const blackstartGraph: { nodes: BlackstartNode[], edges: BlackstartEdge[] } = {
    nodes: [
        { id: 'power_core', name: 'Ядро питания', description: 'Основной источник энергии.', dependencies: [] },
        { id: 'grid_control', name: 'Упр. сетью', description: 'Стабилизирует энергосеть.', dependencies: ['power_core'] },
        { id: 'comms_relay', name: 'Реле связи', description: 'Восстанавливает связь.', dependencies: ['power_core'] },
        { id: 'life_support', name: 'Жизнеобеспечение', description: 'Активирует системы жизнеобеспечения.', dependencies: ['grid_control'] },
        { id: 'data_archives', name: 'Архивы данных', description: 'Доступ к основным данным.', dependencies: ['grid_control', 'comms_relay'] },
        { id: 'sector_a_gate', name: 'Шлюз Сектора А', description: 'Открывает доступ в Сектор А.', dependencies: ['life_support', 'data_archives'] },
        { id: 'system_auth', name: 'Авторизация', description: 'Полное восстановление системы.', dependencies: ['sector_a_gate'] },
    ],
    edges: [
        { source: 'power_core', target: 'grid_control' },
        { source: 'power_core', target: 'comms_relay' },
        { source: 'grid_control', target: 'life_support' },
        { source: 'grid_control', target: 'data_archives' },
        { source: 'comms_relay', target: 'data_archives' },
        { source: 'life_support', target: 'sector_a_gate' },
        { source: 'data_archives', target: 'sector_a_gate' },
        { source: 'sector_a_gate', target: 'system_auth' },
    ]
};
