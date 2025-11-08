import { SocialGraph } from '../types';

export const socialGraphData: SocialGraph = {
  nodes: [
    { id: 'char-rion-001', kind: 'character' },
    { id: 'char-vestar-001', kind: 'character' },
    { id: 'char-lyra-001', kind: 'character' },
    { id: 'char-elara-001', kind: 'character' },
    { id: 'char-norr-001', kind: 'character' },
    { id: 'char-tavel-001', kind: 'character' },
    { id: 'char-bruni-001', kind: 'character' },
  ],
  edges: [
    // Norr's team from "Многоцелевая оптимизация"
    { source: 'char-norr-001', target: 'char-tavel-001', w: 0.8, relation: 'ally' },
    { source: 'char-norr-001', target: 'char-bruni-001', w: 0.6, relation: 'ally' },
    { source: 'char-tavel-001', target: 'char-bruni-001', w: 0.5, relation: 'neutral' },
    
    // Rion and Vestar are high-level operatives
    { source: 'char-rion-001', target: 'char-vestar-001', w: 0.7, relation: 'ally' },

    // Elara and Lyra are thematically linked as "truth-seekers"
    { source: 'char-lyra-001', target: 'char-elara-001', w: 0.4, relation: 'neutral' },

    // Add some rivalries for dynamic tension
    { source: 'char-vestar-001', target: 'char-bruni-001', w: 0.3, relation: 'rival' }, // Order vs. Chaos
    { source: 'char-rion-001', target: 'char-tavel-001', w: 0.6, relation: 'rival' }, // Opposing engineering philosophies
  ],
};
