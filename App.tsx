import React, { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { AccessProvider } from './contexts/AccessContext';
import { BranchProvider } from './contexts/BranchContext';
import { SandboxProvider } from './contexts/SandboxContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EntityDetailPage } from './pages/EntityDetailPage';
import { EntityListPage } from './pages/EntityListPage';
import { HomePage } from './pages/HomePage';

const AccessModulePage = lazy(() => import('./pages/AccessModulePage').then((m) => ({ default: m.AccessModulePage })));
const CharacterBuilderPage = lazy(() => import('./pages/CharacterBuilderPage').then((m) => ({ default: m.CharacterBuilderPage })));
const ConflictLabPage = lazy(() => import('./pages/ConflictLabPage').then((m) => ({ default: m.ConflictLabPage })));
const GoalLabConsolePageV2 = lazy(() => import('./pages/GoalLabConsolePageV2').then((m) => ({ default: m.GoalLabConsolePageV2 })));
const GoalLabPageV2 = lazy(() => import('./pages/GoalLabPageV2').then((m) => ({ default: m.GoalLabPageV2 })));
const LocationConstructorPage = lazy(() => import('./pages/LocationConstructorPage').then((m) => ({ default: m.LocationConstructorPage })));
const RelationsLabPage = lazy(() => import('./pages/RelationsLabPage').then((m) => ({ default: m.RelationsLabPage })));
const SimulatorPage = lazy(() => import('./pages/SimulatorPage').then((m) => ({ default: m.SimulatorPage })));

const PageLoader = () => (
  <div className="flex items-center justify-center h-[60vh]">
    <div className="text-sm text-slate-500 animate-pulse font-mono uppercase tracking-widest">Loading...</div>
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
                      <Route path="/access" element={<AccessModulePage />} />
                      <Route path="/builder" element={<CharacterBuilderPage />} />
                      <Route path="/location-constructor" element={<LocationConstructorPage />} />
                      <Route path="/goal-lab-v2" element={<GoalLabPageV2 />} />
                      <Route path="/goal-lab-console-v2" element={<GoalLabConsolePageV2 />} />
                      <Route path="/conflict-lab" element={<ConflictLabPage />} />
                      <Route path="/simulator" element={<SimulatorPage />} />
                      <Route path="/relations-lab" element={<RelationsLabPage />} />

                      <Route path="/goal-lab" element={<Navigate to="/goal-lab-v2" replace />} />
                      <Route path="/goal-lab-console" element={<Navigate to="/goal-lab-console-v2" replace />} />
                      <Route path="/dilemma-lab" element={<Navigate to="/conflict-lab?tab=dilemma" replace />} />
                      <Route path="/mafia-lab" element={<Navigate to="/conflict-lab?tab=mafia" replace />} />

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
