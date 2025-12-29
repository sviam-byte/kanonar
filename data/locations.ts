import { LocationEntity, EntityType, Branch, LocationMap, LocationMapCell, SvgShape, LocationMapExit } from '../types';
import { DEMO_LOCATION } from './demo-rich';

// --- MAP BUILDERS ---

// Helper to create basic grid
const createGrid = (
  w: number,
  h: number,
  defaultWalkable = true,
  opts?: {
    defaultLevel?: number;
    defaultElevation?: number;
    defaultMaxOccupancy?: number;
  }
): LocationMapCell[] => {
  const cells: LocationMapCell[] = [];
  const level = opts?.defaultLevel ?? 0;
  const elevation = opts?.defaultElevation ?? 0;
  const maxOcc = opts?.defaultMaxOccupancy ?? 1; // standard human size

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      cells.push({
        x,
        y,
        walkable: defaultWalkable,
        danger: 0,
        cover: 0,
        level,
        elevation,
        maxOccupancy: maxOcc,
        tags: [],
        hazards: []
      });
    }
  }
  return cells;
};

// --- TEST MAPS (for atom codex / hazards / axes debugging) ---
const buildTestSafeRoomMap = (): LocationMap => {
  const width = 10, height = 10;
  const cells = createGrid(width, height, true, { defaultMaxOccupancy: 1 });
  // walls
  for (const c of cells) {
    if (c.x === 0 || c.y === 0 || c.x === width - 1 || c.y === height - 1) {
      c.walkable = false;
      c.maxOccupancy = 0;
      c.tags?.push('wall');
      c.cover = 0.9;
    }
  }
  const exits: LocationMapExit[] = [{ x: 5, y: height - 2, targetId: 'test.minefield', label: 'To Minefield' }];
  return { id: 'test_safe_room_map', width, height, cells, visuals: [], exits };
};

const buildTestMinefieldMap = (): LocationMap => {
  const width = 14, height = 10;
  const cells = createGrid(width, height, true, { defaultMaxOccupancy: 1 });
  // corridor with mines (hazards on cells)
  for (const c of cells) {
    // outer walls
    if (c.x === 0 || c.y === 0 || c.x === width - 1 || c.y === height - 1) {
      c.walkable = false;
      c.maxOccupancy = 0;
      c.tags?.push('wall');
      continue;
    }
    // mine stripe in the middle
    if (c.x >= 5 && c.x <= 8 && c.y >= 2 && c.y <= height - 3) {
      c.tags?.push('hazard');
      c.danger = Math.max(c.danger || 0, 0.7);
      c.hazards = c.hazards || [];
      c.hazards.push({ kind: 'mine', intensity: 0.9 });
    }
    // some cover objects
    if ((c.x === 3 && c.y === 3) || (c.x === 10 && c.y === 6)) {
      c.cover = 0.7;
      c.tags?.push('cover');
    }
  }
  const exits: LocationMapExit[] = [{ x: 2, y: height - 2, targetId: 'test.safe_room', label: 'Back to Safe Room' }];
  return { id: 'test_minefield_map', width, height, cells, visuals: [], exits };
};

