import { useCallback, useEffect, useState } from 'react';
import { App, Button, Select, Table, Tag, Typography } from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatRelative } from '../../lib/format';
import { listSecurityEvents } from '../../services/api';

const { Text } = Typography;

export const EVENT_KINDS = [
  'login_failed',
  'lockout',
  'account_disabled',
  'account_blocked',
  'ip_blocked',
  'ip_denied',
  'rate_limited',
  'code_unknown',
  'code_delivery_failed',
];

export const EVENT_TAG = {
  login_failed: 'warning',
  lockout: 'error',
  account_disabled: 'error',
  account_blocked: 'error',
  ip_blocked: 'error',
  ip_denied: 'error',
  rate_limited: 'warning',
  code_unknown: 'warning',
  code_delivery_failed: 'error',
};

const SUMMARY = [
  ['login_failed', 'admin.eventLoginFailed'],
  ['lockout', 'admin.eventLockout'],
  ['ip_blocked', 'admin.eventIpBlocked'],
  ['ip_denied', 'admin.eventIpDenied'],
];

export default function AdminActivity() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [kind, setKind] = useState();
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextKind) => {
      setLoading(true);
      try {
        const res = await listSecurityEvents({ kind: nextKind || undefined, limit: 300 });
        setEvents(res.data.events || []);
        setSummary(res.data.summary || {});
      } catch (err) {
        message.error(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [message]
  );

  useEffect(() => {
    load(kind);
  }, [load, kind]);

  return (
    <div>
      <PageHeader
        title={t('activity.title')}
        description={t('activity.lead')}
        extra={<Button onClick={() => load(kind)}>{t('admin.historyRefresh')}</Button>}
      />
      <div className="kpi-grid kpi-grid--compact">
        {SUMMARY.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`kpi is-link${kind === key ? ' is-active' : ''}`}
            onClick={() => setKind(kind === key ? undefined : key)}
          >
            <span className="kpi__label">{t(label)}</span>
            <span className={`kpi__value${summary[key] ? ' is-alert' : ''}`}>{summary[key] || 0}</span>
          </button>
        ))}
      </div>
      <section className="panel">
        <header className="panel__head">
          <Select
            allowClear
            placeholder={t('admin.historyFilter')}
            style={{ minWidth: 240 }}
            value={kind}
            onChange={setKind}
            options={EVENT_KINDS.map((item) => ({ value: item, label: t(`admin.event_${item}`) }))}
          />
        </header>
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={events}
          pagination={{ pageSize: 25, showSizeChanger: false, hideOnSinglePage: true }}
          scroll={{ x: 720 }}
          columns={[
            {
              title: t('admin.historyTime'),
              dataIndex: 'created_at',
              width: 200,
              render: (value) => (
                <span title={formatDateTime(value, locale)}>{formatRelative(value, locale)}</span>
              ),
            },
            {
              title: t('admin.historyKind'),
              dataIndex: 'kind',
              width: 200,
              render: (value) => (
                <Tag color={EVENT_TAG[value] || 'default'} bordered={false}>
                  {t(`admin.event_${value}`)}
                </Tag>
              ),
            },
            { title: t('users.username'), dataIndex: 'username', render: (value) => value || '—' },
            {
              title: t('admin.ip'),
              dataIndex: 'ip',
              render: (value) => (value ? <Text code>{value}</Text> : '—'),
            },
            {
              title: t('admin.historyDetail'),
              dataIndex: 'detail',
              render: (value) => <Text type="secondary">{value || '—'}</Text>,
            },
          ]}
        />
      </section>
    </div>
  );
}
