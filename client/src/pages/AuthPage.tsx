import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, login, register, loginDemo, logout } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('student@lpnu.ua');
  const [username, setUsername] = useState('lpnu_student');
  const [fullName, setFullName] = useState('Олександр Коваленко');
  const [password, setPassword] = useState('DemoPass123!');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ email, username, fullName, password });
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка авторизації');
    } finally {
      setSubmitting(false);
    }
  };

  if (user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">{user.fullName}</h1>
              <p className="text-xs text-slate-400">
                @{user.username} • {user.email} • Роль: {user.role}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300 space-y-1.5">
            <div>
              <strong className="text-white">Статус JWT-сесії:</strong> Активна (захищене збереження
              схем, історії ревізій та користувацьких підсхем ІМС у PostgreSQL / Prisma ORM).
            </div>
            <div>
              <strong className="text-white">Ідентифікатор інженера:</strong>{' '}
              <span className="font-mono text-emerald-300">{user.id}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => navigate('/editor')}>
              Перейти до редактора схем
            </Button>
            <Button variant="danger" onClick={logout}>
              Завершити сеанс
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl space-y-5">
        <div className="text-center space-y-1">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold text-white">
            {mode === 'login' ? 'Вхід до системи LogicForge' : 'Реєстрація інженера-розробника'}
          </h1>
          <p className="text-xs text-slate-400">
            Зберігайте цифрові схеми, ревізії та власні мікросхеми в хмарній БД PostgreSQL
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-lg py-1.5 text-xs font-medium ${
              mode === 'login' ? 'bg-slate-800 text-white' : 'text-slate-400'
            }`}
          >
            Авторизація
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`rounded-lg py-1.5 text-xs font-medium ${
              mode === 'register' ? 'bg-slate-800 text-white' : 'text-slate-400'
            }`}
          >
            Реєстрація
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Електронна пошта</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Логін користувача</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Прізвище та ім’я</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1">Пароль</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            {mode === 'login' ? 'Увійти в кабінет' : 'Зареєструвати акаунт'}
          </Button>
        </form>

        <div className="border-t border-slate-800 pt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            icon={<Sparkles className="h-4 w-4 text-emerald-400" />}
            onClick={async () => {
              await loginDemo();
              navigate('/');
            }}
          >
            Швидкий вхід під демо-акаунтом (student@lpnu.ua)
          </Button>
        </div>
      </div>
    </div>
  );
};
