
import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { EntityListPage } from './pages/EntityListPage';
import { EntityDetailPage } from './pages/EntityDetailPage';
import { LinterPage } from './pages/LinterPage';
import { BranchProvider } from './contexts/BranchContext';
import { SandboxProvider } from './contexts/SandboxContext';
import { AccessProvider } from './contexts/AccessContext';
import { ErrorBoundary } from './components/ErrorBoundary';

// Eagerly loaded (small, frequently visited)
import { ScenariosPage } from './pages/ScenariosPage';
import { PresetsPage } from './pages/PresetsPage';

// Lazy loaded (heavy pages — only fetched when navigated to)
const ComparePage = lazy(() => import('./pages/ComparePage').then(m => ({ default: m.ComparePage })));
const EventsConstructorPage = lazy(() => import('./pages/EventsConstructorPage').then(m => ({ default: m.EventsConstructorPage })));
const SimulationRunnerPage = lazy(() => import('./pages/SimulationRunnerPage').then(m => ({ default: m.SimulationRunnerPage })));
const SimulationListPage = lazy(() => import('./pages/SimulationListPage').then(m => ({ default: m.SimulationListPage })));
const SolverPage = lazy(() => import('./pages/SolverPage').then(m => ({ default: m.SolverPage })));
const RunnerPage = lazy(() => import('./pages/RunnerPage').then(m => ({ default: m.RunnerPage })));
const ArchetypesPage = lazy(() => import('./pages/ArchetypesPage').then(m => ({ default: m.ArchetypesPage })));
const SocialEventsListPage = lazy(() => import('./pages/SocialEventsListPage').then(m => ({ default: m.SocialEventsListPage })));
const EventsPage = lazy(() => import('./pages/EventsPage').then(m => ({ default: m.EventsPage })));
const ArchetypeRelationsPage = lazy(() => import('./pages/ArchetypeRelationsPage').then(m => ({ default: m.ArchetypeRelationsPage })));
const SimulationInspectorPage = lazy(() => import('./pages/SimulationInspectorPage').then(m => ({ default: m.SimulationInspectorPage })));
const CharacterBuilderPage = lazy(() => import('./pages/CharacterBuilderPage').then(m => ({ default: m.CharacterBuilderPage })));
const CharacterLabPage = lazy(() => import('./pages/CharacterLabPage').then(m => ({ default: m.CharacterLabPage })));
const MassNetworkPage = lazy(() => import('./pages/MassNetworkPage').then(m => ({ default: m.MassNetworkPage })));
const AccessModulePage = lazy(() => import('./pages/AccessModulePage').then(m => ({ default: m.AccessModulePage })));
const PlanningLabPage = lazy(() => import('./pages/PlanningLabPage').then(m => ({ default: m.PlanningLabPage })));
const DialogueLabPage = lazy(() => import('./pages/DialogueLabPage').then(m => ({ default: m.DialogueLabPage })));
const BiographyLabPage = lazy(() => import('./pages/BiographyLabPage').then(m => ({ default: m.BiographyLabPage })));
const NarrativePage = lazy(() => import('./pages/NarrativePage').then(m => ({ default: m.NarrativePage })));
const RelationsLabPage = lazy(() => import('./pages/RelationsLabPage').then(m => ({ default: m.RelationsLabPage })));
const SimKitLabPage = lazy(() => import('./pages/SimKitLabPage').then(m => ({ default: m.SimKitLabPage })));
const LocationConstructorPage = lazy(() => import('./pages/LocationConstructorPage').then(m => ({ default: m.LocationConstructorPage })));
const DiagnosticsPage = lazy(() => import('./pages/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage })));

// GoalLab legacy routes stay default for compatibility.
// V2 is exposed on explicit /goal-lab-v2 routes until parity is confirmed.
const GoalLabPage = lazy(() => import('./pages/GoalLabPage').then(m => ({ default: m.GoalLabPage })));
const GoalLabConsolePage = lazy(() => import('./pages/GoalLabConsolePage').then(m => ({ default: m.GoalLabConsolePage })));

// GoalLab v2 (new architecture)
const GoalLabPageV2 = lazy(() => import('./pages/GoalLabPageV2').then(m => ({ default: m.GoalLabPageV2 })));
const GoalLabConsolePageV2 = lazy(() => import('./pages/GoalLabConsolePageV2').then(m => ({ default: m.GoalLabConsolePageV2 })));

// Console (uses GoalSandbox VM — kept for now, will migrate later)
const ConsolePage = lazy(() => import('./pages/ConsolePage').then(m => ({ default: m.ConsolePage })));

const PageLoader = () => (
  <div className="flex items-center justify-center h-[60vh]">
    <div className="text-sm text-slate-500 animate-pulse font-mono uppercase tracking-widest">Loading…</div>
  </div>
);


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
                  <Suspense fallback={<PageLoader />}>
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
                    <Route path="/goal-lab-console" element={<GoalLabConsolePage />} />
                    <Route path="/goal-lab-v2" element={<GoalLabPageV2 />} />
                    <Route path="/goal-lab-console-v2" element={<GoalLabConsolePageV2 />} />
                    <Route path="/console" element={<ConsolePage />} />
                    <Route path="/simkit-lab" element={<SimKitLabPage />} />
                    <Route path="/relations-lab" element={<RelationsLabPage />} />
                    <Route path="/biography-lab" element={<BiographyLabPage />} />
                    <Route path="/location-constructor" element={<LocationConstructorPage />} />
                    <Route path="/narrative" element={<NarrativePage />} />
                    <Route path="/:entityType" element={<EntityListPage />} />
                    <Route path="/:entityType/:entityId" element={<EntityDetailPage />} />
                  </Routes>
                  </Suspense>
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