// 1. Throne Hall Map
const buildThroneHallMap = (): LocationMap => {
    const width = 20;
    const height = 30;
    const cells = createGrid(width, height, true, {
      defaultLevel: 0,
      defaultElevation: 0,
      defaultMaxOccupancy: 1.5, // Spacious
    });
    
    // Add Pillars
    const pillarCoords = [
        {x: 4, y: 5}, {x: 15, y: 5},
        {x: 4, y: 10}, {x: 15, y: 10},
        {x: 4, y: 15}, {x: 15, y: 15},
        {x: 4, y: 20}, {x: 15, y: 20},
        {x: 4, y: 25}, {x: 15, y: 25},
    ];
    
    cells.forEach(c => {
        c.tags = c.tags || [];

        // Walls
        if (c.x === 0 || c.x === width - 1 || c.y === 0 || c.y === height - 1) {
            c.walkable = false;
            c.elevation = 2; // Walls are high
            c.maxOccupancy = 0;
            c.tags.push('wall');
        }
        // Pillars
        if (pillarCoords.some(p => Math.abs(c.x - p.x) < 1.5 && Math.abs(c.y - p.y) < 1.5)) {
             c.walkable = false;
             c.cover = 0.8;
             c.elevation = 2; // Pillars are high
             c.maxOccupancy = 0;
             c.tags.push('pillar', 'cover');
        }
        // Dais/Throne area
        if (c.y < 4 && c.x > 7 && c.x < 12) {
            c.walkable = true; // Dais is walkable but elevated
            c.danger = 0.2; // Exposed
            c.elevation = 0.5; // Slight elevation
            c.level = 1;
            c.tags.push('platform', 'dais');
        }
        if (c.y < 2 && c.x > 8 && c.x < 11) {
            c.walkable = false; // Throne itself
            c.cover = 0.5;
            c.elevation = 1; // Higher platform
            c.maxOccupancy = 0;
            c.tags.push('throne');
        }

        // Chokepoint before Dais
        if (c.y === 5 && c.x >= 7 && c.x <= 12) {
            c.maxOccupancy = 0.8;
            c.tags.push('chokepoint');
        }

        // Hazard Zone (e.g. Magic instability)
        if (c.x >= 16 && c.x <= 18 && c.y >= 25 && c.y <= 27) {
            c.danger = Math.max(c.danger, 0.4);
            c.hazards?.push({ kind: 'custom', intensity: 0.4 });
            c.tags.push('hazard_zone');
        }
    });

    const visuals: SvgShape[] = [
        // Floor
        { tag: 'rect', attrs: { x: 0, y: 0, width, height, fill: '#0c0c10' } },
        // Carpet
        { tag: 'rect', attrs: { x: 8, y: 4, width: 4, height: 26, fill: '#330000', opacity: 0.5 } },
        // Dais
        { tag: 'path', attrs: { d: 'M 7 4 L 13 4 L 14 0 L 6 0 Z', fill: '#111', stroke: '#444', 'stroke-width': 0.1 } },
        // Throne
        { tag: 'rect', attrs: { x: 9, y: 0.5, width: 2, height: 1.5, fill: '#1a1a2e', stroke: '#f59e0b', 'stroke-width': 0.1 } },
        // Pillars
        ...pillarCoords.map(p => ({
            tag: 'circle' as const,
            attrs: { cx: p.x + 0.5, cy: p.y + 0.5, r: 0.8, fill: '#222', stroke: '#444', 'stroke-width': 0.1 }
        })),
        // Lighting
        { tag: 'defs', attrs: {}, children: [
             { tag: 'radialGradient', attrs: { id: 'light_throne' }, children: [
                 { tag: 'stop', attrs: { offset: '0%', 'stop-color': '#00aaff', 'stop-opacity': 0.2 } as any},
                 { tag: 'stop', attrs: { offset: '100%', 'stop-color': '#000', 'stop-opacity': 0 } as any}
             ]}
        ]},
        { tag: 'circle', attrs: { cx: 10, cy: 2, r: 8, fill: 'url(#light_throne)' } }
    ];

    const exits: LocationMapExit[] = [
        { x: 9, y: 29, targetId: "ka_palace.corridor_north", label: "Main Exit" },
        { x: 10, y: 29, targetId: "ka_palace.corridor_north", label: "Main Exit" }
    ];

    return { id: 'throne_hall_map', width, height, cells, visuals, exits };
};

// 2. Small Council Map
const buildCouncilMap = (): LocationMap => {
    const width = 12;
    const height = 12;
    const cells = createGrid(width, height, true, {
        defaultLevel: 0,
        defaultElevation: 0,
        defaultMaxOccupancy: 1
    });
    
    cells.forEach(c => {
        c.tags = c.tags || [];

        // Table in center
        const dx = Math.abs(c.x - 5.5);
        const dy = Math.abs(c.y - 5.5);
        if (dx < 2.5 && dy < 3.5) {
            c.walkable = false;
            c.cover = 0.4;
            c.elevation = 0.8; // Table height
            c.maxOccupancy = 0;
            c.tags.push('table', 'cover');
        }
        // Walls
        if (c.x === 0 || c.x === width - 1 || c.y === 0 || c.y === height - 1) {
            c.walkable = false;
            c.elevation = 2;
            c.maxOccupancy = 0;
            c.tags.push('wall');
        }
        // Door
        if (c.y === height - 1 && c.x >= 5 && c.x <= 6) {
            c.walkable = true;
            c.elevation = 0;
            c.tags.push('door');
        }

        // Chokepoints (Narrow spaces around table)
        if (c.walkable && dx >= 2.5 && dx <= 3.5) {
            c.maxOccupancy = 0.6;
            c.tags.push('chokepoint');
        }
    });

    const visuals: SvgShape[] = [
        { tag: 'rect', attrs: { x: 0, y: 0, width, height, fill: '#151518' } },
        // Table (Oval)
        { tag: 'ellipse', attrs: { cx: 6, cy: 6, rx: 2.5, ry: 3.5, fill: '#2e1a0f', stroke: '#5c3a21', 'stroke-width': 0.2 } },
        // Chairs
        ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
             const angle = (i / 8) * Math.PI * 2;
             const cx = 6 + Math.cos(angle) * 3.5;
             const cy = 6 + Math.sin(angle) * 4.5;
             return { tag: 'circle' as const, attrs: { cx, cy, r: 0.5, fill: '#222' } };
        })
    ];

    const exits: LocationMapExit[] = [
         { x: 5, y: 11, targetId: "ka_palace.corridor_north", label: "Exit" },
         { x: 6, y: 11, targetId: "ka_palace.corridor_north", label: "Exit" }
    ];

    return { id: 'council_map', width, height, cells, visuals, exits };
};

