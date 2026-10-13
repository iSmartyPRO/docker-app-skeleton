import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Table, Tag, Typography } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { formatDateTime, formatRelative } from '../../lib/format';
import api from '../../services/api';

const { Text } = Typography;

/**
 * Server errors and browser crashes since the last restart, newest first. A
 * person's code, request or session id from the error screen finds them.
 */
export default function Incidents() {
  const { t, locale } = useLocale();
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (query) => {
    setLoading(true);
    try {
      const res = await api.get('/admin/incidents', { params: { q: query || undefined, limit: 200 } });
      setItems(res.data.incidents);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load('');
  }, [load]);

  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <strong>{t('incidents.title')}</strong>
          <div className="panel__sub">{t('incidents.desc')}</div>
        </div>
        <span style={{ flex: 1 }} />
        <Input.Search
          allowClear
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onSearch={(value) => load(value.trim())}
          placeholder={t('incidents.search')}
          style={{ width: 300, maxWidth: '100%' }}
        />
        <Button onClick={() => load(q.trim())}>{t('admin.historyRefresh')}</Button>
      </header>
      <Table
        rowKey={(row) => `${row.id}-${row.at}`}
        size="middle"
        loading={loading}
        dataSource={items || []}
        locale={{ emptyText: t('incidents.empty') }}
        pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
        scroll={{ x: 900 }}
        expandable={{
          rowExpandable: (row) => Boolean(row.stack || row.agent),
          expandedRowRender: (row) => (
            <pre className="incident-stack">{[row.stack, row.agent && `UA: ${row.agent}`, row.build && `Build: ${row.build}`].filter(Boolean).join('\n\n')}</pre>
          ),
        }}
        columns={[
          { title: t('admin.historyTime'), dataIndex: 'at', width: 150, render: (value) => <span title={formatDateTime(value, locale)}>{formatRelative(value, locale)}</span> },
          {
            title: t('incidents.code'),
            dataIndex: 'code',
            width: 170,
            render: (value, row) => (
              <Tag color={row.kind === 'client' ? 'purple' : value === 'DB_UNAVAILABLE' ? 'orange' : 'red'} bordered={false}>
                {value}
              </Tag>
            ),
          },
          { title: t('incidents.request'), dataIndex: 'id', width: 130, render: (value) => <Text code copyable={{ text: value }}>{value}</Text> },
          { title: t('incidents.session'), dataIndex: 'session', width: 150, render: (value) => (value ? <Text code copyable={{ text: value }}>{value}</Text> : '—') },
          { title: t('incidents.where'), render: (_, row) => <Text type="secondary">{[row.method, row.path].filter(Boolean).join(' ') || '—'}</Text> },
          { title: t('admin.historyDetail'), dataIndex: 'message', render: (value) => <Text>{value || '—'}</Text> },
        ]}
      />
    </section>
  );
}
