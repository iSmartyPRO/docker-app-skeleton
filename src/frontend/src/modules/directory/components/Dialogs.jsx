import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Checkbox, Empty, Form, Input, Modal, Result, Select, Spin, Table, Tag } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, CopyOutlined, LockOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import api from '../../../services/api';
import { adApi, adError, errorInfo } from '../api';
import { useDirectory } from '../DirectoryContext';
import { generatePassword, passwordIssues } from '../lib';
import OuTree from './OuTree';
import { Avatar, KindIcon, PathText, StatusTags } from './Bits';

function useCopy() {
  const { t } = useLocale();
  const { message } = App.useApp();
  return async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t('directory.copied'));
    } catch {
      message.info(text);
    }
  };
}

/** Who the dialog is about: avatar, name, login. */
function Subject({ object }) {
  if (!object) return null;
  return (
    <div className="ad-subject">
      <Avatar object={object} size={40} />
      <div>
        <strong>{object.name}</strong>
        <span className="ad-muted">{[object.login, object.upn].filter(Boolean).join(' · ')}</span>
      </div>
    </div>
  );
}

/** The live checklist under a password field. */
export function PasswordHints({ password, policy, login, name }) {
  const { t } = useLocale();
  const issues = passwordIssues(password, policy, { login, name });
  const rows = [
    ['short', t('directory.password.ruleLength', { n: policy?.passwordMinLength || 8 })],
    ...(policy?.passwordComplexity !== false
      ? [['complexity', t('directory.password.ruleComplexity')], ['containsLogin', t('directory.password.ruleLogin')], ['containsName', t('directory.password.ruleName')]]
      : []),
  ];
  return (
    <ul className="ad-rules">
      {rows.map(([key, text]) => {
        const ok = password && !issues.includes(key);
        return (
          <li key={key} className={ok ? 'is-ok' : ''}>
            {ok ? <CheckCircleFilled /> : <CloseCircleFilled />} {text}
          </li>
        );
      })}
      {policy?.passwordHint && <li className="ad-rules__hint">{policy.passwordHint}</li>}
    </ul>
  );
}

/** Explains why passwords cannot be set (no LDAPS / StartTLS) — the same text everywhere. */
export function SecureChannelNote({ info, compact = false }) {
  const { t } = useLocale();
  if (!info) return null;
  if (info.passwordsAvailable) {
    return (
      <Alert
        className="ad-secure"
        type="success"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message={info.mode === 'demo' ? t('directory.channel.demo') : t('directory.channel.secure', { channel: info.channel === 'ldaps' ? 'LDAPS' : 'StartTLS' })}
        description={compact ? null : t('directory.channel.notStored')}
      />
    );
  }
  return <Alert className="ad-secure" type="warning" showIcon icon={<LockOutlined />} message={t('directory.channel.unavailable')} description={t('directory.channel.unavailableText')} />;
}

