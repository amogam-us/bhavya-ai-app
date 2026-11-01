import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import { ChildApp } from './pages/child/ChildApp';
import { HomePage } from './pages/HomePage';
import { MissionEditorPage } from './pages/parent/MissionEditorPage';
import { MissionsPage } from './pages/parent/MissionsPage';
import { NewMissionPage } from './pages/parent/NewMissionPage';
import { ParentLayout } from './pages/parent/ParentLayout';
import { ProgressPage } from './pages/parent/ProgressPage';
import { SettingsPage } from './pages/parent/SettingsPage';

// The simulator brings in the 3D engine, so it loads only when opened.
const SimulatorPage = lazy(() =>
  import('./pages/simulator/SimulatorPage').then((m) => ({ default: m.SimulatorPage })),
);

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/parent" element={<ParentLayout />}>
        <Route index element={<MissionsPage />} />
        <Route path="new" element={<NewMissionPage />} />
        <Route path="missions/:id" element={<MissionEditorPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/child" element={<ChildApp />} />
      <Route
        path="/simulator"
        element={
          <Suspense
            fallback={
              <div className="sim3d-center">
                <Spinner label="Loading the simulator…" />
              </div>
            }
          >
            <SimulatorPage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
