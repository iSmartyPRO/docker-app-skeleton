import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button } from 'antd';
import PageHeader from '../components/ui/PageHeader';
import { useLocale } from '../context/LocaleContext';
import { errorMessage } from '../lib/errors';
import { TimeChart } from '../modules/dashboard/charts';
import { personalApi } from './client';
import { CopyField, EmptyState, SecretModal, TokenEditor } from './components';
import { TokenRow, useTokenActions } from './console/Tokens';
import { RequestTable } from './console/RequestLog';

/** /account/api — the person's own tokens. */
export default function ApiTokensPage() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  const [requests, setRequests] = useState([]);
  const [editor, setEditor] = useState({ open: false, token: null });
  const [secret, setSecret] = useState(null);

  const load = useCallback(async () => {
    try {
      const [res, log] = await Promise.all([personalApi.load(), personalApi.requests({ limit: 20 })]);
      setData(res.data);
      setRequests(log.data.requests);
    } catch (err) {
      if (err?.response?.status === 403) setDenied(true);
      else message.error(errorMessage(err));
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const actions = useTokenActions(personalApi, { onChanged: load, showSecret: setSecret });
  const openEditor = (token = null) => setEditor({ open: true, token });

  if (denied) {
    return (
      <div>
        <PageHeader title={t('api.personal.title')} description={t('api.personal.lead')} />
        <EmptyState icon="lock" title={t('api.personal.title')} text={t('api.personal.disabled')} />
      </div>
    );
  }

  const active = data?.tokens.filter((token) => token.state === 'active') || [];
  const inactive = data?.tokens.filter((token) => token.state !== 'active') || [];
  const day = (value) => new Date(value).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' });

  return (
    <div className="ax-personal dc-scope">
      <PageHeader
        title={t('api.personal.title')}
        description={t('api.personal.lead')}
        extra={
          <>
            <Link to="/developers" target="_blank" rel="noreferrer">
              <Button>{t('api.docs')} ↗</Button>
            </Link>
            <Button type="primary" onClick={() => openEditor()} disabled={!data}>
              ＋ {t('api.newToken')}
            </Button>
          </>
        }
      />
      {data && <CopyField value={`${data.origin}/api/v1`} label={t('api.baseUrl')} />}
      {!data ? (
        <div className="ax-skeleton" />
      ) : data.tokens.length === 0 ? (
        <EmptyState
          icon="key"
          title={t('api.noTokens')}
          text={t('api.noTokensText')}
          action={
            <Button type="primary" size="large" onClick={() => openEditor()}>
              ＋ {t('api.newToken')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="ax-tokens">
            {[...active, ...inactive].map((token) => (
              <TokenRow key={token.id} token={token} showOwner={false} onEdit={openEditor} onRotate={actions.rotate} onRevoke={actions.revoke} onDelete={actions.remove} />
            ))}
          </div>
          {data.stats.totals.total > 0 && (
            <section className="ax-card">
              <header>
                <h3>{t('api.personal.activity')}</h3>
                <span className="ax-muted">{data.stats.totals.total}</span>
              </header>
              <div className="ax-chart is-small">
                <TimeChart
                  labels={data.stats.series.map((point) => point.at)}
                  series={[
                    { key: 'total', label: t('api.chart.requests'), values: data.stats.series.map((point) => point.total), color: 'var(--da-primary)' },
                    { key: 'errors', label: t('api.chart.errors'), values: data.stats.series.map((point) => point.errors), color: '#EF4444' },
                  ]}
                  height={160}
                  formatLabel={day}
                />
              </div>
              {requests.length > 0 && <RequestTable rows={requests} />}
            </section>
          )}
        </>
      )}
      {data && (
        <TokenEditor
          open={editor.open}
          token={editor.token}
          templates={data.templates.filter((template) => Object.entries(template.scopes).every(([key, level]) => level === 'none' || data.areas.some((area) => area.key === key)))}
          areas={data.areas}
          resources={data.resources}
          resourceKinds={data.resourceKinds}
          config={data.config}
          client={personalApi}
          onClose={() => setEditor({ open: false, token: null })}
          onSaved={load}
          onSecret={setSecret}
        />
      )}
      <SecretModal open={Boolean(secret)} secret={secret} origin={data?.origin || window.location.origin} onClose={() => setSecret(null)} />
    </div>
  );
}
