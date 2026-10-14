import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { App, Button, Switch } from 'antd';
import { PlusOutlined, ReadOutlined } from '@ant-design/icons';
import { useLocale } from '../context/LocaleContext';
import { errorMessage } from '../lib/errors';
import { consoleApi } from './client';
import { CopyField, GlyphIcon, SecretModal, TokenEditor } from './components';
import Overview from './console/Overview';
import Tokens from './console/Tokens';
import Templates from './console/Templates';
import Webhooks from './console/Webhooks';
import RequestLog from './console/RequestLog';
import ApiSettings from './console/ApiSettings';

const TABS = ['overview', 'tokens', 'templates', 'webhooks', 'log', 'settings'];

/**
 * /admin/api — the API console: tokens of everyone, access templates,
 * webhooks, the request log and API settings.
 */
export default function ApiConsole() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const [overview, setOverview] = useState(null);
  const [meta, setMeta] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [editor, setEditor] = useState({ open: false, token: null });
  const [secret, setSecret] = useState(null);
  const [tokensVersion, setTokensVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const [o, m, tp] = await Promise.all([consoleApi.overview(), consoleApi.meta(), consoleApi.templates()]);
      setOverview(o.data);
      setMeta(m.data);
      setTemplates(tp.data.templates);
    } catch (err) {
      message.error(errorMessage(err));
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const go = (next, extra = {}) => setParams({ tab: next, ...extra }, { replace: false });
  const config = overview?.config;

  const toggleApi = async (enabled) => {
    try {
      const res = await consoleApi.saveConfig({ enabled });
      setOverview((prev) => ({ ...prev, config: res.data.config }));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const openEditor = (token = null) => setEditor({ open: true, token });
  const shared = { overview, meta, templates, config, reload: load, openEditor, go, tokensVersion, setTemplates, showSecret: setSecret };

  return (
    <div className="ax-page">
      <header className="ax-hero">
        <div className="ax-hero__glow" aria-hidden="true" />
        <div className="ax-hero__text">
          <span className="ax-hero__eyebrow">
            <GlyphIcon name="code" /> REST · Webhooks · OpenAPI 3.1
          </span>
          <h1>{t('api.title')}</h1>
          <p>{t('api.lead')}</p>
        </div>
        <div className="ax-hero__side">
          {overview && <CopyField value={`${overview.origin}/api/v1`} label={t('api.baseUrl')} />}
          <div className="ax-hero__actions">
            {config && (
              <label className={`ax-switch${config.enabled ? ' is-on' : ''}`}>
                <Switch checked={config.enabled} onChange={toggleApi} />
                <span>{config.enabled ? t('api.on') : t('api.off')}</span>
              </label>
            )}
            <Link to="/developers" target="_blank" rel="noreferrer" tabIndex={-1}>
              <Button className="mod-act" icon={<ReadOutlined />} aria-label={t('api.docs')} title={t('api.docs')}>
                <span>{t('api.docs')}</span>
              </Button>
            </Link>
            <Button type="primary" onClick={() => openEditor()} disabled={!meta} icon={<PlusOutlined />}>
              {t('api.newToken')}
            </Button>
          </div>
        </div>
      </header>

      <nav className="ax-tabs" role="tablist">
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => go(key)}>
            {t(`api.tabs.${key}`)}
            {key === 'tokens' && overview?.counts?.tokens ? <b>{overview.counts.tokens}</b> : null}
            {key === 'webhooks' && overview?.counts?.webhooks ? <b>{overview.counts.webhooks}</b> : null}
          </button>
        ))}
      </nav>

      <div className="ax-body" key={tab}>
        {tab === 'overview' && <Overview {...shared} />}
        {tab === 'tokens' && <Tokens {...shared} />}
        {tab === 'templates' && <Templates {...shared} />}
        {tab === 'webhooks' && <Webhooks {...shared} />}
        {tab === 'log' && <RequestLog {...shared} />}
        {tab === 'settings' && <ApiSettings {...shared} setOverview={setOverview} />}
      </div>

      {meta && (
        <TokenEditor
          open={editor.open}
          token={editor.token}
          templates={templates}
          areas={meta.areas}
          resources={meta.resources}
          resourceKinds={meta.resourceKinds}
          people={meta.people}
          config={config}
          client={consoleApi}
          onClose={() => setEditor({ open: false, token: null })}
          onSaved={() => {
            setTokensVersion((v) => v + 1);
            load();
          }}
          onSecret={(value) => setSecret(value)}
        />
      )}
      <SecretModal open={Boolean(secret)} secret={secret} origin={overview?.origin || window.location.origin} onClose={() => setSecret(null)} />
    </div>
  );
}
