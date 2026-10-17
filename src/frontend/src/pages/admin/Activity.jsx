import { useCallback, useEffect, useState } from 'react';
import { App, Button, Select, Table, Tag, Typography } from 'antd';
import PageHeader from '../../components/ui/PageHeader';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatRelative } from '../../lib/format';
import { listSecurityEvents } from '../../services/api';
import { translate } from '../../i18n/translations';
import Incidents from './Incidents';

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
  'secret_unreadable',
  'impersonation_start',
  'impersonation_end',
  'directory_linked',
  'directory_unlinked',
  'directory_password',
  'directory_password_removed',
  'folder_access_changed',
  'folder_group_changed',
  'folder_access_password',
  'folder_ntfs_changed',
  'demo_data',
  'org_structure',
  'employee_account',
];

export const EVENT_TAG = {
  impersonation_start: 'purple',
  impersonation_end: 'purple',
  directory_linked: 'blue',
  directory_unlinked: 'blue',
  directory_password: 'blue',
  directory_password_removed: 'blue',
  folder_access_changed: 'cyan',
  folder_group_changed: 'magenta',
  folder_access_password: 'blue',
  folder_ntfs_changed: 'volcano',
  demo_data: 'gold',
  org_structure: 'geekblue',
  employee_account: 'cyan',
  login_failed: 'warning',
  lockout: 'error',
  account_disabled: 'error',
  account_blocked: 'error',
  ip_blocked: 'error',
  ip_denied: 'error',
  rate_limited: 'warning',
  code_unknown: 'warning',
  code_delivery_failed: 'error',
  secret_unreadable: 'error',
};

/**
 * The detail of an event in the reader's language: events carry a text code and
 * its parameters (activity.detail.<code>); older rows and codes without a text
 * show the English detail stored with them.
 */
export function eventDetail(row, locale) {
  if (row?.detail_code) {
    const text = translate(locale, `activity.detail.${row.detail_code}`, row.detail_params || {});
    if (text) return text;
  }
  return row?.detail || '';
}

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
              render: (value, row) => <Text type="secondary">{eventDetail(row, locale) || '—'}</Text>,
            },
          ]}
        />
      </section>
      <Incidents />
    </div>
  );
}
