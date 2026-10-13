import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Dropdown, Input, Result, Segmented, Select, Skeleton, Switch } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import AccessDialog from '../../shared/AccessDialog';
import { userOptions } from '../../shared/People';
import { tasksApi } from '../api';
import { atLeast, useTasks } from '../TasksContext';
import Board from '../components/Board';
import TaskList from '../components/TaskList';
import { useTaskEditor } from '../components/editor/EditorContext';
import { CreateButton } from '../components/editor/QuickTask';
import FollowButton from '../components/FollowButton';
import ProjectDialog from '../components/ProjectDialog';
import StatusesDialog from '../components/StatusesDialog';
import { priorityOptions } from '../components/bits';

function useStoredView(key, fallback) {
  const storageKey = `tasks_view_${key}`;
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || fallback;
    } catch {
      return fallback;
    }
  });
  const change = (next) => {
    setView(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* ignore */
    }
  };
  return [view, change];
}

/** A project: board or list, filters, the task drawer (/app/tasks/KEY-12). */
export default function ProjectPage({ projectKey, taskRef }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { config, refresh: refreshProjects } = useTasks();
  const [meta, setMeta] = useState(null);
  const [tasks, setTasks] = useState(null);
  // The server sends at most `limit` tasks; more exist when it says so.
  const [truncated, setTruncated] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useStoredView(projectKey, config?.defaultView || 'board');
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState();
  const [priority, setPriority] = useState();
  const [label, setLabel] = useState();
  const [showDone, setShowDone] = useState(true);
  const [dialog, setDialog] = useState(null);
  const editor = useTaskEditor();

  const loadTasks = useCallback(async () => {
    const res = await tasksApi.tasks({ project: projectKey });
    setTasks(res.data.tasks);
    setTruncated(res.data.truncated ? res.data.tasks.length : null);
  }, [projectKey]);

  const loadMeta = useCallback(async () => {
    const res = await tasksApi.project(projectKey);
    setMeta(res.data);
  }, [projectKey]);

  useEffect(() => {
    setMeta(null);
    setTasks(null);
    setError(null);
    Promise.all([loadMeta(), loadTasks()]).catch(setError);
  }, [loadMeta, loadTasks]);

  // Lists follow changes made in the task forms.
  useEffect(() => {
    if (editor.version) {
      loadTasks().catch(() => {});
      refreshProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.version]);

  // /app/tasks/KEY-12 opens the task's card over the board.
  useEffect(() => {
    if (taskRef) editor.openTask(taskRef, () => navigate(`/app/tasks/${projectKey}`, { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskRef]);

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const needle = q.trim().toLowerCase();
    return tasks.filter((task) => {
      if (needle && !`${task.ref} ${task.title}`.toLowerCase().includes(needle)) return false;
      if (assignee === 'me' && task.assignee?.id !== user.id) return false;
      if (assignee === 'none' && task.assignee) return false;
      if (typeof assignee === 'number' && task.assignee?.id !== assignee) return false;
      if (priority !== undefined && task.priority !== priority) return false;
      if (label && !task.labels.includes(label)) return false;
      return true;
    });
  }, [tasks, q, assignee, priority, label, user]);

  if (error) {
    return <Result status="404" title={t('tasks.projectNotFound')} subTitle={errorMessage(error)} extra={<Button onClick={() => navigate('/app/tasks')}>{t('common.back')}</Button>} />;
  }
  if (!meta || !tasks) return <Skeleton active paragraph={{ rows: 12 }} />;

  const { project, statuses, members, labels } = meta;
  const canEdit = atLeast(project.level, 'edit');
  const canManage = atLeast(project.level, 'manage');
  const canEditTask = (task) => canEdit || task.assignee?.id === user.id;

  const onMove = async (task, statusId, move) => {
    setTasks((list) => list.map((item) => (item.id === task.id ? { ...item, statusId } : item)));
    try {
      await tasksApi.updateTask(task.ref, { statusId, move });
    } catch (err) {
      message.error(errorMessage(err));
    }
    loadTasks();
    refreshProjects();
  };

  const quickCreate = async (title, statusId) => {
    try {
      await tasksApi.createTask({ projectId: project.key, title, statusId });
      await loadTasks();
      refreshProjects();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const toggleDone = async (task, done) => {
    await tasksApi.updateTask(task.ref, { complete: done }).catch((err) => message.error(errorMessage(err)));
    loadTasks();
    refreshProjects();
  };

  const menu = [
    canManage && { key: 'edit', label: t('tasks.editProject') },
    canManage && { key: 'workflow', label: t('tasks.workflow') },
    canManage && { type: 'divider' },
    canManage && { key: 'archive', label: project.archived ? t('tasks.unarchive') : t('tasks.archive') },
    canManage && { key: 'delete', danger: true, label: t('tasks.deleteProject') },
  ].filter(Boolean);

  const onMenu = async ({ key }) => {
    if (key === 'edit' || key === 'workflow') setDialog(key);
    if (key === 'archive') {
      await tasksApi.updateProject(project.key, { archived: !project.archived });
      await Promise.all([loadMeta(), refreshProjects()]);
    }
    if (key === 'delete') {
      modal.confirm({
        title: t('tasks.deleteProjectConfirm', { name: project.name }),
        content: t('tasks.deleteProjectText'),
        okText: t('common.delete'),
        okButtonProps: { danger: true },
        cancelText: t('common.cancel'),
        onOk: async () => {
          await tasksApi.deleteProject(project.key);
          await refreshProjects();
          navigate('/app/tasks/projects', { replace: true });
        },
      });
    }
  };

  const listGroups = statuses
    .map((status) => ({
      key: `s${status.id}`,
      label: status.name,
      color: status.color,
      tasks: filtered.filter((task) => task.statusId === status.id),
      collapsed: status.category === 'done',
    }))
    .filter((group) => showDone || !statuses.find((status) => `s${status.id}` === group.key && status.category === 'done'));

  const open = tasks.filter((task) => task.statusCategory !== 'done').length;

  return (
    <div className="tasks-page">
      <header className="mod-hero" style={{ '--c': project.color }}>
        <span className="mod-hero__badge">{project.key}</span>
        <div className="mod-hero__text">
          <h1>
            {project.name}
            {project.archived && <span className="mod-pill">{t('tasks.archived')}</span>}
          </h1>
          <p>{project.description || t('tasks.projectStats', { open, total: tasks.length, members: members.length })}</p>
        </div>
        <div className="mod-hero__actions">
          {!project.personal && <FollowButton projectId={project.id} />}
          {canManage && <Button onClick={() => setDialog('access')}>{t('kb.accessMenu')}</Button>}
          {menu.length > 0 && (
            <Dropdown trigger={['click']} menu={{ items: menu, onClick: onMenu }}>
              <Button>⋯</Button>
            </Dropdown>
          )}
          {canEdit && !project.archived && (
            <CreateButton
              onQuick={() => editor.openQuick({ projectId: project.id })}
              onFull={() => editor.openFull({ projectId: project.id })}
              onTemplate={(draft) => editor.openFull({ ...draft, projectId: draft.projectId || project.id })}
            />
          )}
        </div>
      </header>
      {truncated && <Alert type="warning" showIcon message={t('tasks.v2.boardTruncated', { n: truncated })} style={{ marginBottom: 12 }} />}

      <div className="mod-toolbar">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: t('tasks.board') },
            { value: 'list', label: t('tasks.list') },
          ]}
        />
        <Input.Search allowClear placeholder={t('tasks.search')} value={q} onChange={(event) => setQ(event.target.value)} style={{ width: 220 }} />
        <Select
          allowClear
          placeholder={t('tasks.fields.assignee')}
          value={assignee}
          onChange={setAssignee}
          style={{ minWidth: 170 }}
          options={[
            { value: 'me', label: t('tasks.assignedToMe') },
            { value: 'none', label: t('tasks.unassigned') },
            ...userOptions(members),
          ]}
          showSearch
          filterOption={(input, option) => String(option.search || option.label).toLowerCase().includes(input.toLowerCase())}
        />
        <Select allowClear placeholder={t('tasks.fields.priority')} value={priority} onChange={setPriority} options={priorityOptions(t)} style={{ minWidth: 150 }} />
        {labels.length > 0 && <Select allowClear placeholder={t('tasks.fields.labels')} value={label} onChange={setLabel} options={labels.map((value) => ({ value, label: value }))} style={{ minWidth: 140 }} />}
        <span className="mod-toolbar__grow" />
        {view === 'list' && (
          <label className="toolbar-switch">
            <Switch size="small" checked={showDone} onChange={setShowDone} /> {t('tasks.showDone')}
          </label>
        )}
      </div>

      {view === 'board' ? (
        <Board
          statuses={statuses}
          tasks={filtered}
          onOpen={(task) => editor.openTask(task.ref)}
          onMove={onMove}
          canEdit={canEditTask}
          onQuickCreate={canEdit && !project.archived ? quickCreate : null}
        />
      ) : (
        <TaskList groups={listGroups} onOpen={(task) => editor.openTask(task.ref)} onToggle={toggleDone} canEdit={canEditTask} />
      )}

      <ProjectDialog
        open={dialog === 'edit'}
        project={project}
        onClose={(saved) => {
          setDialog(null);
          if (saved) {
            loadMeta();
            refreshProjects();
          }
        }}
      />
      <StatusesDialog
        open={dialog === 'workflow'}
        project={project}
        statuses={statuses}
        onClose={(saved) => {
          setDialog(null);
          if (saved) {
            loadMeta();
            loadTasks();
          }
        }}
      />
      <AccessDialog
        open={dialog === 'access'}
        title={project.name}
        levelKey="tasks.level"
        load={() => tasksApi.access(project.key)}
        loadSubjects={tasksApi.subjects}
        save={(entries) => tasksApi.saveAccess(project.key, entries)}
        onClose={(saved) => {
          setDialog(null);
          if (saved) loadMeta();
        }}
      />
    </div>
  );
}
