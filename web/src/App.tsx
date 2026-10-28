import { Navigate, Route, Routes } from 'react-router-dom';
import { ChildApp } from './pages/child/ChildApp';
import { HomePage } from './pages/HomePage';
import { MissionEditorPage } from './pages/parent/MissionEditorPage';
import { MissionsPage } from './pages/parent/MissionsPage';
import { NewMissionPage } from './pages/parent/NewMissionPage';
import { ParentLayout } from './pages/parent/ParentLayout';
import { ProgressPage } from './pages/parent/ProgressPage';
import { SettingsPage } from './pages/parent/SettingsPage';
import { SimulatorPage } from './pages/simulator/SimulatorPage';

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
      <Route path="/simulator" element={<SimulatorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
