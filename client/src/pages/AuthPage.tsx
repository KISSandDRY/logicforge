import React, { useEffect, useId, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  FolderKanban,
  KeyRound,
  LogIn,
  Mail,
  ShieldCheck,
  User as UserIcon,
  UserPlus,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

type AuthFieldKey = 'email' | 'username' | 'fullName' | 'password';
type AuthFieldErrors = Partial<Record<AuthFieldKey, string>>;

function validateAuthFields(
  mode: 'login' | 'register',
  values: { email: string; username: string; fullName: string; password: string },
): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const trimmedEmail = values.email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
    errors.email = 'Введіть коректну електронну пошту (наприклад, name@domain.ua).';
  }

  if (mode === 'register') {
    const trimmedUser = values.username.trim();
    if (trimmedUser.length < 3 || trimmedUser.length > 40) {
      errors.username = 'Логін має містити від 3 до 40 символів.';
    } else if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUser)) {
      errors.username = 'Дозволені лише латинські літери, цифри, _, - та крапка.';
    }

    const trimmedName = values.fullName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      errors.fullName = 'Введіть прізвище та ім’я (щонайменше 2 символи).';
    }

    if (values.password.length < 6) {
      errors.password = 'Пароль має містити щонайменше 6 символів.';
    }
  } else if (values.password.length < 1) {
    errors.password = 'Введіть пароль від облікового запису.';
  }

  return errors;
}

const Win95StopIcon: React.FC = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <circle cx="14" cy="14" r="12" fill="#cc0000" stroke="#000000" strokeWidth="1.5" />
    <path d="M 5 21 A 11 11 0 0 1 21 5" fill="none" stroke="#ff8080" strokeWidth="1.2" />
    <line x1="9" y1="9" x2="19" y2="19" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="square" />
    <line x1="19" y1="9" x2="9" y2="19" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="square" />
  </svg>
);

