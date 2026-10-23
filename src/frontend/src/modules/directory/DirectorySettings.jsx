import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Checkbox, Empty, Form, Input, InputNumber, Modal, Select, Spin, Switch, Tag, Tooltip } from 'antd';
import { ArrowUpOutlined, ClusterOutlined, DeleteOutlined, FolderOpenOutlined, PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import SaveBar from '../../components/ui/SaveBar';
import LoadState from '../../components/ui/LoadState';
import { SettingRow, SettingsSection } from '../../components/ui/SettingsSection';
import { useAdminSettings } from '../../hooks/useAdminSettings';
import { useSettingsForm } from '../../hooks/useSettingsForm';
import { useLocale } from '../../context/LocaleContext';
import SettingsPageHeader from '../../pages/admin/settings/SettingsPageHeader';
import { UnitSelect } from '../org/public';
import { adApi, adError } from './api';
import { loginPreview } from './lib';
import './directory.css';

const ATTRIBUTES = ['givenName', 'sn', 'initials', 'displayName', 'description', 'title', 'department', 'company', 'mail', 'telephoneNumber', 'mobile', 'physicalDeliveryOfficeName', 'employeeID', 'l', 'manager'];

/** Browse OUs from the integration's base DN (settings: the managed root, exclusions, OUs for new users). */
function BrowseDialog({ open, title, onPick, onClose }) {
  const { t } = useLocale();
  const [at, setAt] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open) return;
    setData(null);
    setError(null);
    adApi
      .browse(at)
      .then(({ data: res }) => setData(res))
      .catch((err) => setError(adError(err, t)));
  }, [open, at, t]);
  useEffect(() => {
    if (open) setAt(null);
  }, [open]);
  return (
    <Modal open={open} title={title} onCancel={onClose} width={560} destroyOnHidden footer={[
      <Button key="cancel" onClick={onClose}>{t('common.cancel')}</Button>,
      <Button key="pick" type="primary" disabled={!data} onClick={() => onPick(data.dn)}>{t('directory.settings.pickThis')}</Button>,
    ]}>
      {error && <Alert type="warning" showIcon message={error} />}
      {!data && !error && <Spin />}
      {data && (
        <>
          <div className="ad-browse__here">
            <ClusterOutlined /> <code>{data.dn}</code>
          </div>
          {data.parent && (
            <Button size="small" icon={<ArrowUpOutlined />} onClick={() => setAt(data.parent)} className="ad-gap">
              {t('directory.settings.up')}
            </Button>
          )}
          {data.children.length ? (
            <ul className="ad-list ad-browse">
              {data.children.map((child) => (
                <li key={child.dn}>
                  <FolderOpenOutlined />
                  <div className="ad-list__main">
                    <a onClick={() => setAt(child.dn)}>{child.name}</a>
                    {child.description && <span className="ad-muted">{child.description}</span>}
                  </div>
                  {child.place === 'excluded' && <Tag color="orange">{t('directory.place.excluded')}</Tag>}
                  {child.place === 'outside' && <Tag>{t('directory.place.outside')}</Tag>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('directory.settings.noChildren')} />
          )}
        </>
      )}
    </Modal>
  );
}

/** A DN input with a «Browse» button (when the module can read the directory). */
function DnInput({ value, onChange, canBrowse, placeholder, title }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <div className="ad-row">
      <Input value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder || 'OU=Accounts,DC=example,DC=local'} allowClear className="ad-mono" />
      <Tooltip title={canBrowse ? null : t('directory.settings.browseOff')}>
        <Button icon={<FolderOpenOutlined />} disabled={!canBrowse} onClick={() => setOpen(true)}>
          {t('directory.settings.browse')}
        </Button>
      </Tooltip>
      <BrowseDialog open={open} title={title || t('directory.settings.browse')} onClose={() => setOpen(false)} onPick={(dn) => { onChange?.(dn); setOpen(false); }} />
    </div>
  );
}

/** A list of DNs or patterns: tags, plus «Browse» to add an OU. */
function DnList({ value = [], onChange, canBrowse, placeholder }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <div className="ad-row">
      <Select mode="tags" value={value} onChange={onChange} tokenSeparators={[';']} placeholder={placeholder} open={false} suffixIcon={null} className="ad-grow" />
      <Tooltip title={canBrowse ? null : t('directory.settings.browseOff')}>
        <Button icon={<PlusOutlined />} disabled={!canBrowse} onClick={() => setOpen(true)}>
          {t('directory.settings.browse')}
        </Button>
      </Tooltip>
      <BrowseDialog open={open} title={t('directory.settings.excludedPick')} onClose={() => setOpen(false)} onPick={(dn) => { onChange?.([...new Set([...value, dn])]); setOpen(false); }} />
    </div>
  );
}

