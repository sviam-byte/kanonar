
import { SystemEntity, WorldState } from '../../types';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export function updateSystemEntities(world: WorldState) {
    if (!world.systemEntities) return;

    for (const sys of world.systemEntities) {
        // 1. Base Decay / Recovery
        // Stability tends to drop if health is low
        if (sys.health < 0.5) {
            sys.stability = clamp01(sys.stability - 0.01);
        } else {
            sys.stability = clamp01(sys.stability + 0.005);
        }

        // 2. Interaction Effects
        // Check if any agent acted on this system this tick
        // This requires looking at ActionAppliedEvent or Observations in the loop
        // For MVP, we simulate simple "Guardian" maintenance
        
        const guardians = world.agents.filter(a => sys.guardians.includes(a.entityId));
        let maintenance = 0;
        for(const g of guardians) {
            // Simple logic: if guardian is not stressed, they maintain the system
            if ((g.body.acute.stress ?? 0) < 50) {
                maintenance += 0.02;
            }
        }
        
        sys.health = clamp01(sys.health + maintenance - 0.01); // Natural decay

        // 3. System Actions (Feedback to World)
        // If stability drops too low, system might cause a threat increase
        if (sys.stability < 0.2 && world.scene) {
            world.scene.metrics.threat = Math.min(100, world.scene.metrics.threat + 5);
            // Could log a specific event here "System Critical"
        }
    }
}
