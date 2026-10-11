import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { App, Empty, Segmented, Skeleton } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { tasksApi } from '../api';
import { useTasks } from '../TasksContext';
import TaskList from '../components/TaskList';
import { useTaskEditor } from '../components/editor/EditorContext';
import { CreateButton } from '../components/editor/QuickTask';

/** Buckets by due date in the user's local time. */
function bucketsOf(tasks, t) {
  const now = dayjs();
  const today = now.startOf('day');
  const groups = {
    overdue: { key: 'overdue', label: t('tasks.bucket.overdue'), tone: 'alert', tasks: [] },
    today: { key: 'today', label: t('tasks.bucket.today'), tasks: [] },
    tomorrow: { key: 'tomorrow', label: t('tasks.bucket.tomorrow'), tasks: [] },
    week: { key: 'week', label: t('tasks.bucket.week'), tasks: [] },
    later: { key: 'later', label: t('tasks.bucket.later'), tasks: [] },
    none: { key: 'none', label: t('tasks.bucket.none'), tasks: [] },
    deferred: { key: 'deferred', label: t('tasks.v2.deferredGroup'), tasks: [], collapsed: true },
    done: { key: 'done', label: t('tasks.bucket.done'), tasks: [], collapsed: true },
  };
  for (const task of tasks) {
    if (task.statusCategory === 'done') {
      groups.done.tasks.push(task);
      continue;
    }
    if (task.deferred) {
      groups.deferred.tasks.push(task);
      continue;
    }
    if (!task.dueAt) {
      groups.none.tasks.push(task);
      continue;
    }
    const due = dayjs(task.dueAt);
    const days = due.startOf('day').diff(today, 'day');
    if (task.dueTime ? due.isBefore(now) : days < 0) groups.overdue.tasks.push(task);
    else if (days === 0) groups.today.tasks.push(task);
    else if (days === 1) groups.tomorrow.tasks.push(task);
    else if (days <= 7) groups.week.tasks.push(task);
    else groups.later.tasks.push(task);
  }
  // Important ones first inside each group.
  Object.values(groups).forEach((group) => group.tasks.sort((a, b) => Number(b.important) - Number(a.important)));
  groups.done.tasks.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  return Object.values(groups);
}

const ROLES = ['doing', 'helping', 'assigned', 'auditing', 'all'];
const ROLE_KEY = 'tasks_my_role';

/** My tasks across projects, by role (doing / helping / assigned / auditing) and due date. */
export default function MyTasks({ openRef }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mine, refresh } = useTasks();
  const editor = useTaskEditor();
  const [tasks, setTasks] = useState(null);
  const [role, setRole] = useState(() => {
    try {
      return localStorage.getItem(ROLE_KEY) || 'doing';
    } catch {
      return 'doing';
    }
  });

  const load = useCallback(async () => {
    const res = await tasksApi.tasks({ role, doneSince: dayjs().subtract(14, 'day').toISOString(), sort: 'due' });
    setTasks(res.data.tasks);
  }, [role]);

  useEffect(() => {
    setTasks(null);
    load().catch((err) => message.error(errorMessage(err)));
  }, [load, message]);

  useEffect(() => {
    if (editor.version) {
      load().catch(() => {});
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.version]);

  useEffect(() => {
    if (openRef) editor.openTask(openRef, () => navigate('/app/tasks', { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRef]);

  const groups = useMemo(() => (tasks ? bucketsOf(tasks, t) : []), [tasks, t]);

  const toggle = async (task, done) => {
    setTasks((list) => list.map((item) => (item.id === task.id ? { ...item, statusCategory: done ? 'done' : 'todo', completedAt: done ? new Date().toISOString() : null } : item)));
    try {
      await tasksApi.updateTask(task.ref, { complete: done });
    } catch (err) {
      message.error(errorMessage(err));
      if (err?.response?.data?.code === 'RESULT_REQUIRED') editor.openTask(task.ref);
    }
    load();
    refresh();
  };

  const name = (user.displayName || user.username).split(' ')[0];
  const counts = { doing: mine?.open, helping: mine?.helping, assigned: mine?.assigned, auditing: mine?.auditing };

  return (
    <div className="tasks-page">
      <header className="mod-hero">
        <div className="mod-hero__text">
          <h1>{t('tasks.myTitle')}</h1>
          <p>{t('tasks.myLead', { name })}</p>
        </div>
        <div className="my-stats">
          <div><strong>{mine?.open ?? '—'}</strong><span>{t('tasks.stats.open')}</span></div>
          <div className={mine?.overdue ? 'is-alert' : ''}><strong>{mine?.overdue ?? '—'}</strong><span>{t('tasks.stats.overdue')}</span></div>
          <div><strong>{mine?.done_week ?? '—'}</strong><span>{t('tasks.stats.doneWeek')}</span></div>
        </div>
        <div className="mod-hero__actions">
          <CreateButton size="large" onQuick={() => editor.openQuick()} onFull={() => editor.openFull()} onTemplate={(draft) => editor.openFull(draft)} />
        </div>
      </header>
      <div className="mod-toolbar">
        <Segmented
          value={role}
          onChange={(next) => {
            setRole(next);
            try {
              localStorage.setItem(ROLE_KEY, next);
            } catch {
              /* ignore */
            }
          }}
          options={ROLES.map((key) => ({ value: key, label: <span className="role-tab">{t(`tasks.v2.roles.${key}`)}{counts[key] ? <b>{counts[key]}</b> : null}</span> }))}
        />
      </div>
      {!tasks ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : tasks.length === 0 ? (
        <Empty className="tasks-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`tasks.v2.emptyRole.${role}`)} />
      ) : (
        <TaskList groups={groups} onOpen={(task) => editor.openTask(task.ref)} onToggle={toggle} showProject />
      )}
    </div>
  );
}