/** OU per org unit: [{ unitId, ou }]. */
function UnitOus({ value = [], onChange, canBrowse }) {
  const { t } = useLocale();
  const update = (index, patch) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="ad-unit-ous">
      {value.map((item, index) => (
        <div key={index} className="ad-unit-ous__row">
          <UnitSelect value={item.unitId || undefined} onChange={(unitId) => update(index, { unitId })} placeholder={t('directory.settings.unit')} style={{ minWidth: 200 }} />
          <DnInput value={item.ou} onChange={(ou) => update(index, { ou })} canBrowse={canBrowse} />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={t('common.delete')} />
        </div>
      ))}
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => onChange([...value, { unitId: null, ou: '' }])}>
        {t('directory.settings.addUnitOu')}
      </Button>
    </div>
  );
}

function SecureCheck({ enabled }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await adApi.secureCheck();
      setResult(data);
    } catch (err) {
      message.error(adError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ad-secure-check">
      <Button icon={<SafetyCertificateOutlined />} loading={busy} disabled={!enabled} onClick={run}>
        {t('directory.settings.checkChannel')}
      </Button>
      {result && (
        <Alert
          type={result.ok ? 'success' : 'warning'}
          showIcon
          message={result.channel ? (result.ok ? t('directory.settings.channelOk', { channel: result.channel === 'ldaps' ? 'LDAPS' : result.channel === 'demo' ? t('directory.demoBadge') : 'StartTLS' }) : t('directory.settings.channelFailed')) : t('directory.channel.unavailable')}
          description={result.error || null}
        />
      )}
    </div>
  );
}

