import { SimulationMeta } from '../../types';
import { incidentA12 } from './incident-a12';
import { logisticsO2Pipeline } from './logistics-o2-pipeline';
import { seirBeta } from './seir-beta';
import { percolationFrontier } from './percolation-frontier';
import { influenceCanonDrive } from './influence-canon-drive';
import { portfolioSmallRegnum } from './portfolio-small-regnum';
import { queueEvacD7 } from './queue-evac-d7';
import { crowdExhibit } from './crowd-exhibit';
import { blackstartNetwork } from './blackstart-network';
import { negotiationEmbassy } from './negotiation-embassy';
import { networkDynamics } from './network-dynamics';
import { negotiationHeadToHead } from './negotiation-head-to-head';

export const allSimulations: SimulationMeta[] = [
  incidentA12,
  logisticsO2Pipeline,
  seirBeta,
  negotiationEmbassy,
  negotiationHeadToHead,
  networkDynamics,
  percolationFrontier,
  influenceCanonDrive,
  portfolioSmallRegnum,
  queueEvacD7,
  crowdExhibit,
  blackstartNetwork,
];
