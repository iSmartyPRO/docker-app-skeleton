import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { getMe, login as loginRequest, logout as logoutRequest } from '../services/api';
import { disablePush } from '../pwa/push';
import { can, canAny } from '../lib/access';
import { outageOf, reportFailure } from '../lib/outage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [ready, setReady] = useState(false);
  // Bumped on every explicit sign-in / sign-out: a /auth/me answer that was
  // started before must not overwrite it (e.g. the initial 401 resolving after
  // the magic-link callback has already signed the person in).
  const seq = useRef(0);
  // The initial /auth/me hit an outage: ask again once the server is back.
  const pending = useRef(false);

  const setUser = useCallback((next) => {
    seq.current += 1;
    pending.current = false;
    setUserState(next);
    setReady(true);
  }, []);

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
        setUserState(null);
      }
      return Promise.reject(error);
    });
    return () => api.interceptors.response.eject(id);
  }, []);

  const loadMe = useCallback(() => {
    const started = seq.current;
    return getMe()
      .then((res) => {
        if (seq.current !== started) return;
        pending.current = false;
        setUserState(res.data?.user || null);
        setReady(true);
      })
      .catch((error) => {
        if (seq.current !== started) return;
        if (outageOf(error)) {
          // Unknown, not "signed out": during an outage the gates keep waiting
          // under the "technical works" screen instead of showing /login.
          pending.current = true;
          reportFailure(error, { immediate: true });
          return;
        }
        pending.current = false;
        setUserState(null);
        setReady(true);
      });
  }, []);

  useEffect(() => {
    loadMe();
    const onRecovered = () => {
      if (pending.current) loadMe();
    };
    window.addEventListener('outage:recovered', onRecovered);
    return () => window.removeEventListener('outage:recovered', onRecovered);
  }, [loadMe]);

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
      /**
       * Signs out on the server, then here. If the server cannot be reached
       * (one retry), the person stays signed in and the error is thrown: the
       * session cookie is still valid, so pretending to be signed out on a
       * shared device would be unsafe. A 401 means the session is already gone.
       */
      async logout() {
        // A shared device must not keep receiving this person's push notifications.
        await disablePush().catch(() => {});
        navigator.clearAppBadge?.().catch?.(() => {});
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            await logoutRequest();
            lastError = null;
            break;
          } catch (error) {
            if (error?.response?.status === 401) {
              lastError = null;
              break;
            }
            lastError = error;
            if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
          }
        }
        if (lastError) throw lastError;
        setUser(null);
      },
    }),
    [user, ready, setUser]
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
