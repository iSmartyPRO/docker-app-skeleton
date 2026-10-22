import { useEffect, useState } from 'react';
import { App, Alert, Button, Form, Input, Modal, Segmented, Skeleton, Tag, Tooltip } from 'antd';
import { CheckCircleFilled, DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import ModuleHeader from '../../shared/ModuleHeader';
import { remoteApi } from '../api';
import { useRemote } from '../RemoteContext';

function CredentialDialog({ open, credential, canShare, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const editing = Boolean(credential?.id);

  useEffect(() => {
    if (open) form.setFieldsValue({ name: credential?.name || '', username: credential?.username || '', domain: credential?.domain || '', password: '', scope: credential?.scope || 'personal' });
  }, [open, credential, form]);

  const save = async () => {
    try {
      const values = await form.validateFields();
      if (editing && !values.password) delete values.password;
      if (editing) await remoteApi.updateCredential(credential.id, values);
      else await remoteApi.saveCredential(values);
      message.success(t('remote.vault.saved'));
      onClose(true);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(errorMessage(err));
    }
  };

  return (
    <Modal open={open} onCancel={() => onClose(false)} onOk={save} okText={t('common.save')} cancelText={t('common.cancel')} title={editing ? t('remote.vault.edit') : t('remote.vault.add')} width={460} destroyOnHidden>
      <Form form={form} layout="vertical" className="rm-form">
        <Form.Item name="name" label={t('remote.vault.name')} rules={[{ required: true, message: t('remote.vault.nameRequired') }]}>
          <Input maxLength={120} placeholder={t('remote.vault.namePlaceholder')} autoFocus />
        </Form.Item>
        <div className="rm-form__row">
          <Form.Item name="username" label={t('remote.host.credUser')} style={{ flex: 2 }}>
            <Input maxLength={160} autoComplete="off" />
          </Form.Item>
          <Form.Item name="domain" label={t('remote.host.credDomain')}>
            <Input maxLength={120} placeholder="CORP" autoComplete="off" />
          </Form.Item>
        </div>
        <Form.Item name="password" label={t('remote.host.credPassword')} help={editing && credential?.hasPassword ? t('remote.host.credKept') : undefined}>
          <Input.Password autoComplete="new-password" placeholder={editing && credential?.hasPassword ? '••••••••' : ''} />
        </Form.Item>
        {canShare && (
          <Form.Item name="scope" label={t('remote.vault.scope')} help={t('remote.vault.scopeHint')}>
            <Segmented options={[{ value: 'personal', label: t('remote.vault.personal') }, { value: 'shared', label: t('remote.vault.shared') }]} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

function PassboltPanel() {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const [state, setState] = useState(null);
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  const load = () => remoteApi.passbolt().then((res) => setState(res.data.passbolt)).catch(() => setState({ connected: false }));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const values = await form.validateFields();
      setBusy(true);
      await remoteApi.savePassbolt(values);
      form.resetFields();
      await load();
      message.success(t('remote.passbolt.saved'));
    } catch (err) {
      if (!err?.errorFields) message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try { await remoteApi.testPassbolt(); await load(); message.success(t('remote.passbolt.verified')); }
    catch (err) { message.error(errorMessage(err)); }
    finally { setBusy(false); }
  };

  const disconnect = () => modal.confirm({
    title: t('remote.passbolt.disconnectConfirm'), okText: t('remote.passbolt.disconnect'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
    onOk: async () => { await remoteApi.deletePassbolt(); await load(); },
  });

  if (!state) return <Skeleton active paragraph={{ rows: 2 }} />;

  return (
    <section className="rm-vault-section">
      <h2 className="rm-section-title"><SafetyCertificateOutlined /> {t('remote.passbolt.title')}</h2>
      <p className="rm-muted">{t('remote.passbolt.lead')}</p>
      {state.connected ? (
        <div className="rm-passbolt-status">
          <div>
            <div className="rm-passbolt-status__row"><CheckCircleFilled className="rm-ok" /> <strong>{state.url}</strong></div>
            <div className="rm-muted">{t('remote.passbolt.fingerprint')}: <code>{state.fingerprint}</code></div>
            <div className="rm-muted">{state.verifiedAt ? t('remote.passbolt.verifiedAt', { when: formatDateTime(state.verifiedAt, locale) }) : t('remote.passbolt.notVerified')}</div>
          </div>
          <div className="rm-passbolt-status__actions">
            <Button loading={busy} onClick={test}>{t('remote.passbolt.test')}</Button>
            <Button danger onClick={disconnect}>{t('remote.passbolt.disconnect')}</Button>
          </div>
        </div>
      ) : (
        <Form form={form} layout="vertical" className="rm-form" style={{ maxWidth: 560 }}>
          <Form.Item name="url" label={t('remote.passbolt.url')} rules={[{ required: true }]}>
            <Input placeholder="https://passbolt.example.com" />
          </Form.Item>
          <Form.Item name="privateKey" label={t('remote.passbolt.key')} help={t('remote.passbolt.keyHint')} rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
          </Form.Item>
          <Form.Item name="passphrase" label={t('remote.passbolt.passphrase')}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" loading={busy} onClick={save}>{t('remote.passbolt.connect')}</Button>
        </Form>
      )}
    </section>
  );
}

/** /app/remote/vault — password manager (credentials) and the person's Passbolt. */
export default function Vault() {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const remote = useRemote();
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => remoteApi.credentials().then((res) => setList(res.data.credentials)).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const remove = (c) => modal.confirm({
    title: t('remote.vault.deleteTitle', { name: c.name }), okText: t('common.delete'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
    onOk: async () => { await remoteApi.deleteCredential(c.id); load(); },
  });

  return (
    <div className="rm-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.remote.name'), to: '/app/remote' }, { key: 'vault', label: t('remote.vault.title') }]}
        icon={<MenuIcon name="remote" />}
        title={t('remote.vault.title')}
        description={t('remote.vault.lead')}
        actions={[{ key: 'add', primary: true, icon: <PlusOutlined />, label: t('remote.vault.add'), onClick: () => setEditing({}) }]}
      />

      <section className="rm-vault-section">
        <h2 className="rm-section-title"><KeyOutlined /> {t('remote.vault.credentials')}</h2>
        {list === null ? <Skeleton active paragraph={{ rows: 3 }} /> : list.length === 0 ? (
          <Alert type="info" showIcon message={t('remote.vault.emptyTitle')} description={t('remote.vault.emptyText')} />
        ) : (
          <div className="rm-cred-list">
            {list.map((c) => (
              <div key={c.id} className="rm-cred">
                <span className="rm-cred__icon"><KeyOutlined /></span>
                <div className="rm-cred__body">
                  <strong>{c.name}</strong>
                  <span className="rm-muted">{[c.domain && `${c.domain}\\`, c.username].filter(Boolean).join('') || '—'}</span>
                </div>
                <Tag bordered={false} className={c.scope === 'shared' ? 'rm-badge is-shared' : 'rm-badge'}>{t(`remote.vault.${c.scope}`)}</Tag>
                {(c.mine || remote.can.admin) && (
                  <span className="rm-cred__actions">
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(c)} aria-label={t('common.edit')} />
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(c)} aria-label={t('common.delete')} />
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {remote.settings.passbolt && <PassboltPanel />}

      <CredentialDialog open={Boolean(editing)} credential={editing} canShare={remote.can.admin} onClose={(changed) => { setEditing(null); if (changed) load(); }} />
    </div>
  );
}
