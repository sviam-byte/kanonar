
import { LocationEntity, EntityType, Branch } from '../types';
import { createEmptyLocation, Location } from '../lib/location/types';

// 1. RICH DEMO LOCATION
// This object uses the full 'Location' structure but is cast to LocationEntity 
// for compatibility with the main array. The extra fields are preserved at runtime.

const base: Location = createEmptyLocation("fortress_council_hall_demo", "Зал Совета (Демо)");

export const DEMO_LOCATION: LocationEntity & Location = {
    ...base,
    type: EntityType.Location,
    entityId: "fortress_council_hall_demo",
    title: "Зал Совета (Демонстрация)",
    description: "Величественный зал, где решаются судьбы. Демонстрационная локация с полным набором сценарных слоев: физикой, социологией и нарративным напряжением.",
    versionTags: [Branch.Current],
    tags: ["demo", "council", "high_stakes"],
    
    // Visual Map
    map: {
        id: "map-demo-council",
        width: 16,
        height: 16,
        cells: Array.from({length: 256}, (_, i) => {
            const x = i % 16;
            const y = Math.floor(i / 16);
            // Simple walls
            if (x === 0 || x === 15 || y === 0 || y === 15) return { x, y, walkable: false, danger: 0, cover: 0 };
            // Center table
            if (x >= 6 && x <= 9 && y >= 6 && y <= 9) return { x, y, walkable: false, danger: 0, cover: 0.5 };
            // Danger zones (The Pit)
            if (x === 8 && y === 12) return { x, y, walkable: true, danger: 0.8, cover: 0 };
            return { x, y, walkable: true, danger: 0, cover: 0 };
        }),
        visuals: [
            { tag: 'rect', attrs: { x: 0, y: 0, width: 16, height: 16, fill: '#111' } },
            { tag: 'circle', attrs: { cx: 8, cy: 8, r: 3, fill: '#222', stroke: '#444' } }
        ]
    },

    // Rich Layers
    contextModes: [
        { 
            id: 'strategic_planning', 
            label: 'Стратегическая сессия',
            goalWeightModifiers: { 'maintain_legitimacy': 1.5, 'seek_status': 1.2, 'rest_and_recover': -0.5 },
            tensionModifier: 1.2 
        }
    ],
    
    norms: {
        requiredBehavior: [
            { id: 'speak_in_turn', description: 'Говорить только когда дано слово', appliesToTags: ['subordinate'] }
        ],
        forbiddenBehavior: [
            { id: 'draw_weapon', description: 'Обнажать оружие', penalties: { 'legitimacy': 50, 'trust': 30 } }
        ],
        penalties: {}
    },

    localGoals: [
        { id: 'protect_leader', label: 'Защитить Короля', tag: 'care' },
        { id: 'maintain_order', label: 'Соблюдать протокол', tag: 'order' }
    ],

    physics: {
        mobilityCost: 1.0,
        collisionRisk: 0.05,
        environmentalStress: 0.1,
        acousticsProfile: { echo: 0.8, dampening: 0.2 },
        climbable: false, jumpable: false, crawlable: false, weightLimit: 1000
    },

    tomModifier: {
        noise: 0.05,
        authorityBias: 0.5, // Authority is amplified here
        privacyBias: -0.8,  // No privacy
        misinterpretationChance: 0.2
    },

    riskReward: {
        riskIndex: 0.8, // High stakes
        rewardIndex: 0.9, // High political gain
        safePaths: [],
        dangerPaths: [],
        resourceOpportunities: []
    },
    
    // Add missing required fields from Location type with safe defaults
    worldIntegration: {
        worldPressure: 0,
        signalQuality: 1,
        supplyState: 1,
        politicalTemperature: 0.5
    },
    schedule: [],
    timeModes: []
};