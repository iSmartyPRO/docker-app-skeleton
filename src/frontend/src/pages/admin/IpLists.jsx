import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Select, Space, Table, Typography, message } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { addIpRule, deleteIpRule, listIpRules } from '../../services/api';

const { Title } = Typography;

export default function AdminIpLists() {
  const { t } = useLocale();
  const [rules, setRules] = useState([]);

  const load = async () => {
    const res = await listIpRules();
    setRules(res.data.rules || []);
  };

  useEffect(() => {
    load().catch((err) => message.error(err.response?.data?.error || err.message));
  }, []);

  const onAdd = async (values) => {
    await addIpRule(values);
    await load();
    message.success(t('common.saved'));
  };

  return (
    <div>
      <Title level={2}>{t('admin.ipLists')}</Title>
      <Card className="panel-card" bordered={false} style={{ marginBottom: 16 }}>
        <Form layout="inline" onFinish={onAdd}>
          <Form.Item name="listType" initialValue="blacklist" rules={[{ required: true }]}>
            <Select
              style={{ width: 180 }}
              options={[
                { value: 'blacklist', label: t('admin.blacklist') },
                { value: 'whitelist', label: t('admin.whitelist') },
              ]}
            />
          </Form.Item>
          <Form.Item name="ip" rules={[{ required: true }]}>
            <Input placeholder={t('admin.ip')} />
          </Form.Item>
          <Form.Item name="reason">
            <Input placeholder={t('admin.reason')} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            {t('admin.addRule')}
          </Button>
        </Form>
      </Card>
      <Card className="panel-card" bordered={false}>
        <Table
          rowKey="id"
          dataSource={rules}
          pagination={false}
          columns={[
            { title: t('admin.ip'), dataIndex: 'ip' },
            { title: '', dataIndex: 'list_type' },
            { title: t('admin.reason'), dataIndex: 'reason' },
            {
              title: '',
              render: (_, row) => (
                <Space>
                  <Button
                    type="link"
                    onClick={async () => {
                      await deleteIpRule(row.id);
                      await load();
                    }}
                  >
                    {t('admin.remove')}
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
