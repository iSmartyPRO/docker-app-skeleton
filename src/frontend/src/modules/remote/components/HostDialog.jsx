import { useEffect, useState } from 'react';
import { App, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Switch } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { remoteApi } from '../api';

const DEFAULT_PORT = { rdp: 3389, vnc: 5900 };

/** Add or edit a computer (remote.admin). */
export default function HostDialog({ open, host, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [people, setPeople] = useState([]);
  const editing = Boolean(host?.id);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: host?.name || '',
      address: host?.address || '',
      protocol: host?.protocol || 'rdp',
      port: host?.port || DEFAULT_PORT.rdp,
      ownerUserId: host?.ownerUserId || null,
      monitored: host?.monitored || false,
      note: host?.note || '',
    });
    remoteApi.subjects().then((res) => setPeople(res.data?.users || [])).catch(() => setPeople([]));
  }, [open, host, form]);

  const save = async () => {
    try {
      const values = await form.validateFields();
      if (editing) await remoteApi.updateHost(host.id, values);
      else await remoteApi.saveHost(values);
      message.success(t('remote.host.saved'));
      onClose(true);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(errorMessage(err));
    }
  };

  const remove = async () => {
    try {
      await remoteApi.deleteHost(host.id);
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => onClose(false)}
      onOk={save}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      title={editing ? t('remote.host.edit') : t('remote.host.add')}
      width={520}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" className="rm-form">
        <Form.Item name="name" label={t('remote.host.name')} rules={[{ required: true, message: t('remote.host.nameRequired') }]}>
          <Input maxLength={120} placeholder="HQ-PC-001" autoFocus />
        </Form.Item>
        <div className="rm-form__row">
          <Form.Item name="address" label={t('remote.host.address')} rules={[{ required: true }]} style={{ flex: 2 }}>
            <Input maxLength={255} placeholder="10.0.0.15" />
          </Form.Item>
          <Form.Item name="protocol" label={t('remote.host.protocol')}>
            <Segmented
              options={[{ value: 'rdp', label: 'RDP' }, { value: 'vnc', label: 'VNC' }]}
              onChange={(value) => form.setFieldValue('port', DEFAULT_PORT[value])}
            />
          </Form.Item>
          <Form.Item name="port" label={t('remote.host.port')}>
            <InputNumber min={1} max={65535} style={{ width: 92 }} />
          </Form.Item>
        </div>
        <Form.Item name="ownerUserId" label={t('remote.host.owner')} help={t('remote.host.ownerHint')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('remote.host.ownerPick')}
            options={people.map((p) => ({ value: p.id, label: p.name || p.username }))}
          />
        </Form.Item>
        <Form.Item name="monitored" valuePropName="checked" label={t('remote.host.monitored')} help={t('remote.host.monitoredHint')}>
          <Switch />
        </Form.Item>
        <Form.Item name="note" label={t('remote.host.note')}>
          <Input.TextArea rows={2} maxLength={300} />
        </Form.Item>
        {editing && (
          <Popconfirm title={t('remote.host.deleteConfirm')} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={remove}>
            <a className="rm-danger">{t('remote.host.delete')}</a>
          </Popconfirm>
        )}
      </Form>
    </Modal>
  );
}
