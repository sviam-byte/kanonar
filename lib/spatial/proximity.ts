
// lib/spatial/proximity.ts
import { clamp01 } from "../threat/threatStack";

export type Vec2 = { x: number; y: number };

export type AgentLite = {
  id: string;
  pos: Vec2;
  // trust to ME (0..1) — если есть
  trustToMe?: number;
  // hostility to ME (0..1) — если есть
  hostileToMe?: number;
};

export type ProximityResult = {
  nearbyCountNorm: number;     // 0..1
  nearbyTrustMean: number;     // 0..1
  nearbyHostileMean: number;   // 0..1
  crowding: number;            // 0..1
  why: string[];
};

export function computeProximity(
  meId: string,
  agents: AgentLite[],
  radiusTiles: number,
  maxExpectedNearby: number // например 6
): ProximityResult {
  const me = agents.find(a => a.id === meId);
  const why: string[] = [];
  if (!me) {
    return { nearbyCountNorm: 0, nearbyTrustMean: 0.5, nearbyHostileMean: 0, crowding: 0, why: ["no-me"] };
  }

  const r2 = radiusTiles * radiusTiles;
  const nearby = agents
    .filter(a => a.id !== meId)
    .map(a => ({ a, d2: (a.pos.x - me.pos.x) ** 2 + (a.pos.y - me.pos.y) ** 2 }))
    .filter(x => x.d2 <= r2);

  const count = nearby.length;
  const nearbyCountNorm = clamp01(count / Math.max(1, maxExpectedNearby));

  const trustVals = nearby.map(x => x.a.trustToMe ?? 0.5);
  const hostileVals = nearby.map(x => x.a.hostileToMe ?? 0);

  const mean = (xs: number[]) => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;

  const nearbyTrustMean = clamp01(mean(trustVals));
  const nearbyHostileMean = clamp01(mean(hostileVals));

  // crowding: если много людей, растёт нелинейно
  const crowding = clamp01(1 - Math.exp(-0.9 * nearbyCountNorm));

  why.push(`nearby=${count} norm=${nearbyCountNorm.toFixed(3)} trustMean=${nearbyTrustMean.toFixed(3)} hostileMean=${nearbyHostileMean.toFixed(3)} crowd=${crowding.toFixed(3)}`);

  return { nearbyCountNorm, nearbyTrustMean, nearbyHostileMean, crowding, why };
}