/** Reset password (+ must change at next logon, + unlock). Shown only with ad.passwords. */
export function PasswordDialog({ open, object, onClose }) {
  const { t } = useLocale();
  const { info, change } = useDirectory();
  const copy = useCopy();
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [unlock, setUnlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  // The password was set but «must change» / unlock failed: say so (it is NOT a failure).
  const [partial, setPartial] = useState(null);
  useEffect(() => {
    if (open) {
      setPartial(null);
      setPassword('');
      setMustChange(info?.settings?.mustChangeDefault !== false);
      setUnlock(true);
      setError(null);
      setDone(false);
    }
  }, [open, info?.settings?.mustChangeDefault]);
  const policy = info?.settings;
  const issues = passwordIssues(password, policy, { login: object?.login, name: object?.name });
  const available = Boolean(info?.passwordsAvailable);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await change(() => adApi.password({ dn: object.dn, password, mustChange, unlock }), { rethrow: true, success: false });
      if (data) {
        const flags = (data.steps || []).find((item) => item.step === 'flags' && !item.ok);
        setPartial(data.outcome === 'partial' ? flags?.code || 'AD_ERROR' : null);
        setDone(true);
      }
    } catch (err) {
      const extra = errorInfo(err)?.issues;
      setError(extra?.length ? `${adError(err, t)}: ${extra.map((issue) => t(`directory.password.issue.${issue}`)).join(', ')}` : adError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onCancel={() => onClose(done)} title={t('directory.password.title')} width={520} destroyOnHidden footer={done ? <Button type="primary" onClick={() => onClose(true)}>{t('common.close')}</Button> : [
      <Button key="cancel" onClick={() => onClose(false)}>{t('common.cancel')}</Button>,
      <Button key="ok" type="primary" danger loading={busy} disabled={!available || !password || issues.length > 0} onClick={submit}>
        {t('directory.password.submit')}
      </Button>,
    ]}>
      <Subject object={object} />
      {done ? (
        <Result
          status={partial ? 'warning' : 'success'}
          title={t('directory.password.done')}
          subTitle={partial ? `${t(mustChange ? 'directory.password.partialMustChange' : 'directory.password.partialUnlock')} ${adError({ response: { data: { code: partial } } }, t)}` : mustChange ? t('directory.password.doneMustChange') : t('directory.password.doneNoChange')}
          extra={<Button icon={<CopyOutlined />} onClick={() => copy(password)}>{t('directory.password.copy')}</Button>}
        />
      ) : (
        <>
          <SecureChannelNote info={info} compact />
          {available && (
            <div className="ad-form">
              <label>
                <span>{t('directory.password.new')}</span>
                <div className="ad-row">
                  <Input.Password value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" data-tour="directory.passwordField" />
                  <Button icon={<ReloadOutlined />} onClick={() => setPassword(generatePassword())}>{t('directory.password.generate')}</Button>
                  <Button icon={<CopyOutlined />} disabled={!password} onClick={() => copy(password)} aria-label={t('directory.password.copy')} />
                </div>
              </label>
              <PasswordHints password={password} policy={policy} login={object?.login} name={object?.name} />
              <Checkbox checked={mustChange} onChange={(event) => setMustChange(event.target.checked)}>{t('directory.password.mustChange')}</Checkbox>
              {object?.locked && <Checkbox checked={unlock} onChange={(event) => setUnlock(event.target.checked)}>{t('directory.password.unlock')}</Checkbox>}
              {error && <Alert type="error" showIcon message={error} />}
              <p className="ad-note">{t('directory.password.note')}</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/** Pick an OU inside the root (move, create, settings inside the root). */
export function OuPickerDialog({ open, title, okText, current, onPick, onClose }) {
  const { t } = useLocale();
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);
  return (
    <Modal open={open} title={title || t('directory.ouPicker.title')} onCancel={onClose} width={520} destroyOnHidden okText={okText || t('directory.ouPicker.ok')} okButtonProps={{ disabled: !selected || selected.dn === current }} onOk={() => onPick(selected)}>
      <p className="ad-muted">{t('directory.ouPicker.lead')}</p>
      <div className="ad-picker">
        <OuTree selected={selected?.dn} onSelect={(dn, node) => setSelected({ dn, name: node.name })} height={360} />
      </div>
      {selected && (
        <div className="ad-picked">
          <KindIcon kind="ou" /> {selected.name}
        </div>
      )}
    </Modal>
  );
}

const BULK_TITLES = { enable: 'directory.bulk.enable', disable: 'directory.bulk.disable', move: 'directory.bulk.move', offboard: 'directory.bulk.offboard' };

/** Bulk enable / disable / move / offboard: a preview from the server (nothing written), then apply. */
export function BulkDialog({ open, action, dns, targetOu, onClose }) {
  const { t } = useLocale();
  const { change } = useDirectory();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  // The list as a key: a new array with the same DNs must not ask for the preview again.
  const dnKey = JSON.stringify(dns || []);
  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setError(null);
    setResult(null);
    adApi
      .bulk({ action, dns: JSON.parse(dnKey), targetOu, dryRun: true })
      .then(({ data }) => setPreview(data))
      .catch((err) => setError(adError(err, t)));
  }, [open, action, dnKey, targetOu, t]);
  const actionable = (preview?.items || []).filter((item) => !item.refused && item.changes?.length);
  const apply = async () => {
    setBusy(true);
    const data = await change(() => adApi.bulk({ action, dns, targetOu }), { success: false });
    setBusy(false);
    if (data) setResult(data);
  };
  const columns = [
    { key: 'name', title: t('directory.columns.name'), render: (_, item) => <span className="ad-cell-name"><KindIcon kind={item.kind} /> {item.name}</span> },
    { key: 'from', title: t('directory.bulk.from'), responsive: ['md'], render: (_, item) => <PathText path={item.from} /> },
    {
      key: 'what',
      title: t('directory.bulk.what'),
      render: (_, item) =>
        item.refused ? <Tag color="red">{t(`directory.errors.${item.refused}`)}</Tag> : item.changes?.length ? item.changes.map((c) => <Tag key={c} color="blue">{t(`directory.bulk.change.${c}`)}</Tag>) : <Tag>{t('directory.bulk.nothing')}</Tag>,
    },
  ];
  const resultColumns = [
    { key: 'name', title: t('directory.columns.name'), dataIndex: 'name' },
    { key: 'outcome', title: t('directory.bulk.result'), render: (_, item) => <Tag color={item.outcome === 'changed' ? 'green' : item.outcome === 'failed' || item.outcome === 'refused' ? 'red' : 'default'}>{t(`directory.outcome.${item.outcome}`)}</Tag> },
    { key: 'error', title: '', render: (_, item) => (item.code ? t(`directory.errors.${item.code}`) : null) },
  ];
  return (
    <Modal open={open} width={680} title={t(BULK_TITLES[action] || 'directory.bulk.title')} onCancel={() => onClose(Boolean(result))} destroyOnHidden footer={result ? <Button type="primary" onClick={() => onClose(true)}>{t('common.close')}</Button> : [
      <Button key="cancel" onClick={() => onClose(false)}>{t('common.cancel')}</Button>,
      <Button key="ok" type="primary" danger={action !== 'enable'} loading={busy} disabled={!actionable.length} onClick={apply}>
        {t('directory.bulk.apply', { n: actionable.length })}
      </Button>,
    ]}>
      {error && <Alert type="error" showIcon message={error} />}
      {!preview && !error && <Spin />}
      {preview && !result && (
        <>
          {preview.target && <p className="ad-muted">{t('directory.bulk.target', { name: preview.target.name })}</p>}
          <Alert type="info" showIcon message={t('directory.bulk.previewNote')} className="ad-gap" />
          <Table size="small" rowKey="dn" pagination={false} columns={columns} dataSource={preview.items} scroll={{ y: 320 }} />
        </>
      )}
      {result && (
        <>
          <Alert type={result.failed ? 'warning' : 'success'} showIcon message={t('directory.bulk.summary', { changed: result.changed, failed: result.failed, unchanged: result.unchanged + result.refused })} className="ad-gap" />
          <Table size="small" rowKey="dn" pagination={false} columns={resultColumns} dataSource={result.results} scroll={{ y: 320 }} />
        </>
      )}
    </Modal>
  );
}

const ATTR_FIELD = { telephoneNumber: 'phone', physicalDeliveryOfficeName: 'office', employeeID: 'employeeId', l: 'city', displayName: 'name' };
const valueOf = (object, attr) => (attr === 'manager' ? object.manager : object[ATTR_FIELD[attr] || attr]) || '';

/** People in scope for a manager / member picker (server search). */
export function DirectorySearch({ value, onChange, kinds = 'user', placeholder, mode, initialLabel, ...rest }) {
  const { t } = useLocale();
  const [options, setOptions] = useState(initialLabel && value ? [{ value, label: initialLabel }] : []);
  const [loading, setLoading] = useState(false);
  const search = async (q) => {
    if (String(q).trim().length < 2) return;
    setLoading(true);
    try {
      const { data } = await adApi.find(q, kinds);
      setOptions(data.objects.map((item) => ({ value: item.dn, label: `${item.name}${item.login ? ` · ${item.login}` : ''}`, item })));
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Select
      showSearch
      allowClear
      mode={mode}
      value={value || undefined}
      onChange={onChange}
      filterOption={false}
      onSearch={search}
      options={options}
      loading={loading}
      placeholder={placeholder || t('directory.searchPeople')}
      notFoundContent={loading ? <Spin size="small" /> : null}
      {...rest}
    />
  );
}

/** Edit the attributes the settings allow. Only changed values are sent. */
export function EditDialog({ open, object, managerName, onClose }) {
  const { t } = useLocale();
  const { info, change } = useDirectory();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const allowed = useMemo(() => (info?.settings?.editableAttributes || []).filter((attr) => object?.kind === 'user' || ['description', 'mail', 'displayName'].includes(attr)), [info, object]);
  useEffect(() => {
    if (open && object) form.setFieldsValue(Object.fromEntries(allowed.map((attr) => [attr, valueOf(object, attr)])));
  }, [open, object, allowed, form]);
  const submit = async () => {
    const values = await form.validateFields();
    const changes = Object.fromEntries(Object.entries(values).filter(([attr, value]) => (value || '') !== valueOf(object, attr)).map(([attr, value]) => [attr, value || '']));
    if (!Object.keys(changes).length) return onClose(false);
    setBusy(true);
    const data = await change(() => adApi.attributes(object.dn, changes));
    setBusy(false);
    if (data) onClose(true);
    return null;
  };
  return (
    <Modal open={open} title={t('directory.edit.title')} onCancel={() => onClose(false)} onOk={submit} okText={t('directory.edit.save')} confirmLoading={busy} width={620} destroyOnHidden>
      <Subject object={object} />
      <Form form={form} layout="vertical" className="ad-edit-grid">
        {allowed.map((attr) =>
          attr === 'manager' ? (
            <Form.Item key={attr} name={attr} label={t(`directory.attr.${attr}`)} className="ad-edit-grid__wide">
              <DirectorySearch initialLabel={managerName} />
            </Form.Item>
          ) : (
            <Form.Item key={attr} name={attr} label={t(`directory.attr.${attr}`)} className={attr === 'description' ? 'ad-edit-grid__wide' : undefined} rules={attr === 'mail' ? [{ type: 'email', message: t('directory.errors.AD_BAD_MAIL') }] : undefined}>
              {attr === 'description' ? <Input.TextArea rows={2} maxLength={1024} /> : <Input maxLength={attr === 'displayName' ? 256 : 128} />}
            </Form.Item>
          )
        )}
      </Form>
      <p className="ad-note">{t('directory.edit.note')}</p>
    </Modal>
  );
}

/** Add an account to groups (in scope, never folder access groups). */
export function GroupsDialog({ open, object, onClose }) {
  const { t } = useLocale();
  const { change } = useDirectory();
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setSelected([]);
      setOptions([]);
    }
  }, [open]);
  const search = async (q) => {
    if (!String(q).trim()) return;
    setLoading(true);
    try {
      const { data } = await adApi.groups(q);
      setOptions(data.groups.map((group) => ({ value: group.dn, label: group.name, group })));
    } finally {
      setLoading(false);
    }
  };
  const submit = async () => {
    setBusy(true);
    const data = await change(() => adApi.members({ groups: selected, members: [object.dn], action: 'add' }), { success: t('directory.groups.added') });
    setBusy(false);
    if (data) onClose(true);
  };
  return (
    <Modal open={open} title={t('directory.groups.addTitle')} onCancel={() => onClose(false)} onOk={submit} okText={t('directory.groups.add')} okButtonProps={{ disabled: !selected.length }} confirmLoading={busy} width={520} destroyOnHidden>
      <Subject object={object} />
      <Select
        mode="multiple"
        showSearch
        filterOption={false}
        onSearch={search}
        value={selected}
        onChange={setSelected}
        options={options}
        loading={loading}
        style={{ width: '100%' }}
        placeholder={t('directory.groups.search')}
        optionRender={(option) => (
          <span className="ad-option">
            <strong>{option.data.group.name}</strong>
            <span className="ad-muted">{option.data.group.description || ''}</span>
          </span>
        )}
      />
      <p className="ad-note">{t('directory.groups.note')}</p>
    </Modal>
  );
}

/** Add members to a group (users, groups, computers in scope). */
export function MembersDialog({ open, group, onClose }) {
  const { t } = useLocale();
  const { change } = useDirectory();
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);
  const submit = async () => {
    setBusy(true);
    const data = await change(() => adApi.members({ groups: [group.dn], members: selected, action: 'add' }), { success: t('directory.groups.membersAdded') });
    setBusy(false);
    if (data) onClose(true);
  };
  return (
    <Modal open={open} title={t('directory.groups.addMembers', { name: group?.name || '' })} onCancel={() => onClose(false)} onOk={submit} okText={t('directory.groups.add')} okButtonProps={{ disabled: !selected.length }} confirmLoading={busy} width={520} destroyOnHidden>
      <DirectorySearch mode="multiple" kinds="user,group,computer" value={selected} onChange={(value) => setSelected(value || [])} style={{ width: '100%' }} />
    </Modal>
  );
}

/** Link the AD account to an employee card (Employees module). */
export function EmployeeLinkDialog({ open, object, onClose }) {
  const { t } = useLocale();
  const { change } = useDirectory();
  const [options, setOptions] = useState([]);
  const [value, setValue] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue(null);
  }, [open]);
  const search = async (q) => {
    if (String(q).trim().length < 2) return;
    const { data } = await adApi.employees(q);
    setOptions(data.employees.map((employee) => ({ value: employee.id, label: employee.name, employee })));
  };
  const submit = async () => {
    setBusy(true);
    const data = await change(() => adApi.employeeLink(object.dn, value), { success: t('directory.links.employeeLinked') });
    setBusy(false);
    if (data) onClose(true);
  };
  return (
    <Modal open={open} title={t('directory.links.employeeTitle')} onCancel={() => onClose(false)} onOk={submit} okButtonProps={{ disabled: !value }} confirmLoading={busy} destroyOnHidden>
      <Subject object={object} />
      <Select
        showSearch
        filterOption={false}
        onSearch={search}
        value={value}
        onChange={setValue}
        options={options}
        style={{ width: '100%' }}
        placeholder={t('directory.links.employeeSearch')}
        optionRender={(option) => (
          <span className="ad-option">
            <strong>{option.data.employee.name}</strong>
            {option.data.employee.adAccount && <span className="ad-muted">{t('directory.links.alreadyHas', { login: option.data.employee.adAccount })}</span>}
          </span>
        )}
      />
      <p className="ad-note">{t('directory.links.employeeNote')}</p>
    </Modal>
  );
}

