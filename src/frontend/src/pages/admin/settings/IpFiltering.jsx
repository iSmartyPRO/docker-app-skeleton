import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Form, Input, Popconfirm, Select, Switch, Table, Tag, Typography } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import SaveBar from '../../../components/ui/SaveBar';
import LoadState from '../../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../../components/ui/SettingsSection';
import { useAdminSettings } from '../../../hooks/useAdminSettings';
import { useSettingsForm } from '../../../hooks/useSettingsForm';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { addIpRule, deleteIpRule, listIpRules } from '../../../services/api';
import SettingsPageHeader from './SettingsPageHeader';
import { HintLabel } from '../../../help/Hint';

const { Text } = Typography;

function PolicyForm({ settings, save }) {
  const { t } = useLocale();
  const security = settings.security || {};
  const initial = useMemo(
    () => ({
      whitelistEnabled: Boolean(security.whitelistEnabled),
      blacklistEnabled: security.blacklistEnabled !== false,
    }),
    [security.whitelistEnabled, security.blacklistEnabled]
  );
  const { dirty, saving, submit, reset, formProps } = useSettingsForm(initial, (values) =>
    save({ security: values })
  );

  return (
    <Form {...formProps}>
      <SettingsSection title={t('settings.ip.policy')} description={t('settings.ip.policyDesc')}>
        <SettingRow label={t('settings.ip.blacklistEnabled')} description={t('settings.ip.blacklistEnabledDesc')}>
          <Form.Item name="blacklistEnabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={<HintLabel id="admin.whitelist">{t('settings.ip.whitelistEnabled')}</HintLabel>} description={t('settings.ip.whitelistEnabledDesc')}>
          <Form.Item name="whitelistEnabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

function RulesSection() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [rules, setRules] = useState([]);
  const [yourIp, setYourIp] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await listIpRules();
      setRules(res.data.rules || []);
      setYourIp(res.data.yourIp || '');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (values) => {
    setAdding(true);
    try {
      await addIpRule(values);
      form.resetFields(['ip', 'reason']);
      await load();
      message.success(t('settings.ip.added'));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    try {
      await deleteIpRule(id);
      await load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const listLabel = (type) => (type === 'whitelist' ? t('admin.whitelist') : t('admin.blacklist'));
  const visible = filter === 'all' ? rules : rules.filter((rule) => rule.list_type === filter);

  return (
    <SettingsSection
      title={<HintLabel id="admin.ipRules">{t('settings.ip.rules')}</HintLabel>}
      description={t('settings.ip.rulesDesc')}
      extra={
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'whitelist', label: t('admin.whitelist') },
            { value: 'blacklist', label: t('admin.blacklist') },
          ]}
        />
      }
      flush
    >
      <Form form={form} layout="inline" onFinish={add} className="rule-form" initialValues={{ listType: 'blacklist' }}>
        <Form.Item name="listType">
          <Select
            style={{ width: 170 }}
            options={[
              { value: 'blacklist', label: t('admin.blacklist') },
              { value: 'whitelist', label: t('admin.whitelist') },
            ]}
          />
        </Form.Item>
        <Form.Item name="ip" rules={[{ required: true, message: t('common.required') }]}>
          <Input placeholder={t('admin.ip')} style={{ width: 200 }} />
        </Form.Item>
        <Form.Item name="reason">
          <Input placeholder={t('admin.reason')} style={{ width: 220 }} maxLength={200} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={adding}>
          {t('admin.addRule')}
        </Button>
      </Form>
      {yourIp && (
        <div className="rule-form__hint">
          <Text type="secondary">{t('settings.ip.yourIp', { ip: yourIp })}</Text>
          <Button
            size="small"
            type="link"
            onClick={() => form.setFieldsValue({ listType: 'whitelist', ip: yourIp })}
          >
            {t('settings.ip.addMine')}
          </Button>
        </div>
      )}
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={visible}
        pagination={visible.length > 20 ? { pageSize: 20 } : false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settings.ip.empty')} /> }}
        columns={[
          {
            title: t('admin.ip'),
            dataIndex: 'ip',
            render: (value) => <Text code>{value}</Text>,
          },
          {
            title: '',
            dataIndex: 'list_type',
            width: 150,
            render: (value) => (
              <Tag color={value === 'whitelist' ? 'green' : 'red'} bordered={false}>
                {listLabel(value)}
              </Tag>
            ),
          },
          { title: t('admin.reason'), dataIndex: 'reason', render: (value) => value || '—' },
          {
            title: t('users.created'),
            dataIndex: 'created_at',
            width: 180,
            responsive: ['md'],
            render: (value) => formatDateTime(value, locale),
          },
          {
            title: '',
            width: 110,
            align: 'right',
            render: (_, row) => (
              <Popconfirm title={t('settings.ip.confirmRemove')} onConfirm={() => remove(row.id)}>
                <Button type="text" danger size="small">
                  {t('admin.remove')}
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </SettingsSection>
  );
}

export default function IpFilteringSettings() {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id="ip" />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <PolicyForm settings={settings} save={save} />}
      </LoadState>
      <RulesSection />
    </>
  );
}
