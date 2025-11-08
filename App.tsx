import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { EntityListPage } from './pages/EntityListPage';
import { EntityDetailPage } from './pages/EntityDetailPage';
import { SimulationListPage } from './pages/SimulationListPage';
import { SimulationRunnerPage } from './pages/SimulationRunnerPage';
import { LinterPage } from './pages/LinterPage';
import { BranchProvider } from './contexts/BranchContext';

function App() {
  return (
    <BranchProvider>
      <HashRouter>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/linter" element={<LinterPage />} />
              <Route path="/simulations" element={<SimulationListPage />} />
              <Route path="/simulations/:simId" element={<SimulationRunnerPage />} />
              <Route path="/:entityType" element={<EntityListPage />} />
              <Route path="/:entityType/:entityId" element={<EntityDetailPage />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </BranchProvider>
  );
}

export default App;