import { useEffect } from 'react';
import { App, Form, Input, InputNumber, Modal, Popconfirm, Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { remoteApi } from '../api';
import { useRemote } from '../RemoteContext';

/** Add or edit a published application (remote.admin). Independent connection. */
export default function AppDialog({ open, app, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const remote = useRemote();
  const [form] = Form.useForm();
  const editing = Boolean(app?.id);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: app?.name || '',
      alias: app?.alias || '',
      address: app?.address || '',
      port: app?.port || 3389,
      gatewayId: app?.gatewayId || null,
      folderId: app?.folderId || null,
      args: app?.args || '',
      loadBalanceInfo: app?.loadBalanceInfo || '',
      credUsername: app?.credUsername || '',
      credDomain: app?.credDomain || '',
      credPassword: '',
    });
  }, [open, app, form]);

  const save = async () => {
    try {
      const values = await form.validateFields();
      if (editing && !values.credPassword) delete values.credPassword;
      if (editing) await remoteApi.updateApp(app.id, values);
      else await remoteApi.saveApp(values);
      message.success(t('remote.apps.saved'));
      onClose(true);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(errorMessage(err));
    }
  };

  const remove = async () => {
    try { await remoteApi.deleteApp(app.id); onClose(true); } catch (err) { message.error(errorMessage(err)); }
  };

  return (
    <Modal open={open} onCancel={() => onClose(false)} onOk={save} okText={t('common.save')} cancelText={t('common.cancel')} title={editing ? t('remote.apps.edit') : t('remote.apps.addTitle')} width={540} destroyOnHidden>
      <Form form={form} layout="vertical" className="rm-form">
        <div className="rm-form__row">
          <Form.Item name="name" label={t('remote.apps.name')} rules={[{ required: true, message: t('remote.apps.nameRequired') }]} style={{ flex: 2 }}>
            <Input maxLength={120} placeholder="1С (ЗУП)" autoFocus />
          </Form.Item>
          <Form.Item name="folderId" label={t('remote.folders.folder')} style={{ flex: 1 }}>
            <Select allowClear placeholder={t('remote.folders.none')} options={remote.folders.map((f) => ({ value: f.id, label: f.name }))} />
          </Form.Item>
        </div>
        <Form.Item name="alias" label={t('remote.apps.alias')} help={t('remote.apps.aliasHint')} rules={[{ required: true }]}>
          <Input maxLength={255} placeholder="||1C-zup-bso" autoComplete="off" />
        </Form.Item>
        <div className="rm-form__row">
          <Form.Item name="address" label={t('remote.apps.address')} rules={[{ required: true }]} style={{ flex: 2 }}>
            <Input maxLength={255} placeholder="RDS.EXAMPLE.RU" />
          </Form.Item>
          <Form.Item name="port" label={t('remote.host.port')}>
            <InputNumber min={1} max={65535} style={{ width: 92 }} />
          </Form.Item>
        </div>
        <Form.Item name="gatewayId" label={t('remote.apps.gateway')} help={t('remote.apps.gatewayHint')}>
          <Select allowClear placeholder={t('remote.apps.direct')} options={remote.gateways.map((g) => ({ value: g.id, label: `${g.name} (${g.host}:${g.port})` }))} />
        </Form.Item>
        <Form.Item name="loadBalanceInfo" label={t('remote.apps.lbi')} help={t('remote.apps.lbiHint')}>
          <Input maxLength={512} placeholder="tsv://MS Terminal Services Plugin.1.Collection" autoComplete="off" />
        </Form.Item>
        <Form.Item name="args" label={t('remote.apps.args')}>
          <Input maxLength={500} autoComplete="off" />
        </Form.Item>

        <div className="rm-creds-block">
          <div className="rm-creds-block__head">{t('remote.host.credentials')}</div>
          <p className="rm-muted">{t('remote.apps.credsHint')}</p>
          <div className="rm-form__row">
            <Form.Item name="credUsername" label={t('remote.host.credUser')} style={{ flex: 2 }}>
              <Input maxLength={160} autoComplete="off" />
            </Form.Item>
            <Form.Item name="credDomain" label={t('remote.host.credDomain')}>
              <Input maxLength={120} placeholder="CORP" autoComplete="off" />
            </Form.Item>
          </div>
          <Form.Item name="credPassword" label={t('remote.host.credPassword')} help={editing && app?.hasCredentials ? t('remote.host.credKept') : undefined}>
            <Input.Password autoComplete="new-password" placeholder={editing && app?.hasCredentials ? '••••••••' : ''} />
          </Form.Item>
        </div>

        {editing && (
          <Popconfirm title={t('remote.apps.deleteConfirm')} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={remove}>
            <a className="rm-danger">{t('remote.apps.delete')}</a>
          </Popconfirm>
        )}
      </Form>
    </Modal>
  );
}
