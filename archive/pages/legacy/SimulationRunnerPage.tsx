import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { allSimulations } from '../data/simulations';
import { MapIncidentRunner } from '../components/simulations/MapIncidentRunner';
import { LogisticsRunner } from '../components/simulations/LogisticsRunner';
import { SeirRunner } from '../components/simulations/SeirRunner';
import { PercolationRunner } from '../components/simulations/PercolationRunner';
import { InfluenceRunner } from '../components/simulations/InfluenceRunner';
import { PortfolioRunner } from '../components/simulations/PortfolioRunner';
import { QueueRunner } from '../components/simulations/QueueRunner';
import { CrowdRunner } from '../components/simulations/CrowdRunner';
import { BlackstartRunner } from '../components/simulations/BlackstartRunner';
import { NegotiationRunner } from '../components/simulations/NegotiationRunner';
import { NetworkRunner } from '../components/simulations/NetworkRunner';
import { NegotiationHeadToHeadRunner } from '../components/simulations/NegotiationHeadToHeadRunner';

export const SimulationRunnerPage: React.FC = () => {
  const { simId } = useParams<{ simId: string }>();

  const sim = allSimulations.find(s => s.key === simId);

  if (!sim) {
    return (
        <div className="p-8 text-canon-red text-center">
            <h2 className="text-2xl font-bold mb-4">Simulation Not Found</h2>
            <p>The requested simulation '{simId}' does not exist.</p>
            <Link to="/simulations" className="text-canon-accent hover:underline mt-4 inline-block">Return to Simulation List</Link>
        </div>
    );
  }

  const renderRunner = () => {
    switch (sim.mode) {
      case 'map':
        return <MapIncidentRunner sim={sim} />;
      case 'logistics':
        return <LogisticsRunner sim={sim} />;
      case 'seir':
        return <SeirRunner sim={sim} />;
      case 'negotiation':
        return <NegotiationRunner sim={sim} />;
      case 'negotiation-head-to-head':
        return <NegotiationHeadToHeadRunner sim={sim} />;
      case 'network':
        return <NetworkRunner sim={sim} />;
      case 'percolation':
        return <PercolationRunner sim={sim} />;
      case 'influence':
        return <InfluenceRunner sim={sim} />;
      case 'portfolio':
        return <PortfolioRunner sim={sim} />;
      case 'queue':
        return <QueueRunner sim={sim} />;
      case 'crowd':
        return <CrowdRunner sim={sim} />;
      case 'blackstart':
        return <BlackstartRunner sim={sim} />;
      default:
        return <p className="text-canon-text-light">No runner available for simulation mode: {sim.mode}</p>;
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
       <div className="mb-6 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold">{sim.title}</h2>
        <p className="text-canon-text-light mt-2">{sim.description}</p>
      </div>
      <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
        {renderRunner()}
      </div>
    </div>
  );
};
