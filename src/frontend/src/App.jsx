import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import enUS from 'antd/locale/en_US';
import ruRU from 'antd/locale/ru_RU';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LocaleProvider, useLocale } from './context/LocaleContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import FontLoader from './components/FontLoader';
import { ThemeProvider, useThemeMode } from './context/ThemeContext';
import Home from './pages/Home';
import Login from './pages/Login';
import SetupWizard from './pages/SetupWizard';
import AdminLayout from './layouts/AdminLayout';
import AccountLayout from './layouts/AccountLayout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminGeneral from './pages/admin/General';
import AdminAppearance from './pages/admin/Appearance';
import AdminTypography from './pages/admin/Typography';
import AdminMenuIcons from './pages/admin/MenuIcons';
import AdminIntegration from './pages/admin/Integration';
import AdminUsers from './pages/admin/Users';
import AdminUserEdit from './pages/admin/UserEdit';
import AdminSecurity from './pages/admin/Security';
import AdminIpLists from './pages/admin/IpLists';
import AdminSecurityHistory from './pages/admin/SecurityHistory';
import AccountProfile from './pages/account/Profile';
import AccountAppearance from './pages/account/Appearance';
import AccountSecurity from './pages/account/Security';
import { getSetupStatus } from './services/api';

function Screen({ children }) {
  return (
    <div className="boot-screen">
      <Spin size="large" />
    </div>
  );
}

function SetupGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    getSetupStatus()
      .then((res) => setNeedsSetup(Boolean(res.data?.needsSetup)))
      .catch(() => setNeedsSetup(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Screen />;
  if (needsSetup) return <Navigate to="/setup" replace />;
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
  const { user, ready } = useAuth();
  if (!ready) return <Screen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/account" replace />;
  return children;
}

function ThemedRoutes() {
  const { antdConfig, mode } = useThemeMode();
  const { locale } = useLocale();

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.lang = locale;
  }, [mode, locale]);

  return (
    <ConfigProvider theme={antdConfig} locale={locale === 'ru' ? ruRU : enUS}>
      <Routes>
        <Route path="/setup" element={<SetupWizard />} />
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
          <Route path="general" element={<AdminGeneral />} />
          <Route path="appearance" element={<AdminAppearance />} />
          <Route path="typography" element={<AdminTypography />} />
          <Route path="icons" element={<AdminMenuIcons />} />
          <Route path="integrations/:kind" element={<AdminIntegration />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminUserEdit />} />
          <Route path="security" element={<AdminSecurity />} />
          <Route path="security/ip" element={<AdminIpLists />} />
          <Route path="security/history" element={<AdminSecurityHistory />} />
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
            <Router>
              <ThemedRoutes />
            </Router>
          </ThemeProvider>
        </LocaleProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
