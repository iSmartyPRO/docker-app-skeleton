import { Suspense, lazy, useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
  useParams,
} from 'react-router-dom';
import { App as AntApp, ConfigProvider, Spin } from 'antd';
import enUS from 'antd/locale/en_US';
import ruRU from 'antd/locale/ru_RU';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LocaleProvider, useLocale } from './context/LocaleContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import FontLoader from './components/FontLoader';
import { ThemeProvider, useThemeMode } from './context/ThemeContext';
import { LEGACY_ADMIN_ROUTES, SETTINGS_ITEMS } from './admin/navigation';
import { SETTINGS_PAGES } from './admin/settingsPages';
import { getSetupStatus } from './services/api';
import { SETTINGS_VIEW } from './lib/access';

// Public entry points stay in the main bundle; consoles load on demand.
import Home from './pages/Home';
import Login from './pages/Login';

const SetupWizard = lazy(() => import('./pages/SetupWizard'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const SettingsLayout = lazy(() => import('./layouts/SettingsLayout'));
const AccountLayout = lazy(() => import('./layouts/AccountLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminUserEdit = lazy(() => import('./pages/admin/UserEdit'));
const AdminActivity = lazy(() => import('./pages/admin/Activity'));
const AdminGroups = lazy(() => import('./pages/admin/Groups'));
const AdminRoles = lazy(() => import('./pages/admin/Roles'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const SettingsHome = lazy(() => import('./pages/admin/settings/SettingsHome'));
const AccountProfile = lazy(() => import('./pages/account/Profile'));
const AccountAppearance = lazy(() => import('./pages/account/Appearance'));
const AccountSecurity = lazy(() => import('./pages/account/Security'));

function Screen() {
  return (
    <div className="boot-screen">
      <Spin size="large" />
    </div>
  );
}

// Setup can only move forward, so once it reports "done" we stop asking.
let setupDone = false;

function SetupGate({ children }) {
  const [state, setState] = useState(setupDone ? 'done' : 'loading');

  useEffect(() => {
    if (setupDone) return;
    getSetupStatus()
      .then((res) => {
        const needs = Boolean(res.data?.needsSetup);
        if (!needs) setupDone = true;
        setState(needs ? 'needed' : 'done');
      })
      // A failed status check (network, 5xx) must not bounce a configured
      // product into the wizard; let the page load and surface its own errors.
      .catch(() => setState('done'));
  }, []);

  if (state === 'loading') return <Screen />;
  if (state === 'needed') return <Navigate to="/setup" replace />;
  return children;
}

function AccessGate({ children }) {
  const { user, ready } = useAuth();
  const { settings, ready: settingsReady } = useSettings();

  if (!ready || !settingsReady) return <Screen />;
  if ((settings?.accessMode || 'closed') === 'closed' && !user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AuthGate({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Screen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminGate({ children }) {
  const { user, ready, can } = useAuth();
  if (!ready) return <Screen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!can('console.access')) return <Navigate to="/account" replace />;
  return children;
}

/** Hides a console page the user has no permission for. */
function Allow({ any, children }) {
  const { canAny } = useAuth();
  return canAny(any) ? children : <Navigate to="/admin" replace />;
}

/** /admin/<old path> → new location, so bookmarks keep working. */
function LegacyAdminRedirect() {
  const params = useParams();
  const rest = params['*'] || '';
  const target = LEGACY_ADMIN_ROUTES[rest];
  return <Navigate to={target ? `/admin/${target}` : '/admin'} replace />;
}

function ThemedRoutes() {
  const { antdConfig, mode } = useThemeMode();
  const { locale } = useLocale();
  const { settings } = useSettings();

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.lang = locale;
  }, [mode, locale]);

  useEffect(() => {
    if (settings?.appName) document.title = settings.appName;
  }, [settings?.appName]);

  return (
    <ConfigProvider theme={antdConfig} locale={locale === 'ru' ? ruRU : enUS}>
      <AntApp className="ant-app-root">
        <Suspense fallback={<Screen />}>
          <Routes>
            <Route path="/setup" element={<SetupWizard />} />
            <Route path="/auth/magic" element={<AuthCallback kind="magic" />} />
            <Route path="/auth/telegram" element={<AuthCallback kind="telegram" />} />
            <Route
              path="/login"
              element={
                <SetupGate>
                  <Login />
                </SetupGate>
              }
            />
            <Route
              path="/"
              element={
                <SetupGate>
                  <AccessGate>
                    <Home />
                  </AccessGate>
                </SetupGate>
              }
            />
            <Route
              path="/admin"
              element={
                <SetupGate>
                  <AdminGate>
                    <AdminLayout />
                  </AdminGate>
                </SetupGate>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<Allow any={['users.view']}><AdminUsers /></Allow>} />
              <Route path="users/:id" element={<Allow any={['users.view']}><AdminUserEdit /></Allow>} />
              <Route path="groups" element={<Allow any={['users.view']}><AdminGroups /></Allow>} />
              <Route path="roles" element={<Allow any={['users.view']}><AdminRoles /></Allow>} />
              <Route path="activity" element={<Allow any={['activity.view']}><AdminActivity /></Allow>} />
              <Route path="settings" element={<Allow any={SETTINGS_VIEW}><SettingsLayout /></Allow>}>
                <Route index element={<SettingsHome />} />
                {SETTINGS_ITEMS.map((item) => {
                  const Page = SETTINGS_PAGES[item.id];
                  return Page ? (
                    <Route key={item.id} path={item.id} element={<Page key={item.id} itemId={item.id} />} />
                  ) : null;
                })}
                <Route path="*" element={<Navigate to="/admin/settings" replace />} />
              </Route>
              <Route path="*" element={<LegacyAdminRedirect />} />
            </Route>
            <Route
              path="/account"
              element={
                <SetupGate>
                  <AuthGate>
                    <AccountLayout />
                  </AuthGate>
                </SetupGate>
              }
            >
              <Route index element={<AccountProfile />} />
              <Route path="appearance" element={<AccountAppearance />} />
              <Route path="security" element={<AccountSecurity />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AntApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <LocaleProvider>
          <ThemeProvider>
            <FontLoader />
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <ThemedRoutes />
            </Router>
          </ThemeProvider>
        </LocaleProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
