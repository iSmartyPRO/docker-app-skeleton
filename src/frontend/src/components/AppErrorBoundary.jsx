import { Component } from 'react';
import { Button } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { isChunkError, isReloading, reloadOnce } from '../lib/chunkReload';

class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reloading: false };
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
  }

  componentDidUpdate(prev) {
    // Navigating elsewhere gives the next page a fresh chance.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, reloading: false });
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
          <div className="app-error__actions">
            <Button type="primary" size="large" onClick={() => window.location.reload()}>{t('appError.reload')}</Button>
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
