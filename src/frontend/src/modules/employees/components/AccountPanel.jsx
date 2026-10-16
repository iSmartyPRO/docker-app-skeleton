import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Avatar, Button, Form, Input, Modal, Popconfirm, Radio, Select, Space, Tag } from 'antd';
import { LinkOutlined, LockOutlined, UnlockOutlined, UserAddOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { useAuth } from '../../../context/AuthContext';
import { useSettings } from '../../../context/SettingsContext';
import { can } from '../../../lib/access';
import { fmtDateTime } from '../../../lib/datetime';
import api from '../../../services/api';
import { empApi } from '../api';
import { empError, initials } from '../lib';

/**
 * «Учётная запись портала» on the employee card: the linked account with
 * block / unlink, or — without one — «Создать пользователя» (one step, the
 * Users rules apply) and «Связать с существующим».
 */
export default function AccountPanel({ employee, can: rights, onChanged }) {
  const { t } = useLocale();
  const { user: me } = useAuth();
  const { message } = App.useApp();
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);
  const account = employee.user;
  const run = async (fn, ok) => {
    try {
      const res = await fn();
      onChanged(res.data);
      if (ok) message.success(ok);
    } catch (err) {
      message.error(empError(err, t));
    }
  };
  if (account) {
    return (
      <div className="emp-account" data-tour="emp.account">
        <div className="emp-account__user">
          <Avatar size={44} src={account.avatarUrl || undefined}>
            {initials(account.name)}
          </Avatar>
          <div className="emp-account__text">
            <strong>{account.name}</strong>
            <span>
              {account.username}
              {account.email ? ` · ${account.email}` : ''}
            </span>
            <span className="emp-muted">{account.lastLoginAt ? t('emp.account.lastLogin', { date: fmtDateTime(account.lastLoginAt) }) : t('emp.account.neverSignedIn')}</span>
          </div>
          <Tag bordered={false} color={account.isBlocked ? 'red' : account.isActive ? 'green' : 'default'}>
            {account.isBlocked ? t('emp.account.isBlocked') : account.isActive ? t('emp.account.isActive') : t('emp.account.isInactive')}
          </Tag>
        </div>
        <Space wrap>
          {can(me, 'users.view') && (
            <Link to={`/admin/users/${account.id}`}>
              <Button icon={<LinkOutlined />}>{t('emp.account.openUser')}</Button>
            </Link>
          )}
          {rights.createAccount && (
            <Button icon={account.isBlocked ? <UnlockOutlined /> : <LockOutlined />} danger={!account.isBlocked} onClick={() => run(() => empApi.blockAccount(employee.id, !account.isBlocked), account.isBlocked ? t('emp.account.unblocked') : t('emp.account.blocked'))}>
              {account.isBlocked ? t('emp.account.unblock') : t('emp.account.block')}
            </Button>
          )}
          {rights.account && (
            <Popconfirm title={t('emp.account.unlinkConfirm')} description={t('emp.account.unlinkHint')} okText={t('emp.account.unlink')} cancelText={t('common.cancel')} onConfirm={() => run(() => empApi.unlinkAccount(employee.id), t('emp.account.unlinked'))}>
              <Button type="text">{t('emp.account.unlink')}</Button>
            </Popconfirm>
          )}
        </Space>
      </div>
    );
  }
  return (
    <div className="emp-account" data-tour="emp.account">
      <p className="emp-muted">{t('emp.account.noneLead')}</p>
      <div className="emp-account__choices">
        {rights.createAccount && (
          <button type="button" className="emp-choice" onClick={() => setCreating(true)} data-testid="emp-create-account">
            <UserAddOutlined />
            <strong>{t('emp.account.create')}</strong>
            <span>{t('emp.account.createHint')}</span>
          </button>
        )}
        {rights.account && (
          <button type="button" className="emp-choice" onClick={() => setLinking(true)}>
            <LinkOutlined />
            <strong>{t('emp.account.link')}</strong>
            <span>{t('emp.account.linkHint')}</span>
          </button>
        )}
      </div>
      {rights.hr && !rights.account && <p className="emp-muted">{t('emp.account.needUsersManage')}</p>}
      <CreateAccountDialog open={creating} employee={employee} onClose={() => setCreating(false)} onDone={(data) => { setCreating(false); onChanged(data); }} />
      <LinkAccountDialog open={linking} employee={employee} onClose={() => setLinking(false)} onDone={(data) => { setLinking(false); onChanged(data); }} />
    </div>
  );
}

