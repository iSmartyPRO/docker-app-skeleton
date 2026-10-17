import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Button, Input, Select } from 'antd';
import Segmented from '../../components/ui/Segmented';
import { ReloadOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { consoleApi } from '../client';
import { MethodBadge, areaTitle, statusClass } from '../components';

/** Every token call with filters; also used (narrowed) on the personal page. */
export function RequestTable({ rows, showToken = true }) {
  const { t, locale } = useLocale();
  return (
    <div className="ax-table">
      <div className="ax-table__head">
        <span>{t('api.log.time')}</span>
        {showToken && <span>{t('api.log.token')}</span>}
        <span>{t('api.log.method')}</span>
        <span>Path</span>
        <span>HTTP</span>
        <span>{t('api.log.ms')}</span>
        <span>{t('api.log.ip')}</span>
      </div>
      {rows.map((row) => (
        <div key={row.id} className={`ax-table__row${showToken ? '' : ' is-narrow'}`}>
          <span className="ax-muted" title={formatDateTime(row.at, locale)}>
            {formatDateTime(row.at, locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          {showToken && (
            <span className="ax-table__token">
              {row.token ? (
                <>
                  <b>{row.token.name}</b>
                  <code>{row.token.prefix}</code>
                </>
              ) : (
                '—'
              )}
            </span>
          )}
          <span>
            <MethodBadge method={row.method} small />
          </span>
          <span className="ax-table__path">
            <code>{row.path}</code>
            {row.code && <em>{row.code}</em>}
          </span>
          <span className={`ax-status ${statusClass(row.status)}`}>{row.status}</span>
          <span className="ax-muted">{row.ms}</span>
          <span className="ax-muted">{row.ip}</span>
        </div>
      ))}
    </div>
  );
}

export default function RequestLog({ meta }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ status: params.get('status') || 'all', tokenId: undefined, method: undefined, area: undefined, q: '' });
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const [tokens, setTokens] = useState([]);

  useEffect(() => {
    consoleApi.tokens({}).then((res) => setTokens(res.data.tokens)).catch(() => {});
  }, []);

  const query = useCallback(
    (before) => ({
      tokenId: filters.tokenId,
      method: filters.method,
      area: filters.area,
      status: filters.status === 'all' ? undefined : filters.status,
      q: filters.q || undefined,
      before,
      limit: 100,
    }),
    [filters]
  );

  const load = useCallback(async () => {
    try {
      const res = await consoleApi.requests(query());
      setRows(res.data.requests);
      setMore(res.data.more);
    } catch (err) {
      message.error(errorMessage(err));
    }
  }, [query, message]);

  useEffect(() => {
    const timer = setTimeout(load, filters.q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.q]);

  const loadMore = async () => {
    const res = await consoleApi.requests(query(rows[rows.length - 1]?.id));
    setRows([...rows, ...res.data.requests]);
    setMore(res.data.more);
  };
  const set = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  return (
    <div className="ax-stack">
      <div className="ax-toolbar">
        <Segmented
          value={filters.status}
          onChange={(status) => set({ status })}
          options={[
            { value: 'all', label: t('api.allStates') },
            { value: 'ok', label: t('api.log.ok') },
            { value: 'error', label: t('api.log.error') },
          ]}
        />
        <Select
          allowClear
          showSearch
          placeholder={t('api.log.anyToken')}
          value={filters.tokenId}
          onChange={(tokenId) => set({ tokenId })}
          optionFilterProp="label"
          style={{ minWidth: 200 }}
          options={tokens.map((token) => ({ value: token.id, label: `${token.name} · ${token.prefix}` }))}
        />
        <Select allowClear placeholder={t('api.log.method')} value={filters.method} onChange={(method) => set({ method })} style={{ width: 120 }} options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))} />
        <Select allowClear placeholder={t('api.log.area')} value={filters.area} onChange={(area) => set({ area })} style={{ minWidth: 170 }} options={(meta?.areas || []).map((area) => ({ value: area.key, label: areaTitle(t, area.key) }))} />
        <Input allowClear placeholder={t('api.log.path')} value={filters.q} onChange={(event) => set({ q: event.target.value })} style={{ width: 220 }} className="ax-mono" />
        <span className="ax-grow" />
        <Button onClick={load} icon={<ReloadOutlined />}>{t('api.log.refresh')}</Button>
      </div>
      {rows === null ? (
        <div className="ax-skeleton" />
      ) : rows.length ? (
        <>
          <RequestTable rows={rows} />
          {more && (
            <div className="ax-center">
              <Button onClick={loadMore}>{t('api.log.more')}</Button>
            </div>
          )}
        </>
      ) : (
        <p className="ax-muted ax-pad">{t('api.log.empty')}</p>
      )}
    </div>
  );
}
