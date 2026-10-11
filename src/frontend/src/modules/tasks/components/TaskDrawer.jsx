import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { App, Button, Checkbox, DatePicker, Drawer, Dropdown, Input, Mentions, Progress, Select, Skeleton, Switch, Tabs, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatRelative } from '../../../lib/format';
import Markdown from '../../kb/viewers/Markdown';
import { Person, UserAvatar, userOptions } from '../../shared/People';
import { tasksApi } from '../api';
import { DueChip, StatusDot, dueFromPicker, labelColor, priorityOptions } from './bits';

const projectCache = new Map();

async function loadProjectMeta(key) {
  if (projectCache.has(key)) return projectCache.get(key);
  const res = await tasksApi.project(key);
  projectCache.set(key, res.data);
  setTimeout(() => projectCache.delete(key), 60_000);
  return res.data;
}

export function forgetProjectMeta(key) {
  projectCache.delete(key);
}

function Prop({ label, children }) {
  return (
    <div className="tprop">
      <span className="tprop__label">{label}</span>
      <div className="tprop__value">{children}</div>
    </div>
  );
}

function TitleEditor({ value, disabled, onSave }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };
  return (
    <Input.TextArea
      className="tdrawer__title"
      value={draft}
      disabled={disabled}
      variant="borderless"
      autoSize={{ minRows: 1, maxRows: 4 }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onPressEnter={(event) => {
        event.preventDefault();
        event.target.blur();
      }}
    />
  );
}

