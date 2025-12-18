import { Atom } from './types';

export function getM(resolved: Map<string, Atom>, id: string, fallback = 0): number {
  return resolved.get(id)?.m ?? fallback;
}

export function getC(resolved: Map<string, Atom>, id: string, fallback = 0): number {
  return resolved.get(id)?.c ?? fallback;
}

/** Helper for trace: list used IDs filtering nulls */
export function used(...ids: (string | undefined)[]) {
  return ids.filter(Boolean) as string[];
}
