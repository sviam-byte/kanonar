// lib/mafia/roles.ts
//
// Role catalog. Minimal MVP set: Mafia, Citizen, Sheriff, Doctor.

import type { RoleId, RoleSpec, Team } from './types';

export const ROLES: Record<RoleId, RoleSpec> = {
  mafia: {
    id: 'mafia',
    team: 'mafia',
    hasNightAction: true,
    knowsTeammates: true,
    description: 'Knows other mafia. Votes to kill one target each night.',
  },
  citizen: {
    id: 'citizen',
    team: 'town',
    hasNightAction: false,
    knowsTeammates: false,
    description: 'No night action. Votes during day.',
  },
  sheriff: {
    id: 'sheriff',
    team: 'town',
    hasNightAction: true,
    knowsTeammates: false,
    description: 'Each night checks one player, learns their team.',
  },
  doctor: {
    id: 'doctor',
    team: 'town',
    hasNightAction: true,
    knowsTeammates: false,
    description: 'Each night heals one player; if target was mafia kill, they survive.',
  },
};

export function roleTeam(role: RoleId): Team {
  return ROLES[role].team;
}

export function isMafia(role: RoleId): boolean {
  return role === 'mafia';
}

export function isTown(role: RoleId): boolean {
  return ROLES[role].team === 'town';
}

/** Default distribution for N players. */
export function defaultDistribution(nPlayers: number): Record<RoleId, number> {
  // Classic proportions
  if (nPlayers < 4) {
    throw new Error(`Mafia requires at least 4 players, got ${nPlayers}`);
  }
  // mafia ≈ 1/4 of total, rounded
  const mafiaCount = Math.max(1, Math.floor(nPlayers / 4));
  const sheriffCount = nPlayers >= 5 ? 1 : 0;
  const doctorCount = nPlayers >= 6 ? 1 : 0;
  const citizenCount = nPlayers - mafiaCount - sheriffCount - doctorCount;

  if (citizenCount < 0) {
    throw new Error(`Bad distribution for ${nPlayers} players`);
  }

  return {
    mafia: mafiaCount,
    sheriff: sheriffCount,
    doctor: doctorCount,
    citizen: citizenCount,
  };
}

/** Validate that distribution sums to player count. */
export function validateDistribution(
  dist: Record<RoleId, number>,
  nPlayers: number
): void {
  const sum = (Object.values(dist) as number[]).reduce((a, b) => a + b, 0);
  if (sum !== nPlayers) {
    throw new Error(`Distribution sums to ${sum}, expected ${nPlayers}`);
  }
  if (dist.mafia < 1) {
    throw new Error('Distribution must have at least 1 mafia');
  }
  if (dist.mafia >= nPlayers - dist.mafia) {
    throw new Error('Mafia must be outnumbered by town at start');
  }
}
