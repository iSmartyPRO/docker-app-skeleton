import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { App, DatePicker, Input, Modal, Select, Switch, TimePicker } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { useAuth } from '../../../context/AuthContext';
import { errorMessage } from '../../../lib/errors';
import api from '../../../services/api';
import { Hint } from '../../../help/Hint';

/**
 * A task straight from the calendar: title, deadline (the clicked slot),
 * important, project. It is assigned to me and shows up on its date at once.
 */
export default function QuickTaskDialog({ open, start, allDay, onClose, onCreated }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(null);
  const [withTime, setWithTime] = useState(true);
  const [important, setImportant] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setImportant(false);
    setWithTime(!allDay);
    setDue(start ? dayjs(start) : dayjs().add(1, 'day').hour(19).minute(0));
    api
      .get('/app/tasks/projects')
      .then((res) => setProjects(res.data.projects.filter((project) => ['edit', 'manage'].includes(project.level) && !project.archived)))
      .catch(() => setProjects([]));
  }, [open, start, allDay]);

  const save = async () => {
    if (!title.trim()) {
      input.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const dueAt = withTime ? due.second(0) : due.endOf('day');
      const res = await api.post('/app/tasks/tasks', { title: title.trim(), dueAt: dueAt.toISOString(), dueTime: withTime, important, projectId: projectId || undefined, assigneeIds: [user.id] });
      onCreated(res.data.task);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={save}
      okText={t('calendarTasks.create')}
      confirmLoading={saving}
      title={
        <span className="hp-label">
          {t('calendarTasks.title')}
          <Hint id="calendar.quickTask" />
        </span>
      }
      width={480}
      destroyOnHidden
      afterOpenChange={(visible) => visible && input.current?.focus()}
    >
      <div className="cal-qt">
        <Input ref={input} size="large" value={title} onChange={(event) => setTitle(event.target.value)} onPressEnter={save} placeholder={t('calendarTasks.placeholder')} maxLength={300} />
        <div className="cal-qt__row">
          <span>{t('calendarTasks.deadline')}</span>
          <DatePicker value={due} onChange={(date) => date && setDue(due.year(date.year()).month(date.month()).date(date.date()))} allowClear={false} format="dd, D MMM YYYY" />
          {withTime && <TimePicker value={due} onChange={(time) => time && setDue(due.hour(time.hour()).minute(time.minute()))} allowClear={false} format="HH:mm" minuteStep={15} needConfirm={false} />}
          <label className="cal-qt__switch">
            <Switch size="small" checked={withTime} onChange={setWithTime} /> {t('calendarTasks.withTime')}
          </label>
        </div>
        <div className="cal-qt__row">
          <span>{t('calendarTasks.project')}</span>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={projectId || undefined}
            onChange={(value) => setProjectId(value || null)}
            placeholder={t('calendarTasks.noProject')}
            style={{ flex: 1, minWidth: 180 }}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
          />
        </div>
        <label className="cal-qt__switch">
          <Switch size="small" checked={important} onChange={setImportant} /> 🔥 {t('calendarTasks.important')}
        </label>
        <p className="cal-qt__note">{t('calendarTasks.note')}</p>
      </div>
    </Modal>
  );
}
