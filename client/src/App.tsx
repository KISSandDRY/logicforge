import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { AuthProvider } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { ComponentLibraryPage } from './pages/ComponentLibraryPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditorPage } from './pages/EditorPage';
import { ReportsPage } from './pages/ReportsPage';
import { RevisionHistoryPage } from './pages/RevisionHistoryPage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
          <Navbar />
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/editor" element={<EditorPage />} />
              <Route path="/editor/:id" element={<EditorPage />} />
              <Route path="/library" element={<ComponentLibraryPage />} />
              <Route path="/revisions/:id" element={<RevisionHistoryPage />} />
              <Route path="/reports/:id" element={<ReportsPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};
