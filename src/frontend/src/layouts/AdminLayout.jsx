import { Suspense, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Spin } from 'antd';
import Chrome from '../components/Chrome';
import AppFooter from '../components/AppFooter';
import CommandPalette, { useCommandPaletteHotkey } from '../components/CommandPalette';
import { MenuIcon } from '../components/icons/menuIcons';
import { ADMIN_PAGES, visibleAdminPages } from '../admin/navigation';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useThemeMode } from '../context/ThemeContext';
import PageTransition from '../components/ui/PageTransition';

const { Sider, Content } = Layout;

const SIDER_KEY = 'da_admin_sider';

function loadCollapsed() {
  try {
    return JSON.parse(localStorage.getItem(SIDER_KEY) || '{}').collapsed === true;
  } catch {
    return false;
  }
}

/** The most specific sidebar entry that owns the current path. */
function selectedKey(pathname) {
  // Module docs (/admin/modules/<id>/docs) belong to Settings → Modules.
  if (pathname.startsWith('/admin/modules')) return '/admin/settings';
  const match = ADMIN_PAGES.filter(
    (page) => pathname === page.key || (page.key !== '/admin' && pathname.startsWith(`${page.key}/`))
  ).sort((a, b) => b.key.length - a.key.length)[0];
  return match?.key || '/admin';
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function PageFallback() {
  return (
    <div className="page-fallback">
      <Spin />
    </div>
  );
}

/** Settings screens share one shell: only their content animates (SettingsLayout). */
function sectionKey(pathname) {
  const path = pathname.replace(/\/$/, '');
  if (path === '/admin/settings') return 'settings-hub';
  return path.startsWith('/admin/settings/') ? 'settings' : path;
}

export default function AdminLayout() {
  const { t } = useLocale();
  const { appearance } = useThemeMode();
  const location = useLocation();
  const navigate = useNavigate();
  // `collapsed` is the saved desktop preference; below the lg breakpoint the
  // sider is collapsed by default and the trigger only expands it temporarily.
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [broken, setBroken] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const effectiveCollapsed = broken ? !mobileExpanded : collapsed;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { canAny } = useAuth();
  const pages = visibleAdminPages(canAny);

  useCommandPaletteHotkey(setPaletteOpen);

  useEffect(() => {
    try {
      localStorage.setItem(SIDER_KEY, JSON.stringify({ collapsed }));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const items = useMemo(
    () =>
      // In a collapsed Sider antd shows the label as a tooltip by itself.
      pages.map((page) => ({
        key: page.key,
        icon: <MenuIcon slot={page.key} appearance={appearance} />,
        label: t(page.labelKey),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, appearance, pages.map((page) => page.key).join()]
  );

  const shortcut = isMac ? '⌘K' : 'Ctrl K';

  return (
    <div className="shell">
      <Chrome dense />
      <Layout className="workspace">
        <Sider
          className={`workspace__sider${effectiveCollapsed ? ' is-collapsed' : ''}`}
          width={252}
          collapsedWidth={68}
          collapsible
          collapsed={effectiveCollapsed}
          onBreakpoint={(isBroken) => {
            setBroken(isBroken);
            setMobileExpanded(false);
          }}
          onCollapse={(value, type) => {
            // antd also fires this on breakpoint changes; only honor real clicks.
            if (type !== 'clickTrigger') return;
            if (broken) setMobileExpanded(!value);
            else setCollapsed(value);
          }}
          breakpoint="lg"
          theme="light"
        >
          <div className="workspace__head">
            {!effectiveCollapsed && <div className="workspace__eyebrow">{t('nav.console')}</div>}
            <button
              type="button"
              className="workspace__search"
              onClick={() => setPaletteOpen(true)}
              aria-label={t('nav.search')}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {!effectiveCollapsed && (
                <>
                  <span className="workspace__search-text">{t('nav.search')}</span>
                  <kbd>{shortcut}</kbd>
                </>
              )}
            </button>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey(location.pathname)]}
            onClick={({ key }) => navigate(key)}
            items={items}
            className="workspace__menu"
          />
        </Sider>
        <Content className="workspace__content">
          <Suspense fallback={<PageFallback />}>
            <PageTransition id={sectionKey(location.pathname)}>
              <Outlet />
            </PageTransition>
          </Suspense>
        </Content>
      </Layout>
      <AppFooter />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
