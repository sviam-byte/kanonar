
import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { EntityListPage } from './pages/EntityListPage';
import { EntityDetailPage } from './pages/EntityDetailPage';
import { LinterPage } from './pages/LinterPage';
import { BranchProvider } from './contexts/BranchContext';
import { SandboxProvider } from './contexts/SandboxContext';
import { AccessProvider } from './contexts/AccessContext';
import { ComparePage } from './pages/ComparePage';
import { ScenariosPage } from './pages/ScenariosPage';
import { EventsConstructorPage } from './pages/EventsConstructorPage';
import { SimulationRunnerPage } from './pages/SimulationRunnerPage';
import { SimulationListPage } from './pages/SimulationListPage';
import { SolverPage } from './pages/SolverPage';
import { RunnerPage } from './pages/RunnerPage';
import { ArchetypesPage } from './pages/ArchetypesPage';
import { SocialEventsListPage } from './pages/SocialEventsListPage';
import { EventsPage } from './pages/EventsPage'; 
import { ArchetypeRelationsPage } from './pages/ArchetypeRelationsPage';
import { SimulationInspectorPage } from './pages/SimulationInspectorPage';
import { CharacterBuilderPage } from './pages/CharacterBuilderPage';
import { PresetsPage } from './pages/PresetsPage';
import { CharacterLabPage } from './pages/CharacterLabPage';
import { MassNetworkPage } from './pages/MassNetworkPage';
import { AccessModulePage } from './pages/AccessModulePage';
import { PlanningLabPage } from './pages/PlanningLabPage';
import { DialogueLabPage } from './pages/DialogueLabPage';
import { BiographyLabPage } from './pages/BiographyLabPage';
import { GoalLabPage } from './pages/GoalLabPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NarrativePage } from './pages/NarrativePage';
import { RelationsLabPage } from './pages/RelationsLabPage';


function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <BranchProvider>
          <AccessProvider>
            <SandboxProvider>
              <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-grow">
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/linter" element={<LinterPage />} />
                    <Route path="/archetypes" element={<ArchetypesPage />} />
                    <Route path="/archetype-relations" element={<ArchetypeRelationsPage />} />
                    <Route path="/compare/:entityId" element={<ComparePage />} />
                    <Route path="/scenarios" element={<ScenariosPage />} />
                    <Route path="/inspector" element={<SimulationInspectorPage />} />
                    <Route path="/simulations" element={<SimulationListPage />} />
                    <Route path="/simulations/:simId" element={<SimulationRunnerPage />} />
                    <Route path="/social-events" element={<SocialEventsListPage />} />
                    <Route path="/events" element={<EventsPage />} />
                    <Route path="/social_event" element={<SocialEventsListPage />} />
                    <Route path="/social-simulator" element={<EventsConstructorPage />} />
                    <Route path="/solver" element={<SolverPage />} />
                    <Route path="/runner" element={<RunnerPage />} />
                    <Route path="/runner/:scenarioId" element={<RunnerPage />} />
                    <Route path="/builder" element={<CharacterBuilderPage />} />
                    <Route path="/presets" element={<PresetsPage />} />
                    <Route path="/character-lab" element={<CharacterLabPage />} />
                    <Route path="/mass" element={<MassNetworkPage />} />
                    <Route path="/access" element={<AccessModulePage />} />
                    <Route path="/planning-lab" element={<PlanningLabPage />} />
                    <Route path="/dialogue-lab" element={<DialogueLabPage />} />
                    <Route path="/goal-lab" element={<GoalLabPage />} />
                    <Route path="/relations-lab" element={<RelationsLabPage />} />
                    <Route path="/biography-lab" element={<BiographyLabPage />} />
                    <Route path="/narrative" element={<NarrativePage />} />
                    <Route path="/:entityType" element={<EntityListPage />} />
                    <Route path="/:entityType/:entityId" element={<EntityDetailPage />} />
                  </Routes>
                </main>
              </div>
            </SandboxProvider>
          </AccessProvider>
        </BranchProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
