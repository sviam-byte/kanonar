
import { SocialGraph } from '../types';

export const socialGraphData: SocialGraph = {
  nodes: [
    { id: 'deicide-mentor', kind: 'character' },
    { id: 'assi-the-runner', kind: 'character' },
    { id: 'master-gideon', kind: 'character' },
  ],
  edges: [
    { source: 'deicide-mentor', target: 'master-gideon', w: 0.5, relation: 'neutral' },
    { source: 'deicide-mentor', target: 'assi-the-runner', w: 0.3, relation: 'neutral' },
    { source: 'master-gideon', target: 'assi-the-runner', w: 0.2, relation: 'neutral' },
  ],
};