// 3. Forum Plaza Map
const buildPlazaMap = (): LocationMap => {
    const width = 30;
    const height = 30;
    const cells = createGrid(width, height, true, {
        defaultLevel: 0, 
        defaultElevation: 0,
        defaultMaxOccupancy: 2.0 // Open space
    });
    
    cells.forEach(c => {
        c.tags = c.tags || [];

        // Fountain in center
        const dist = Math.sqrt((c.x - 15) ** 2 + (c.y - 15) ** 2);
        if (dist < 4) {
            c.walkable = false;
            c.cover = 0.5;
            c.elevation = 1; // Fountain walls
            c.maxOccupancy = 0;
            c.tags.push('fountain', 'cover');
        }
        // Market stalls on edges
        if ((c.x < 3 || c.x > 26) && c.y % 4 !== 0) {
             c.walkable = false;
             c.cover = 0.8;
             c.elevation = 2; // Stalls
             c.maxOccupancy = 0;
             c.tags.push('stall', 'cover');
        }
        // Open ground danger
        if (dist > 5 && dist < 12) {
            c.danger = 0.3; // Exposed
            c.tags.push('open_ground');
        }

        // Wet floor hazard near fountain
        if (dist >= 4 && dist <= 5.5) {
            c.danger = Math.max(c.danger, 0.4);
            c.hazards?.push({ kind: 'custom', intensity: 0.3 }); // Slippery
            c.tags.push('hazard_zone');
        }

        // Narrow paths between stalls
        if ((c.x === 3 || c.x === 26) && c.y % 4 !== 0) {
            c.maxOccupancy = 0.6;
            c.tags.push('chokepoint');
        }
    });

    const visuals: SvgShape[] = [
        { tag: 'rect', attrs: { x: 0, y: 0, width, height, fill: '#0a0a0a' } },
        // Fountain
        { tag: 'circle', attrs: { cx: 15, cy: 15, r: 4, fill: '#112233', stroke: '#334455' } },
        { tag: 'circle', attrs: { cx: 15, cy: 15, r: 2, fill: '#224466' } },
        // Stalls
        { tag: 'rect', attrs: { x: 0.5, y: 4, width: 2, height: 22, fill: 'none', stroke: '#444', 'stroke-dasharray': '2 2' } },
        { tag: 'rect', attrs: { x: 27.5, y: 4, width: 2, height: 22, fill: 'none', stroke: '#444', 'stroke-dasharray': '2 2' } },
    ];
    
    const exits: LocationMapExit[] = [
        { x: 15, y: 0, targetId: "ka_city.main_street", label: "Main St." },
        { x: 15, y: 29, targetId: "ka_city.lower_corridors", label: "Lower Levels" }
    ];

    return { id: 'plaza_map', width, height, cells, visuals, exits };
};

