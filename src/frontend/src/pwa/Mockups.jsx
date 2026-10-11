import { useLocale } from '../context/LocaleContext';

/*
 * Illustrations for the install guide: phone screens drawn in HTML/CSS, so
 * they use the real app name and icon, follow the language and the theme,
 * and stay sharp on any screen. `.mk-hot` marks the element to tap.
 */

function Phone({ os, children, dark }) {
  return (
    <div className={`mk-phone is-${os}${dark ? ' is-dark' : ''}`} aria-hidden="true">
      <div className="mk-phone__screen">
        <div className="mk-status">
          <span>9:41</span>
          <span className="mk-status__icons">
            <i className="mk-signal" />
            <i className="mk-battery" />
          </span>
        </div>
        {os === 'ios' && <span className="mk-island" />}
        {children}
      </div>
    </div>
  );
}

function PageSkeleton({ app }) {
  return (
    <div className="mk-page">
      <div className="mk-page__bar">
        <img src={app.icon} alt="" />
        <b>{app.name}</b>
      </div>
      <div className="mk-page__hero" />
      <div className="mk-page__line" />
      <div className="mk-page__line is-short" />
      <div className="mk-page__cards">
        <i />
        <i />
      </div>
    </div>
  );
}

function Tap() {
  return <span className="mk-tap" />;
}

// ── iPhone (Safari) ─────────────────────────────────────────────────────────

export function IosSafari({ app }) {
  return (
    <Phone os="ios">
      <PageSkeleton app={app} />
      <div className="mk-safari">
        <div className="mk-safari__url">
          <span>🔒</span> {app.host}
        </div>
        <div className="mk-safari__tools">
          <span>‹</span>
          <span className="is-muted">›</span>
          <span className="mk-hot">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
              <path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H17" />
            </svg>
            <Tap />
          </span>
          <span>▢</span>
          <span>⧉</span>
        </div>
      </div>
    </Phone>
  );
}

export function IosShareSheet({ app }) {
  const { t } = useLocale();
  return (
    <Phone os="ios">
      <PageSkeleton app={app} />
      <div className="mk-dim" />
      <div className="mk-sheet">
        <div className="mk-sheet__app">
          <img src={app.icon} alt="" />
          <div>
            <b>{app.name}</b>
            <span>{app.host}</span>
          </div>
        </div>
        <div className="mk-sheet__group">
          <div className="mk-sheet__row">{t('pwa.mock.copy')}<span>⧉</span></div>
          <div className="mk-sheet__row">{t('pwa.mock.favorites')}<span>☆</span></div>
        </div>
        <div className="mk-sheet__group">
          <div className="mk-sheet__row mk-hot">
            {t('pwa.mock.addHome')}
            <span>⊞</span>
            <Tap />
          </div>
          <div className="mk-sheet__row">{t('pwa.mock.bookmark')}<span>📖</span></div>
        </div>
      </div>
    </Phone>
  );
}

export function IosAddDialog({ app }) {
  const { t } = useLocale();
  return (
    <Phone os="ios">
      <div className="mk-modal-ios">
        <div className="mk-modal-ios__bar">
          <span className="is-link">{t('pwa.mock.cancel')}</span>
          <b>{t('pwa.mock.addHomeTitle')}</b>
          <span className="is-link is-bold mk-hot">
            {t('pwa.mock.add')}
            <Tap />
          </span>
        </div>
        <div className="mk-modal-ios__card">
          <img src={app.icon} alt="" />
          <div>
            <div className="mk-input">{app.shortName}</div>
            <span>{app.origin}</span>
          </div>
        </div>
        <p>{t('pwa.mock.addHomeNote')}</p>
      </div>
    </Phone>
  );
}

const HOME_COLORS = ['#34C759', '#007AFF', '#FF9500', '#FF2D55', '#5856D6', '#AF52DE', '#5AC8FA', '#FFCC00', '#8E8E93', '#FF3B30', '#30B0C7'];

