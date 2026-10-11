import { useEffect, useState } from 'react';
import { App, Form, Input, Modal, Radio } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { ColorSwatches } from '../../shared/People';
import { calendarApi } from '../api';

/** Create a shared calendar or edit any calendar's name, colour and description. */
export default function CalendarDialog({ open, calendar, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const editing = Boolean(calendar);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        calendar
          ? { name: calendar.name, description: calendar.description, color: calendar.color }
          : { name: '', description: '', color: '#10B981', visibility: 'team' }
      );
    }
  }, [open, calendar, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = editing ? await calendarApi.updateCalendar(calendar.id, values) : await calendarApi.createCalendar(values);
      message.success(t(editing ? 'common.saved' : 'calendar.calendarCreated'));
      onClose(res.data.calendar);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={editing ? t('calendar.editCalendar') : t('calendar.newCalendar')}
      onCancel={() => onClose(null)}
      onOk={submit}
      okText={editing ? t('common.save') : t('common.create')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label={t('calendar.calendarName')} rules={[{ required: true, message: t('common.required') }]}>
          <Input autoFocus maxLength={120} placeholder={t('calendar.calendarNamePlaceholder')} />
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
              {['team', 'teamEdit', 'private'].map((value) => (
                <Radio key={value} value={value}>
                  <strong>{t(`calendar.visibility_${value}`)}</strong>
                  <span>{t(`calendar.visibility_${value}Desc`)}</span>
                </Radio>
              ))}
            </Radio.Group>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