// 4. Lower Corridors Map (Updated)
const buildLowerCorridorsMap = (): LocationMap => {
    const width = 24;
    const height = 24;
    const cells: LocationMapCell[] = [];
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let walkable = false;
            let cover = 0;
            let danger = 0;
            let elevation = 2; // Rock by default
            let maxOccupancy = 0;
            let hazards: any[] = [];
            let tags: string[] = [];
            let level = 0;
            
            // Main vertical tunnel
            const center = 12 + Math.floor(Math.sin(y * 0.3) * 4);
            const tunnelWidth = (y > 8 && y < 16) ? 3 : 2;
            
            if (x >= center - tunnelWidth && x <= center + tunnelWidth) {
                walkable = true;
                danger = 0.2; 
                elevation = 0; // Floor
                maxOccupancy = 1;
                tags.push('corridor');
            }
            // Cross tunnel
            if (y >= 10 && y <= 14 && x > 2 && x < 22) {
                 walkable = true;
                 danger = 0.3;
                 elevation = 0;
                 maxOccupancy = 1;
                 tags.push('corridor');
            }
            // Chamber collapse
            if (x >= 13 && x <= 15 && y >= 12 && y <= 13) {
                walkable = false;
                cover = 0.9; 
                elevation = 1; // Debris pile
                maxOccupancy = 0;
                hazards.push({ kind: 'structural_collapse', intensity: 0.8 });
                tags.push('rubble', 'cover');
            }
            // Corners
            if (walkable && (x < center - 1.5 || x > center + 1.5)) {
                cover = 0.7;
                danger = 0.4;
                tags.push('corner');
            }
            // Pit
            if (x === 10 && y === 18) {
                walkable = true;
                danger = 0.9; 
                cover = 0;
                elevation = -2; // Pit!
                hazards.push({ kind: 'fall', intensity: 0.9 });
                tags.push('pit');
            }

            cells.push({ x, y, walkable, danger, cover, elevation, maxOccupancy, hazards, level, tags });
        }
    }

    const visuals: SvgShape[] = [
        { tag: 'rect', attrs: { x: 0, y: 0, width, height, fill: '#050505' } },
        { tag: 'path', attrs: { d: `M 10 0 C 8 6, 16 8, 14 12 C 12 16, 8 18, 10 24 L 14 24 C 12 18, 16 16, 18 12 C 20 8, 12 6, 14 0 Z`, fill: '#151515' }},
        { tag: 'path', attrs: { d: 'M 2 10 L 22 10 L 22 14 L 2 14 Z', fill: '#151515' }},
        { tag: 'circle', attrs: { cx: 10.5, cy: 18.5, r: 1.5, fill: '#000', stroke: '#300', 'stroke-width': 0.2 } }, // Pit
        { tag: 'path', attrs: { d: 'M 13 12 L 15 13', stroke: '#444', 'stroke-width': 0.5 } } // Debris
    ];
    
    const exits: LocationMapExit[] = [
        { x: 12, y: 0, targetId: "ka_city.forum_plaza", label: "To Plaza" },
        { x: 12, y: 23, targetId: "ka_palace.hidden_corridor", label: "To Palace" }
    ];

    return { id: 'lower_corridors_map', width, height, cells, visuals, exits };
};

