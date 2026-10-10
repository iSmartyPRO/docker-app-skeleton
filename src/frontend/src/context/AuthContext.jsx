import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api, { getMe, login as loginRequest, logout as logoutRequest } from '../services/api';
import { can, canAny } from '../lib/access';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // An expired or revoked session surfaces as 401 on any request: drop the
  // user so route gates send them to /login instead of showing broken pages.
  useEffect(() => {
    const id = api.interceptors.response.use(undefined, (error) => {
      const url = error?.config?.url || '';
      if (error?.response?.status === 401 && !url.startsWith('/auth/') && !url.startsWith('/setup/')) {
        setUser(null);
      }
      return Promise.reject(error);
    });
    return () => api.interceptors.response.eject(id);
  }, []);

  useEffect(() => {
    getMe()
      .then((res) => setUser(res.data?.user || null))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      setUser,
      can: (permission) => can(user, permission),
      canAny: (permissions) => canAny(user, permissions),
      async login(payload) {
        const res = await loginRequest(payload);
        setUser(res.data.user);
        return res.data.user;
      },
      async logout() {
        try {
          await logoutRequest();
        } finally {
          setUser(null);
        }
      },
    }),
    [user, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
