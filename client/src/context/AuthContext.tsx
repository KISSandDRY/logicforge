import React, { createContext, useContext, useEffect, useState } from 'react';
import { safeParseUserDto, type UserDTO } from '@logicforge/shared-types';
import { api, getStoredToken, setStoredToken } from '../services/api';

const USER_STORAGE_KEY = 'logicforge_user';
const TOKEN_STORAGE_KEY = 'logicforge_token';

interface AuthContextValue {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    email: string;
    username: string;
    fullName: string;
    password: string;
  }) => Promise<void>;
  loginDemo: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDTO | null>(() => {
    try {
      return safeParseUserDto(localStorage.getItem(USER_STORAGE_KEY));
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const token = getStoredToken() ?? localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    setStoredToken(token);
    if (token.startsWith('local-session-')) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((res) => {
        if (res?.user) {
          setUser(res.user);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
        }
      })
      .catch(() => {
        // Якщо використовується офлайн-сесія — зберігаємо локальний профіль
      })
      .finally(() => setLoading(false));
  }, []);

  const saveSession = (token: string, nextUser: UserDTO) => {
    setStoredToken(token);
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const login = async (email: string, password: string) => {
    try {
      const res = await api.login({ email, password });
      if (!res?.user || !res?.token) {
        throw new Error('API unavailable: invalid response payload');
      }
      saveSession(res.token, res.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const isOfflineUnavailable =
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('API unavailable') ||
        msg.includes('HTTP Error 5') ||
        msg.includes('HTTP Error 404') ||
        msg.includes('HTTP Error 405');
      // Якщо сервер недоступний (офлайн-режим), створюємо локальну авторизовану сесію
      if (isOfflineUnavailable) {
        const localName = email.split('@')[0] || 'engineer';
        saveSession(`local-session-${Date.now()}`, {
          id: `u-local-${localName}`,
          email,
          username: localName,
          fullName: localName.charAt(0).toUpperCase() + localName.slice(1),
          role: 'STUDENT',
          createdAt: new Date().toISOString(),
        });
        return;
      }
      throw err;
    }
  };

  const register = async (payload: {
    email: string;
    username: string;
    fullName: string;
    password: string;
  }) => {
    try {
      const res = await api.register(payload);
      if (!res?.user || !res?.token) {
        throw new Error('API unavailable: invalid response payload');
      }
      saveSession(res.token, res.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const isOfflineUnavailable =
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('API unavailable') ||
        msg.includes('HTTP Error 5') ||
        msg.includes('HTTP Error 404') ||
        msg.includes('HTTP Error 405');
      if (isOfflineUnavailable) {
        saveSession(`local-session-${Date.now()}`, {
          id: `u-local-${payload.username}`,
          email: payload.email,
          username: payload.username,
          fullName: payload.fullName,
          role: 'STUDENT',
          createdAt: new Date().toISOString(),
        });
        return;
      }
      throw err;
    }
  };

  const loginDemo = async () => {
    try {
      const res = await api.demoLogin();
      saveSession(res.token, res.user);
    } catch {
      saveSession('local-session-token', {
        id: 'u-demo-lpnu-001',
        email: 'engineer@logicforge.eda',
        username: 'digital_engineer',
        fullName: 'Інженер-схемотехнік',
        role: 'STUDENT',
        createdAt: new Date().toISOString(),
      });
    }
  };

  const logout = () => {
    setStoredToken(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
    void api.logout().catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginDemo, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
