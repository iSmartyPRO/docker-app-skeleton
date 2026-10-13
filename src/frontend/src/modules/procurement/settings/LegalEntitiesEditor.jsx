import { useCallback, useEffect, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Skeleton, Switch, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';

/**
 * The shared directory of legal entities (payers of requests, parties of
 * contracts). `api` = { list, create, update, archive } — the console's admin
 * API or the procurement module's own (for procurement administrators).
 */
export default function LegalEntitiesEditor({ api, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const load = useCallback(() => api.list().then((res) => setItems(res.data.entities)).catch((err) => message.error(errorMessage(err))), [api, message]);
  useEffect(() => {
    load();
  }, [load]);
  const open = (entity) => {
    setEditing(entity || {});
    form.setFieldsValue(entity ? { ...entity } : { name: '', shortName: '', taxId: '', address: '', bankDetails: '', note: '', isDefault: false, sort: 0 });
  };
  const save = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      if (editing?.id) await api.update(editing.id, values);
      else await api.create(values);
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const toggleArchive = async (entity) => {
    try {
      if (entity.archived) await api.update(entity.id, { archived: false });
      else await api.archive(entity.id);
      await load();
      onChanged?.();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  if (!items) return <Skeleton active />;
  return (
    <div className="le-editor">
      <ul className="le-list">
        {items.map((entity) => (
          <li key={entity.id} className={entity.archived ? 'is-archived' : ''}>
            <button type="button" className="le-list__main" onClick={() => open(entity)}>
              <strong>{entity.name}</strong>
              <small>{[entity.shortName, entity.taxId && `${t('legalEntities.taxId')}: ${entity.taxId}`, entity.address].filter(Boolean).join(' · ')}</small>
            </button>
            {entity.isDefault && <Tag color="blue">{t('legalEntities.default')}</Tag>}
            {entity.archived && <Tag>{t('legalEntities.archived')}</Tag>}
            <Button size="small" type="text" onClick={() => toggleArchive(entity)}>
              {entity.archived ? t('legalEntities.restore') : t('legalEntities.archive')}
            </Button>
          </li>
        ))}
      </ul>
      <Button icon={<PlusOutlined />} onClick={() => open(null)}>
        {t('legalEntities.add')}
      </Button>
      <Modal open={Boolean(editing)} title={editing?.id ? t('legalEntities.edit') : t('legalEntities.add')} onCancel={() => setEditing(null)} onOk={save} okButtonProps={{ loading: busy }} okText={t('common.save')} cancelText={t('common.cancel')} destroyOnClose>
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label={t('legalEntities.name')} rules={[{ required: true, whitespace: true, message: t('legalEntities.nameRequired') }]}>
            <Input maxLength={200} placeholder={t('legalEntities.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="shortName" label={t('legalEntities.shortName')}>
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="taxId" label={t('legalEntities.taxId')}>
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item name="address" label={t('legalEntities.address')}>
            <Input maxLength={400} />
          </Form.Item>
          <Form.Item name="bankDetails" label={t('legalEntities.bankDetails')}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={2000} />
          </Form.Item>
          <Form.Item name="note" label={t('legalEntities.note')}>
            <Input maxLength={400} />
          </Form.Item>
          <div className="prc-inline">
            <Form.Item name="isDefault" valuePropName="checked" label={t('legalEntities.isDefault')}>
              <Switch />
            </Form.Item>
            <Form.Item name="sort" label={t('legalEntities.sort')}>
              <InputNumber min={-9999} max={9999} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
