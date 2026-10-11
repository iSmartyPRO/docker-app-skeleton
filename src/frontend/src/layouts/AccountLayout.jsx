import { Suspense, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import Chrome from '../components/Chrome';
import AppFooter from '../components/AppFooter';
import { MenuIcon } from '../components/icons/menuIcons';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { PageFallback } from './AdminLayout';
import PageTransition from '../components/ui/PageTransition';

const { Sider, Content } = Layout;

const ITEMS = [
  { key: '/account', icon: 'user', labelKey: 'account.profile' },
  { key: '/account/appearance', icon: 'palette', labelKey: 'account.appearance' },
  { key: '/account/security', icon: 'lock', labelKey: 'account.security' },
  { key: '/account/notifications', icon: 'bell', labelKey: 'notifications.prefsTitle' },
  { key: '/account/connections', icon: 'integrations', labelKey: 'connections.title' },
  { key: '/account/api', icon: 'code', labelKey: 'account.api', permissions: ['api.tokens', 'api.admin'] },
];

export default function AccountLayout() {
  const { t } = useLocale();
  const { appearance } = useThemeMode();
  const location = useLocation();
  const navigate = useNavigate();

  const { canAny } = useAuth();
  const items = useMemo(
    () =>
      ITEMS.filter((item) => !item.permissions || canAny(item.permissions)).map((item) => ({
        key: item.key,
        icon: <MenuIcon name={item.icon} appearance={appearance} />,
        label: t(item.labelKey),
      })),
    [t, appearance, canAny]
  );

  return (
    <div className="shell">
      <Chrome dense />
      <Layout className="workspace">
        <Sider className="workspace__sider" width={240} breakpoint="md" collapsedWidth={68} theme="light">
          <div className="workspace__head">
            <div className="workspace__eyebrow">{t('account.title')}</div>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={items}
            onClick={({ key }) => navigate(key)}
            className="workspace__menu"
          />
        </Sider>
        <Content className="workspace__content">
          <Suspense fallback={<PageFallback />}>
            <PageTransition>
              <Outlet />
            </PageTransition>
          </Suspense>
        </Content>
      </Layout>
      <AppFooter />
    </div>
  );
}