function DescriptionEditor({ value, disabled, onSave }) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(value), [value]);
  if (!editing) {
    return (
      <div
        className={`tdesc${value ? '' : ' is-empty'}${disabled ? '' : ' is-editable'}`}
        onClick={() => !disabled && setEditing(true)}
        role="presentation"
      >
        {value ? <Markdown text={value} /> : <span>{disabled ? t('tasks.noDescription') : t('tasks.addDescription')}</span>}
      </div>
    );
  }
  return (
    <div className="tdesc-edit">
      <Input.TextArea autoFocus autoSize={{ minRows: 5, maxRows: 22 }} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('tasks.descriptionPlaceholder')} />
      <div className="tdesc-edit__bar">
        <span className="tdesc-edit__hint">Markdown</span>
        <Button onClick={() => { setDraft(value); setEditing(false); }}>{t('common.cancel')}</Button>
        <Button
          type="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(draft);
              setEditing(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function Checklist({ task, disabled, reload }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const items = task.checklistItems;
  const done = items.filter((item) => item.done).length;
  const run = async (action) => {
    try {
      await action();
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  return (
    <div className="tcheck">
      {items.length > 0 && <Progress percent={Math.round((done / items.length) * 100)} size="small" format={() => `${done}/${items.length}`} />}
      {items.map((item) => (
        <div key={item.id} className={`tcheck__row${item.done ? ' is-done' : ''}`}>
          <Checkbox checked={item.done} disabled={disabled} onChange={(event) => run(() => tasksApi.updateChecklist(item.id, { done: event.target.checked }))} />
          <Input
            variant="borderless"
            defaultValue={item.text}
            disabled={disabled}
            onBlur={(event) => event.target.value.trim() && event.target.value !== item.text && run(() => tasksApi.updateChecklist(item.id, { text: event.target.value }))}
            onPressEnter={(event) => event.target.blur()}
          />
          {!disabled && (
            <button type="button" className="tcheck__del" onClick={() => run(() => tasksApi.deleteChecklist(item.id))} aria-label={t('common.delete')}>
              ✕
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <Input
          value={text}
          placeholder={`+ ${t('tasks.addChecklist')}`}
          variant="filled"
          onChange={(event) => setText(event.target.value)}
          onPressEnter={() => {
            const value = text.trim();
            if (!value) return;
            setText('');
            run(() => tasksApi.addChecklist(task.ref, value));
          }}
        />
      )}
    </div>
  );
}

/** Highlights @mentions in a plain-text comment. */
function CommentBody({ text }) {
  const parts = String(text).split(/(@[a-zA-Z0-9._-]{3,32})/g);
  return (
    <div className="tcomment__body">
      {parts.map((part, index) => (part.startsWith('@') ? <span key={index} className="mention">{part}</span> : <span key={index}>{part}</span>))}
    </div>
  );
}

function Comments({ task, members, reload }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await tasksApi.addComment(task.ref, draft);
      setDraft('');
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const options = members.map((user) => ({ value: user.username, label: <Person user={user} size={18} />, key: String(user.id) }));
  return (
    <div className="tcomments">
      {task.commentList.length === 0 && <div className="tcomments__empty">{t('tasks.noComments')}</div>}
      {task.commentList.map((comment) => (
        <div key={comment.id} className="tcomment">
          <UserAvatar user={comment.author} size={30} tip={false} />
          <div className="tcomment__main">
            <div className="tcomment__head">
              <strong>{comment.author?.name || '—'}</strong>
              <span>{formatRelative(comment.createdAt, locale)}{comment.editedAt ? ` · ${t('tasks.edited')}` : ''}</span>
              {comment.mine && (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'edit', label: t('common.edit') },
                      { key: 'delete', danger: true, label: t('common.delete') },
                    ],
                    onClick: async ({ key }) => {
                      if (key === 'edit') setEditing({ id: comment.id, body: comment.body });
                      else {
                        await tasksApi.deleteComment(comment.id).catch((err) => message.error(errorMessage(err)));
                        reload();
                      }
                    },
                  }}
                >
                  <button type="button" className="tcomment__more">⋯</button>
                </Dropdown>
              )}
            </div>
            {editing?.id === comment.id ? (
              <div className="tcomment__edit">
                <Input.TextArea autoSize value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} />
                <div>
                  <Button size="small" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                  <Button
                    size="small"
                    type="primary"
                    onClick={async () => {
                      await tasksApi.updateComment(comment.id, editing.body).catch((err) => message.error(errorMessage(err)));
                      setEditing(null);
                      reload();
                    }}
                  >
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            ) : (
              <CommentBody text={comment.body} />
            )}
          </div>
        </div>
      ))}
      <div className="tcomments__composer">
        <Mentions
          autoSize={{ minRows: 2, maxRows: 8 }}
          value={draft}
          onChange={setDraft}
          options={options}
          filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
          placeholder={t('tasks.commentPlaceholder')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send();
          }}
        />
        <div className="tcomments__send">
          <span>{t('tasks.commentHint')}</span>
          <Button type="primary" onClick={send} loading={busy} disabled={!draft.trim()}>
            {t('tasks.send')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function activityText(entry, t, locale) {
  const { data } = entry;
  if (entry.kind === 'created') return t('tasks.activity.created');
  const fmt = (value) =>
    value ? new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', ...(data.time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value)) : '—';
  switch (data.field) {
    case 'status':
      return t('tasks.activity.status', { from: data.from, to: data.to });
    case 'assignee':
      return data.to ? t('tasks.activity.assignee', { to: data.to }) : t('tasks.activity.unassigned');
    case 'priority':
      return t('tasks.activity.priority', { to: t(`tasks.priority.${data.to}`) });
    case 'due':
      return data.to ? t('tasks.activity.due', { to: fmt(data.to) }) : t('tasks.activity.dueRemoved');
    case 'start':
      return t('tasks.activity.start', { to: data.to || '—' });
    case 'title':
      return t('tasks.activity.title', { to: data.to });
    case 'description':
      return t('tasks.activity.description');
    case 'labels':
      return t('tasks.activity.labels', { to: (data.to || []).join(', ') || '—' });
    default:
      return data.field || entry.kind;
  }
}

function History({ task }) {
  const { t, locale } = useLocale();
  return (
    <ul className="thistory">
      {task.activity.map((entry) => (
        <li key={entry.id}>
          <UserAvatar user={entry.actor} size={22} tip={false} />
          <div>
            <span>
              <strong>{entry.actor?.name || t('tasks.system')}</strong> {activityText(entry, t, locale)}
            </span>
            <time>{formatRelative(entry.createdAt, locale)}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Full task view in a side panel (full screen on phones). Every field saves
 * on change; `onChanged` lets the board/list refresh.
 */
export default function TaskDrawer({ taskRef, open, onClose, onChanged, onDeleted }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const [task, setTask] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('comments');
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const reload = useCallback(async () => {
    const res = await tasksApi.task(taskRef);
    setTask(res.data.task);
    return res.data.task;
  }, [taskRef]);

  useEffect(() => {
    if (!open || !taskRef) return;
    setTask(null);
    setError(null);
    reload()
      .then((loaded) => loadProjectMeta(loaded.project.key))
      .then(setMeta)
      .catch(setError);
  }, [open, taskRef, reload]);

  const update = async (patch) => {
    try {
      const res = await tasksApi.updateTask(task.ref, patch);
      const fresh = await reload();
      changed.current?.(res.data.task || fresh);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const remove = () =>
    modal.confirm({
      title: t('tasks.deleteConfirm', { ref: task.ref }),
      content: task.title,
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        await tasksApi.deleteTask(task.ref);
        message.success(t('tasks.deleted'));
        onDeleted?.(task);
        onClose();
      },
    });

  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/app/tasks/${task.ref}`).then(() => message.success(t('common.copied')));
  };

  const members = meta?.members || [];
  const statusOptions = useMemo(
    () => (meta?.statuses || []).map((status) => ({ value: status.id, label: <span className="status-option"><StatusDot color={status.color} />{status.name}</span> })),
    [meta]
  );
  const editable = Boolean(task?.can?.edit);
  const width = typeof window !== 'undefined' && window.innerWidth < 760 ? '100%' : 720;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={width}
      destroyOnHidden
      className="tdrawer"
      title={
        task ? (
          <div className="tdrawer__head">
            <span className="tdrawer__ref" style={{ '--c': task.project.color }}>
              <span className="mod-dot" />
              {task.project.name} · {task.ref}
            </span>
          </div>
        ) : null
      }
      extra={
        task && (
          <div className="tdrawer__actions">
            <Tooltip title={task.watching ? t('tasks.unwatch') : t('tasks.watch')}>
              <Button
                type={task.watching ? 'default' : 'text'}
                onClick={async () => {
                  await tasksApi.watch(task.ref, !task.watching);
                  reload();
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill={task.watching ? 'currentColor' : 'none'} fillOpacity=".15" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 4 }}>
                  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                  <circle cx="12" cy="12" r="2.8" />
                </svg>
                {task.watchers.length}
              </Button>
            </Tooltip>
            <Tooltip title={t('tasks.copyLink')}>
              <Button type="text" onClick={copyLink}>🔗</Button>
            </Tooltip>
            {task.can.delete && (
              <Dropdown trigger={['click']} menu={{ items: [{ key: 'delete', danger: true, label: t('common.delete') }], onClick: remove }}>
                <Button type="text">⋯</Button>
              </Dropdown>
            )}
          </div>
        )
      }
    >
      {error ? (
        <div className="tdrawer__error">{errorMessage(error)}</div>
      ) : !task || !meta ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <div className="tdrawer__body">
          <TitleEditor value={task.title} disabled={!editable} onSave={(title) => update({ title })} />
          <div className="tprops">
            <Prop label={t('tasks.fields.status')}>
              <Select variant="filled" value={task.statusId} disabled={!editable} options={statusOptions} onChange={(statusId) => update({ statusId })} style={{ minWidth: 180 }} />
            </Prop>
            <Prop label={t('tasks.fields.assignee')}>
              <Select
                variant="filled"
                allowClear
                showSearch
                value={task.assignee?.id}
                disabled={!editable}
                placeholder={t('tasks.unassigned')}
                options={userOptions(members)}
                filterOption={(input, option) => option.search.includes(input.toLowerCase())}
                onChange={(assigneeId) => update({ assigneeId: assigneeId || null })}
                style={{ minWidth: 220 }}
              />
            </Prop>
            <Prop label={t('tasks.fields.priority')}>
              <Select variant="filled" value={task.priority} disabled={!editable} options={priorityOptions(t)} onChange={(priority) => update({ priority })} style={{ minWidth: 160 }} />
            </Prop>
            <Prop label={t('tasks.fields.due')}>
              <div className="tdue">
                <DatePicker
                  variant="filled"
                  value={task.dueAt ? dayjs(task.dueAt) : null}
                  disabled={!editable}
                  showTime={task.dueTime ? { format: 'HH:mm', minuteStep: 5 } : false}
                  format={task.dueTime ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY'}
                  onChange={(value) => update({ dueAt: dueFromPicker(value, task.dueTime), dueTime: task.dueTime && Boolean(value) })}
                />
                <Tooltip title={t('tasks.withTime')}>
                  <Switch
                    size="small"
                    checked={task.dueTime}
                    disabled={!editable || !task.dueAt}
                    onChange={(on) => update({ dueTime: on, dueAt: dueFromPicker(dayjs(task.dueAt).hour(on ? 18 : 0).minute(0), on) })}
                  />
                </Tooltip>
                <DueChip dueAt={task.dueAt} dueTime={task.dueTime} done={task.statusCategory === 'done'} />
              </div>
            </Prop>
            <Prop label={t('tasks.fields.start')}>
              <DatePicker variant="filled" value={task.startDate ? dayjs(task.startDate) : null} disabled={!editable} format="DD.MM.YYYY" onChange={(value) => update({ startDate: value ? value.format('YYYY-MM-DD') : null })} />
            </Prop>
            <Prop label={t('tasks.fields.labels')}>
              <Select
                variant="filled"
                mode="tags"
                value={task.labels}
                disabled={!editable}
                placeholder={t('tasks.addLabels')}
                options={(meta.labels || []).map((label) => ({ value: label, label }))}
                tagRender={({ label, closable, onClose: close }) => (
                  <span className="task-label" style={{ '--c': labelColor(label), marginInlineEnd: 4 }}>
                    {label}
                    {closable && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={close}>×</button>}
                  </span>
                )}
                onChange={(labels) => update({ labels })}
                style={{ minWidth: 240 }}
              />
            </Prop>
            <Prop label={t('tasks.fields.author')}>
              <Person user={task.author} />
            </Prop>
          </div>

          <h3 className="tsection">{t('tasks.fields.description')}</h3>
          <DescriptionEditor value={task.description} disabled={!editable} onSave={(description) => update({ description })} />

          <h3 className="tsection">{t('tasks.fields.checklist')}</h3>
          <Checklist task={task} disabled={!editable} reload={async () => { const fresh = await reload(); changed.current?.(fresh); }} />

          <Tabs
            activeKey={tab}
            onChange={setTab}
            className="ttabs"
            items={[
              { key: 'comments', label: `${t('tasks.comments')} · ${task.commentList.length}`, children: <Comments task={task} members={members} reload={reload} /> },
              { key: 'history', label: t('tasks.history'), children: <History task={task} /> },
            ]}
          />
        </div>
      )}
    </Drawer>
  );
}
