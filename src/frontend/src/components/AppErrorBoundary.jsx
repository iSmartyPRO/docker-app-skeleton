import { Component } from 'react';
import { Button } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { isChunkError, isReloading, reloadOnce } from '../lib/chunkReload';
import { fmtTime } from '../lib/datetime';
import { BUILD, clientSessionId, reportClientError, supportTime } from '../lib/outage';
import { normalizeLocale, pick } from '../i18n/languages';

class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reloading: false, incident: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isReloading() || (isChunkError(error) && reloadOnce())) {
      this.setState({ reloading: true });
      return;
    }
    console.error('Page failed to render', error, info?.componentStack);
    // The crash goes to the server's incident list; its id is shown for support.
    reportClientError({ message: error?.message, stack: `${error?.stack || ''}\n${info?.componentStack || ''}` }).then((incident) => this.setState({ incident }));
  }

  componentDidUpdate(prev) {
    // Navigating elsewhere gives the next page a fresh chance.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, reloading: false, incident: null });
  }

  render() {
    const { error, reloading } = this.state;
    const { t, children } = this.props;
    if (!error) return children;
    if (reloading || isReloading()) return <div className="app-error is-quiet">{t('appError.updating')}</div>;
    const update = isChunkError(error);
    return (
      <div className="app-error" role="alert">
        <div className="app-error__card">
          <div className="app-error__icon" aria-hidden="true">{update ? '✨' : '⚠️'}</div>
          <h1>{update ? t('appError.updateTitle') : t('appError.title')}</h1>
          <p>{update ? t('appError.updateText') : t('appError.text')}</p>
          {!update && (
            <dl className="mnt__ids app-error__ids">
              <div>
                <dt>{t('appError.code')}</dt>
                <dd>APP_CRASH</dd>
              </div>
              <div>
                <dt>{t('appError.session')}</dt>
                <dd>{clientSessionId()}</dd>
              </div>
              {this.state.incident && (
                <div>
                  <dt>{t('appError.incident')}</dt>
                  <dd>{this.state.incident}</dd>
                </div>
              )}
              <div>
                <dt>{t('outage.since')}</dt>
                <dd>{fmtTime(new Date())}</dd>
              </div>
            </dl>
          )}
          <div className="app-error__actions">
            <Button type="primary" size="large" onClick={() => window.location.reload()}>{t('appError.reload')}</Button>
            {!update && (
              <Button
                size="large"
                onClick={() => {
                  const text = [`Код: APP_CRASH`, `Инцидент: ${this.state.incident || '—'}`, `Сессия: ${clientSessionId()}`, `Время: ${supportTime()}`, `Страница: ${window.location.pathname}`, `Сборка: ${BUILD}`, `Ошибка: ${String(error?.message || '').slice(0, 200)}`].join('\n');
                  navigator.clipboard?.writeText(text).catch(() => {});
                  this.setState({ copied: true });
                }}
              >
                {this.state.copied ? `✓ ${t('appError.copied')}` : t('appError.copy')}
              </Button>
            )}
            <Button size="large" onClick={() => { window.location.href = '/'; }}>{t('appError.home')}</Button>
          </div>
        </div>
      </div>
    );
  }
}

/** Keeps a failing page from blanking the whole app; recovers by itself after a deploy. */
export default function AppErrorBoundary({ resetKey, children }) {
  const { t } = useLocale();
  return (
    <Boundary resetKey={resetKey} t={t}>
      {children}
    </Boundary>
  );
}

/**
 * Last line of defence around the providers themselves (settings, auth,
 * locale, theme): plain markup and no context hooks, since those providers
 * may be exactly what failed.
 */
export class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isReloading() || (isChunkError(error) && reloadOnce())) return;
    console.error('App failed to start', error, info?.componentStack);
    reportClientError({ message: error?.message, stack: `${error?.stack || ''}\n${info?.componentStack || ''}` }, 'APP_ROOT_CRASH');
  }

  render() {
    if (!this.state.error) return this.props.children;
    // Texts inline: the dictionaries may be exactly what failed to load. Add a language here too.
    const lang = normalizeLocale(document.documentElement.lang) || normalizeLocale(navigator.language) || 'en';
    const text = pick(
      {
        ru: { title: 'Не удалось открыть портал', body: 'Обновите страницу. Если ошибка повторяется, сообщите в поддержку код сессии:', reload: 'Обновить' },
        en: { title: 'The portal could not start', body: 'Reload the page. If it happens again, tell support this session code:', reload: 'Reload' },
        ky: { title: 'Порталды ачуу мүмкүн болгон жок', body: 'Бетти жаңыртыңыз. Ката кайталанса, колдоо кызматына бул сессиянын кодун айтыңыз:', reload: 'Жаңыртуу' },
        tr: { title: 'Portal başlatılamadı', body: 'Sayfayı yenileyin. Sorun tekrarlanırsa destek ekibine bu oturum kodunu iletin:', reload: 'Yenile' },
        zh: { title: '门户无法启动', body: '请刷新页面。如果问题再次出现，请将此会话代码告知技术支持：', reload: '刷新' },
      },
      lang
    );
    return (
      <div role="alert" style={{ maxWidth: 480, margin: '15vh auto', padding: 16, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20 }}>{text.title}</h1>
        <p>{text.body}</p>
        <p><code>{clientSessionId()}</code></p>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: '8px 20px', fontSize: 16 }}>{text.reload}</button>
      </div>
    );
  }
}
