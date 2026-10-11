import { useEffect, useState } from 'react';
import { App, Form, Input, Modal, Radio } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { ColorSwatches } from '../../shared/People';
import { filesApi } from '../api';

/** Create or edit a shared space (team storage with its own access list). */
export default function SpaceDialog({ open, space, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const editing = Boolean(space);

  useEffect(() => {
    if (open) form.setFieldsValue(space ? { name: space.name, description: space.description, color: space.color } : { name: '', description: '', color: '#0EA5E9', visibility: 'teamEdit' });
  }, [open, space, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = editing ? await filesApi.updateSpace(space.id, values) : await filesApi.createSpace(values);
      message.success(t(editing ? 'common.saved' : 'files.spaceCreated'));
      onClose(res.data.space);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={editing ? t('files.editSpace') : t('files.newSpace')}
      onCancel={() => onClose(null)}
      onOk={submit}
      okText={editing ? t('common.save') : t('common.create')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label={t('files.spaceName')} rules={[{ required: true, message: t('common.required') }]}>
          <Input autoFocus maxLength={120} placeholder={t('files.spaceNamePlaceholder')} />
        </Form.Item>
        <Form.Item name="description" label={t('calendar.description')}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} />
        </Form.Item>
        <Form.Item name="color" label={t('kb.color')}>
          <ColorSwatches small />
        </Form.Item>
        {!editing && (
          <Form.Item name="visibility" label={t('tasks.visibility')}>
            <Radio.Group className="visibility-options">
              {['teamEdit', 'team', 'private'].map((value) => (
                <Radio key={value} value={value}>
                  <strong>{t(`files.visibility_${value}`)}</strong>
                  <span>{t(`files.visibility_${value}Desc`)}</span>
                </Radio>
              ))}
            </Radio.Group>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
