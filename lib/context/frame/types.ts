
// lib/context/frame/types.ts

// Кто / что / где / когда / почему — единый фрейм

import type { TomDyadReport } from '../../tom/v3/types';
import type { ContextTuning } from '../../../types';

export interface TomRelationView {
  targetId: string;
  trust: number;
  align: number;
  threat: number;
  respect: number;
  affection: number;
  
  // Extended fields
  roleTag?: string;       // ward_of, lover, enemy, friend, commander, etc.
  label?: string;         // человекочитаемо: "мой король", "мой враг"
  closeness?: number;     // 0..1
  attachment?: number;    // 0..1
  dominance?: number;     // 0..1 perceived dominance
}

export interface TomPhysicalSelf {
  hpEstimate: number;        // 0..1
  staminaEstimate: number;   // 0..1
  painEstimate: number;      // 0..1
  mobilityEstimate: number;  // 0..1
  isSeverelyWounded: boolean;
  isCombatCapable: boolean;
  confidence: number;        // 0..1
}

export interface TomPhysicalOther {
  targetId: string;
  name: string;
  hpEstimate: number;        // 0..1
  painEstimate: number;      // 0..1
  mobilityEstimate: number;  // 0..1
  isSeverelyWounded: boolean;
  isCombatCapable: boolean;
  confidence: number;        // 0..1
}

export interface NearbyAgentSummary {
  id: string;
  name: string;
  faction?: string;
  role?: string;
  distanceRaw?: number | null;   // в клетках/метрах
  distance: number;              // effective distance
  distanceNorm?: number | null;  // [0,1]
  isSameLocation?: boolean;
  isWounded: boolean;
  mapHazardThere?: number;
}

export interface ContextEventSummary {
  id: string;
  kind: string;         // "combat", "order", "dialog", ...
  tick: number;           // tick или time
  intensity?: number;   // [0,1]
  tags?: string[];      // "injury", "betrayal", ...
  actors?: string[];    // ids агентов
  locationId?: string;
}

export interface ActiveOrder {
  id: string;
  kind: string;          // "protect", "attack", "evacuate", ...
  issuerId?: string;
  targetAgentId?: string;
  targetLocationId?: string;
  priority?: number;     // [0,1]
  isMandatory?: boolean;
  tags?: string[];
  summary?: string;
}

export interface AgentContextFrame {
  tick: number;

  meta: {
    scenarioId: string;
    sceneId?: string;
  };

  who: {
    agentId: string;
    entityId: string;
    name: string;
    archetypes: string[];
    roles: string[];
    factions: string[];
  };

  where: {
    locationId: string | null;
    locationName: string | null;
    locationTags: string[];
    regionId: string;
    map: {
      hasMap: boolean;
      cell: { x: number; y: number } | undefined;
      hazard: number;
      cover: number;
      nearestHazardDist: number | null;
      exits: { x: number; y: number }[];
    };
  };

  when: {
    timeOfDay: "night" | "morning" | "day" | "evening" | "dawn" | "dusk";
    phase: string;
  };

  what: {
    nearbyAgents: NearbyAgentSummary[];
    recentEvents: ContextEventSummary[];
    localWoundedCount: number;
    sceneWoundedCount: number;
    localThreatRaw: number;
    sceneThreatRaw: number;
    contextTuning?: ContextTuning;
  };

  how: {
    physical: {
      hp: number;
      stamina: number;
      isWounded: boolean;
      canMove: boolean;
      isArmed: boolean;
    };
    affect: {
      arousal: number;
      valence: number;
      fear: number;
      anger: number;
      shame: number;
      pride: number;
    };
    resources: {
      ammo?: number;
      medkits?: number;
      [k: string]: number | undefined;
    };
  };

  why: {
    activeOrders: ActiveOrder[];
    longTermGoals: string[];      // id целей
    currentTaskLabel?: string;    // текстовая/идшная метка
    narrativeFlags: string[];     // "after_battle", "before_festival" и т.п.
  };

  social: {
    allyCountNearby: number;
    enemyCountNearby: number;
    maxAllyCloseness: number | null;
    maxEnemyCloseness: number | null;
    isAlone: boolean;
  };

  tom?: {
    relations: TomRelationView[];
    physicalSelf: TomPhysicalSelf;
    physicalOthers: TomPhysicalOther[];
    reports?: Record<string, TomDyadReport>; // New field for V3 reports
  };

  derived?: {
    threatIndex: number;
    safetyIndex: number;
    supportIndex: number;
    lonelinessIndex: number;
    history?: {
        threatDelta: number;
        woundedDelta: number;
    };
  };
}
