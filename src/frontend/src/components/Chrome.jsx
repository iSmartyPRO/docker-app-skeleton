import { Suspense, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { App, Avatar, Dropdown, Tooltip } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useSettings } from '../context/SettingsContext';
import { useThemeMode } from '../context/ThemeContext';
import { initials } from '../lib/format';
import { can, primaryRole, roleLabel } from '../lib/access';
import BrandMark from './BrandMark';
import LanguageSwitch, { languageItems } from './LanguageSwitch';
import ThemeSwitch from './ThemeSwitch';
import { IconAdmin, IconLogin } from './icons/AdminIcons';
import { MenuIcon } from './icons/menuIcons';
import { enabledModules, moduleLabel } from '../modules/registry';
import { preloadProps } from '../lib/lazyPage';
import NotificationBell from './NotificationBell';
import { useContributions } from '../platform/extensions';
import { isStandalone } from '../pwa/pwa';
import { useHelp } from '../help/HelpContext';
import api from '../services/api';
import DemoBanner from './DemoBanner';

// Phones: help, theme, language and the console move into the account menu
// (index.css hides their header buttons at the same width).
const NARROW = '(max-width: 560px)';

function useNarrow() {
  const [narrow, setNarrow] = useState(() => Boolean(window.matchMedia?.(NARROW).matches));
  useEffect(() => {
    const query = window.matchMedia?.(NARROW);
    if (!query) return undefined;
    const update = () => setNarrow(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}

/** Grid button listing every enabled module (the "app launcher"). */
function AppsLauncher() {
  const { t } = useLocale();
  const { settings } = useSettings();
  const { user } = useAuth();
  const navigate = useNavigate();
  const modules = enabledModules(settings, user);
  if (!modules.length) return null;
  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      overlayClassName="launcher"
      popupRender={() => (
        <div className="launcher__panel">
          <div className="launcher__title">{t('apps.title')}</div>
          <div className="launcher__grid">
            {modules.map((module) => (
              <button key={module.id} type="button" className="launcher__app" onClick={() => navigate(module.path)} {...preloadProps(module)}>
                <MenuIcon name={module.icon} />
                <span>{moduleLabel(module, settings, t)}</span>
              </button>
            ))}
          </div>
          <Link to="/apps" className="launcher__all">{t('apps.all')} →</Link>
        </div>
      )}
    >
      <button type="button" className="chrome__icon" aria-label={t('apps.title')} data-tour="header.launcher">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          {[5, 12, 19].flatMap((x) => [5, 12, 19].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.9" fill="currentColor" />))}
        </svg>
      </button>
    </Dropdown>
  );
}

function UserMenu({ user, onHelp }) {
  const { logout } = useAuth();
  const { t, locale, languages, setLocale } = useLocale();
  const { mode, setMode } = useThemeMode();
  const narrow = useNarrow();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const name = user.displayName || user.username;
  const isAdmin = can(user, 'console.access');
  const role = primaryRole(user);

  const items = [
    {
      key: 'head',
      disabled: true,
      className: 'user-menu__head',
      label: (
        <div className="user-menu__who">
          <strong>{name}</strong>
          <span>
            @{user.username}
            {role ? ` · ${roleLabel(role, t)}` : ''}
          </span>
        </div>
      ),
    },
    { type: 'divider' },
    { key: '/account', label: t('menu.cabinet') },
    ...(isAdmin
      ? [
          { key: '/admin', label: t('menu.adminConsole') },
          ...(user.permissions?.some((perm) => perm === '*' || perm.startsWith('settings.'))
            ? [{ key: '/admin/settings', label: t('menu.settings') }]
            : []),
        ]
      : []),
    ...(isStandalone() ? [] : [{ key: '/install', label: `📱 ${t('pwa.install.menu')}` }]),
    ...(narrow
      ? [
          { type: 'divider' },
          { key: 'help', label: t('help.title') },
          { key: 'theme', label: t(mode === 'dark' ? 'header.lightTheme' : 'header.darkTheme') },
          ...(languages.length > 1 ? [{ key: 'lang', label: t('header.language'), children: languageItems(languages, locale, 'lang:') }] : []),
        ]
      : []),
    { type: 'divider' },
    { key: 'logout', danger: true, label: t('common.signOut') },
  ];

  const onClick = async ({ key }) => {
    if (key === 'help') return onHelp();
    if (key === 'theme') return setMode(mode === 'dark' ? 'light' : 'dark');
    if (key.startsWith('lang:')) return setLocale(key.slice(5));
    if (key === 'logout') {
      try {
        await logout();
      } catch {
        // The server did not end the session: the person stays signed in.
        message.error(t('common.signOutFailed'));
        return;
      }
      navigate('/login', { replace: true });
      return;
    }
    navigate(key);
  };

  return (
    <Dropdown menu={{ items, onClick }} trigger={['click']} placement="bottomRight" overlayClassName="user-menu">
      <button type="button" className="chrome__user" aria-label={t('common.account')} data-tour="header.user">
        <Avatar size={30} src={user.avatarUrl}>
          {initials(name)}
        </Avatar>
        <span className="chrome__user-name">{name}</span>
        <span className="chrome__caret" aria-hidden="true">
          <DownOutlined />
        </span>
      </button>
    </Dropdown>
  );
}

/**
 * Shown while a superadministrator acts as someone else ("sign in as"):
 * whose portal this is and a way back to their own account.
 */
function ImpersonationBar({ user }) {
  const { t } = useLocale();
  const back = async () => {
    try {
      await api.post('/auth/impersonate/stop');
    } finally {
      window.location.assign(`/admin/users/${user.id}`);
    }
  };
  return (
    <div className="imp-bar" role="status">
      <span className="imp-bar__eye" aria-hidden="true">👁</span>
      <span className="imp-bar__text">
        {t('userLinks.barText', { name: user.displayName || user.username, admin: user.impersonator.displayName || user.impersonator.username || '' })}
      </span>
      <button type="button" onClick={back}>
        {t('userLinks.barBack')}
      </button>
    </div>
  );
}

export default function Chrome({ dense }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const { settings } = useSettings();
  const name = settings?.appName || t('brand');
  const location = useLocation();
  const navigate = useNavigate();
  // An installed app has no browser back button: offer one away from the home page.
  const { openHelp } = useHelp();
  const showBack = isStandalone() && location.pathname !== '/' && window.history.length > 1;
  const headerActions = useContributions('header.actions');

  return (
    <>
    {user?.impersonator && <ImpersonationBar user={user} />}
    <DemoBanner />
    <header className={`chrome ${dense ? 'chrome--dense' : ''}`}>
      {showBack && (
        <button type="button" className="chrome__back" onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      <Link to="/" className="chrome__brand">
        <BrandMark />
        <span className="chrome__name">{name}</span>
      </Link>
      <div className={`chrome__actions${user ? ' has-user' : ''}`}>
        <LanguageSwitch />
        <ThemeSwitch />
        {user ? (
          <>
            <Tooltip title={`${t('help.title')} · ?`} mouseEnterDelay={0.3}>
              <button type="button" className="chrome__icon chrome__help" onClick={() => openHelp()} aria-label={t('help.title')} data-tour="header.help">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" />
                  <circle cx="12" cy="17" r="0.6" fill="currentColor" />
                </svg>
              </button>
            </Tooltip>
            {/* Buttons modules add to the top bar (chat, «Ждёт меня»): header.actions. */}
            <Suspense fallback={null}>
              {headerActions.map(({ id, Component }) => (
                <Component key={id} />
              ))}
            </Suspense>
            <NotificationBell />
            <AppsLauncher />
            {can(user, 'console.access') && (
              <Tooltip title={t('menu.adminConsole')} mouseEnterDelay={0.15}>
                <Link className="chrome__icon chrome__admin" to="/admin" aria-label={t('common.admin')} data-tour="header.admin">
                  <IconAdmin />
                </Link>
              </Tooltip>
            )}
            <UserMenu user={user} onHelp={() => openHelp()} />
          </>
        ) : (
          <Tooltip title={t('common.signIn')} mouseEnterDelay={0.15}>
            <Link className="chrome__icon" to="/login" aria-label={t('common.signIn')}>
              <IconLogin />
            </Link>
          </Tooltip>
        )}
      </div>
    </header>
    </>
  );
}
