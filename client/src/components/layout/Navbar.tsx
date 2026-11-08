import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Cpu,
  FileSpreadsheet,
  History,
  LayoutGrid,
  LogIn,
  LogOut,
  User,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

export const Navbar: React.FC = () => {
  const { pathname } = useLocation();
  const { user, loginDemo, logout } = useAuth();

  const navItems = [
    { to: '/', label: 'Каталог і проєкти', icon: <LayoutGrid className="h-4 w-4" /> },
    { to: '/editor', label: 'Редактор схем', icon: <Cpu className="h-4 w-4" /> },
    { to: '/library', label: 'Бібліотека ІМС', icon: <BookOpen className="h-4 w-4" /> },
    {
      to: '/revisions/preset-full-adder',
      label: 'Історія ревізій',
      icon: <History className="h-4 w-4" />,
    },
    {
      to: '/reports/preset-full-adder',
      label: 'Інженерні звіти',
      icon: <FileSpreadsheet className="h-4 w-4" />,
    },
  ];

  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white leading-none">
                LogicForge <span className="text-emerald-400">Studio</span>
              </div>
              <div className="text-[10px] text-slate-400">САПР цифрових логічних схем</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active =
                item.to === '/'
                  ? pathname === '/'
                  : pathname.startsWith(`/${item.to.split('/')[1]}`);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                to="/auth"
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:border-slate-700"
              >
                <User className="h-3.5 w-3.5 text-emerald-400" />
                <span className="max-w-[140px] truncate">{user.fullName}</span>
              </Link>
              <Button
                variant="ghost"
                size="xs"
                onClick={logout}
                title="Вийти з облікового запису"
                icon={<LogOut className="h-3.5 w-3.5" />}
              >
                Вихід
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="xs"
                onClick={() => void loginDemo()}
                title="Миттєвий вхід під демонстраційним акаунтом інженера"
              >
                Демо-вхід
              </Button>
              <Link to="/auth">
                <Button variant="primary" size="xs" icon={<LogIn className="h-3.5 w-3.5" />}>
                  Увійти
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
