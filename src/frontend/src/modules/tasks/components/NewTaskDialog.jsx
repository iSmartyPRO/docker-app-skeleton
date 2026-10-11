import { useEffect, useState } from 'react';
import { App, DatePicker, Form, Input, Modal, Select, Switch } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { userOptions } from '../../shared/People';
import { tasksApi } from '../api';
import { atLeast, useTasks } from '../TasksContext';
import { dueFromPicker, priorityOptions } from './bits';

/** Full "new task" form: project (when not fixed), title, assignee, due, priority, description. */
export default function NewTaskDialog({ open, projectKey, statusId, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { projects } = useTasks();
  const [form] = Form.useForm();
  const [members, setMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const project = Form.useWatch('projectId', form);
  const withTime = Form.useWatch('withTime', form);
  const writable = projects.filter((item) => atLeast(item.level, 'edit') && !item.archived);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ projectId: projectKey || writable[0]?.key, title: '', priority: 1, withTime: false, assigneeId: undefined, due: null, description: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectKey]);

  useEffect(() => {
    if (!open || !project) return;
    tasksApi.project(project).then((res) => setMembers(res.data.members)).catch(() => setMembers([]));
  }, [open, project]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await tasksApi.createTask({
        projectId: values.projectId,
        statusId,
        title: values.title,
        description: values.description,
        priority: values.priority,
        assigneeId: values.assigneeId || null,
        dueAt: dueFromPicker(values.due, values.withTime),
        dueTime: Boolean(values.withTime && values.due),
      });
      message.success(t('tasks.created', { ref: res.data.task.ref }));
      onClose(res.data.task);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('tasks.newTask')}
      onCancel={() => onClose(null)}
      onOk={submit}
      okText={t('common.create')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      destroyOnHidden
      width={600}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        {!projectKey && (
          <Form.Item name="projectId" label={t('tasks.project')} rules={[{ required: true, message: t('common.required') }]}>
            <Select options={writable.map((item) => ({ value: item.key, label: <span className="status-option"><span className="mod-dot" style={{ '--c': item.color }} />{item.name}</span> }))} />
          </Form.Item>
        )}
        <Form.Item name="title" label={t('tasks.fields.title')} rules={[{ required: true, message: t('common.required') }]}>
          <Input.TextArea autoFocus autoSize={{ minRows: 1, maxRows: 4 }} maxLength={300} placeholder={t('tasks.titlePlaceholder')} />
        </Form.Item>
        <div className="form-grid-2">
          <Form.Item name="assigneeId" label={t('tasks.fields.assignee')}>
            <Select allowClear showSearch placeholder={t('tasks.unassigned')} options={userOptions(members)} filterOption={(input, option) => option.search.includes(input.toLowerCase())} />
          </Form.Item>
          <Form.Item name="priority" label={t('tasks.fields.priority')}>
            <Select options={priorityOptions(t)} />
          </Form.Item>
          <Form.Item label={t('tasks.fields.due')}>
            <div className="tdue">
              <Form.Item name="due" noStyle>
                <DatePicker showTime={withTime ? { format: 'HH:mm', minuteStep: 5 } : false} format={withTime ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY'} />
              </Form.Item>
              <Form.Item name="withTime" valuePropName="checked" noStyle>
                <Switch size="small" />
              </Form.Item>
              <span className="tdue__hint">{t('tasks.withTime')}</span>
            </div>
          </Form.Item>
        </div>
        <Form.Item name="description" label={t('tasks.fields.description')}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} placeholder={t('tasks.descriptionPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