export function HomeScreen({ app, os }) {
  return (
    <Phone os={os} dark>
      <div className={`mk-home is-${os}`}>
        {HOME_COLORS.slice(0, 9).map((color) => (
          <div key={color} className="mk-home__app">
            <i style={{ background: color }} />
            <span />
          </div>
        ))}
        <div className="mk-home__app is-ours mk-hot">
          <img src={app.icon} alt="" />
          <span className="is-label">{app.shortName}</span>
          <Tap />
        </div>
        {HOME_COLORS.slice(9).map((color) => (
          <div key={color} className="mk-home__app">
            <i style={{ background: color }} />
            <span />
          </div>
        ))}
      </div>
      <div className="mk-dock">
        {['#34C759', '#007AFF', '#FF9500', '#5AC8FA'].map((color) => (
          <i key={color} style={{ background: color }} />
        ))}
      </div>
    </Phone>
  );
}

// ── Android (Chrome) ────────────────────────────────────────────────────────

function ChromeBar({ app, hotMenu }) {
  return (
    <div className="mk-chrome">
      <span className="mk-chrome__home">⌂</span>
      <div className="mk-chrome__url">
        <span>🔒</span> {app.host}
      </div>
      <span className="mk-chrome__tabs">2</span>
      <span className={`mk-chrome__menu${hotMenu ? ' mk-hot' : ''}`}>
        ⋮{hotMenu && <Tap />}
      </span>
    </div>
  );
}

export function AndroidChrome({ app }) {
  return (
    <Phone os="android">
      <ChromeBar app={app} hotMenu />
      <PageSkeleton app={app} />
    </Phone>
  );
}

export function AndroidMenu({ app }) {
  const { t } = useLocale();
  return (
    <Phone os="android">
      <ChromeBar app={app} />
      <PageSkeleton app={app} />
      <div className="mk-menu">
        <div className="mk-menu__icons">
          <span>→</span>
          <span>☆</span>
          <span>⤓</span>
          <span>ⓘ</span>
          <span>↻</span>
        </div>
        <div className="mk-menu__row">{t('pwa.mock.newTab')}</div>
        <div className="mk-menu__row">{t('pwa.mock.history')}</div>
        <div className="mk-menu__row">{t('pwa.mock.downloads')}</div>
        <div className="mk-menu__row mk-hot">
          <span className="mk-menu__icon">⊕</span>
          {t('pwa.mock.installApp')}
          <Tap />
        </div>
        <div className="mk-menu__row">{t('pwa.mock.settings')}</div>
      </div>
    </Phone>
  );
}

export function AndroidInstallDialog({ app }) {
  const { t } = useLocale();
  return (
    <Phone os="android">
      <ChromeBar app={app} />
      <PageSkeleton app={app} />
      <div className="mk-dim" />
      <div className="mk-dialog">
        <b>{t('pwa.mock.installTitle')}</b>
        <div className="mk-dialog__app">
          <img src={app.icon} alt="" />
          <div>
            <strong>{app.name}</strong>
            <span>{app.host}</span>
          </div>
        </div>
        <div className="mk-dialog__buttons">
          <span>{t('pwa.mock.cancel')}</span>
          <span className="is-primary mk-hot">
            {t('pwa.mock.install')}
            <Tap />
          </span>
        </div>
      </div>
    </Phone>
  );
}

// ── Desktop (Chrome / Edge) ─────────────────────────────────────────────────

export function DesktopInstall({ app }) {
  const { t } = useLocale();
  return (
    <div className="mk-desktop" aria-hidden="true">
      <div className="mk-desktop__top">
        <span className="mk-desktop__dots">
          <i />
          <i />
          <i />
        </span>
        <div className="mk-desktop__url">
          <span>🔒 {app.host}</span>
          <span className="mk-desktop__install mk-hot">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="13" rx="2" />
              <path d="M12 8v6M9 11l3 3 3-3M8 20h8" />
            </svg>
            <Tap />
          </span>
        </div>
      </div>
      <div className="mk-desktop__body">
        <PageSkeleton app={app} />
        <div className="mk-desktop__popup">
          <b>{t('pwa.mock.installTitle')}</b>
          <div className="mk-dialog__app">
            <img src={app.icon} alt="" />
            <div>
              <strong>{app.name}</strong>
              <span>{app.host}</span>
            </div>
          </div>
          <div className="mk-dialog__buttons">
            <span className="is-primary">{t('pwa.mock.install')}</span>
            <span>{t('pwa.mock.cancel')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
