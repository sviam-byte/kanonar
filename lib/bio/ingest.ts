
import { listify } from '../utils/listify';

export function priorFromHistory(history: any[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const ev of listify(history)) {
    const w = (ev.lifeGoalWeights ?? {}) as Record<string, number>;
    if (!w || !Object.keys(w).length) continue;
    
    const intensity = Math.max(0, ev.intensity ?? 0.5);
    const dur = Math.max(1, ev.duration_days ?? 1);
    const val = (typeof ev.valence === 'number' ? Math.sign(ev.valence || 0) : 1);
    
    // Scale weight by intensity, duration log, and valence direction
    // Negative events might still form a goal (avoidance/compensation), but we weigh them slightly less here
    // as direct "positive" prior for that goal, unless logic handles negative weights elsewhere.
    // Assuming lifeGoalWeights are positive magnitudes of importance.
    const scale = intensity * Math.log1p(dur) * (val >= 0 ? 1 : 0.7); 

    for (const [g, v] of Object.entries(w)) {
      acc[g] = (acc[g] ?? 0) + (v as number) * scale;
    }
  }
  return acc;
}
