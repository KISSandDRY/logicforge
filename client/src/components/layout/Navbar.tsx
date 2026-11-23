import React, { useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Cpu,
  FileSpreadsheet,
  FolderKanban,
  History,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  Menu,
  Plus,
  UserCircle2,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { NewSchemeModal } from '../circuit/NewSchemeModal';

export const Navbar: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { activeCircuitId } = useWorkspace();

  const drawerId = useId();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newSchemeModalOpen, setNewSchemeModalOpen] = useState(false);

  const handleOpenNewSchemeDialog = () => {
    setMobileMenuOpen(false);
    setNewSchemeModalOpen(true);
  };

  const navItems = [
    {
      key: 'overview',
      to: '/',
      label: 'Головна',
      fullTitle: 'Головна сторінка та інтерактивний стенд',
      icon: <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
      active: pathname === '/',
      requiresAuth: false,
    },
    {
      key: 'cabinet',
      to: '/cabinet',
      label: 'Мої схеми',
      fullTitle: user
        ? 'Особистий кабінет та збережені схеми'
        : 'Мої схеми (лише для зареєстрованих користувачів)',
      icon: <FolderKanban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
      active: pathname.startsWith('/cabinet') || pathname.startsWith('/my-circuits'),
      requiresAuth: true,
    },
    {
      key: 'editor',
      to: `/editor/${activeCircuitId}`,
      label: 'Редактор',
      fullTitle: 'Схемотехнічний редактор та симулятор',
      icon: <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
      active: pathname.startsWith('/editor'),
      requiresAuth: false,
    },
    {
      key: 'library',
      to: '/library',
      label: 'Бібліотека',
      fullTitle: 'Бібліотека цифрових логічних елементів',
      icon: <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
      active: pathname.startsWith('/library'),
      requiresAuth: false,
    },
    {
      key: 'revisions',
      to: `/revisions/${activeCircuitId}`,
      label: 'Ревізії',
      fullTitle: user
        ? 'Історія ревізій поточної схеми'
        : 'Ревізії (лише для зареєстрованих користувачів)',
      icon: <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
      active: pathname.startsWith('/revisions'),
      requiresAuth: true,
    },
    {
      key: 'reports',
      to: `/reports/${activeCircuitId}`,
      label: 'Звіти',
      fullTitle: 'Конструкторські звіти BOM, Netlist та ДДНФ',
      icon: <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
      active: pathname.startsWith('/reports'),
      requiresAuth: false,
    },
  ];

  return (
    <>
      <header className="no-print sticky top-0 z-40 win95-outset bg-win-bg text-win-ink">
        <div className="flex h-10 w-full flex-nowrap items-center justify-between gap-2 px-2.5 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              title="LogicForge — САПР моделювання та симуляції цифрових логічних схем"
              className="inline-flex min-h-7 coarse:min-h-9 items-center gap-1.5 min-w-0 shrink-0 pr-1 focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black"
            >
              <span className="win95-inset inline-flex items-center justify-center bg-win-canvas px-1.5 py-0.5 shrink-0">
                <svg width="28" height="18" viewBox="-2 0 50 30" fill="none" className="shrink-0">
                  <line x1="1" y1="9" x2="10" y2="9" stroke="var(--win-ink)" strokeWidth="2.2" />
                  <line x1="1" y1="21" x2="10" y2="21" stroke="var(--win-ink)" strokeWidth="2.2" />
                  <path
                    d="M 6 3 Q 14 15 6 27"
                    fill="none"
                    stroke="var(--win-ink)"
                    strokeWidth="2.2"
                  />
                  <path
                    d="M 10 3 Q 25 3 36 15 Q 25 27 10 27 Q 18 15 10 3 Z"
                    fill="var(--win-surface)"
                    stroke="var(--win-ink)"
                    strokeWidth="2.2"
                  />
                  <line x1="36" y1="15" x2="45" y2="15" stroke="var(--win-ink)" strokeWidth="2.2" />
                </svg>
              </span>
              <span className="truncate text-sm font-bold tracking-tight text-win-ink">
                LOGICFORGE
              </span>
            </Link>

            <nav className="hidden lg:flex items-center gap-1 ml-1" aria-label="Основна навігація">
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  to={item.to}
                  title={item.fullTitle}
                  className={`inline-flex min-h-7 min-w-7 items-center gap-1.5 px-2.5 py-1 text-xs font-bold whitespace-nowrap touch-manipulation ${
                    item.active
                      ? 'win95-button-pressed bg-win-surface text-win-ink'
                      : 'win95-button text-win-ink'
                  }`}
                >
                  <span className="hidden xl:inline-flex">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.requiresAuth && !user && (
                    <Lock className="h-3 w-3 shrink-0 text-win-muted" aria-hidden="true" />
                  )}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="navbar-new-btn"
              onClick={handleOpenNewSchemeDialog}
              title="Створити нову схему (порожню або за шаблоном)"
              className="win95-button hidden sm:inline-flex min-h-7 min-w-7 coarse:min-h-9 items-center gap-1 px-2.5 py-1 text-xs font-bold whitespace-nowrap touch-manipulation text-win-ink"
            >
              <Plus className="h-3.5 w-3.5 text-win-teal" aria-hidden="true" />
              <span>Нова схема</span>
            </button>

            <div className="hidden lg:flex items-center gap-1">
              {user ? (
                <>
                  <Link
                    to="/cabinet"
                    data-testid="navbar-account-link"
                    title={`Особистий кабінет (${user.fullName})`}
                    className={`win95-button inline-flex min-h-7 min-w-7 items-center gap-1.5 px-2.5 py-1 text-xs font-bold whitespace-nowrap touch-manipulation text-win-ink ${
                      pathname.startsWith('/cabinet') ? 'win95-button-pressed bg-win-surface' : ''
                    }`}
                  >
                    <UserCircle2 className="h-3.5 w-3.5 text-win-navy" aria-hidden="true" />
                    <span className="max-w-[130px] truncate">{user.fullName}</span>
                  </Link>
                  <button
                    type="button"
                    data-testid="navbar-logout-btn"
                    onClick={logout}
                    aria-label="Вийти з облікового запису"
                    title="Вийти з облікового запису"
                    className="win95-button inline-flex min-h-7 min-w-7 items-center gap-1 px-2 py-1 text-xs font-bold whitespace-nowrap touch-manipulation text-win-ink"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden xl:inline">Вихід</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className={`win95-button inline-flex min-h-7 min-w-7 items-center gap-1 px-2.5 py-1 text-xs font-bold whitespace-nowrap touch-manipulation text-win-ink ${
                      pathname === '/login' ? 'win95-button-pressed bg-win-surface' : ''
                    }`}
                  >
                    <LogIn className="h-3.5 w-3.5 text-win-teal" aria-hidden="true" />
                    <span>Вхід</span>
                  </Link>
                  <Link
                    to="/register"
                    className={`win95-button inline-flex min-h-7 min-w-7 items-center gap-1 px-2.5 py-1 text-xs font-bold whitespace-nowrap touch-manipulation text-win-ink ${
                      pathname === '/register' ? 'win95-button-pressed bg-win-surface' : ''
                    }`}
                  >
                    <UserPlus className="h-3.5 w-3.5 text-win-navy" aria-hidden="true" />
                    <span>Реєстрація</span>
                  </Link>
                </>
              )}
            </div>

            <button
              type="button"
              data-testid="navbar-mobile-menu-btn"
              aria-label="Відкрити навігаційне меню"
              aria-expanded={mobileMenuOpen}
              aria-controls={drawerId}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="win95-button inline-flex lg:hidden min-h-8 min-w-8 coarse:min-h-9 coarse:min-w-9 items-center justify-center touch-manipulation text-win-ink"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Розкладне мобільне меню у стилі Windows 95 (< 1024px) */}
        {mobileMenuOpen && (
          <div
            id={drawerId}
            data-testid="navbar-mobile-drawer"
            className="lg:hidden border-t border-win-shadow bg-win-bg px-3 py-2.5 space-y-2.5"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex min-h-9 min-w-9 items-center gap-2 px-2.5 py-1.5 text-xs font-bold touch-manipulation ${
                    item.active
                      ? 'win95-button-pressed bg-win-surface text-win-ink'
                      : 'win95-button text-win-ink'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                  {item.requiresAuth && !user && (
                    <Lock className="h-3 w-3 shrink-0 text-win-muted" aria-hidden="true" />
                  )}
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-win-shadow pt-2">
              <button
                type="button"
                onClick={handleOpenNewSchemeDialog}
                className="win95-button inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 text-xs font-bold touch-manipulation text-win-ink"
              >
                <Plus className="h-3.5 w-3.5 text-win-teal" aria-hidden="true" />
                <span>Нова схема</span>
              </button>

              {user ? (
                <>
                  <Link
                    to="/cabinet"
                    onClick={() => setMobileMenuOpen(false)}
                    className="win95-button inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 text-xs font-bold touch-manipulation text-win-ink"
                  >
                    <UserCircle2 className="h-4 w-4 text-win-navy" aria-hidden="true" />
                    <span>{user.fullName}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="win95-button inline-flex min-h-9 items-center gap-1 px-3 py-1.5 text-xs font-bold touch-manipulation text-win-ink"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Вихід</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="win95-button flex-1 inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 px-3 py-1 text-xs font-bold touch-manipulation text-win-ink"
                  >
                    <LogIn className="h-3.5 w-3.5 text-win-teal" aria-hidden="true" /> Вхід
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="win95-button flex-1 inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 px-3 py-1 text-xs font-bold touch-manipulation text-win-ink"
                  >
                    <UserPlus className="h-3.5 w-3.5 text-win-navy" aria-hidden="true" /> Реєстрація
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <NewSchemeModal
        open={newSchemeModalOpen}
        onClose={() => setNewSchemeModalOpen(false)}
        onCreated={(createdId) => navigate(`/editor/${createdId}`)}
      />
    </>
  );
};
