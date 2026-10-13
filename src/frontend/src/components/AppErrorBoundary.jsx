import { Component } from 'react';
import { Button } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { isChunkError, isReloading, reloadOnce } from '../lib/chunkReload';
import { BUILD, clientSessionId, reportClientError } from '../lib/outage';

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
                <dd>{new Date().toLocaleTimeString()}</dd>
              </div>
            </dl>
          )}
          <div className="app-error__actions">
            <Button type="primary" size="large" onClick={() => window.location.reload()}>{t('appError.reload')}</Button>
            {!update && (
              <Button
                size="large"
                onClick={() => {
                  const text = [`Код: APP_CRASH`, `Инцидент: ${this.state.incident || '—'}`, `Сессия: ${clientSessionId()}`, `Время: ${new Date().toLocaleString()}`, `Страница: ${window.location.pathname}`, `Сборка: ${BUILD}`, `Ошибка: ${String(error?.message || '').slice(0, 200)}`].join('\n');
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
