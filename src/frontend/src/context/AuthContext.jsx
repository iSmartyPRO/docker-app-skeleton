import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api, { getMe, login as loginRequest, logout as logoutRequest } from '../services/api';
import { disablePush } from '../pwa/push';
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
      // Other 401s (a wrong link password, a file-server login) carry their own
      // code and must not end the portal session.
      const code = error?.response?.data?.code;
      const sessionLost = !code || code === 'SESSION_REQUIRED';
      if (error?.response?.status === 401 && sessionLost && !url.startsWith('/auth/') && !url.startsWith('/setup/')) {
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
          // A shared device must not keep receiving this person's push notifications.
          await disablePush().catch(() => {});
          navigator.clearAppBadge?.().catch?.(() => {});
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
