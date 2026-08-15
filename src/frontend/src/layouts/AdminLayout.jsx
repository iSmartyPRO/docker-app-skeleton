import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Tooltip } from 'antd';
import Chrome from '../components/Chrome';
import AppFooter from '../components/AppFooter';
import { MenuIcon } from '../components/icons/menuIcons';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';

const { Sider, Content } = Layout;

const SIDER_KEY = 'da_admin_sider';
const TOP_KEYS = ['project', 'integrations', 'people', 'security'];

function loadSider() {
  try {
    const raw = localStorage.getItem(SIDER_KEY);
    if (!raw) return { collapsed: false, openKeys: [] };
    const data = JSON.parse(raw);
    return {
      collapsed: Boolean(data.collapsed),
      openKeys: Array.isArray(data.openKeys) ? data.openKeys.filter((key) => typeof key === 'string') : [],
    };
  } catch {
    return { collapsed: false, openKeys: [] };
  }
}

function ancestorsFor(path) {
  if (
    path.startsWith('/admin/general') ||
    path.startsWith('/admin/appearance') ||
    path.startsWith('/admin/typography') ||
    path.startsWith('/admin/icons')
  ) {
    const keys = ['project'];
    if (
      path.startsWith('/admin/appearance') ||
      path.startsWith('/admin/typography') ||
      path.startsWith('/admin/icons')
    ) {
      keys.push('appearance');
    }
    return keys;
  }
  if (path.startsWith('/admin/integrations')) return ['integrations'];
  if (path.startsWith('/admin/users')) return ['people'];
  if (path.startsWith('/admin/security')) return ['security'];
  return [];
}

function sameKeys(a, b) {
  return a.length === b.length && a.every((key) => b.includes(key));
}

export default function AdminLayout() {
  const { t } = useLocale();
  const { appearance } = useThemeMode();
  const location = useLocation();
  const navigate = useNavigate();
  const initial = useMemo(loadSider, []);
  const [collapsed, setCollapsed] = useState(initial.collapsed);
  const [openKeys, setOpenKeys] = useState(() => {
    const needed = ancestorsFor(location.pathname);
    return [...new Set([...initial.openKeys, ...needed])];
  });

  useEffect(() => {
    localStorage.setItem(SIDER_KEY, JSON.stringify({ collapsed, openKeys }));
  }, [collapsed, openKeys]);

  useEffect(() => {
    if (!collapsed) return;
    const needed = ancestorsFor(location.pathname);
    if (!needed.length) return;
    setOpenKeys((prev) => {
      const top = needed[0];
      const next = [...new Set([...prev.filter((key) => !TOP_KEYS.includes(key) || key === top), ...needed])];
      return sameKeys(prev, next) ? prev : next;
    });
  }, [collapsed, location.pathname]);

  const icon = (slot, title) => {
    const node = <MenuIcon slot={slot} appearance={appearance} />;
    if (!collapsed) return node;
    return (
      <Tooltip title={title} placement="right" mouseEnterDelay={0.15}>
        <span className="workspace__menu-tip">{node}</span>
      </Tooltip>
    );
  };

  const label = (title, to) => {
    if (collapsed) {
      return <span className="workspace__menu-label-hidden">{title}</span>;
    }
    return to ? <NavLink to={to}>{title}</NavLink> : title;
  };

  const items = useMemo(
    () => [
      {
        key: '/admin',
        icon: icon('/admin', t('admin.dashboard')),
        label: label(t('admin.dashboard'), '/admin'),
      },
      {
        key: 'project',
        icon: icon('project', t('admin.project')),
        label: label(t('admin.project')),
        children: [
          {
            key: '/admin/general',
            icon: icon('/admin/general', t('admin.general')),
            label: label(t('admin.general'), '/admin/general'),
          },
          {
            key: 'appearance',
            icon: icon('appearance', t('admin.appearance')),
            label: label(t('admin.appearance')),
            children: [
              {
                key: '/admin/appearance',
                icon: icon('/admin/appearance', t('admin.theme')),
                label: label(t('admin.theme'), '/admin/appearance'),
              },
              {
                key: '/admin/typography',
                icon: icon('/admin/typography', t('admin.typography')),
                label: label(t('admin.typography'), '/admin/typography'),
              },
              {
                key: '/admin/icons',
                icon: icon('/admin/icons', t('admin.iconStyle')),
                label: label(t('admin.iconStyle'), '/admin/icons'),
              },
            ],
          },
        ],
      },
      {
        key: 'integrations',
        icon: icon('integrations', t('admin.integrations')),
        label: label(t('admin.integrations')),
        children: [
          {
            key: '/admin/integrations/email',
            icon: icon('/admin/integrations/email', t('admin.email')),
            label: label(t('admin.email'), '/admin/integrations/email'),
          },
          {
            key: '/admin/integrations/telegram',
            icon: icon('/admin/integrations/telegram', t('admin.telegram')),
            label: label(t('admin.telegram'), '/admin/integrations/telegram'),
          },
          {
            key: '/admin/integrations/whatsapp',
            icon: icon('/admin/integrations/whatsapp', t('admin.whatsapp')),
            label: label(t('admin.whatsapp'), '/admin/integrations/whatsapp'),
          },
          {
            key: '/admin/integrations/ad',
            icon: icon('/admin/integrations/ad', t('admin.ad')),
            label: label(t('admin.ad'), '/admin/integrations/ad'),
          },
        ],
      },
      {
        key: 'people',
        icon: icon('people', t('admin.people')),
        label: label(t('admin.people')),
        children: [
          {
            key: '/admin/users',
            icon: icon('/admin/users', t('admin.users')),
            label: label(t('admin.users'), '/admin/users'),
          },
        ],
      },
      {
        key: 'security',
        icon: icon('security', t('admin.security')),
        label: label(t('admin.security')),
        children: [
          {
            key: '/admin/security',
            icon: icon('/admin/security', t('admin.access')),
            label: label(t('admin.access'), '/admin/security'),
          },
          {
            key: '/admin/security/ip',
            icon: icon('/admin/security/ip', t('admin.ipLists')),
            label: label(t('admin.ipLists'), '/admin/security/ip'),
          },
          {
            key: '/admin/security/history',
            icon: icon('/admin/security/history', t('admin.history')),
            label: label(t('admin.history'), '/admin/security/history'),
          },
        ],
      },
    ],
    [t, appearance, collapsed]
  );

  const handleCollapse = (next) => {
    setCollapsed(next);
    if (next) setOpenKeys(ancestorsFor(location.pathname));
  };

  const handleOpenChange = (keys) => {
    if (!collapsed) {
      setOpenKeys(keys);
      return;
    }
    const opened = keys.find((key) => !openKeys.includes(key));
    if (opened && TOP_KEYS.includes(opened)) {
      setOpenKeys(keys.filter((key) => !TOP_KEYS.includes(key) || key === opened));
      return;
    }
    setOpenKeys(keys);
  };

  return (
    <div className="shell">
      <Chrome dense />
      <Layout className="workspace">
        <Sider
          className={`workspace__sider${collapsed ? ' is-collapsed' : ''}`}
          width={268}
          collapsedWidth={64}
          collapsible
          collapsed={collapsed}
          onCollapse={handleCollapse}
          theme="light"
        >
          <Menu
            mode="inline"
            inlineCollapsed={false}
            selectedKeys={[location.pathname]}
            openKeys={openKeys}
            onOpenChange={handleOpenChange}
            onClick={({ key }) => {
              if (key.startsWith('/')) navigate(key);
            }}
            expandIcon={collapsed ? () => null : undefined}
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
