import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { ROUTES, COMPAT_REDIRECTS } from './lib/appRoutes';
import { HomePage } from './pages/HomePage';
import { EntityListPage } from './pages/EntityListPage';
import { EntityDetailPage } from './pages/EntityDetailPage';
import { LinterPage } from './pages/LinterPage';
import { BranchProvider } from './contexts/BranchContext';
import { SandboxProvider } from './contexts/SandboxContext';
import { AccessProvider } from './contexts/AccessContext';
import { ErrorBoundary } from './components/ErrorBoundary';

import { ScenariosPage } from './pages/ScenariosPage';
import { PresetsPage } from './pages/PresetsPage';

const ComparePage = lazy(() => import('./pages/ComparePage').then(m => ({ default: m.CompareSimPage })));
const SolverPage = lazy(() => import('./pages/SolverPage').then(m => ({ default: m.SolverPage })));
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
const DialogueLabV2Page = lazy(() => import('./pages/DialogueLabV2Page').then(m => ({ default: m.DialogueLabV2Page })));
const BiographyLabPage = lazy(() => import('./pages/BiographyLabPage').then(m => ({ default: m.BiographyLabPage })));
const NarrativePage = lazy(() => import('./pages/NarrativePage').then(m => ({ default: m.NarrativePage })));
const RelationsLabPage = lazy(() => import('./pages/RelationsLabPage').then(m => ({ default: m.RelationsLabPage })));
const LocationConstructorPage = lazy(() => import('./pages/LocationConstructorPage').then(m => ({ default: m.LocationConstructorPage })));
const DiagnosticsPage = lazy(() => import('./pages/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage })));
const RunnerPage = lazy(() => import('./pages/RunnerPage').then(m => ({ default: m.RunnerPage })));
const SimulationListPage = lazy(() => import('./pages/SimulationListPage').then(m => ({ default: m.SimulationListPage })));
const SimulationRunnerPage = lazy(() => import('./pages/SimulationRunnerPage').then(m => ({ default: m.SimulationRunnerPage })));
const SimulatorPage = lazy(() => import('./pages/SimulatorPage').then(m => ({ default: m.SimulatorPage })));
const GoalLabPage = lazy(() => import('./pages/GoalLabPage').then(m => ({ default: m.GoalLabPage })));
const GoalLabConsolePage = lazy(() => import('./pages/GoalLabConsolePage').then(m => ({ default: m.GoalLabConsolePage })));
const GoalLabPageV2 = lazy(() => import('./pages/GoalLabPageV2').then(m => ({ default: m.GoalLabPageV2 })));
const GoalLabConsolePageV2 = lazy(() => import('./pages/GoalLabConsolePageV2').then(m => ({ default: m.GoalLabConsolePageV2 })));
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
                      <Route path={ROUTES.home} element={<HomePage />} />
                      <Route path={ROUTES.labs.linter} element={<LinterPage />} />
                      <Route path={ROUTES.narrative.archetypes} element={<ArchetypesPage />} />
                      <Route path={ROUTES.narrative.archetypeRelations} element={<ArchetypeRelationsPage />} />
                      <Route path={ROUTES.labs.compare} element={<ComparePage />} />
                      <Route path={ROUTES.simulation.hub} element={<ScenariosPage />} />
                      <Route path={ROUTES.inspector} element={<SimulationInspectorPage />} />
                      <Route path={ROUTES.entities.socialEvents} element={<SocialEventsListPage />} />
                      <Route path="/events" element={<EventsPage />} />
                      <Route path="/social_event" element={<SocialEventsListPage />} />
                      <Route path={ROUTES.simulation.solver} element={<SolverPage />} />
                      <Route path={ROUTES.labs.builder} element={<CharacterBuilderPage />} />
                      <Route path={ROUTES.labs.presets} element={<PresetsPage />} />
                      <Route path={ROUTES.labs.characterLab} element={<CharacterLabPage />} />
                      <Route path={ROUTES.narrative.mass} element={<MassNetworkPage />} />
                      <Route path={ROUTES.access} element={<AccessModulePage />} />
                      <Route path={ROUTES.labs.planningLab} element={<PlanningLabPage />} />
                      <Route path={ROUTES.labs.dialogueLab} element={<DialogueLabV2Page />} />
                      <Route path={ROUTES.labs.goalLab} element={<GoalLabPage />} />
                      <Route path={ROUTES.labs.goalLabConsole} element={<GoalLabConsolePage />} />
                      <Route path="/console" element={<ConsolePage />} />
                      <Route path={ROUTES.simulation.live} element={<SimulatorPage />} />
                      <Route path={ROUTES.labs.relationsLab} element={<RelationsLabPage />} />
                      <Route path={ROUTES.labs.biographyLab} element={<BiographyLabPage />} />
                      <Route path={ROUTES.labs.locationBuilder} element={<LocationConstructorPage />} />
                      <Route path={ROUTES.narrative.canvas} element={<NarrativePage />} />
                      <Route path={ROUTES.simulation.diagnostics} element={<DiagnosticsPage />} />
                      <Route path={ROUTES.simulation.runner} element={<RunnerPage />} />
                      <Route path={ROUTES.simulation.catalog} element={<SimulationListPage />} />
                      <Route path={`${ROUTES.simulation.catalog}/:simId`} element={<SimulationRunnerPage />} />

                      {/* Compatibility redirects — keep old URLs alive, but do not surface them in UI. */}
                      {COMPAT_REDIRECTS.map(([from, to]) => (
                        <Route key={from} path={from} element={<Navigate to={to} replace />} />
                      ))}

                      {/* Hidden legacy pages — direct access only, never linked from the UI. */}
                      <Route path={ROUTES.legacy.dialogueLab} element={<DialogueLabPage />} />
                      <Route path={ROUTES.legacy.goalLab} element={<GoalLabPageV2 />} />
                      <Route path={ROUTES.legacy.goalLabConsole} element={<GoalLabConsolePageV2 />} />

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
