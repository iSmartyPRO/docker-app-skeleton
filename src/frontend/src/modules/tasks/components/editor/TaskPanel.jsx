import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { App, Button, Dropdown, Input, Modal, Popover, Select, Skeleton, Tooltip } from 'antd';
import { useAuth } from '../../../../context/AuthContext';
import { useLocale } from '../../../../context/LocaleContext';
import { useSettings } from '../../../../context/SettingsContext';
import { errorMessage } from '../../../../lib/errors';
import Conversation from '../../../chat/components/Conversation';
import { chatApi } from '../../../chat/api';
import { tasksApi } from '../../api';
import { useTasks } from '../../TasksContext';
import ProjectDialog from '../ProjectDialog';
import { StatusDot } from '../bits';
import RichText from './RichText';
import { ChecklistsBlock, FilesBlock, ResultsBlock, checklistOps, taskLists, uid } from './blocks1';
import {
  FieldsBlock,
  FlowBlock,
  GanttBlock,
  LinksBlock,
  ParentBlock,
  PeopleBlock,
  PlanningBlock,
  ProjectBlock,
  RecurringBlock,
  RemindersBlock,
  SubtasksBlock,
  TagsBlock,
  TimeBlock,
  defaultRecurrence,
  formatClock,
  useTicking,
} from './blocks2';
import { DeadlinePicker, PeopleSelect, PersonPill, defaultDeadline, usePeople } from './pickers';
import './editor.css';

export const CHIPS = [
  { key: 'results', icon: '🏁' },
  { key: 'files', icon: '📎' },
  { key: 'checklists', icon: '☑' },
  { key: 'project', icon: '🗂' },
  { key: 'coassignees', icon: '👥' },
  { key: 'auditors', icon: '👁' },
  { key: 'flow', icon: '🌊' },
  { key: 'tags', icon: '#' },
  { key: 'reminders', icon: '⏰' },
  { key: 'parent', icon: '⤴' },
  { key: 'subtasks', icon: '⤵' },
  { key: 'links', icon: '🔗' },
  { key: 'recurring', icon: '🔁' },
  { key: 'gantt', icon: '📊' },
  { key: 'planning', icon: '🗓' },
  { key: 'time', icon: '⏱' },
  { key: 'fields', icon: '✚' },
];