export const AuthPage: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, login, register, logout } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>(() =>
    pathname.startsWith('/register') ? 'register' : 'login',
  );

  useEffect(() => {
    if (pathname.startsWith('/register')) {
      setMode('register');
    } else if (pathname.startsWith('/login')) {
      setMode('login');
    }
  }, [pathname]);

  const formId = useId();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<Partial<Record<AuthFieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTouched({});
    setSubmitted(false);
    setServerError(null);
  }, [mode]);

  const validationErrors = useMemo(
    () => validateAuthFields(mode, { email, username, fullName, password }),
    [mode, email, username, fullName, password],
  );

  const visibleErrors: AuthFieldErrors = useMemo(() => {
    const out: AuthFieldErrors = {};
    (Object.keys(validationErrors) as AuthFieldKey[]).forEach((key) => {
      if (submitted || touched[key]) {
        out[key] = validationErrors[key];
      }
    });
    return out;
  }, [submitted, touched, validationErrors]);

  const markTouched = (field: AuthFieldKey) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register({
          email: email.trim(),
          username: username.trim(),
          fullName: fullName.trim(),
          password,
        });
      }
      navigate('/cabinet');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Помилка автентифікації');
    } finally {
      setBusy(false);
    }
  };

  const hasAnyVisibleError = Boolean(serverError) || Object.keys(visibleErrors).length > 0;

  if (user) {
    return (
      <div className="win95-desktop-bg min-h-[calc(100vh-2.6rem)] flex items-center justify-center px-3 sm:px-4 py-6">
        <div className="win95-window w-full max-w-lg overflow-hidden">
          <div className="win95-titlebar flex items-center justify-between px-3 py-1.5">
            <span className="text-xs font-bold">АКТИВНА СЕСІЯ КОРИСТУВАЧА</span>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="win95-inset flex h-11 w-11 items-center justify-center bg-win-surface text-win-navy">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-base font-bold text-win-ink">{user.fullName}</h1>
                <p className="font-mono text-xs text-win-muted">
                  @{user.username} • {user.email}
                </p>
              </div>
            </div>

            <div className="win95-statusbar-cell p-3 text-xs text-win-ink space-y-1 font-mono">
              <div>Логін: @{user.username}</div>
              <div>Електронна пошта: {user.email}</div>
              <div>Стан синхронізації: Особисті проєкти та ревізії активні</div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => navigate('/cabinet')}
                icon={<FolderKanban className="h-4 w-4" />}
              >
                Перейти у Мій кабінет та схеми
              </Button>
              <Button variant="secondary" onClick={() => navigate('/editor')}>
                Редактор САПР
              </Button>
              <Button variant="danger" onClick={logout}>
                Вийти
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="win95-desktop-bg min-h-[calc(100vh-2.6rem)] flex items-center justify-center px-3 sm:px-4 py-6 sm:py-10">
      <div className="win95-window w-full max-w-4xl overflow-hidden">
        <div className="win95-titlebar flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
          <span className="text-xs font-bold">
            {mode === 'login'
              ? 'ВХІД ДО ОСОБИСТОГО КАБІНЕТУ LOGICFORGE'
              : 'РЕЄСТРАЦІЯ ОБЛІКОВОГО ЗАПИСУ ІНЖЕНЕРА'}
          </span>
        </div>

        <div className="grid lg:grid-cols-[1.05fr,1.2fr] p-1.5 gap-2">
          {/* Ліва інформаційна колонка */}
          <div className="win95-statusbar-cell p-4 sm:p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <h1 className="text-base sm:text-lg font-bold text-win-ink">
                {mode === 'login'
                  ? 'Увійдіть до свого інженерного кабінету'
                  : 'Створіть особистий кабінет для збереження схем'}
              </h1>
              <p className="text-xs leading-relaxed text-win-muted">
                Обліковий запис надає доступ до персонального реєстру цифрових схем, контролю
                ревізій топології та бібліотеки власних інкапсульованих мікросхем.
              </p>

              <ul className="space-y-1.5 pt-1 text-xs text-win-ink">
                <li className="win95-outset flex items-center gap-2 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-win-teal" />
                  <span>Збереження власних схем у розділі «Мої схеми»</span>
                </li>
                <li className="win95-outset flex items-center gap-2 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-win-teal" />
                  <span>Контроль версій (v1, v2...) та миттєве відновлення</span>
                </li>
                <li className="win95-outset flex items-center gap-2 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-win-teal" />
                  <span>Створення користувацьких мікросхем (Custom IC)</span>
                </li>
                <li className="win95-outset flex items-center gap-2 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-win-teal" />
                  <span>Експорт конструкторських специфікацій BOM та ДДНФ</span>
                </li>
              </ul>
            </div>

            <div className="win95-outset p-3 text-xs text-win-muted">
              <div className="font-bold text-win-ink">Перемикання режиму:</div>
              <p className="mt-1">
                {mode === 'login' ? (
                  <>
                    Ще не маєте облікового запису?{' '}
                    <Link to="/register" className="font-bold text-win-navy underline">
                      Перейти на сторінку реєстрації →
                    </Link>
                  </>
                ) : (
                  <>
                    Вже зареєстровані у системі?{' '}
                    <Link to="/login" className="font-bold text-win-navy underline">
                      Перейти на сторінку входу →
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Права колонка: форма входу або реєстрації */}
          <div className="win95-outset p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 gap-1.5 text-xs font-bold">
              <button
                type="button"
                data-testid="auth-switch-login"
                onClick={() => navigate('/login')}
                className={`inline-flex min-h-8 coarse:min-h-9 items-center justify-center gap-1.5 py-1.5 touch-manipulation ${
                  mode === 'login'
                    ? 'win95-button-pressed bg-win-surface text-win-ink'
                    : 'win95-button text-win-ink'
                }`}
              >
                <LogIn className="h-3.5 w-3.5 text-win-teal" />
                <span>Вхід в акаунт</span>
              </button>
              <button
                type="button"
                data-testid="auth-switch-register"
                onClick={() => navigate('/register')}
                className={`inline-flex min-h-8 coarse:min-h-9 items-center justify-center gap-1.5 py-1.5 touch-manipulation ${
                  mode === 'register'
                    ? 'win95-button-pressed bg-win-surface text-win-ink'
                    : 'win95-button text-win-ink'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5 text-win-navy" />
                <span>Реєстрація</span>
              </button>
            </div>

            {hasAnyVisibleError && (
              <div
                role="alert"
                data-testid="auth-error-panel"
                className="win95-outset bg-win-bg p-1"
              >
                <div className="win95-inset flex items-start gap-2.5 bg-logic-x-bg px-3 py-2.5 text-xs">
                  <Win95StopIcon />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-bold text-logic-x">
                      {serverError
                        ? 'Помилка автентифікації або реєстрації'
                        : 'Перевірте коректність виділених червоним полів'}
                    </div>
                    {serverError ? (
                      <div className="text-win-ink">{serverError}</div>
                    ) : (
                      <ul className="list-disc pl-4 text-[11px] text-win-ink space-y-0.5">
                        {Object.values(visibleErrors).map((msg, i) => (
                          <li key={i}>{msg}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5 text-xs">
              <div>
                <label htmlFor={`${formId}-email`} className="block font-bold text-win-ink">
                  <span className="mb-1 block">Електронна пошта (Email)</span>
                </label>
                <div className="relative font-normal">
                  <Mail
                    className={`pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 ${
                      visibleErrors.email ? 'text-logic-x' : 'text-win-muted'
                    }`}
                  />
                  <input
                    id={`${formId}-email`}
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(visibleErrors.email)}
                    aria-describedby={visibleErrors.email ? `${formId}-email-err` : undefined}
                    value={email}
                    onBlur={() => markTouched('email')}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (serverError) setServerError(null);
                    }}
                    placeholder="engineer@logicforge.eda"
                    className={`${
                      visibleErrors.email ? 'win95-field-error pr-8' : 'win95-field pr-3'
                    } w-full pl-8 py-2 text-win-ink`}
                  />
                  {visibleErrors.email && (
                    <AlertCircle
                      aria-hidden="true"
                      className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-logic-x"
                    />
                  )}
                </div>
                {visibleErrors.email && (
                  <p
                    id={`${formId}-email-err`}
                    className="mt-1 flex items-center gap-1 text-[11px] font-bold text-logic-x"
                  >
                    <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{visibleErrors.email}</span>
                  </p>
                )}
              </div>

              {mode === 'register' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`${formId}-username`} className="block font-bold text-win-ink">
                      <span className="mb-1 block">Логін користувача (Username)</span>
                    </label>
                    <div className="relative font-normal">
                      <UserIcon
                        className={`pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 ${
                          visibleErrors.username ? 'text-logic-x' : 'text-win-muted'
                        }`}
                      />
                      <input
                        id={`${formId}-username`}
                        type="text"
                        autoComplete="username"
                        aria-invalid={Boolean(visibleErrors.username)}
                        aria-describedby={
                          visibleErrors.username ? `${formId}-username-err` : undefined
                        }
                        value={username}
                        onBlur={() => markTouched('username')}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          if (serverError) setServerError(null);
                        }}
                        placeholder="chip_architect"
                        className={`${
                          visibleErrors.username ? 'win95-field-error pr-8' : 'win95-field pr-3'
                        } w-full pl-8 py-2 text-win-ink`}
                      />
                      {visibleErrors.username && (
                        <AlertCircle
                          aria-hidden="true"
                          className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-logic-x"
                        />
                      )}
                    </div>
                    {visibleErrors.username && (
                      <p
                        id={`${formId}-username-err`}
                        className="mt-1 flex items-center gap-1 text-[11px] font-bold text-logic-x"
                      >
                        <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>{visibleErrors.username}</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`${formId}-fullname`} className="block font-bold text-win-ink">
                      <span className="mb-1 block">Прізвище та ім’я</span>
                    </label>
                    <div className="relative font-normal">
                      <input
                        id={`${formId}-fullname`}
                        type="text"
                        autoComplete="name"
                        aria-invalid={Boolean(visibleErrors.fullName)}
                        aria-describedby={
                          visibleErrors.fullName ? `${formId}-fullname-err` : undefined
                        }
                        value={fullName}
                        onBlur={() => markTouched('fullName')}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          if (serverError) setServerError(null);
                        }}
                        placeholder="Шевченко Іван"
                        className={`${
                          visibleErrors.fullName ? 'win95-field-error pr-8' : 'win95-field pr-3'
                        } w-full pl-3 py-2 font-normal text-win-ink`}
                      />
                      {visibleErrors.fullName && (
                        <AlertCircle
                          aria-hidden="true"
                          className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-logic-x"
                        />
                      )}
                    </div>
                    {visibleErrors.fullName && (
                      <p
                        id={`${formId}-fullname-err`}
                        className="mt-1 flex items-center gap-1 text-[11px] font-bold text-logic-x"
                      >
                        <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>{visibleErrors.fullName}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor={`${formId}-password`} className="block font-bold text-win-ink">
                  <span className="mb-1 block">Пароль</span>
                </label>
                <div className="relative font-normal">
                  <KeyRound
                    className={`pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 ${
                      visibleErrors.password ? 'text-logic-x' : 'text-win-muted'
                    }`}
                  />
                  <input
                    id={`${formId}-password`}
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    aria-invalid={Boolean(visibleErrors.password)}
                    aria-describedby={visibleErrors.password ? `${formId}-password-err` : undefined}
                    value={password}
                    onBlur={() => markTouched('password')}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (serverError) setServerError(null);
                    }}
                    placeholder="Мінімум 6 символів"
                    className={`${
                      visibleErrors.password ? 'win95-field-error pr-8' : 'win95-field pr-3'
                    } w-full pl-8 py-2 text-win-ink`}
                  />
                  {visibleErrors.password && (
                    <AlertCircle
                      aria-hidden="true"
                      className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-logic-x"
                    />
                  )}
                </div>
                {visibleErrors.password && (
                  <p
                    id={`${formId}-password-err`}
                    className="mt-1 flex items-center gap-1 text-[11px] font-bold text-logic-x"
                  >
                    <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{visibleErrors.password}</span>
                  </p>
                )}
              </div>

              <div className="pt-1">
                <Button
                  data-testid="auth-submit-btn"
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  loading={busy}
                >
                  {mode === 'login' ? 'Увійти в особистий кабінет' : 'Зареєструвати акаунт'}
                </Button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-win-shadow pt-3 text-xs text-win-muted">
              <Link
                to="/cabinet"
                className="inline-flex min-h-7 coarse:min-h-9 items-center py-1 font-bold text-win-ink hover:underline"
              >
                ← До розділу «Мої схеми»
              </Link>
              <Link
                to="/editor"
                className="inline-flex min-h-7 coarse:min-h-9 items-center py-1 font-bold text-win-navy hover:underline"
              >
                Відкрити редактор без входу →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