/** «Create portal user» from the AD account, or link an existing portal account. */
export function PortalUserDialog({ open, object, onClose }) {
  const { t } = useLocale();
  const { change } = useDirectory();
  const [mode, setMode] = useState('create');
  const [username, setUsername] = useState('');
  const [users, setUsers] = useState(null);
  const [userId, setUserId] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setMode('create');
    setUsername(String(object?.login || '').toLowerCase());
    setUserId(null);
    api
      .get('/admin/users')
      .then(({ data }) => setUsers(data.users.filter((user) => user.authSource !== 'ldap')))
      .catch(() => setUsers([]));
  }, [open, object]);
  const submit = async () => {
    setBusy(true);
    const data = mode === 'create' ? await change(() => adApi.portalUser(object.dn, username), { success: t('directory.links.userCreated') }) : await change(() => adApi.portalLink(object.dn, userId), { success: t('directory.links.userLinked') });
    setBusy(false);
    if (data) onClose(true);
  };
  return (
    <Modal open={open} title={t('directory.links.portalTitle')} onCancel={() => onClose(false)} onOk={submit} okButtonProps={{ disabled: mode === 'create' ? !username : !userId }} confirmLoading={busy} destroyOnHidden width={520}>
      <Subject object={object} />
      <div className="ad-choice">
        <Button type={mode === 'create' ? 'primary' : 'default'} onClick={() => setMode('create')}>{t('directory.links.createUser')}</Button>
        <Button type={mode === 'link' ? 'primary' : 'default'} onClick={() => setMode('link')}>{t('directory.links.linkUser')}</Button>
      </div>
      {mode === 'create' ? (
        <div className="ad-form">
          <label>
            <span>{t('directory.links.username')}</span>
            <Input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} maxLength={32} />
          </label>
          <p className="ad-note">{t('directory.links.createNote')}</p>
        </div>
      ) : users === null ? (
        <Spin />
      ) : users.length ? (
        <Select
          showSearch
          optionFilterProp="label"
          value={userId}
          onChange={setUserId}
          style={{ width: '100%' }}
          options={users.map((user) => ({ value: user.id, label: `${user.displayName || user.username} · @${user.username}` }))}
          placeholder={t('directory.links.pickUser')}
        />
      ) : (
        <Empty description={t('directory.links.noUsers')} />
      )}
    </Modal>
  );
}

export { Subject, StatusTags };
