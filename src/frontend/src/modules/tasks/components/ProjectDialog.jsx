import { useEffect, useRef, useState } from 'react';
import { App, Form, Input, Modal, Radio } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { ColorSwatches } from '../../shared/People';
import { tasksApi } from '../api';
import { HintLabel } from '../../../help/Hint';

/**
 * Create or edit a project. The short key (HR, SALES…) prefixes task numbers
 * (HR-12) and the URL (/app/tasks/HR); it is suggested from the name and
 * checked for availability while typing. It cannot change later.
 */
export default function ProjectDialog({ open, project, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [keyState, setKeyState] = useState(null);
  const keyTouched = useRef(false);
  const timer = useRef();
  const editing = Boolean(project);

  useEffect(() => {
    if (!open) return;
    keyTouched.current = false;
    setKeyState(null);
    form.setFieldsValue(
      project
        ? { name: project.name, description: project.description, color: project.color || '#6366F1' }
        : { name: '', key: '', description: '', color: '#6366F1', visibility: 'team' }
    );
  }, [open, project, form]);

  const checkKey = (key) => {
    clearTimeout(timer.current);
    if (!key) {
      setKeyState(null);
      return;
    }
    timer.current = setTimeout(async () => {
      const res = await tasksApi.checkKey(key).catch(() => null);
      if (res) setKeyState(res.data);
    }, 300);
  };

  const onName = (name) => {
    if (editing || keyTouched.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!name.trim()) return;
      const res = await tasksApi.suggestKey(name).catch(() => null);
      if (res && !keyTouched.current) {
        form.setFieldsValue({ key: res.data.key });
        setKeyState({ key: res.data.key, available: true });
      }
    }, 350);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = editing
        ? await tasksApi.updateProject(project.key, { name: values.name, description: values.description, color: values.color })
        : await tasksApi.createProject(values);
      message.success(t(editing ? 'common.saved' : 'tasks.projectCreated'));
      onClose(res.data.project || res.data);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const keyHelp = keyState
    ? keyState.available
      ? <span className="key-ok">✓ {t('tasks.keyFree', { key: keyState.key })}</span>
      : <span className="key-bad">{t(`tasks.key_${keyState.reason || 'TAKEN'}`)}</span>
    : t('tasks.keyHint');

  return (
    <Modal
      open={open}
      title={editing ? t('tasks.editProject') : t('tasks.newProject')}
      onCancel={() => onClose(null)}
      onOk={submit}
      okText={editing ? t('common.save') : t('common.create')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
        <Form.Item name="name" label={t('tasks.projectName')} rules={[{ required: true, message: t('common.required') }]}>
          <Input autoFocus maxLength={120} placeholder={t('tasks.projectNamePlaceholder')} onChange={(event) => onName(event.target.value)} />
        </Form.Item>
        {!editing && (
          <Form.Item
            name="key"
            label={<HintLabel id="tasks.projectKey">{t('tasks.projectKey')}</HintLabel>}
            help={keyHelp}
            normalize={(value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Input
              style={{ width: 200, fontWeight: 700, letterSpacing: '0.06em' }}
              onChange={(event) => {
                keyTouched.current = true;
                checkKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              }}
            />
          </Form.Item>
        )}
        <Form.Item name="description" label={t('tasks.projectDescription')}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} />
        </Form.Item>
        <Form.Item name="color" label={t('kb.color')}>
          <ColorSwatches small />
        </Form.Item>
        {!editing && (
          <Form.Item name="visibility" label={<HintLabel id="tasks.projectAccess">{t('tasks.visibility')}</HintLabel>}>
            <Radio.Group className="visibility-options">
              {['team', 'readonly', 'private'].map((value) => (
                <Radio key={value} value={value}>
                  <strong>{t(`tasks.visibility_${value}`)}</strong>
                  <span>{t(`tasks.visibility_${value}Desc`)}</span>
                </Radio>
              ))}
            </Radio.Group>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