const CHIPS_KEY = 'tasks_chips_v2';
function rememberedChips() {
  try {
    return JSON.parse(localStorage.getItem(CHIPS_KEY) || '[]');
  } catch {
    return [];
  }
}
function rememberChips(list) {
  try {
    localStorage.setItem(CHIPS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function emptyDraft(overrides = {}) {
  return {
    title: '',
    important: false,
    description: '',
    descriptionFormat: 'html',
    originatorId: null,
    assigneeId: null,
    assigneeIds: [],
    dueAt: defaultDeadline(),
    projectId: null,
    coassigneeIds: [],
    auditorIds: [],
    flowId: null,
    labels: [],
    resultRequired: false,
    parentId: null,
    parent: null,
    checklists: [],
    files: [],
    reminders: [],
    links: [],
    deps: [],
    planStart: null,
    planEnd: null,
    allowChangeDeadline: true,
    skipWeekends: false,
    deadlineFromSubtasks: false,
    timeTracking: false,
    timeEstimate: null,
    custom: {},
    recurrence: null,
    ...overrides,
  };
}

/** The form's values of an existing task. */
function fromTask(task) {
  return {
    title: task.title,
    important: task.important,
    description: task.description,
    descriptionFormat: task.descriptionFormat,
    originatorId: task.originator?.id || null,
    assigneeId: task.assignee?.id || null,
    dueAt: task.dueAt,
    projectId: task.project.personal ? null : task.project.id,
    coassigneeIds: task.coassignees.map((user) => user.id),
    auditorIds: task.auditors.map((user) => user.id),
    flowId: task.flowId,
    labels: task.labels,
    resultRequired: task.resultRequired,
    parentId: task.parent?.id || null,
    planStart: task.planStart,
    planEnd: task.planEnd,
    allowChangeDeadline: task.allowChangeDeadline,
    skipWeekends: task.skipWeekends,
    deadlineFromSubtasks: task.deadlineFromSubtasks,
    timeTracking: task.timeTracking,
    timeEstimate: task.timeEstimate,
    custom: task.custom,
  };
}

/** What the API takes to create the drafted task. */
export function draftPayload(draft, me) {
  return {
    title: draft.title,
    important: draft.important,
    description: draft.description,
    descriptionFormat: 'html',
    originatorId: draft.originatorId || me,
    assigneeId: draft.assigneeIds?.length > 1 ? undefined : draft.assigneeIds?.[0] || draft.assigneeId,
    assigneeIds: draft.assigneeIds?.length > 1 ? draft.assigneeIds : undefined,
    dueAt: draft.dueAt,
    dueTime: Boolean(draft.dueAt),
    projectId: draft.projectId || undefined,
    coassigneeIds: draft.coassigneeIds,
    auditorIds: draft.auditorIds,
    flowId: draft.flowId || undefined,
    labels: draft.labels,
    resultRequired: draft.resultRequired,
    parentId: draft.parentId || undefined,
    checklists: (draft.checklists || []).map((list) => ({ title: list.title, items: list.items.map((item) => ({ text: item.text, done: item.done, level: item.level, important: item.important })) })),
    fileIds: (draft.files || []).map((file) => file.id),
    reminders: draft.reminders,
    linkIds: (draft.links || []).map((task) => task.id),
    deps: (draft.deps || []).map((dep) => ({ taskId: dep.taskId, kind: dep.kind })),
    planStart: draft.planStart,
    planEnd: draft.planEnd,
    allowChangeDeadline: draft.allowChangeDeadline,
    skipWeekends: draft.skipWeekends,
    deadlineFromSubtasks: draft.deadlineFromSubtasks,
    timeTracking: draft.timeTracking,
    timeEstimate: draft.timeEstimate,
    custom: draft.custom,
  };
}

/** A template's payload as a draft (ids of people and projects stay). */
export function draftFromPayload(payload = {}) {
  return emptyDraft({
    ...payload,
    description: payload.description || '',
    checklists: (payload.checklists || []).map((list) => ({ key: uid(), title: list.title, items: (list.items || []).map((item) => ({ key: uid(), text: item.text, done: false, level: item.level || 0, important: Boolean(item.important) })) })),
    assigneeIds: payload.assigneeIds || [],
    files: [],
    reminders: [],
    links: [],
    deps: [],
    dueAt: payload.dueAt || defaultDeadline(),
  });
}

function Flame({ on, onClick, disabled }) {
  const { t } = useLocale();
  return (
    <Tooltip title={on ? t('tasks.v2.importantOn') : t('tasks.v2.importantOff')}>
      <button type="button" className={`te-flame${on ? ' is-on' : ''}`} onClick={onClick} disabled={disabled} aria-pressed={on} aria-label={t('tasks.v2.important')}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M12 2.5c.6 3.2-1 5-2.6 6.8C7.8 11 6.5 12.8 6.5 15.4A5.5 5.5 0 0 0 12 21a5.5 5.5 0 0 0 5.5-5.6c0-2.4-1-3.9-2-5.1-.3 1.4-1 2.3-2 2.8.6-3.6-.2-7.6-1.5-10.6Z" fill="currentColor" />
        </svg>
      </button>
    </Tooltip>
  );
}

function BaseRow({ label, children }) {
  return (
    <div className="te-row">
      <span className="te-row__label">{label}</span>
      <div className="te-row__value">{children}</div>
    </div>
  );
}

function overdueText(task, t) {
  if (!task?.dueAt || task.statusCategory === 'done') return null;
  const diff = dayjs().diff(dayjs(task.dueAt), 'minute');
  if (diff <= 0) return null;
  if (diff < 60) return t('tasks.v2.overdueMinutes', { n: diff });
  if (diff < 1440) return t('tasks.v2.overdueHours', { n: Math.floor(diff / 60) });
  return t('tasks.v2.overdueDays', { n: Math.floor(diff / 1440) });
}

/**
 * The task in full: a new task's form or an existing task's card. Left — the
 * form (title, description, people and deadline, optional blocks switched on
 * by chips); right — the task's conversation. Floating buttons on the left
 * edge: close, copy link, open in a new window, print.
 */
export default function TaskPanel({ open, taskRef, initialDraft, onClose, onChanged, onDeleted, onRefChange }) {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const { user, can: canDo } = useAuth();
  const { settings } = useSettings();
  const { projects, config, refresh: refreshHome } = useTasks();
  const people = usePeople();
  const [current, setCurrent] = useState({ ref: taskRef, draft: initialDraft });
  const [task, setTask] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [chips, setChips] = useState(() => new Set(rememberedChips()));
  const [saving, setSaving] = useState(false);
  const [multi, setMulti] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [mobileTab, setMobileTab] = useState('form');
  const [creatingProject, setCreatingProject] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [pick, setPick] = useState(null);
  const [labels, setLabels] = useState([]);
  const [dueOpen, setDueOpen] = useState(undefined);
  // Remounts the uncontrolled title and description when a new draft is loaded.
  const [draftVersion, setDraftVersion] = useState(0);
  const chatOn = Boolean(settings?.modules?.chat?.enabled);
  const filesOn = Boolean(settings?.modules?.files?.enabled);
  const driveOn = Boolean(settings?.modules?.drive?.enabled);

  useEffect(() => {
    if (open) setCurrent({ ref: taskRef, draft: initialDraft });
  }, [open, taskRef, initialDraft]);

  const mode = current.ref ? 'task' : 'new';

  const reload = useCallback(async () => {
    if (!current.ref) return null;
    const res = await tasksApi.task(current.ref);
    setTask(res.data.task);
    return res.data.task;
  }, [current.ref]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMobileTab('form');
    if (current.ref) {
      setTask(null);
      reload().catch(setError);
    } else {
      setTask(null);
      setDraft(emptyDraft({ originatorId: user.id, assigneeId: user.id, ...(current.draft || {}) }));
      setDraftVersion((n) => n + 1);
      setMulti(Boolean(current.draft?.assigneeIds?.length > 1));
    }
  }, [open, current, reload, user.id]);

  useEffect(() => {
    if (open) tasksApi.templates().then((res) => setTemplates(res.data.templates)).catch(() => {});
  }, [open]);

  const value = mode === 'task' ? (task ? fromTask(task) : null) : draft;
  const project = projects.find((item) => item.id === value?.projectId);
  useEffect(() => {
    if (project) tasksApi.project(project.key).then((res) => setLabels(res.data.labels)).catch(() => {});
    else setLabels([]);
  }, [project]);

  const can = mode === 'task' ? task?.can || {} : { edit: true, changeDeadline: true };
  const editable = Boolean(can.edit);

  /** One place for every change: the draft, or the API and a reload. */
  const change = useCallback(
    async (patch) => {
      if (mode === 'new') {
        setDraft((prev) => ({ ...prev, ...patch }));
        return;
      }
      try {
        const res = await tasksApi.updateTask(task.ref, patch);
        if (res.data.task.ref !== task.ref) {
          setCurrent({ ref: res.data.task.ref });
          onRefChange?.(res.data.task.ref);
        } else await reload();
        onChanged?.(res.data.task);
      } catch (err) {
        message.error(errorMessage(err));
        if (err?.response?.data?.code === 'RESULT_REQUIRED') toggleChip('results', true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, task, reload, onChanged, message]
  );

  const run = async (action, success) => {
    try {
      const res = await action();
      await reload();
      onChanged?.();
      if (success) message.success(success);
      return res;
    } catch (err) {
      message.error(errorMessage(err));
      if (err?.response?.data?.code === 'RESULT_REQUIRED') toggleChip('results', true);
      return null;
    }
  };

  function toggleChip(key, on) {
    setChips((prev) => {
      const next = new Set(prev);
      if (on ?? !next.has(key)) next.add(key);
      else next.delete(key);
      rememberChips([...next]);
      return next;
    });
  }

  // Blocks show when switched on, or by themselves when the task already has that data.
  const has = useMemo(() => {
    if (!value) return {};
    const source = mode === 'task' ? task : draft;
    return {
      results: value.resultRequired || (task?.results?.length || 0) > 0,
      files: (source?.files?.length || 0) > 0,
      checklists: (mode === 'task' ? task?.checklists?.length : draft?.checklists?.length) > 0,
      project: Boolean(value.projectId),
      coassignees: value.coassigneeIds?.length > 0,
      auditors: value.auditorIds?.length > 0,
      flow: Boolean(value.flowId),
      tags: value.labels?.length > 0,
      reminders: (source?.reminders?.length || 0) > 0,
      parent: Boolean(value.parentId),
      subtasks: (task?.subtaskList?.length || 0) > 0,
      links: (source?.links?.length || 0) > 0,
      recurring: Boolean(task?.template?.recurring || draft?.recurrence),
      gantt: (source?.deps?.length || 0) > 0,
      planning: Boolean(value.planStart || value.planEnd || value.skipWeekends || value.deadlineFromSubtasks || value.allowChangeDeadline === false),
      time: Boolean(value.timeTracking || value.timeEstimate),
      fields: Object.keys(value.custom || {}).length > 0,
    };
  }, [value, task, draft, mode]);
  const shown = (key) => chips.has(key) || has[key];
  const hide = (key) => () => toggleChip(key, false);

  const people_ = (ids) => people.filter((person) => (ids || []).includes(person.id));
  const personOf = (id) => people.find((person) => person.id === id) || null;

  // ── Create ──
  const create = async () => {
    if (!draft.title.trim()) {
      message.warning(t('tasks.v2.titleRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = draftPayload(draft, user.id);
      if (draft.recurrence && shown('recurring')) payload.recurrence = draft.recurrence;
      const res = await tasksApi.createTask(payload);
      const created = res.data.task;
      message.success(created.copies?.length ? t('tasks.v2.createdMany', { n: created.copies.length + 1 }) : t('tasks.created', { ref: created.ref }));
      refreshHome();
      onChanged?.(created);
      setCurrent({ ref: created.ref });
      onRefChange?.(created.ref);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplate = async (payload, title) => {
    let name = title;
    modal.confirm({
      title: t('tasks.v2.tpl.saveAs'),
      content: <Input defaultValue={title} maxLength={300} onChange={(event) => (name = event.target.value)} />,
      okText: t('common.save'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await tasksApi.saveTemplate({ title: name, payload });
          message.success(t('tasks.v2.tpl.saved'));
          tasksApi.templates().then((res) => setTemplates(res.data.templates));
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });
  };

  const applyTemplate = (template) => {
    setDraft((prev) => ({ ...draftFromPayload(template.payload), originatorId: prev.originatorId, dueAt: prev.dueAt }));
    setDraftVersion((n) => n + 1);
    message.success(t('tasks.v2.tpl.applied', { title: template.title }));
  };

  const openNew = (overrides) => setCurrent({ ref: null, draft: overrides });

  // Actions from deadline reminders in the task's chat ("complete it", "change the deadline").
  useEffect(() => {
    const onAction = (event) => {
      if (!task || event.detail.ref !== task.ref) return;
      event.detail.handled = true;
      if (event.detail.action === 'complete') change({ complete: true });
      if (event.detail.action === 'deadline') {
        setMobileTab('form');
        setDueOpen(true);
      }
    };
    window.addEventListener('task-action', onAction);
    return () => window.removeEventListener('task-action', onAction);
  }, [task, change]);

  const copyLink = () => navigator.clipboard?.writeText(`${window.location.origin}/app/tasks/${task.ref}`).then(() => message.success(t('common.copied')));

  if (!open) return null;

  const loading = mode === 'task' ? !task : !draft;
  const overdue = mode === 'task' ? overdueText(task, t) : null;
  const statusOptions = (task?.statuses || []).map((status) => ({ value: status.id, label: <span className="status-option"><StatusDot color={status.color} />{status.name}</span> }));

  const headerMenu = task && {
    items: [
      { key: 'watch', label: task.watching ? `👁 ${t('tasks.v2.menu.unwatch')}` : `👁 ${t('tasks.v2.menu.watch')}`, onClick: () => run(() => tasksApi.watch(task.ref, !task.watching)) },
      chatOn && { key: 'mute', label: `🔕 ${t('tasks.v2.menu.mute')}`, onClick: () => chatApi.entity('task', task.id).then((res) => chatApi.prefs(res.data.room.id, { muted: !res.data.room.muted })).then(() => message.success(t('tasks.v2.menu.muteDone'))).catch((err) => message.error(errorMessage(err))) },
      { key: 'link', label: `🔗 ${t('tasks.copyLink')}`, onClick: copyLink },
      { type: 'divider' },
      { key: 'new', label: `＋ ${t('tasks.v2.menu.newTask')}`, onClick: () => openNew({}) },
      { key: 'sub', label: `⤵ ${t('tasks.v2.menu.subtask')}`, onClick: () => openNew({ parentId: task.id, projectId: task.project.personal ? null : task.project.id }) },
      { key: 'copy', label: `⧉ ${t('tasks.v2.menu.copy')}`, onClick: () => tasksApi.formOf(task.ref).then((res) => openNew({ ...draftFromPayload(res.data.payload), dueAt: task.dueAt || defaultDeadline() })) },
      templates.length > 0 && { key: 'fromTpl', label: `📄 ${t('tasks.v2.menu.fromTemplate')}`, children: templates.filter((tpl) => !tpl.recurring).map((tpl) => ({ key: `t${tpl.id}`, label: tpl.title, onClick: () => openNew(draftFromPayload(tpl.payload)) })) },
      { key: 'saveTpl', label: `💾 ${t('tasks.v2.tpl.saveAs')}`, onClick: () => tasksApi.formOf(task.ref).then((res) => saveAsTemplate(res.data.payload, task.title)) },
      { key: 'fav', label: task.favorite ? `★ ${t('tasks.v2.menu.unfavorite')}` : `☆ ${t('tasks.v2.menu.favorite')}`, onClick: () => run(() => tasksApi.favorite(task.ref, !task.favorite)) },
      { key: 'auto', label: `⚙ ${t('tasks.v2.menu.automate')}`, onClick: () => { toggleChip('recurring', true); toggleChip('flow', true); } },
    ].filter(Boolean),
  };

  const footerMore = task && {
    items: [
      can.defer && { key: 'defer', label: task.deferred ? t('tasks.v2.resume') : t('tasks.v2.defer'), onClick: () => change({ deferred: !task.deferred }) },
      can.delegate && { key: 'delegate', label: t('tasks.v2.delegate'), onClick: () => setDelegating(true) },
      can.delete && { type: 'divider' },
      can.delete && {
        key: 'delete',
        danger: true,
        label: t('common.delete'),
        onClick: () =>
          modal.confirm({
            title: t('tasks.deleteConfirm', { ref: task.ref }),
            content: task.title,
            okText: t('common.delete'),
            okButtonProps: { danger: true },
            cancelText: t('common.cancel'),
            onOk: async () => {
              await tasksApi.deleteTask(task.ref);
              message.success(t('tasks.deleted'));
              refreshHome();
              onDeleted?.(task);
              onClose();
            },
          }),
      },
    ].filter(Boolean),
  };

  const fileList = mode === 'task' ? task?.files || [] : draft?.files || [];
  const exclude = task ? [task.id] : [];

  const panel = (
    <div className="tp-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="tp-float">
        <Tooltip title={t('common.close')} placement="left">
          <button type="button" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </Tooltip>
        {task && (
          <>
            <Tooltip title={t('tasks.copyLink')} placement="left">
              <button type="button" onClick={copyLink}>🔗</button>
            </Tooltip>
            <Tooltip title={t('tasks.v2.newWindow')} placement="left">
              <button type="button" onClick={() => window.open(`/app/tasks/${task.ref}`, '_blank', 'noopener')}>↗</button>
            </Tooltip>
            <Tooltip title={t('tasks.v2.print')} placement="left">
              <button type="button" onClick={() => window.print()}>🖨</button>
            </Tooltip>
          </>
        )}
      </div>
      <div className={`tp is-${mode}${mobileTab === 'chat' ? ' show-chat' : ''}`} role="dialog" aria-modal="true">
        <div className="tp-mobile-tabs">
          <button type="button" className={mobileTab === 'form' ? 'is-active' : ''} onClick={() => setMobileTab('form')}>{t('tasks.v2.tabForm')}</button>
          <button type="button" className={mobileTab === 'chat' ? 'is-active' : ''} onClick={() => setMobileTab('chat')}>{t('chat.taskChat')}</button>
          <button type="button" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <div className="tp-form tp-print">
          {error ? (
            <div className="te-error">{errorMessage(error)}</div>
          ) : loading ? (
            <Skeleton active paragraph={{ rows: 12 }} />
          ) : (
            <>
              <div className="tp-scroll">
                {mode === 'task' && (
                  <div className="tp-meta">
                    <span className="tp-ref" style={{ '--c': task.project.color }}>
                      {!task.project.personal && <span className="mod-dot" />}
                      {!task.project.personal && <span>{task.project.name}</span>}
                      <b>{task.ref}</b>
                    </span>
                    {task.parent && (
                      <Link to={`/app/tasks/${task.parent.ref}`} className="tp-parent" onClick={(event) => { event.preventDefault(); setCurrent({ ref: task.parent.ref }); }}>
                        ⤴ {task.parent.ref} {task.parent.title}
                      </Link>
                    )}
                    <span className="tp-meta__grow" />
                    <Tooltip title={task.favorite ? t('tasks.v2.menu.unfavorite') : t('tasks.v2.menu.favorite')}>
                      <button type="button" className={`tp-star${task.favorite ? ' is-on' : ''}`} onClick={() => run(() => tasksApi.favorite(task.ref, !task.favorite))}>
                        {task.favorite ? '★' : '☆'}
                      </button>
                    </Tooltip>
                    <Dropdown menu={headerMenu} trigger={['click']} placement="bottomRight">
                      <button type="button" className="tp-menu" aria-label={t('tasks.v2.menu.title')}>≡</button>
                    </Dropdown>
                  </div>
                )}
                <div className="tp-title">
                  <Input.TextArea
                    key={mode === 'task' ? task.ref : `new-${draftVersion}`}
                    autoFocus={mode === 'new'}
                    defaultValue={value.title}
                    disabled={!editable}
                    variant="borderless"
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    placeholder={t('tasks.v2.titlePlaceholder')}
                    maxLength={300}
                    onChange={(event) => mode === 'new' && setDraft((prev) => ({ ...prev, title: event.target.value }))}
                    onBlur={(event) => mode === 'task' && event.target.value.trim() && event.target.value !== task.title && change({ title: event.target.value })}
                    onPressEnter={(event) => {
                      event.preventDefault();
                      event.target.blur();
                    }}
                  />
                  <Flame on={value.important} disabled={!editable} onClick={() => change({ important: !value.important })} />
                </div>

                <RichText
                  key={mode === 'task' ? `${task.ref}-d` : `new-d-${draftVersion}`}
                  value={value.description}
                  format={value.descriptionFormat || 'html'}
                  readOnly={!editable}
                  placeholder={t('tasks.descriptionPlaceholder')}
                  onChange={mode === 'new' ? (description) => setDraft((prev) => ({ ...prev, description })) : undefined}
                  onCommit={mode === 'task' ? (description) => change({ description, descriptionFormat: 'html' }) : undefined}
                  onAttach={() => toggleChip('files', true)}
                  onChecklist={(lines) => {
                    toggleChip('checklists', true);
                    checklistOps({ mode, task, reload, setDraft, message }).addList(t('tasks.v2.cl.defaultTitle', { n: (mode === 'task' ? task.checklists.length : draft.checklists.length) + 1 }), lines);
                  }}
                />

                <div className="te-base">
                  <BaseRow label={t('tasks.v2.originator')}>
                    {pick === 'originator' ? (
                      <PeopleSelect autoFocus open value={value.originatorId} allowClear={false} onChange={(id) => { change({ originatorId: id }); setPick(null); }} onDropdownVisibleChange={(visible) => !visible && setPick(null)} />
                    ) : (
                      <PersonPill user={mode === 'task' ? task.originator : personOf(value.originatorId)} placeholder={t('tasks.v2.choosePerson')} disabled={!editable || (mode === 'task' && task.myRole !== 'originator' && !config?.isAdmin)} onClick={() => setPick('originator')} />
                    )}
                  </BaseRow>
                  <BaseRow label={t('tasks.fields.assignee')}>
                    {mode === 'new' && multi ? (
                      <PeopleSelect multiple autoFocus value={draft.assigneeIds} onChange={(assigneeIds) => setDraft((prev) => ({ ...prev, assigneeIds }))} placeholder={t('tasks.v2.severalAssignees')} />
                    ) : pick === 'assignee' ? (
                      <PeopleSelect autoFocus open value={value.assigneeId} onChange={(id) => { change({ assigneeId: id || null }); setPick(null); }} onDropdownVisibleChange={(visible) => !visible && setPick(null)} />
                    ) : (
                      <PersonPill user={mode === 'task' ? task.assignee : personOf(value.assigneeId)} placeholder={t('tasks.unassigned')} disabled={!editable} onClick={() => setPick('assignee')} />
                    )}
                    {mode === 'new' && (
                      <Tooltip title={multi ? t('tasks.v2.oneAssignee') : t('tasks.v2.moreAssignees')}>
                        <button
                          type="button"
                          className="te-plus"
                          onClick={() => {
                            if (!multi) setDraft((prev) => ({ ...prev, assigneeIds: [prev.assigneeId].filter(Boolean) }));
                            setMulti(!multi);
                          }}
                        >
                          {multi ? '−' : '＋'}
                        </button>
                      </Tooltip>
                    )}
                    {canDo('users.manage') && (
                      <Link to="/admin/users" target="_blank" className="te-invite">
                        {t('tasks.v2.invite')}
                      </Link>
                    )}
                  </BaseRow>
                  {mode === 'new' && multi && draft.assigneeIds.length > 1 && <div className="te-hint te-hint--row">{t('tasks.v2.copiesHint', { n: draft.assigneeIds.length })}</div>}
                  <BaseRow label={t('tasks.fields.due')}>
                    <DeadlinePicker value={value.dueAt} disabled={!can.changeDeadline} open={dueOpen} onOpenChange={(next) => !next && setDueOpen(undefined)} onChange={(dueAt) => change({ dueAt, dueTime: Boolean(dueAt) })} />
                    <Tooltip title={t('tasks.v2.chips.planning')}>
                      <button type="button" className={`te-plus${shown('planning') ? ' is-on' : ''}`} onClick={() => toggleChip('planning')}>🗓</button>
                    </Tooltip>
                    {overdue && <span className="te-overdue">{overdue}</span>}
                  </BaseRow>
                  {mode === 'task' && (
                    <>
                      <BaseRow label={t('tasks.fields.status')}>
                        <Select variant="borderless" className="te-select" value={task.statusId} disabled={!editable} options={statusOptions} onChange={(statusId) => change({ statusId })} popupMatchSelectWidth={220} />
                        {task.deferred && <span className="te-tag is-deferred">{t('tasks.v2.deferred')}</span>}
                        {task.rating && <span className={`te-tag is-${task.rating}`}>{task.rating === 'good' ? '👍' : '👎'} {t(`tasks.v2.rating.${task.rating}`)}</span>}
                      </BaseRow>
                      <BaseRow label={t('tasks.v2.created')}>
                        <span className="te-plain">
                          {new Date(task.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          <em> · ID {task.ref}</em>
                        </span>
                      </BaseRow>
                      {task.timeTracking && <TimerRow task={task} onTimer={(action) => run(() => tasksApi.timer(task.ref, action))} disabled={!editable} />}
                    </>
                  )}
                </div>

                <div className="te-chips">
                  {CHIPS.map((chip) => {
                    const on = shown(chip.key);
                    const count = {
                      files: fileList.length,
                      checklists: mode === 'task' ? task.checklists.length : draft.checklists.length,
                      coassignees: value.coassigneeIds.length,
                      auditors: value.auditorIds.length,
                      subtasks: task?.subtaskList?.length,
                      links: mode === 'task' ? task.links.length : draft.links.length,
                    }[chip.key];
                    return (
                      <button key={chip.key} type="button" className={`te-chip${on ? ' is-on' : ''}${chip.key === 'subtasks' && mode === 'new' ? ' is-disabled' : ''}`} onClick={() => toggleChip(chip.key)} disabled={chip.key === 'subtasks' && mode === 'new'} title={chip.key === 'subtasks' && mode === 'new' ? t('tasks.v2.subtasksLater') : undefined}>
                        <span>{chip.icon}</span>
                        {t(`tasks.v2.chips.${chip.key}`)}
                        {count ? <b>{count}</b> : null}
                      </button>
                    );
                  })}
                </div>

                <div className="te-blocks">
                  {shown('results') && (
                    <ResultsBlock
                      task={task}
                      mode={mode}
                      required={value.resultRequired}
                      disabled={!editable}
                      onRequired={(on) => change({ resultRequired: on })}
                      onAdd={(body) => run(() => tasksApi.addResult(task.ref, { body }), t('tasks.v2.results.added'))}
                      onRemoveResult={(result) => run(() => tasksApi.removeResult(result.id))}
                      onRemove={hide('results')}
                    />
                  )}
                  {shown('files') && (
                    <FilesBlock
                      files={fileList}
                      taskRef={mode === 'task' ? task.ref : null}
                      disabled={!editable}
                      filesEnabled={filesOn}
                      driveEnabled={driveOn}
                      onRemove={hide('files')}
                      onChanged={(list, action) => {
                        if (mode === 'new') {
                          setDraft((prev) => ({ ...prev, files: action === 'add' ? [...prev.files, ...list] : prev.files.filter((file) => !list.some((item) => item.id === file.id)) }));
                          if (action === 'remove') list.forEach((file) => tasksApi.removeFile(file.id).catch(() => {}));
                        } else if (action === 'add') run(async () => {});
                        else run(() => Promise.all(list.map((file) => tasksApi.removeFile(file.id))));
                      }}
                    />
                  )}
                  {shown('checklists') && (
                    <ChecklistsBlock lists={mode === 'task' ? taskLists(task) : draft.checklists} ops={checklistOps({ mode, task, reload, setDraft, message })} disabled={!editable} onRemove={hide('checklists')} />
                  )}
                  {shown('project') && <ProjectBlock value={value.projectId} disabled={!editable} onChange={(projectId) => change({ projectId })} onCreate={() => setCreatingProject(true)} onRemove={hide('project')} />}
                  {shown('coassignees') && (
                    <PeopleBlock icon="👥" title={t('tasks.v2.chips.coassignees')} value={value.coassigneeIds} disabled={!editable} onChange={(coassigneeIds) => change({ coassigneeIds })} onRemove={hide('coassignees')} hint={t('tasks.v2.coassigneesHint')} />
                  )}
                  {shown('auditors') && (
                    <PeopleBlock icon="👁" title={t('tasks.v2.chips.auditors')} value={value.auditorIds} disabled={!editable} onChange={(auditorIds) => change({ auditorIds })} onRemove={hide('auditors')} hint={t('tasks.v2.auditorsHint')} />
                  )}
                  {shown('flow') && <FlowBlock value={value.flowId} disabled={!editable} onChange={(flowId) => change({ flowId })} onRemove={hide('flow')} />}
                  {shown('tags') && <TagsBlock value={value.labels} known={labels} disabled={!editable} onChange={(next) => change({ labels: next })} onRemove={hide('tags')} />}
                  {shown('reminders') && (
                    <RemindersBlock
                      reminders={mode === 'task' ? task.reminders : draft.reminders}
                      hasDeadline={Boolean(value.dueAt)}
                      onAdd={(payload) => (mode === 'new' ? setDraft((prev) => ({ ...prev, reminders: [...prev.reminders, { ...payload, key: uid() }] })) : run(() => tasksApi.addReminder(task.ref, payload), t('tasks.v2.rem.added')))}
                      onDelete={(reminder) => (mode === 'new' ? setDraft((prev) => ({ ...prev, reminders: prev.reminders.filter((item) => item.key !== reminder.key) })) : run(() => tasksApi.removeReminder(reminder.id)))}
                      onRemove={hide('reminders')}
                    />
                  )}
                  {shown('parent') && (
                    <ParentBlock
                      parent={mode === 'task' ? task.parent : draft.parent}
                      exclude={exclude}
                      disabled={!editable}
                      onChange={(id, option) => (mode === 'new' ? setDraft((prev) => ({ ...prev, parentId: id || null, parent: id ? { id, ref: option?.ref, title: option?.title || '' } : null })) : change({ parentId: id || null }))}
                      onRemove={hide('parent')}
                    />
                  )}
                  {shown('subtasks') && <SubtasksBlock mode={mode} subtasks={task?.subtaskList || []} onCreate={() => openNew({ parentId: task.id, projectId: task.project.personal ? null : task.project.id })} onRemove={hide('subtasks')} />}
                  {shown('links') && (
                    <LinksBlock
                      links={mode === 'task' ? task.links : draft.links}
                      exclude={exclude}
                      disabled={!editable}
                      onAdd={(id, option) => (mode === 'new' ? setDraft((prev) => ({ ...prev, links: [...prev.links, { id, ref: option?.ref, title: option?.title || '' }] })) : run(() => tasksApi.addLink(task.ref, option?.ref || id)))}
                      onDelete={(other) => (mode === 'new' ? setDraft((prev) => ({ ...prev, links: prev.links.filter((item) => item.id !== other.id) })) : run(() => tasksApi.removeLink(task.ref, other.id)))}
                      onRemove={hide('links')}
                    />
                  )}
                  {shown('recurring') && (
                    <RecurringBlock
                      mode={mode}
                      task={task}
                      disabled={!editable}
                      value={mode === 'new' ? draft.recurrence || defaultRecurrence() : task?.template?.recurrence || null}
                      onChange={(recurrence) => mode === 'new' && setDraft((prev) => ({ ...prev, recurrence }))}
                      onSaveTemplate={async (input) => {
                        try {
                          if (input.make) {
                            const form = await tasksApi.formOf(task.ref);
                            await tasksApi.saveTemplate({ title: task.title, payload: form.data.payload, recurring: true, recurrence: input.recurrence });
                            message.success(t('tasks.v2.rec.created'));
                          } else {
                            await tasksApi.saveTemplate({ title: input.title, payload: undefined, recurring: true, recurrence: input.recurrence, active: true }, input.id);
                            await reload();
                          }
                        } catch (err) {
                          message.error(errorMessage(err));
                        }
                      }}
                      onRemove={hide('recurring')}
                    />
                  )}
                  {shown('gantt') && (
                    <GanttBlock
                      deps={mode === 'task' ? task.deps : draft.deps}
                      exclude={exclude}
                      disabled={!editable}
                      onAdd={(dep) => (mode === 'new' ? setDraft((prev) => ({ ...prev, deps: [...prev.deps, { ...dep, key: uid(), title: dep.title || '' }] })) : run(() => tasksApi.addDep(task.ref, { ref: dep.ref || dep.taskId, kind: dep.kind })))}
                      onDelete={(dep) => (mode === 'new' ? setDraft((prev) => ({ ...prev, deps: prev.deps.filter((item) => item.key !== dep.key) })) : run(() => tasksApi.removeDep(dep.id)))}
                      onRemove={hide('gantt')}
                    />
                  )}
                  {shown('planning') && <PlanningBlock value={value} disabled={!editable} onChange={change} onRemove={hide('planning')} />}
                  {shown('time') && <TimeBlock value={value} task={task} disabled={!editable} onChange={change} onTimer={(action) => run(() => tasksApi.timer(task.ref, action))} onRemove={hide('time')} />}
                  {shown('fields') && <FieldsBlock value={value.custom} disabled={!editable} onChange={(custom) => change({ custom })} onRemove={hide('fields')} />}
                </div>
              </div>

              <footer className="tp-foot">
                {mode === 'new' ? (
                  <>
                    <Button type="primary" size="large" loading={saving} onClick={create}>
                      {t('common.create')}
                    </Button>
                    <Button size="large" onClick={onClose}>
                      {t('common.cancel')}
                    </Button>
                    <span className="tp-foot__grow" />
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          {
                            key: 'pick',
                            label: t('tasks.v2.tpl.pick'),
                            disabled: !templates.filter((tpl) => !tpl.recurring).length,
                            children: templates.filter((tpl) => !tpl.recurring).map((tpl) => ({ key: `t${tpl.id}`, label: tpl.title, onClick: () => applyTemplate(tpl) })),
                          },
                          { key: 'save', label: t('tasks.v2.tpl.saveAs'), disabled: !draft.title.trim(), onClick: () => saveAsTemplate(draftPayload(draft, user.id), draft.title) },
                        ],
                      }}
                    >
                      <Button size="large">📄 {t('tasks.v2.tpl.title')} ▾</Button>
                    </Dropdown>
                  </>
                ) : (
                  <>
                    {can.start && (
                      <Button size="large" onClick={() => run(() => tasksApi.start(task.ref))}>
                        ▶ {t('tasks.v2.start')}
                      </Button>
                    )}
                    {task.statusCategory !== 'done' ? (
                      can.complete && (
                        <Button type="primary" size="large" onClick={() => change({ complete: true })}>
                          ✓ {t('tasks.v2.complete')}
                        </Button>
                      )
                    ) : (
                      editable && (
                        <Button size="large" onClick={() => change({ complete: false })}>
                          ↺ {t('tasks.v2.reopen')}
                        </Button>
                      )
                    )}
                    {footerMore.items.length > 0 && (
                      <Dropdown menu={footerMore} trigger={['click']}>
                        <Button size="large">…</Button>
                      </Dropdown>
                    )}
                    {can.rate && (
                      <Popover
                        trigger="click"
                        content={
                          <div className="te-rate">
                            <button type="button" className={task.rating === 'good' ? 'is-on' : ''} onClick={() => run(() => tasksApi.rate(task.ref, { rating: task.rating === 'good' ? null : 'good' }))}>👍 {t('tasks.v2.rating.good')}</button>
                            <button type="button" className={task.rating === 'bad' ? 'is-on' : ''} onClick={() => run(() => tasksApi.rate(task.ref, { rating: task.rating === 'bad' ? null : 'bad' }))}>👎 {t('tasks.v2.rating.bad')}</button>
                          </div>
                        }
                      >
                        <Button size="large" type="text">☆ {t('tasks.v2.rate')}</Button>
                      </Popover>
                    )}
                    <span className="tp-foot__grow" />
                    <Tooltip title={t('tasks.v2.viewsHint')}>
                      <span className="tp-views">👁 {task.views}</span>
                    </Tooltip>
                  </>
                )}
              </footer>
            </>
          )}
        </div>
        <aside className="tp-chat">
          {mode === 'task' && task && chatOn ? (
            <Conversation
              key={task.id}
              entity={{ type: 'task', id: task.id }}
              compact
              header="bare"
              emptyHint={t('tasks.v2.chatEmpty')}
              extraActions={(item) =>
                item.kind === 'text' && can.edit
                  ? [{ key: 'result', label: `🏁 ${t('tasks.v2.results.fromChat')}`, onClick: () => run(() => tasksApi.addResult(task.ref, { messageId: item.id }), t('tasks.v2.results.added')).then(() => toggleChip('results', true)) }]
                  : []
              }
            />
          ) : (
            <div className="tp-chat__placeholder">
              <div className="tp-chat__art" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <b>{t('chat.taskChat')}</b>
              <p>{chatOn ? t('tasks.v2.chatPlaceholder') : t('tasks.v2.chatOff')}</p>
            </div>
          )}
        </aside>
      </div>
      <ProjectDialog
        open={creatingProject}
        onClose={(created) => {
          setCreatingProject(false);
          if (created) {
            refreshHome();
            change({ projectId: created.id });
          }
        }}
      />
      <Modal open={delegating} title={t('tasks.v2.delegate')} footer={null} onCancel={() => setDelegating(false)} destroyOnHidden width={400}>
        <p className="te-muted">{t('tasks.v2.delegateHint')}</p>
        <PeopleSelect
          autoFocus
          exclude={[task?.assignee?.id].filter(Boolean)}
          onChange={(userId) => {
            if (!userId) return;
            setDelegating(false);
            run(() => tasksApi.delegate(task.ref, userId), t('tasks.v2.delegated'));
          }}
          placeholder={t('tasks.v2.choosePerson')}
        />
      </Modal>
    </div>
  );
  return createPortal(panel, document.body);
}

function TimerRow({ task, onTimer, disabled }) {
  const { t } = useLocale();
  const spent = useTicking(task.time);
  return (
    <BaseRow label={t('tasks.v2.chips.time')}>
      <span className={`te-clock${task.time?.running ? ' is-running' : ''}`}>{formatClock(spent)}</span>
      {task.timeEstimate ? <em className="te-muted">/ {formatClock(task.timeEstimate * 60)}</em> : null}
      <button type="button" className="te-plus" disabled={disabled} onClick={() => onTimer(task.time?.running ? 'stop' : 'start')}>
        {task.time?.running ? '⏸' : '▶'}
      </button>
    </BaseRow>
  );
}