function DirectoryForm({ settings, save }) {
  const { t } = useLocale();
  const state = settings.modules?.directory || { enabled: false, settings: {} };
  const ad = settings.integrations?.activeDirectory || {};
  const adReady = Boolean(ad.enabled && ad.host && ad.baseDn);
  const initial = useMemo(() => ({ enabled: state.enabled, ...state.settings }), [state]);
  const { dirty, saving, submit, reset, formProps, form } = useSettingsForm(initial, ({ enabled, ...rest }) => save({ modules: { directory: { enabled, settings: rest } } }));
  const template = Form.useWatch('loginTemplate', form) ?? initial.loginTemplate;
  const canBrowse = Boolean(state.enabled);
  const preview = [
    loginPreview(template, { first: t('directory.settings.sampleFirst'), last: t('directory.settings.sampleLast') }),
    loginPreview(template, { first: 'Ақбота', last: 'Ёлкина' }),
  ];
  return (
    <Form {...formProps}>
      <SettingsSection>
        <SettingRow label={t('modules.enabledLabel')} description={t('directory.settings.enabledDesc')}>
          <Form.Item name="enabled" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.integration')} description={adReady ? t('directory.settings.integrationOn', { host: ad.host }) : t('directory.settings.integrationOff')}>
          <Link to="/admin/settings/ad">{t('directory.settings.openIntegration')} →</Link>
        </SettingRow>
        {state.enabled && (
          <SettingRow label={t('directory.settings.open')}>
            <Link to="/app/directory">{t('apps.directory.name')} →</Link>
          </SettingRow>
        )}
      </SettingsSection>

      <SettingsSection title={t('directory.settings.scope')} description={t('directory.settings.scopeDesc')}>
        <SettingRow label={t('directory.settings.root')} description={t('directory.settings.rootDesc')} stacked>
          <Form.Item name="rootDn" noStyle>
            <DnInput canBrowse={canBrowse} title={t('directory.settings.rootPick')} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.excluded')} description={t('directory.settings.excludedDesc')} stacked>
          <Form.Item name="excluded" noStyle>
            <DnList canBrowse={canBrowse} placeholder="OU=Service,OU=Accounts,DC=example,DC=local; Admins*" />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.hidden')} description={t('directory.settings.hiddenDesc')} stacked>
          <Form.Item name="hiddenAccounts" noStyle>
            <Select mode="tags" open={false} suffixIcon={null} placeholder="svc_*, adm-*" />
          </Form.Item>
        </SettingRow>
        {!canBrowse && <Alert type="info" showIcon message={t('directory.settings.browseOff')} />}
      </SettingsSection>

      <SettingsSection title={t('directory.settings.newUsers')} description={t('directory.settings.newUsersDesc')}>
        <SettingRow label={t('directory.settings.allowCreate')}>
          <Form.Item name="allowCreate" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.loginTemplate')} description={t('directory.settings.loginTemplateDesc')} stacked>
          <Form.Item name="loginTemplate" noStyle rules={[{ pattern: /\{(first|last|f|l)\}/ }]}>
            <Input className="ad-mono" maxLength={60} />
          </Form.Item>
          <div className="ad-preview">
            {t('directory.settings.preview')}: <code>{preview[0] || '—'}</code> · <code>{preview[1] || '—'}</code>
          </div>
        </SettingRow>
        <SettingRow label={t('directory.settings.upnSuffixes')} description={t('directory.settings.upnSuffixesDesc')} stacked>
          <Form.Item name="upnSuffixes" noStyle>
            <Select mode="tags" open={false} suffixIcon={null} placeholder="example.com" />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.mailTemplate')} description={t('directory.settings.mailTemplateDesc')} stacked>
          <Form.Item name="mailTemplate" noStyle>
            <Input className="ad-mono" placeholder="{login}@example.com" maxLength={120} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.defaultOu')} description={t('directory.settings.defaultOuDesc')} stacked>
          <Form.Item name="defaultUserOu" noStyle>
            <DnInput canBrowse={canBrowse} placeholder="OU=Users,OU=HQ,OU=Accounts,DC=example,DC=local" />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.unitOus')} description={t('directory.settings.unitOusDesc')} stacked>
          <Form.Item name="unitOus" noStyle>
            <UnitOus canBrowse={canBrowse} />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('directory.settings.attributes')} description={t('directory.settings.attributesDesc')}>
        <Form.Item name="editableAttributes" noStyle>
          <Checkbox.Group className="ad-attr-grid" options={ATTRIBUTES.map((attr) => ({ value: attr, label: <span>{t(`directory.attr.${attr}`)} <code className="ad-muted">{attr}</code></span> }))} />
        </Form.Item>
      </SettingsSection>

      <SettingsSection title={t('directory.settings.passwords')} description={t('directory.settings.passwordsDesc')}>
        <SettingRow label={t('directory.settings.startTls')} description={ad.useTls ? t('directory.settings.ldapsOn') : t('directory.settings.startTlsDesc')}>
          <Form.Item name="startTls" valuePropName="checked" noStyle>
            <Switch disabled={Boolean(ad.useTls)} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.channelCheck')} description={t('directory.settings.channelCheckDesc')} stacked>
          <SecureCheck enabled={state.enabled} />
        </SettingRow>
        <SettingRow label={t('directory.settings.minLength')}>
          <Form.Item name="passwordMinLength" noStyle>
            <InputNumber min={6} max={64} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.complexity')} description={t('directory.settings.complexityDesc')}>
          <Form.Item name="passwordComplexity" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.mustChange')}>
          <Form.Item name="mustChangeDefault" valuePropName="checked" noStyle>
            <Switch />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.passwordHint')} description={t('directory.settings.passwordHintDesc')} stacked>
          <Form.Item name="passwordHint" noStyle>
            <Input.TextArea rows={2} maxLength={300} showCount />
          </Form.Item>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('directory.settings.lifecycle')} description={t('directory.settings.lifecycleDesc')}>
        <SettingRow label={t('directory.settings.inactiveDays')}>
          <Form.Item name="inactiveDays" noStyle>
            <InputNumber min={7} max={3650} addonAfter={t('directory.settings.days')} />
          </Form.Item>
        </SettingRow>
        <SettingRow label={t('directory.settings.disabledOu')} description={t('directory.settings.disabledOuDesc')} stacked>
          <Form.Item name="disabledOu" noStyle>
            <DnInput canBrowse={canBrowse} placeholder="OU=Disabled,OU=Accounts,DC=example,DC=local" />
          </Form.Item>
        </SettingRow>
      </SettingsSection>
      <SaveBar visible={dirty} saving={saving} onSave={submit} onReset={reset} />
    </Form>
  );
}

export default function DirectorySettings({ itemId }) {
  const { settings, ready, error, refresh, save } = useAdminSettings();
  return (
    <>
      <SettingsPageHeader id={itemId || 'directory'} />
      <LoadState ready={ready} error={error} onRetry={refresh}>
        {settings && <DirectoryForm settings={settings} save={save} />}
      </LoadState>
    </>
  );
}
