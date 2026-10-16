import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, AutoComplete, Button, Empty, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Skeleton, Switch, Tag, Tooltip } from 'antd';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { driveApi, driveError } from './api';
import { LinkRow } from './components/LinkDialog';
import { HintLabel } from '../../help/Hint';
import AccessSettingsFields from './access/AccessSettings';
import './drive.css';
import '../files/files.css';

const COLORS = ['#2563EB', '#0EA5E9', '#14B8A6', '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#8B5CF6', '#6366F1', '#64748B'];

function GeneralForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.drive || { enabled: false, settings: {} };
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { form, dirty, saving, submit, reset, formProps } = useSettingsForm(initial, ({ enabled, ...rest }) =>
    save({ modules: { drive: { enabled, settings: rest } } })
  );
  const links = Form.useWatch('publicLinks', form);
  const writeLinks = Form.useWatch('linkWrite', form);
  const logging = Form.useWatch('activityLog', form);
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('driveSettings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('driveSettings.title')} description={t('driveSettings.titleDesc')}>
          <Form.Item name="title" noStyle>
            <Input maxLength={40} placeholder={t('apps.drive.name')} style={{ width: 260 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('driveSettings.tagline')} description={t('driveSettings.taglineDesc')}>
          <Form.Item name="tagline" noStyle>
            <Input maxLength={160} placeholder={t('drive.tagline')} style={{ width: 360 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('driveSettings.openMode')} description={t('driveSettings.openModeDesc')}>
          <Form.Item name="openMode" noStyle>
            <Radio.Group
              optionType="button"
              options={[
                { value: 'page', label: t('driveSettings.openPage') },
                { value: 'modal', label: t('driveSettings.openModal') },
              ]}
            />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('driveSettings.access')} description={t('driveSettings.accessDesc')}>
        <SettingRow label={t('driveSettings.rememberLogin')} description={t('driveSettings.rememberLoginDesc')}>
          <Form.Item name="rememberLogin" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('driveSettings.hideDenied')} description={t('driveSettings.hideDeniedDesc')}>
          <Form.Item name="hideDenied" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.maxUpload')}>
          <Form.Item name="maxUploadMb" noStyle>
            <InputNumber min={1} max={10240} addonAfter="MB" style={{ width: 170 }} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title={t('driveSettings.links')} description={t('driveSettings.linksDesc')}>
        <SettingRow label={t('filesSettings.publicLinks')} description={t('driveSettings.publicLinksDesc')}>
          <Form.Item name="publicLinks" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('driveSettings.audience')} description={t('driveSettings.audienceDesc')}>
          <Form.Item name="linkAudience" noStyle>
            <Radio.Group
              optionType="button"
              disabled={!links}
              options={[
                { value: 'any', label: t('driveSettings.audienceAny') },
                { value: 'employees', label: t('driveSettings.audienceEmployees') },
              ]}
            />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.requirePassword')}>
          <Form.Item name="requireLinkPassword" valuePropName="checked" noStyle>
            <Switch disabled={!links} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('filesSettings.maxDays')} description={t('filesSettings.maxDaysDesc')}>
          <Form.Item name="maxLinkDays" noStyle>
            <InputNumber min={0} max={3650} disabled={!links} addonAfter={t('settings.login.days')} style={{ width: 160 }} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={<HintLabel id="drive.linkWrite">{t('driveSettings.linkWrite')}</HintLabel>} description={t('driveSettings.linkWriteDesc')}>
          <Form.Item name="linkWrite" valuePropName="checked" noStyle>
            <Switch disabled={!links} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('driveSettings.requireWritePassword')} description={t('driveSettings.requireWritePasswordDesc')}>
          <Form.Item name="requireWritePassword" valuePropName="checked" noStyle>
            <Switch disabled={!links || writeLinks === false} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SettingsSection
        title={t('driveSettings.activity')}
        description={t('driveSettings.activityDesc')}
        extra={state.enabled && <Link to="/app/drive/activity">{t('driveSettings.openActivity')} →</Link>}
      >
        <SettingRow label={<HintLabel id="drive.activityLog">{t('driveSettings.activityLog')}</HintLabel>}>
          <Form.Item name="activityLog" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('driveSettings.logBrowsing')} description={t('driveSettings.logBrowsingDesc')}>
          <Form.Item name="logBrowsing" valuePropName="checked" noStyle>
            <Switch disabled={!logging} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('driveSettings.activityDays')} description={t('driveSettings.activityDaysDesc')}>
          <Form.Item name="activityDays" noStyle>
            <InputNumber min={0} max={3650} disabled={!logging} addonAfter={t('settings.login.days')} style={{ width: 160 }} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <AccessSettingsFields form={form} />
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

