// /lib/social/roles.ts

import { CharacterEntity } from '../../types';
import { listify } from '../utils/listify';

// --- TYPE DEFINITIONS ---

export type GlobalRoleId =
  | "commander" | "frontliner" | "advisor"
  | "operative" | "asset" | "civilian" | "prisoner" | "caretaker" | "devoted";

export interface GlobalRoleEffects {
  deltaDom?: number;
  deltaProtocol?: number;
  deltaRiskCVar?: number;
  deltaPhiMax?: number;
  baseGoals?: Record<string, number>; // добавка к initial_goals
}

export type DyadicRoleId =
  | "mentor_of" | "protege_of"
  | "commander_of" | "subordinate_of"
  | "caretaker_of" | "ward_of"
  | "ally_of" | "rival_of" | "enemy_of";

export interface DyadicRoleEffects {
  trust0?: number;
  bond0?: number;
  align0?: number;
  phiCap?: number;          // максимум φ_{j←i}
  costRefuse?: number;      // доп. стоимость неповиновения
  costHarm?: number;        // доп. стоимость навредить j
  protectGoalBoost?: number; // добавка к цели "protect_j"
}


// --- ROLE EFFECT CONSTANTS ---

export const GLOBAL_ROLE_EFFECTS: Record<GlobalRoleId, GlobalRoleEffects> = {
  commander: {
    deltaDom: +0.3,
    deltaProtocol: +0.2,
    deltaRiskCVar: +0.1,
    deltaPhiMax: -0.2,
    baseGoals: { maintain_legitimacy: 0.6, faction_loyalty: 0.4 }
  },
  frontliner: {
    deltaDom: +0.1,
    deltaRiskCVar: +0.2,
    baseGoals: { mission_success: 0.5, self_preservation: 0.3 }
  },
  caretaker: {
    deltaDom: 0,
    deltaProtocol: +0.1,
    deltaRiskCVar: -0.1,
    baseGoals: { protect_wards: 0.7 }
  },
  devoted: {
    deltaDom: -0.2,
    deltaProtocol: +0.1,
    deltaPhiMax: +0.3,
    baseGoals: { protect_liege: 0.8 }
  },
  advisor: {
    deltaDom: -0.1,
    deltaProtocol: +0.1,
    deltaPhiMax: -0.1,
    baseGoals: { provide_counsel: 0.7 }
  },
  operative: {
    deltaDom: +0.1,
    deltaRiskCVar: +0.1,
    baseGoals: { execute_mission: 0.8 }
  },
  asset: {
    deltaDom: -0.3,
    deltaPhiMax: +0.2,
    baseGoals: { provide_intel: 0.6 }
  },
  civilian: {
    deltaDom: -0.4,
    deltaRiskCVar: -0.3,
    baseGoals: { self_preservation: 0.8 }
  },
  prisoner: {
    deltaDom: -0.8,
    deltaPhiMax: +0.4,
    baseGoals: { escape: 0.9 }
  },
};

export const DYADIC_ROLE_EFFECTS: Record<DyadicRoleId, DyadicRoleEffects> = {
  mentor_of: { phiCap: 0.3, costRefuse: 0.2 },
  protege_of: { trust0: 0.8, bond0: 0.9, align0: 0.7, phiCap: 0.8, costRefuse: 0.5, protectGoalBoost: 0.6 },
  commander_of: { bond0: 0.3, align0: 0.6, phiCap: 0.2, costHarm: -0.3 },
  subordinate_of: { trust0: 0.7, bond0: 0.7, align0: 0.8, phiCap: 0.9, costRefuse: 0.8, protectGoalBoost: 0.3 },
  caretaker_of: { trust0: 0.7, bond0: 0.9, align0: 0.6, phiCap: 0.2, costHarm: 1.0, protectGoalBoost: 0.8 },
  ward_of: { trust0: 0.9, bond0: 0.95, align0: 0.7, phiCap: 0.9, costRefuse: 0.7, protectGoalBoost: 0.4 },
  ally_of: { trust0: 0.6, bond0: 0.5, align0: 0.7, phiCap: 0.4 },
  rival_of: { trust0: 0.2, bond0: 0.1, align0: 0.3, phiCap: 0.05, costHarm: -0.2 },
  enemy_of: { trust0: 0.0, bond0: 0.0, align0: 0.0, phiCap: 0.0, costRefuse: 0.0, costHarm: -0.5 },
};


// --- UTILITY FUNCTIONS ---

/**
 * Applies modifications from global roles to a character's parameters.
 * @param character The character card.
 * @returns An object with boosts for phiMax and goal activations.
 */
export function applyGlobalRoles(
  character: CharacterEntity
): { phiMaxBoost: number; baseGoalBoosts: Record<string, number> } {
  let phiMaxBoost = 0;
  const baseGoalBoosts: Record<string, number> = {};

  for (const roleId of listify(character.roles?.global)) {
    const effects = GLOBAL_ROLE_EFFECTS[roleId as GlobalRoleId];
    if (!effects) continue;

    if (effects.deltaPhiMax) {
        phiMaxBoost += effects.deltaPhiMax;
    }
    if (effects.baseGoals) {
      for (const [goalId, value] of Object.entries(effects.baseGoals)) {
        baseGoalBoosts[goalId] = (baseGoalBoosts[goalId] || 0) + value;
      }
    }
  }
  return { phiMaxBoost, baseGoalBoosts };
}

/**
 * Retrieves the defined effects for a dyadic relationship from a character's perspective.
 * @param observerCard The character observing.
 * @param targetId The ID of the character being observed.
 * @returns The effects object or null if no specific role is defined.
 */
export function getPairRoleEffects(
  observerCard: CharacterEntity,
  targetId: string
): DyadicRoleEffects | null {
  const rel = observerCard.roles?.relations?.find(r => r.other_id === targetId);
  if (!rel) return null;
  return DYADIC_ROLE_EFFECTS[rel.role as DyadicRoleId] ?? null;
}
