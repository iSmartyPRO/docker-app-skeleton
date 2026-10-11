import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { App, Button, Empty, Skeleton } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { tasksApi } from '../api';
import { atLeast, useTasks } from '../TasksContext';
import TaskList from '../components/TaskList';
import TaskDrawer from '../components/TaskDrawer';
import NewTaskDialog from '../components/NewTaskDialog';

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
    done: { key: 'done', label: t('tasks.bucket.done'), tasks: [], collapsed: true },
  };
  for (const task of tasks) {
    if (task.statusCategory === 'done') {
      groups.done.tasks.push(task);
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
  groups.none.tasks.sort((a, b) => b.priority - a.priority);
  groups.done.tasks.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  return Object.values(groups);
}

/** Everything assigned to me across projects, grouped by when it is due. */
export default function MyTasks() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { mine, projects, refresh } = useTasks();
  const [tasks, setTasks] = useState(null);
  const [openRef, setOpenRef] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await tasksApi.tasks({ assignee: 'me', doneSince: dayjs().subtract(14, 'day').toISOString(), sort: 'due' });
    setTasks(res.data.tasks);
  }, []);

  useEffect(() => {
    load().catch((err) => message.error(errorMessage(err)));
  }, [load, message]);

  const groups = useMemo(() => (tasks ? bucketsOf(tasks, t) : []), [tasks, t]);
  const canCreate = projects.some((project) => atLeast(project.level, 'edit') && !project.archived);

  const toggle = async (task, done) => {
    setTasks((list) => list.map((item) => (item.id === task.id ? { ...item, statusCategory: done ? 'done' : 'todo', completedAt: done ? new Date().toISOString() : null } : item)));
    try {
      await tasksApi.updateTask(task.ref, { complete: done });
    } catch (err) {
      message.error(errorMessage(err));
    }
    load();
    refresh();
  };

  const name = (user.displayName || user.username).split(' ')[0];

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
        {canCreate && (
          <div className="mod-hero__actions">
            <Button type="primary" onClick={() => setCreating(true)}>+ {t('tasks.task')}</Button>
          </div>
        )}
      </header>
      {!tasks ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : tasks.length === 0 ? (
        <Empty className="tasks-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('tasks.myEmpty')} />
      ) : (
        <TaskList groups={groups} onOpen={(task) => setOpenRef(task.ref)} onToggle={toggle} showProject />
      )}
      <TaskDrawer
        taskRef={openRef}
        open={Boolean(openRef)}
        onClose={() => setOpenRef(null)}
        onChanged={() => {
          load();
          refresh();
        }}
        onDeleted={() => {
          load();
          refresh();
        }}
      />
      <NewTaskDialog
        open={creating}
        onClose={(task) => {
          setCreating(false);
          if (task) {
            load();
            refresh();
          }
        }}
      />
    </div>
  );
}