// 5. Private Quarters (Detailed - Safe sanctuary)
const buildTeganQuartersMap = (): LocationMap => {
    const width = 20;
    const height = 16;
    const cells = createGrid(width, height, true, {
        defaultLevel: 0,
        defaultElevation: 0,
        defaultMaxOccupancy: 0.8
    });
    
    cells.forEach(c => {
        c.tags = c.tags || [];

        // Outer Walls
        if (c.x === 0 || c.x === width - 1 || c.y === 0 || c.y === height - 1) {
             c.walkable = false;
             c.elevation = 2;
             c.maxOccupancy = 0;
             c.tags.push('wall');
        }
        // Door
        if (c.y === height - 1 && c.x >= 8 && c.x <= 11) {
            c.walkable = true;
            c.elevation = 0;
            c.tags.push('door');
        }
        // Desk
        if (c.y >= 2 && c.y <= 4 && c.x >= 8 && c.x <= 11) { 
            c.walkable = false; 
            c.cover = 0.9; 
            c.elevation = 0.8;
            c.maxOccupancy = 0;
            c.tags.push('desk', 'cover');
        }
        // Bed
        if (c.y >= 2 && c.y <= 6 && c.x >= 2 && c.x <= 5) { 
            c.walkable = false; 
            c.cover = 0.6; 
            c.elevation = 0.5;
            c.maxOccupancy = 0; 
            c.tags.push('bed');
        }
        
        // Window/Balcony (Minimal danger if guarded)
        if (c.y === 0 && c.x >= 14 && c.x <= 18) {
            c.danger = 0.1;
            c.tags.push('balcony');
        }
    });

    const visuals: SvgShape[] = [
        { tag: 'rect', attrs: { x: 0, y: 0, width, height, fill: '#12121a' } },
        { tag: 'rect', attrs: { x: 6, y: 6, width: 8, height: 7, fill: '#2e1a36', rx: 0.5 } }, // Rug
        { tag: 'rect', attrs: { x: 7.5, y: 2.5, width: 5, height: 2, fill: '#0f0f1a', stroke: '#333', 'stroke-width': 0.1, rx: 0.2 } }, // Desk
        { tag: 'circle', attrs: { cx: 10, cy: 2.2, r: 0.6, fill: '#1a1a1a' } }, // Chair
        { tag: 'rect', attrs: { x: 2, y: 2, width: 3.5, height: 4.5, fill: '#181820', stroke: '#222' } }, // Bed
        // Walls
        { tag: 'path', attrs: { d: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`, fill: 'none', stroke: '#08080c', 'stroke-width': 1 }},
    ];
    
    const exits: LocationMapExit[] = [
        { x: 9, y: 15, targetId: "ka_palace.corridor_north", label: "Exit" }
    ];

    return { id: 'tegan_quarters_map', width, height, cells, visuals, exits };
};

// 6. Hidden Corridor
const buildHiddenCorridorMap = (): LocationMap => {
    const width = 8;
    const height = 20;
    const cells = createGrid(width, height, true, {
        defaultLevel: 0,
        defaultElevation: 0,
        defaultMaxOccupancy: 0.5 // Very narrow
    });
    
    cells.forEach(c => {
        c.tags = c.tags || [];

        if (c.x < 2 || c.x > 5) {
            c.walkable = false; 
            c.elevation = 2; // Rock walls
            c.maxOccupancy = 0;
            c.tags.push('wall');
        }
        if (c.y === 10 && c.x > 5) { 
            c.walkable = false; 
            c.cover = 1.0; 
            c.elevation = 0; // Mechanism wall
            c.maxOccupancy = 0;
            c.tags.push('mechanism');
        }
        // Narrow path chokepoint
        if (c.walkable) {
            c.maxOccupancy = 0.5; // Narrow, one person at a time
            c.tags.push('chokepoint', 'secret');
        }
    });
    
    const visuals: SvgShape[] = [
        { tag: 'rect', attrs: { x: 0, y: 0, width, height, fill: '#000' } },
        { tag: 'rect', attrs: { x: 2, y: 0, width: 4, height, fill: '#1a1a1a' } },
        { tag: 'path', attrs: { d: 'M 2 0 V 20 M 6 0 V 20', stroke: '#333', 'stroke-width': 0.2, 'stroke-dasharray': '0.5 0.5' } }
    ];
    
    const exits: LocationMapExit[] = [
        { x: 3, y: 0, targetId: "ka_palace.rheindottir_lab", label: "Lab" },
        { x: 3, y: 19, targetId: "ka_city.lower_corridors", label: "Tunnels" }
    ];

    return { id: 'hidden_corridor_map', width, height, cells, visuals, exits };
};


export const allLocations: LocationEntity[] = [
  // ... Other locations
  {
    entityId: "ka_palace.throne_hall",
    type: EntityType.Location,
    title: "Тронный зал",
    versionTags: [Branch.Current],
    kind: "hall",
    geometry: { 
        shape: "rect", 
        area: 600, 
        capacity: 200,
        anchor: { x: 0.5, y: 0.2 }, 
        zIndex: 2
    },
    properties: { privacy: "public", control_level: 0.95, visibility: 0.95, noise: 0.25 },
    state: { locked: false, damaged: false, crowd_level: 0.3, alert_level: 0.4 },
    connections: { "ka_palace.corridor_north": { distance: 12, difficulty: 1 } },
    affordances: {
        allowedActions: ["observe", "issue_order", "support_leader", "intimidate"],
        forbiddenActions: ["rest", "hide"]
    },
    map: buildThroneHallMap(),
    physics: {
      mobilityCost: 1,
      collisionRisk: 0.1,
      climbable: false,
      jumpable: false,
      crawlable: false,
      weightLimit: 1000,
      environmentalStress: 0.1,
      acousticsProfile: { echo: 0.8, dampening: 0.2 },
    },
    narrativeTension: { value: 0.7, growthRate: 0.1, decayRate: 0.05, incidentProbability: 0.2 },
    ownership: {
      ownerFaction: 'royal_guard',
      authority: ['character-tegan-nots'],
      accessRights: [],
      securityLevel: 0.8
    },
    affect: { anxiety: 0.3, hope: 0.7, shame: 0.1, awe: 0.9, intimacy: 0 },
    contextModes: [],
    hazards: [],
    triggers: [],
    crowd: { populationDensity: 0.2, npcNoiseLevel: 0.3, behaviors: [] },
    tomModifier: { noise: 0.1, authorityBias: 0.3, misinterpretationChance: 0.1, privacyBias: -0.5 },
    riskReward: { riskIndex: 0.3, rewardIndex: 0.8, safePaths: [], dangerPaths: [], resourceOpportunities: [] }
  },
  {
    entityId: "ka_palace.council_room",
    type: EntityType.Location,
    title: "Малый Совет",
    versionTags: [Branch.Current],
    kind: "meeting_room",
    geometry: { shape: "round", area: 150, capacity: 15, zIndex: 2 },
    properties: { privacy: "semi", control_level: 0.8, visibility: 0.5, noise: 0.1 },
    state: { locked: true, damaged: false, crowd_level: 0.1, alert_level: 0.2 },
    connections: { "ka_palace.corridor_north": { distance: 5, difficulty: 1 } },
    affordances: { allowedActions: ["share_information", "persuade", "assign_role", "blame_other"] },
    map: buildCouncilMap(),
    physics: {
      mobilityCost: 1,
      collisionRisk: 0.05,
      climbable: false,
      jumpable: false,
      crawlable: false,
      weightLimit: 500,
      environmentalStress: 0,
      acousticsProfile: { echo: 0.2, dampening: 0.8 },
    },
    contextModes: [{ id: 'strategic_planning', label: 'Совет' }],
    ownership: { ownerFaction: 'royal', authority: [], accessRights: [], securityLevel: 0.9 },
    tomModifier: { noise: 0.1, misinterpretationChance: 0.1, authorityBias: 0.4, privacyBias: 0.2 },
    hazards: [],
    triggers: [],
    crowd: { populationDensity: 0.1, npcNoiseLevel: 0.1, behaviors: [] },
    affect: { anxiety: 0.2, hope: 0.4, shame: 0.1, awe: 0.4, intimacy: 0.1 },
    riskReward: { riskIndex: 0.2, rewardIndex: 0.7, safePaths: [], dangerPaths: [], resourceOpportunities: [] }
  },
  {
    entityId: "ka_city.forum_plaza",
    type: EntityType.Location,
    title: "Форумная Площадь",
    versionTags: [Branch.Current],
    kind: "plaza",
    geometry: { shape: "open", area: 2000, capacity: 500, zIndex: 1 },
    properties: { privacy: "public", control_level: 0.4, visibility: 0.9, noise: 0.8 },
    state: { locked: false, damaged: false, crowd_level: 0.8, alert_level: 0.3 },
    connections: { 
        "ka_palace.gate": { distance: 50, difficulty: 1 },
        "ka_city.main_street": { distance: 10, difficulty: 1 }
    },
    affordances: { allowedActions: ["observe", "reassure_group", "form_subgroup", "hide"] },
    map: buildPlazaMap(),
    physics: {
      mobilityCost: 1,
      collisionRisk: 0.6,
      climbable: true,
      jumpable: true,
      crawlable: false,
      weightLimit: 2000,
      environmentalStress: 0.2,
      acousticsProfile: { echo: 0.4, dampening: 0.1 },
    },
    crowd: { populationDensity: 0.7, npcNoiseLevel: 0.8, behaviors: [] },
    affect: { anxiety: 0.4, hope: 0.6, shame: 0, awe: 0.3, intimacy: 0 },
    ownership: { ownerFaction: null, authority: [], accessRights: [], securityLevel: 0.2 },
    contextModes: [{ id: 'social_arena', label: 'Арена' }],
    hazards: [{ kind: 'custom', intensity: 0.2 }],
    triggers: [],
    tomModifier: { noise: 0.3, misinterpretationChance: 0.2, authorityBias: 0.1, privacyBias: -0.3 },
    riskReward: { riskIndex: 0.3, rewardIndex: 0.3, safePaths: [], dangerPaths: [], resourceOpportunities: [] }
  },
  {
    entityId: "ka_city.lower_corridors",
    type: EntityType.Location,
    title: "Нижние коридоры",
    versionTags: [Branch.Current],
    kind: "tunnels",
    geometry: { shape: "complex", area: 800, capacity: 50, zIndex: 0 },
    properties: { privacy: "semi", control_level: 0.2, visibility: 0.3, noise: 0.4 },
    state: { locked: false, damaged: true, crowd_level: 0.1, alert_level: 0.6 },
    connections: { "ka_city.forum_plaza": { distance: 30, difficulty: 2 } },
    affordances: { allowedActions: ["hide", "search_route", "clear_debris", "attack"] },
    map: buildLowerCorridorsMap(),
    physics: {
      mobilityCost: 1.5,
      collisionRisk: 0.3,
      climbable: true,
      jumpable: true,
      crawlable: true,
      weightLimit: 300,
      environmentalStress: 0.5,
      acousticsProfile: { echo: 0.9, dampening: 0 },
    },
    hazards: [
        { kind: 'structural_collapse', intensity: 0.8 },
        { kind: 'fall', intensity: 0.9 }
    ],
    narrativeTension: { value: 0.6, growthRate: 0.1, decayRate: 0.02, incidentProbability: 0.4 },
    ownership: { ownerFaction: null, authority: [], accessRights: [], securityLevel: 0.1 },
    contextModes: [{ id: 'physical_survival', label: 'Выживание' }],
    triggers: [],
    crowd: { populationDensity: 0.1, npcNoiseLevel: 0.3, behaviors: [] },
    affect: { anxiety: 0.7, hope: 0.1, shame: 0, awe: 0.1, intimacy: 0.1 },
    tomModifier: { noise: 0.4, misinterpretationChance: 0.3, authorityBias: 0, privacyBias: 0.2 },
    riskReward: { riskIndex: 0.8, rewardIndex: 0.2, safePaths: [], dangerPaths: [], resourceOpportunities: [] }
  },
  {
    entityId: "ka_palace.tegan_quarters",
    type: EntityType.Location,
    title: "Покои",
    versionTags: [Branch.Current],
    kind: "room",
    tags: ["module_only", "private", "safe_hub"],
    geometry: { shape: "rect", area: 120, capacity: 5, zIndex: 3 },
    properties: { privacy: "private", control_level: 1.0, visibility: 0.1, noise: 0.05 },
    state: { locked: true, damaged: false, crowd_level: 0, alert_level: 0 },
    connections: { "ka_palace.corridor_north": { distance: 8, difficulty: 1 } },
    affordances: { allowedActions: ["rest", "offer_private_support", "share_personal_belief"] },
    map: buildTeganQuartersMap(),
    physics: {
      mobilityCost: 1,
      collisionRisk: 0,
      climbable: false,
      jumpable: false,
      crawlable: false,
      weightLimit: 200,
      environmentalStress: 0,
      acousticsProfile: { echo: 0.1, dampening: 0.9 },
    },
    ownership: { ownerFaction: 'royal', authority: ['character-tegan-nots'], accessRights: [], securityLevel: 1.0 },
    contextModes: [{ id: 'intimate_dyad', label: 'Приват' }],
    affect: { anxiety: 0, hope: 0.5, shame: 0.1, awe: 0, intimacy: 0.9 },
    hazards: [],
    triggers: [],
    crowd: { populationDensity: 0, npcNoiseLevel: 0, behaviors: [] },
    tomModifier: { noise: 0.05, misinterpretationChance: 0.1, authorityBias: 0.8, privacyBias: 0.8 },
    riskReward: { riskIndex: 0, rewardIndex: 0.6, safePaths: [], dangerPaths: [], resourceOpportunities: [] },
    worldIntegration: { worldPressure: 0, signalQuality: 1, supplyState: 1, politicalTemperature: 0.5 },
    schedule: [],
    timeModes: [],
    history: { events: [], isTainted: false, isSanctuary: true }
  },
  {
    entityId: "ka_palace.hidden_corridor",
    type: EntityType.Location,
    title: "Скрытый переход",
    versionTags: [Branch.Current],
    kind: "corridor",
    tags: ["secret", "module_only"],
    geometry: { shape: "narrow", area: 40, capacity: 2, zIndex: 0 },
    properties: { privacy: "private", control_level: 0.1, visibility: 0.1, noise: 0.1 },
    state: { locked: true, damaged: false, crowd_level: 0, alert_level: 0.2 },
    connections: { 
        "ka_palace.tegan_quarters": { distance: 15, difficulty: 2 },
        "ka_city.lower_corridors": { distance: 50, difficulty: 3 }
    },
    affordances: { allowedActions: ["hide", "escape", "observe"] },
    map: buildHiddenCorridorMap(),
    physics: {
      mobilityCost: 1.2,
      collisionRisk: 0.4,
      climbable: true,
      jumpable: false,
      crawlable: true,
      weightLimit: 150,
      environmentalStress: 0.3,
      acousticsProfile: { echo: 0.3, dampening: 0.5 },
    },
    ownership: { ownerFaction: null, authority: [], accessRights: [], securityLevel: 0.9 },
    riskReward: { riskIndex: 0.4, rewardIndex: 0.8, safePaths: [], dangerPaths: [], resourceOpportunities: [] },
    contextModes: [{ id: 'stealth', label: 'Скрытность' }],
    hazards: [],
    triggers: [],
    crowd: { populationDensity: 0, npcNoiseLevel: 0.2, behaviors: [] },
    affect: { anxiety: 0.5, hope: 0.2, shame: 0, awe: 0.2, intimacy: 0.4 },
    tomModifier: { noise: 0.2, misinterpretationChance: 0.3, authorityBias: 0, privacyBias: 0.7 },
    worldIntegration: { worldPressure: 0, signalQuality: 1, supplyState: 1, politicalTemperature: 0.5 },
    schedule: [],
    timeModes: [],
    history: { events: [], isTainted: false, isSanctuary: false }
  },
  // --- TEST LOCATIONS (debug atom codex / hazards / ctx axes) ---
  {
    entityId: "test.safe_room",
    type: EntityType.Location,
    title: "TEST: Safe Room",
    versionTags: [Branch.Current],
    kind: "test_room",
    geometry: { shape: "rect", area: 80, capacity: 3, zIndex: 10 },
    properties: {
      privacy: "private",
      control_level: 0.1,
      visibility: 0.2,
      noise: 0.05,
      // explicit fields used by locationAtoms.ts fallbacks:
      social_visibility: 0.05,
      normative_pressure: 0.05,
    } as any,
    state: { locked: false, damaged: false, crowd_level: 0, alert_level: 0 } as any,
    connections: { "test.minefield": { distance: 5, difficulty: 1 } } as any,
    affordances: { allowedActions: ["rest", "hide", "observe"], forbiddenActions: [] } as any,
    map: buildTestSafeRoomMap(),
    physics: { mobilityCost: 1, collisionRisk: 0, climbable: false, jumpable: false, crawlable: false, weightLimit: 300, environmentalStress: 0 } as any,
    hazards: [],
    triggers: [],
    crowd: { populationDensity: 0, npcNoiseLevel: 0, behaviors: [] } as any,
    tomModifier: { noise: 0.05, authorityBias: 0, misinterpretationChance: 0.02, privacyBias: 0.6 } as any,
    riskReward: { riskIndex: 0.05, rewardIndex: 0.2, safePaths: [], dangerPaths: [], resourceOpportunities: [] } as any,
  },
  {
    entityId: "test.minefield",
    type: EntityType.Location,
    title: "TEST: Minefield",
    versionTags: [Branch.Current],
    kind: "test_hazard_zone",
    geometry: { shape: "open", area: 160, capacity: 10, zIndex: 10 },
    properties: {
      privacy: "public",
      control_level: 0.2,
      visibility: 0.95,
      noise: 0.4,
      social_visibility: 0.9,
      normative_pressure: 0.2,
    } as any,
    state: { locked: false, damaged: false, crowd_level: 0.1, alert_level: 0.2 } as any,
    connections: { "test.safe_room": { distance: 5, difficulty: 2 } } as any,
    affordances: { allowedActions: ["observe", "move", "escape"], forbiddenActions: ["rest"] } as any,
    map: buildTestMinefieldMap(),
    physics: { mobilityCost: 1.2, collisionRisk: 0.05, climbable: false, jumpable: false, crawlable: false, weightLimit: 300, environmentalStress: 0.2 } as any,
    hazards: [{ kind: 'minefield', intensity: 0.6 }],
    triggers: [],
    crowd: { populationDensity: 0.1, npcNoiseLevel: 0.1, behaviors: [] } as any,
    tomModifier: { noise: 0.2, authorityBias: 0, misinterpretationChance: 0.08, privacyBias: -0.2 } as any,
    riskReward: { riskIndex: 0.9, rewardIndex: 0.1, safePaths: [], dangerPaths: [], resourceOpportunities: [] } as any,
  },
  DEMO_LOCATION
];
