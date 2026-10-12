import { Suspense, lazy, useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
  useLocation,
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
import { ChatProvider } from './modules/chat/ChatContext';
import { HelpProvider } from './help/HelpContext';
// Texts of task events in conversations (task chats show up on the chat page too).
import './modules/tasks/chatEvents';
import { LEGACY_ADMIN_ROUTES, SETTINGS_ITEMS } from './admin/navigation';
import { SETTINGS_PAGES } from './admin/settingsPages';
import { loginUrl } from './lib/returnPath';
import AppErrorBoundary from './components/AppErrorBoundary';
import { getSetupStatus } from './services/api';
import { SETTINGS_VIEW } from './lib/access';
import { MODULE_REGISTRY } from './modules/registry';
import { applyAppIcon } from './pwa/appIcon';

// Public entry points stay in the main bundle; consoles load on demand.
import Home from './pages/Home';
import Login from './pages/Login';

// The robot assistant loads after the page, never delaying it.
const Assistant = lazy(() => import('./modules/assistant/Assistant'));
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
const AppsPage = lazy(() => import('./pages/Apps'));
const PublicShare = lazy(() => import('./modules/kb/PublicShare'));
const InstallPage = lazy(() => import('./pwa/InstallPage'));
const PublicLink = lazy(() => import('./modules/files/PublicLink'));
const PublicDrive = lazy(() => import('./modules/drive/PublicDrive'));
const ResourcesHome = lazy(() => import('./modules/resources/ResourcesHome'));
const SettingsHome = lazy(() => import('./pages/admin/settings/SettingsHome'));
const AccountProfile = lazy(() => import('./pages/account/Profile'));
const AccountAppearance = lazy(() => import('./pages/account/Appearance'));
const AccountSecurity = lazy(() => import('./pages/account/Security'));
const AccountNotifications = lazy(() => import('./pages/account/Notifications'));
const AccountConnections = lazy(() => import('./pages/account/Connections'));
const ApiConsole = lazy(() => import('./developer/ApiConsole'));
const ApiTokensPage = lazy(() => import('./developer/ApiTokensPage'));
const Developers = lazy(() => import('./developer/Developers'));
const HelpCenter = lazy(() => import('./help/HelpCenter'));

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
  const location = useLocation();
  const { settings, ready: settingsReady } = useSettings();

  if (!ready || !settingsReady) return <Screen />;
  if ((settings?.accessMode || 'closed') === 'closed' && !user) {
    return <Navigate to={loginUrl(location)} replace />;
  }
  return children;
}

function AuthGate({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Screen />;
  if (!user) return <Navigate to={loginUrl(location)} replace />;
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

/** A module route: hidden (redirect to /apps) when the module is switched off. */
function ModuleGate({ id, children }) {
  const { settings, ready } = useSettings();
  if (!ready) return <Screen />;
  if (!settings?.modules?.[id]?.enabled) return <Navigate to="/apps" replace />;
  return children;
}

/**
 * "/" follows Settings → Site access → Home page: the landing page, the
 * online resources board (works for guests too) or any other module
 * (guests are sent to sign in first).
 */
function HomeRoute() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const location = useLocation();
  const page = settings?.homePage || 'landing';
  const module = page !== 'landing' && settings?.modules?.[page]?.enabled ? MODULE_REGISTRY.find((entry) => entry.id === page) : null;
  if (!module) return <Home />;
  if (module.id === 'resources') return <ResourcesHome />;
  if (!user) return <Navigate to={loginUrl({ ...location, pathname: module.path })} replace />;
  return <Navigate to={module.path} replace />;
}

/** /admin/<old path> → new location, so bookmarks keep working. */
function LegacyAdminRedirect() {
  const params = useParams();
  const rest = params['*'] || '';
  const target = LEGACY_ADMIN_ROUTES[rest];
  return <Navigate to={target ? `/admin/${target}` : '/admin'} replace />;
}

function ThemedRoutes() {
  const location = useLocation();
  const { antdConfig, mode } = useThemeMode();
  const { locale } = useLocale();
  const { settings } = useSettings();

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.lang = locale;
  }, [mode, locale]);

  // Installed app (PWA): status-bar colour follows the theme; custom icon and name on iOS.
  useEffect(() => {
    const setMeta = (selector, attr, value) => {
      const node = document.head.querySelector(selector);
      if (node && value) node.setAttribute(attr, value);
    };
    setMeta('meta[name="theme-color"]', 'content', mode === 'dark' ? '#0B1220' : '#F8FAFC');
    setMeta('meta[name="apple-mobile-web-app-status-bar-style"]', 'content', mode === 'dark' ? 'black-translucent' : 'default');
    setMeta('meta[name="apple-mobile-web-app-title"]', 'content', settings?.appearance?.shortName || settings?.appName);
  }, [mode, settings]);

  // Tab icon, touch icon and manifest follow "App icon" at once (also right
  // after an admin uploads one). Until settings arrive index.html's
  // /api/pwa/icon already points at the configured icon.
  const appIconUrl = settings?.appearance?.appIconUrl;
  useEffect(() => {
    if (settings) applyAppIcon(appIconUrl);
  }, [settings, appIconUrl]);

  useEffect(() => {
    if (settings?.appName) document.title = settings.appName;
  }, [settings?.appName]);

  return (
    <ConfigProvider theme={antdConfig} locale={locale === 'ru' ? ruRU : enUS}>
      <AntApp className="ant-app-root">
        <AppErrorBoundary resetKey={location.pathname}>
        <HelpProvider>
        <Suspense fallback={<Screen />}>
          <Routes>
            <Route path="/setup" element={<SetupWizard />} />
            <Route path="/auth/magic" element={<AuthCallback kind="magic" />} />
            <Route path="/auth/telegram" element={<AuthCallback kind="telegram" />} />
            <Route path="/s/:slug/*" element={<PublicShare />} />
            <Route path="/l/:token" element={<PublicLink />} />
            <Route path="/d/:token" element={<PublicDrive />} />
            <Route
              path="/install"
              element={
                <SetupGate>
                  <InstallPage />
                </SetupGate>
              }
            />
            <Route
              path="/apps"
              element={
                <SetupGate>
                  <AuthGate>
                    <AppsPage />
                  </AuthGate>
                </SetupGate>
              }
            />
            {MODULE_REGISTRY.map((module) => (
              <Route
                key={module.id}
                path={`${module.path}/*`}
                element={
                  <SetupGate>
                    <AuthGate>
                      <ModuleGate id={module.id}>
                        <module.App />
                      </ModuleGate>
                    </AuthGate>
                  </SetupGate>
                }
              />
            ))}
            <Route
              path="/help/:id?"
              element={
                <SetupGate>
                  <AuthGate>
                    <HelpCenter />
                  </AuthGate>
                </SetupGate>
              }
            />
            <Route
              path="/developers"
              element={
                <SetupGate>
                  <Developers />
                </SetupGate>
              }
            />
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
                    <HomeRoute />
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
              <Route path="api" element={<Allow any={['api.admin']}><ApiConsole /></Allow>} />
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
              <Route path="notifications" element={<AccountNotifications />} />
              <Route path="connections" element={<AccountConnections />} />
              <Route path="api" element={<ApiTokensPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Suspense fallback={null}>
          <Assistant />
        </Suspense>
        </HelpProvider>
        </AppErrorBoundary>
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
            <ChatProvider>
              <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ThemedRoutes />
              </Router>
            </ChatProvider>
          </ThemeProvider>
        </LocaleProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
