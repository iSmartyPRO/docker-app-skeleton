import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import Chrome from '../components/Chrome';
import AppFooter from '../components/AppFooter';
import { MenuIcon } from '../components/icons/menuIcons';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';

const { Sider, Content } = Layout;

export default function AccountLayout() {
  const { t } = useLocale();
  const { appearance } = useThemeMode();
  const location = useLocation();

  const items = useMemo(
    () => [
      {
        key: '/account',
        icon: <MenuIcon name="user" appearance={appearance} />,
        label: <NavLink to="/account">{t('account.profile')}</NavLink>,
      },
      {
        key: '/account/appearance',
        icon: <MenuIcon name="palette" appearance={appearance} />,
        label: <NavLink to="/account/appearance">{t('account.appearance')}</NavLink>,
      },
      {
        key: '/account/security',
        icon: <MenuIcon name="lock" appearance={appearance} />,
        label: <NavLink to="/account/security">{t('account.security')}</NavLink>,
      },
    ],
    [t, appearance]
  );

  return (
    <div className="shell">
      <Chrome dense />
      <Layout className="workspace">
        <Sider className="workspace__sider" width={240} theme="light">
          <div className="workspace__brand">
            <MenuIcon name="user" appearance={appearance} />
            <span>{t('account.title')}</span>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={items}
            className="workspace__menu"
          />
        </Sider>
        <Content className="workspace__content">
          <Outlet />
        </Content>
      </Layout>
      <AppFooter />
    </div>
  );
}