function TestResult({ result }) {
  const { t } = useLocale();
  if (!result) return null;
  if (result.error) return <div className="dv-test is-error">✕ {result.error}</div>;
  return (
    <div className="dv-test is-ok">
      <strong>✓ {t('driveSettings.testOk', { ms: result.ms, user: result.account })}</strong>
      {result.shares?.length > 0 && (
        <div className="dv-test__shares">
          {result.shares.map((share) => <Tag key={share.name} bordered={false}>{share.name}</Tag>)}
        </div>
      )}
      {result.sharesError && <span>{t('driveSettings.sharesHidden')}</span>}
    </div>
  );
}

function ServerDialog({ open, server, defaultDomain, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [testUser, setTestUser] = useState({ username: '', password: '' });
  const auth = Form.useWatch('auth', form);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(server ? { ...server, servicePassword: '' } : { name: '', host: '', port: 445, domain: '', auth: 'user', useLogin: true, encrypt: false, serviceUser: '', servicePassword: '' });
      setResult(null);
      setTestUser({ username: '', password: '' });
    }
  }, [open, server, form]);

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const values = await form.validateFields();
      const { data } = await driveApi.testServer({ ...values, id: server?.id, ...(testUser.username && testUser.password ? testUser : {}) });
      setResult(data);
    } catch (err) {
      if (err?.errorFields) return;
      const code = err?.response?.data?.code;
      setResult({ error: code === 'CREDENTIALS_REQUIRED' || code === 'CREDENTIALS_FAILED' ? t('driveSettings.testNeedsUser') : driveError(err, t) });
    } finally {
      setTesting(false);
    }
  };

  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      if (server) await driveApi.updateServer(server.id, values);
      else await driveApi.createServer(values);
      message.success(t('common.saved'));
      onClose(true);
    } catch (err) {
      message.error(driveError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={server ? t('driveSettings.editServer') : t('driveSettings.addServer')} onCancel={() => onClose(false)} onOk={submit} okText={t('common.save')} cancelText={t('common.cancel')} confirmLoading={busy} width={620} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} className="dv-form">
        <div className="dv-form__grid">
          <Form.Item name="name" label={t('driveSettings.serverName')} rules={[{ required: true, message: t('driveSettings.required') }]}>
            <Input placeholder="FS01" maxLength={120} />
          </Form.Item>
          <Form.Item name="host" label={t('driveSettings.host')} extra={t('driveSettings.hostHint')} rules={[{ required: true, message: t('driveSettings.required') }]}>
            <Input placeholder="fs01.corp.local" />
          </Form.Item>
          <Form.Item name="domain" label={t('driveSettings.domain')} extra={defaultDomain ? t('driveSettings.domainDefault', { domain: defaultDomain }) : t('driveSettings.domainHint')}>
            <Input placeholder={defaultDomain || 'CORP'} />
          </Form.Item>
          <Form.Item name="port" label={t('driveSettings.port')}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <Form.Item name="auth" label={<HintLabel id="drive.authMode">{t('driveSettings.auth')}</HintLabel>}>
          <Radio.Group className="dv-auth-choice">
            <Radio value="user">
              <strong>{t('driveSettings.authUser')}</strong>
              <span>{t('driveSettings.authUserDesc')}</span>
            </Radio>
            <Radio value="service">
              <strong>{t('driveSettings.authService')}</strong>
              <span>{t('driveSettings.authServiceDesc')}</span>
            </Radio>
          </Radio.Group>
        </Form.Item>
        {auth === 'user' ? (
          <Form.Item name="useLogin" valuePropName="checked" label={t('driveSettings.useLogin')} extra={t('driveSettings.useLoginDesc')}>
            <Switch />
          </Form.Item>
        ) : (
          <div className="dv-form__grid">
            <Form.Item name="serviceUser" label={t('driveSettings.serviceUser')} rules={[{ required: true, message: t('driveSettings.required') }]}>
              <Input placeholder="svc-portal" autoComplete="off" />
            </Form.Item>
            <Form.Item name="servicePassword" label={t('driveSettings.servicePassword')} extra={server?.hasServiceSecret ? t('driveSettings.keepPassword') : null}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </div>
        )}
        <Form.Item name="encrypt" valuePropName="checked" label={t('driveSettings.encrypt')} extra={t('driveSettings.encryptDesc')}>
          <Switch />
        </Form.Item>
      </Form>
      <div className="dv-testbox">
        <div className="dv-testbox__head">
          <strong>{t('driveSettings.test')}</strong>
          <span>{t('driveSettings.testDesc')}</span>
        </div>
        <div className="dv-testbox__row">
          <Input placeholder={t('drive.username')} value={testUser.username} onChange={(event) => setTestUser({ ...testUser, username: event.target.value })} autoComplete="off" />
          <Input.Password placeholder={t('drive.password')} value={testUser.password} onChange={(event) => setTestUser({ ...testUser, password: event.target.value })} autoComplete="new-password" />
          <Button loading={testing} onClick={test}>{t('driveSettings.testRun')}</Button>
        </div>
        <TestResult result={result} />
      </div>
    </Modal>
  );
}