function CreateAccountDialog({ open, employee, onClose, onDone }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings } = useSettings();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [lists, setLists] = useState({ roles: null, groups: null });
  const method = Form.useWatch('method', form);
  const adOn = Boolean(settings?.integrations?.activeDirectory?.enabled);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ method: 'password', email: employee.work?.email || '', phone: employee.work?.mobile || employee.work?.phone || '' });
    empApi.suggestUsername(employee.id).then((res) => form.setFieldValue('username', res.data.username)).catch(() => {});
    Promise.all([api.get('/admin/roles').catch(() => null), api.get('/admin/groups').catch(() => null)]).then(([roles, groups]) =>
      setLists({ roles: roles?.data?.roles || null, groups: groups?.data?.groups || null })
    );
  }, [open, employee, form]);
  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const res = await empApi.createAccount(employee.id, values);
      message.success(t('emp.account.createdOk', { username: res.data.created?.username || values.username }));
      onDone(res.data);
    } catch (err) {
      const field = err?.response?.data?.info?.field;
      message.error(empError(err, t));
      if (field) form.setFields([{ name: field, errors: [empError(err, t)] }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={busy} title={t('emp.account.createTitle', { name: employee.name })} okText={t('emp.account.createOk')} cancelText={t('common.cancel')} destroyOnClose width={560}>
      <Form form={form} layout="vertical">
        <Form.Item name="username" label={t('emp.account.username')} rules={[{ required: true, pattern: /^[a-zA-Z0-9._-]{3,32}$/, message: t('emp.account.usernameRule') }]} extra={method === 'directory' ? t('emp.account.usernameDirectory') : null}>
          <Input maxLength={32} autoComplete="off" />
        </Form.Item>
        <Form.Item name="method" label={t('emp.account.method')}>
          <Radio.Group className="emp-methods">
            <Radio value="password">
              <strong>{t('emp.account.methods.password')}</strong>
              <span>{t('emp.account.methods.passwordHint')}</span>
            </Radio>
            <Radio value="code">
              <strong>{t('emp.account.methods.code')}</strong>
              <span>{t('emp.account.methods.codeHint')}</span>
            </Radio>
            <Radio value="directory" disabled={!adOn}>
              <strong>{t('emp.account.methods.directory')}</strong>
              <span>{adOn ? t('emp.account.methods.directoryHint') : t('emp.account.methods.directoryOff')}</span>
            </Radio>
          </Radio.Group>
        </Form.Item>
        {method === 'password' && (
          <Form.Item name="password" label={t('emp.account.password')} rules={[{ required: true, min: 10, message: t('emp.account.passwordRule') }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        )}
        <div className="emp-form__grid2">
          <Form.Item name="email" label={t('emp.fields.workEmail')} rules={[{ type: 'email', message: t('emp.errors.BAD_EMAIL') }]}>
            <Input inputMode="email" />
          </Form.Item>
          <Form.Item name="phone" label={t('emp.account.phone')}>
            <Input inputMode="tel" />
          </Form.Item>
        </div>
        {lists.roles && (
          <Form.Item name="roleIds" label={t('emp.account.roles')} extra={t('emp.account.rolesHint')}>
            <Select mode="multiple" allowClear options={lists.roles.map((role) => ({ value: role.id, label: role.name }))} optionFilterProp="label" />
          </Form.Item>
        )}
        {lists.groups && (
          <Form.Item name="groupIds" label={t('emp.account.groups')} extra={t('emp.account.groupsHint')}>
            <Select mode="multiple" allowClear options={lists.groups.map((group) => ({ value: group.id, label: group.name }))} optionFilterProp="label" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

function LinkAccountDialog({ open, employee, onClose, onDone }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [value, setValue] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      empApi
        .unlinkedAccounts(query)
        .then((res) => setOptions(res.data.accounts.map((account) => ({ value: account.id, label: `${account.name} (${account.username}${account.email ? `, ${account.email}` : ''})` }))))
        .catch(() => setOptions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query]);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await empApi.linkAccount(employee.id, value);
      message.success(t('emp.account.linked'));
      setValue(null);
      onDone(res.data);
    } catch (err) {
      message.error(empError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onCancel={onClose} onOk={submit} okButtonProps={{ disabled: !value }} confirmLoading={busy} title={t('emp.account.linkTitle', { name: employee.name })} okText={t('emp.account.linkOk')} cancelText={t('common.cancel')} destroyOnClose>
      <p className="emp-muted">{t('emp.account.linkLead')}</p>
      <Select showSearch filterOption={false} onSearch={setQuery} value={value} onChange={setValue} options={options} style={{ width: '100%' }} placeholder={t('emp.account.linkPick')} notFoundContent={t('emp.pick.nothing')} />
    </Modal>
  );
}
