import { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { listSecurityEvents } from '../../services/api';

const { Title, Paragraph } = Typography;

const KINDS = [
  'login_failed',
  'lockout',
  'account_disabled',
  'account_blocked',
  'ip_blocked',
  'ip_denied',
  'rate_limited',
];

const TAG = {
  login_failed: 'warning',
  lockout: 'error',
  account_disabled: 'error',
  account_blocked: 'error',
  ip_blocked: 'error',
  ip_denied: 'error',
  rate_limited: 'warning',
};

export default function AdminSecurityHistory() {
  const { t, locale } = useLocale();
  const [kind, setKind] = useState();
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);

  const load = async (nextKind = kind) => {
    setLoading(true);
    try {
      const res = await listSecurityEvents({ kind: nextKind || undefined, limit: 150 });
      setEvents(res.data.events || []);
      setSummary(res.data.summary || {});
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const formatTime = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB', {
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  };

  return (
    <div>
      <Title level={2}>{t('admin.history')}</Title>
      <Paragraph type="secondary">{t('admin.historyLead')}</Paragraph>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card className="panel-card" bordered={false}>
            <Statistic title={t('admin.eventLoginFailed')} value={summary.login_failed || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="panel-card" bordered={false}>
            <Statistic title={t('admin.eventLockout')} value={summary.lockout || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="panel-card" bordered={false}>
            <Statistic title={t('admin.eventIpBlocked')} value={summary.ip_blocked || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="panel-card" bordered={false}>
            <Statistic title={t('admin.eventIpDenied')} value={summary.ip_denied || 0} />
          </Card>
        </Col>
      </Row>
      <Card className="panel-card" bordered={false}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            allowClear
            placeholder={t('admin.historyFilter')}
            style={{ minWidth: 220 }}
            value={kind}
            onChange={(value) => {
              setKind(value);
              load(value);
            }}
            options={KINDS.map((item) => ({ value: item, label: t(`admin.event_${item}`) }))}
          />
          <Button onClick={() => load()}>{t('admin.historyRefresh')}</Button>
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={events}
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: t('admin.historyTime'),
              dataIndex: 'created_at',
              width: 180,
              render: formatTime,
            },
            {
              title: t('admin.historyKind'),
              dataIndex: 'kind',
              width: 180,
              render: (value) => <Tag color={TAG[value] || 'default'}>{t(`admin.event_${value}`)}</Tag>,
            },
            { title: t('users.username'), dataIndex: 'username', render: (value) => value || '—' },
            { title: t('admin.ip'), dataIndex: 'ip', render: (value) => value || '—' },
            { title: t('admin.historyDetail'), dataIndex: 'detail', render: (value) => value || '—' },
          ]}
        />
      </Card>
    </div>
  );
}