function ShareDialog({ open, server, share, preset, groups, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(null);
  const [listError, setListError] = useState(null);
  const [browseUser, setBrowseUser] = useState({ username: '', password: '' });
  const [browsing, setBrowsing] = useState(false);
  const color = Form.useWatch('color', form);
  const shareName = Form.useWatch('share', form);

  // Reads the server's share list; any failure only disables the picker —
  // the share name can always be typed by hand.
  const browse = useCallback(
    async (cred) => {
      setListError(null);
      try {
        const { data } = await driveApi.testServer({ id: server.id, ...(cred || {}) });
        setAvailable(data.shares || []);
        if (data.sharesError) setListError({ code: data.sharesError, text: t('driveSettings.sharesHidden') });
      } catch (err) {
        setAvailable([]);
        setListError({ code: err?.response?.data?.code || 'SMB_ERROR', text: driveError(err, t) });
      }
    },
    [server, t]
  );

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(share || { title: '', share: '', rootPath: '', description: '', color: COLORS[0], uncDisplay: '', groupIds: [], allowLinks: true, pathPrefixes: [], ...(preset || {}) });
    setAvailable(null);
    setBrowseUser({ username: '', password: '' });
    browse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, share, form, browse]);

  const browseAs = async () => {
    setBrowsing(true);
    setAvailable(null);
    await browse(browseUser);
    setBrowsing(false);
  };
  const needsLogin = ['CREDENTIALS_REQUIRED', 'CREDENTIALS_FAILED', 'AUTH_FAILED', 'ACCOUNT_RESTRICTED', 'PASSWORD_EXPIRED'].includes(listError?.code);

  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      if (share) await driveApi.updateShare(server.id, share.id, values);
      else await driveApi.createShare(server.id, values);
      message.success(t('common.saved'));
      onClose(true);
    } catch (err) {
      message.error(driveError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={share ? t('driveSettings.editShare') : t('driveSettings.addShare', { server: server?.name })} onCancel={() => onClose(false)} onOk={submit} okText={t('common.save')} cancelText={t('common.cancel')} confirmLoading={busy} width={620} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} className="dv-form">
        <div className="dv-form__grid">
          <Form.Item name="title" label={t('driveSettings.shareTitle')} extra={t('driveSettings.shareTitleHint')} rules={[{ required: true, message: t('driveSettings.required') }]}>
            <Input placeholder={t('driveSettings.shareTitlePlaceholder')} maxLength={120} />
          </Form.Item>
          <Form.Item
            name="share"
            label={t('driveSettings.share')}
            extra={available === null ? t('driveSettings.loadingShares') : available.length ? t('driveSettings.pickOrType') : t('driveSettings.typeShare')}
            rules={[{ required: true, message: t('driveSettings.required') }]}
          >
            <AutoComplete
              options={(available || []).map((item) => ({ value: item.name, label: <span className="dv-share-opt"><strong>{item.name}</strong>{item.remark && <em>{item.remark}</em>}{item.special && <Tag bordered={false}>{t('driveSettings.hiddenShare')}</Tag>}</span> }))}
              filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
              onSelect={(value) => {
                if (!form.getFieldValue('title')) form.setFieldValue('title', value.replace(/\$$/, ''));
              }}
              placeholder="Finance"
            />
          </Form.Item>
        </div>
        {listError && (
          <div className="dv-sharehint">
            <strong>{needsLogin ? t('driveSettings.sharesNeedLogin') : t('driveSettings.sharesUnavailable')}</strong>
            <span>{needsLogin ? t('driveSettings.sharesNeedLoginText') : listError.text}</span>
            {needsLogin && (
              <div className="dv-testbox__row">
                <Input placeholder={t('drive.username')} value={browseUser.username} onChange={(event) => setBrowseUser({ ...browseUser, username: event.target.value })} autoComplete="off" />
                <Input.Password placeholder={t('drive.password')} value={browseUser.password} onChange={(event) => setBrowseUser({ ...browseUser, password: event.target.value })} autoComplete="new-password" onPressEnter={browseAs} />
                <Button loading={browsing} disabled={!browseUser.username || !browseUser.password} onClick={browseAs}>{t('driveSettings.showShares')}</Button>
              </div>
            )}
          </div>
        )}
        <Form.Item name="rootPath" label={t('driveSettings.rootPath')} extra={t('driveSettings.rootPathHint')}>
          <Input placeholder="Departments/Accounting" addonBefore={`\\\\${server?.host || ''}\\${shareName || '…'}\\`} />
        </Form.Item>
        <Form.Item name="description" label={t('driveSettings.description')}>
          <Input.TextArea rows={2} maxLength={500} placeholder={t('driveSettings.descriptionPlaceholder')} />
        </Form.Item>
        <Form.Item name="color" hidden>
          <Input />
        </Form.Item>
        <Form.Item label={t('driveSettings.color')}>
          <div className="dv-colors">
            {COLORS.map((value) => (
              <button key={value} type="button" className={value === color ? 'is-active' : ''} style={{ background: value }} onClick={() => form.setFieldValue('color', value)} aria-label={value} />
            ))}
          </div>
        </Form.Item>
        <Form.Item name="uncDisplay" label={t('driveSettings.uncDisplay')} extra={t('driveSettings.uncDisplayHint')}>
          <Input placeholder="\\corp.local\dfs\Finance" />
        </Form.Item>
        <Form.Item name="groupIds" label={t('driveSettings.groups')} extra={t('driveSettings.groupsHint')}>
          <Select mode="multiple" allowClear placeholder={t('driveSettings.groupsAll')} options={groups.map((group) => ({ value: group.id, label: group.name }))} optionFilterProp="label" />
        </Form.Item>
        <Form.Item name="allowLinks" valuePropName="checked" label={t('driveSettings.allowLinks')} extra={t('driveSettings.allowLinksHint')}>
          <Switch />
        </Form.Item>
        {/* «Доступ»: how this folder's path is written in AD group descriptions (G:\ОБЪЕКТ-2\_DocArch, W:). */}
        <Form.Item name="pathPrefixes" label={t('driveSettings.pathPrefixes')} extra={t('driveSettings.pathPrefixesHint')}>
          <Select mode="tags" open={false} tokenSeparators={[';', '\n']} placeholder="W:  ·  G:\ОБЪЕКТ-2\_DocArch" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/**
 * A server without folders shows nothing in Drive although its connection
 * test passes. Say so, and offer the server's own shares to add in one click.
 */
function NoSharesCallout({ server, onAdd }) {
  const { t } = useLocale();
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const find = async () => {
    setBusy(true);
    try {
      const { data } = await driveApi.testServer({ id: server.id });
      setFound({ shares: (data.shares || []).filter((item) => !item.special), hidden: Boolean(data.sharesError) });
    } catch (err) {
      setFound({ shares: [], error: driveError(err, t) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dv-noshares">
      <strong>⚠ {t('driveSettings.noSharesTitle')}</strong>
      <span>{t('driveSettings.noSharesText')}</span>
      {!found ? (
        <Button size="small" loading={busy} onClick={find}>
          🔎 {t('driveSettings.findShares')}
        </Button>
      ) : found.error ? (
        <span className="dv-noshares__error">✕ {found.error}</span>
      ) : found.shares.length ? (
        <div className="dv-noshares__list">
          {found.shares.map((item) => (
            <Button key={item.name} size="small" onClick={() => onAdd({ share: item.name, title: item.remark || item.name })}>
              + {item.name}
            </Button>
          ))}
        </div>
      ) : (
        <span>{found.hidden ? t('driveSettings.sharesHidden') : t('driveSettings.noSharesFound')}</span>
      )}
    </div>
  );
}

function ServersManager() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => {
    driveApi
      .admin()
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch(setError);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="fs-share__empty">{driveError(error, t)}</div>;
  if (!data) return <Skeleton active paragraph={{ rows: 4 }} />;

  const move = async (server, index, delta) => {
    const all = data.servers.flatMap((item) => item.shares);
    const list = [...server.shares];
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item);
    const ids = data.servers.flatMap((other) => (other.id === server.id ? list : other.shares)).map((share) => share.id);
    if (ids.length !== all.length) return;
    await driveApi.reorder(ids);
    load();
  };

  return (
    <div className="dv-servers">
      {!data.servers.length && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('driveSettings.noServers')} />
      )}
      {data.servers.map((server) => (
        <div key={server.id} className="dv-server">
          <div className="dv-server__head">
            <span className="dv-server__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>
            </span>
            <div className="dv-server__text">
              <strong>{server.name}</strong>
              <code>\\{server.host}{server.port !== 445 ? `:${server.port}` : ''}</code>
              <span>
                {server.auth === 'service' ? t('driveSettings.authServiceShort', { user: server.serviceUser }) : server.useLogin ? t('driveSettings.authUserLogin') : t('driveSettings.authUserManual')}
                {server.domain ? ` · ${server.domain}` : data.defaultDomain ? ` · ${data.defaultDomain}` : ''}
                {server.encrypt ? ` · ${t('driveSettings.encrypted')}` : ''}
              </span>
            </div>
            <Button onClick={() => setDialog({ type: 'server', server })}>{t('common.edit')}</Button>
            <Popconfirm title={t('driveSettings.deleteServerConfirm')} onConfirm={() => driveApi.deleteServer(server.id).then(load).catch((err) => message.error(driveError(err, t)))}>
              <Button danger type="text">{t('common.delete')}</Button>
            </Popconfirm>
          </div>
          <div className="dv-server__shares">
            {server.shares.map((share, index) => (
              <div key={share.id} className="dv-sharerow" style={{ '--c': share.color }}>
                <span className="dv-sharerow__swatch" />
                <div className="dv-sharerow__text">
                  <strong>{share.title}</strong>
                  <code>{share.uncDisplay || `\\\\${server.host}\\${share.share}${share.rootPath ? `\\${share.rootPath.replace(/\//g, '\\')}` : ''}`}</code>
                </div>
                <span className="dv-sharerow__tags">
                  {share.groupIds.length > 0 && (
                    <Tooltip title={share.groupIds.map((id) => data.groups.find((group) => group.id === id)?.name).filter(Boolean).join(', ')}>
                      <Tag bordered={false}>👥 {share.groupIds.length}</Tag>
                    </Tooltip>
                  )}
                  {!share.allowLinks && <Tag bordered={false}>{t('driveSettings.noLinks')}</Tag>}
                  {(share.pathPrefixes || []).map((prefix) => (
                    <Tooltip key={prefix} title={t('driveSettings.pathPrefixes')}>
                      <Tag bordered={false} className="dv-prefix-tag">{prefix}</Tag>
                    </Tooltip>
                  ))}
                </span>
                <span className="dv-sharerow__order">
                  <Button size="small" type="text" disabled={index === 0} onClick={() => move(server, index, -1)}>↑</Button>
                  <Button size="small" type="text" disabled={index === server.shares.length - 1} onClick={() => move(server, index, 1)}>↓</Button>
                </span>
                <Button size="small" onClick={() => setDialog({ type: 'share', server, share })}>{t('common.edit')}</Button>
                <Popconfirm title={t('driveSettings.deleteShareConfirm')} onConfirm={() => driveApi.deleteShare(share.id).then(load).catch((err) => message.error(driveError(err, t)))}>
                  <Button size="small" type="text" danger>✕</Button>
                </Popconfirm>
              </div>
            ))}
            {server.shares.length === 0 && <NoSharesCallout server={server} onAdd={(preset) => setDialog({ type: 'share', server, preset })} />}
            <Button type={server.shares.length ? 'dashed' : 'primary'} block onClick={() => setDialog({ type: 'share', server })}>+ {t('driveSettings.addShareShort')}</Button>
          </div>
        </div>
      ))}
      <Button type="primary" onClick={() => setDialog({ type: 'server' })}>+ {t('driveSettings.addServer')}</Button>
      <ServerDialog
        open={dialog?.type === 'server'}
        server={dialog?.server}
        defaultDomain={data.defaultDomain}
        onClose={(saved) => {
          setDialog(null);
          if (saved) load();
        }}
      />
      {dialog?.type === 'share' && (
        <ShareDialog
          open
          server={dialog.server}
          share={dialog.share}
          preset={dialog.preset}
          groups={data.groups}
          onClose={(saved) => {
            setDialog(null);
            if (saved) load();
          }}
        />
      )}
    </div>
  );
}

function LinksAudit() {
  const { t } = useLocale();
  const [links, setLinks] = useState(null);
  const load = () => driveApi.adminLinks().then((res) => setLinks(res.data.links)).catch(() => setLinks([]));
  useEffect(() => {
    load();
  }, []);
  if (!links) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (!links.length) return <div className="fs-share__empty">{t('drive.noLinks')}</div>;
  return (
    <div className="sl-list">
      {links.map((link) => <LinkRow key={link.id} link={link} onChange={load} showItem showOwner />)}
    </div>
  );
}

export default function DriveSettings({ itemId }) {
  const { t } = useLocale();
  const { settings, ready, error, refresh, save } = useAdminSettings();
  const enabled = settings?.modules?.drive?.enabled;
  return (
    <>
      <SettingsPageHeader id={itemId} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <GeneralForm settings={settings} save={save} />}
        <SettingsSection title={t('driveSettings.servers')} description={t('driveSettings.serversDesc')}>
          {enabled ? <ServersManager /> : <div className="fs-share__empty">{t('driveSettings.enableFirst')}</div>}
        </SettingsSection>
        {enabled && (
          <SettingsSection title={t('driveSettings.audit')} description={t('driveSettings.auditDesc')}>
            <LinksAudit />
          </SettingsSection>
        )}
      </LoadState>
    </>
  );
}
