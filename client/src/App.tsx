import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { Navbar } from './components/layout/Navbar';
import { DashboardPage } from './pages/DashboardPage';

const EditorPage = lazy(() =>
  import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })),
);

const ComponentLibraryPage = lazy(() =>
  import('./pages/ComponentLibraryPage').then((m) => ({ default: m.ComponentLibraryPage })),
);
const RevisionHistoryPage = lazy(() =>
  import('./pages/RevisionHistoryPage').then((m) => ({ default: m.RevisionHistoryPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const CabinetPage = lazy(() =>
  import('./pages/CabinetPage').then((m) => ({ default: m.CabinetPage })),
);

const Win95LoadingDialog: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    className="win95-desktop-bg flex min-h-[320px] items-center justify-center p-4"
  >
    <div className="win95-window w-full max-w-sm overflow-hidden">
      <div className="win95-titlebar flex items-center justify-between px-2.5 py-1.5">
        <span className="text-xs font-bold tracking-wide text-win-highlight">
          LOGICFORGE.EXE — Завантаження модуля
        </span>
        <span className="font-mono text-[10px] font-bold text-win-highlight">SYS</span>
      </div>
      <div className="space-y-3 bg-win-bg p-4 text-xs text-win-ink">
        <div className="flex items-center gap-2.5">
          <div className="win95-statusbar-cell flex h-8 w-8 shrink-0 items-center justify-center font-mono text-xs font-bold text-win-navy">
            IC
          </div>
          <div>
            <div className="font-bold text-win-ink">Завантаження робочого модуля...</div>
            <div className="text-[11px] text-win-muted">
              Підготовка графічного інтерфейсу та бібліотеки елементів
            </div>
          </div>
        </div>
        <div className="win95-inset grid grid-cols-10 gap-0.5 bg-win-highlight p-0.5">
          {Array.from({ length: 10 }, (_, idx) => (
            <span key={idx} className={`h-3 ${idx < 7 ? 'bg-win-navy' : 'bg-win-surface'}`} />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <div className="min-h-screen flex flex-col bg-win-bg text-win-ink font-sans">
            <Navbar />
            <main className="flex-1">
              <Suspense fallback={<Win95LoadingDialog />}>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/cabinet" element={<CabinetPage />} />
                  <Route path="/my-circuits" element={<CabinetPage />} />
                  <Route path="/login" element={<AuthPage />} />
                  <Route path="/register" element={<AuthPage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/editor" element={<EditorPage />} />
                  <Route path="/editor/:id" element={<EditorPage />} />
                  <Route path="/library" element={<ComponentLibraryPage />} />
                  <Route path="/revisions" element={<RevisionHistoryPage />} />
                  <Route path="/revisions/:id" element={<RevisionHistoryPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/reports/:id" element={<ReportsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </main>
          </div>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};
