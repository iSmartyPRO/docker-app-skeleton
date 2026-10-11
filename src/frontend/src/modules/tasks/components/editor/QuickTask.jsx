import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Dropdown, Input, Modal, Progress } from 'antd';
import { useAuth } from '../../../../context/AuthContext';
import { useLocale } from '../../../../context/LocaleContext';
import { errorMessage } from '../../../../lib/errors';
import { tasksApi } from '../../api';
import { useTasks } from '../../TasksContext';
import { uid } from './blocks1';
import { createdToast } from './createdToast';
import { DeadlinePicker, PeopleSelect, PersonPill, ProjectSelect, defaultDeadline, usePeople } from './pickers';
import { draftFromPayload, draftPayload, emptyDraft } from './TaskPanel';
import { HintLabel } from '../../../../help/Hint';

/**
 * Quick form: title (with the "important" flame), a one-line description that
 * grows, assignee (me by default), deadline (a week ahead, 19:00) and three
 * chips — Files, Checklist, Project. "Full form" carries everything over.
 */
export default function QuickTask({ open, initial, onClose, onCreated, onFull }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { refresh } = useTasks();
  const people = usePeople();
  const [draft, setDraft] = useState(null);
  const [chips, setChips] = useState(new Set());
  const [pickAssignee, setPickAssignee] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [item, setItem] = useState('');
  const fileInput = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setDraft(emptyDraft({ originatorId: user.id, assigneeId: user.id, ...(initial || {}) }));
    setChips(new Set(initial?.projectId ? ['project'] : []));
    setPickAssignee(false);
    setItem('');
  }, [open, initial, user.id]);

  if (!open || !draft) return null;
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const toggle = (key) =>
    setChips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const upload = async (files) => {
    if (!files.length) return;
    setUploading(0.01);
    try {
      const res = await tasksApi.uploadFiles(null, files, (progress) => setUploading(Math.max(0.01, progress)));
      set({ files: [...draft.files, ...res.data.files.map((file) => ({ ...file, kind: 'upload' }))] });
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setUploading(0);
    }
  };

  const checklist = draft.checklists[0];
  const addItem = () => {
    const text = item.trim();
    if (!text) return;
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => ({ key: uid(), text: line, done: false, level: 0, important: false }));
    set({ checklists: checklist ? [{ ...checklist, items: [...checklist.items, ...lines] }] : [{ key: uid(), title: t('tasks.v2.cl.defaultTitle', { n: 1 }), items: lines }] });
    setItem('');
  };

  const create = async () => {
    if (!draft.title.trim()) {
      message.warning(t('tasks.v2.titleRequired'));
      return;
    }
    setSaving(true);
    try {
      const res = await tasksApi.createTask(draftPayload(draft, user.id));
      createdToast(message, t, locale, res.data.task, navigate);
      refresh();
      onCreated?.(res.data.task);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const assignee = people.find((person) => person.id === draft.assigneeId);

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={640} className="tq" destroyOnHidden closable={false} afterOpenChange={(visible) => visible && titleRef.current?.focus()}>
      <div className="tq__title">
        <Input.TextArea
          ref={titleRef}
          autoFocus
          value={draft.title}
          onChange={(event) => set({ title: event.target.value })}
          variant="borderless"
          autoSize={{ minRows: 1, maxRows: 3 }}
          maxLength={300}
          placeholder={t('tasks.v2.titlePlaceholder')}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              create();
            }
          }}
        />
        <button type="button" className={`te-flame${draft.important ? ' is-on' : ''}`} onClick={() => set({ important: !draft.important })} title={t('tasks.v2.important')} aria-pressed={draft.important}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 2.5c.6 3.2-1 5-2.6 6.8C7.8 11 6.5 12.8 6.5 15.4A5.5 5.5 0 0 0 12 21a5.5 5.5 0 0 0 5.5-5.6c0-2.4-1-3.9-2-5.1-.3 1.4-1 2.3-2 2.8.6-3.6-.2-7.6-1.5-10.6Z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <Input.TextArea
        className="tq__desc"
        value={draft.description}
        onChange={(event) => set({ description: event.target.value })}
        variant="borderless"
        autoSize={{ minRows: 1, maxRows: 8 }}
        placeholder={t('tasks.v2.descShort')}
      />
      <div className="tq__row">
        <span className="tq__label"><HintLabel id="tasks.assignee">{t('tasks.fields.assignee')}</HintLabel></span>
        {pickAssignee ? (
          <PeopleSelect autoFocus open value={draft.assigneeId} onChange={(id) => { set({ assigneeId: id || null }); setPickAssignee(false); }} onDropdownVisibleChange={(visible) => !visible && setPickAssignee(false)} />
        ) : (
          <PersonPill user={assignee} placeholder={t('tasks.unassigned')} onClick={() => setPickAssignee(true)} />
        )}
        <span className="tq__label"><HintLabel id="tasks.deadline">{t('tasks.fields.due')}</HintLabel></span>
        <DeadlinePicker value={draft.dueAt} onChange={(dueAt) => set({ dueAt })} />
      </div>

      {chips.has('files') && (
        <div className="tq__block">
          <div className="tq__files">
            {draft.files.map((file) => (
              <span key={file.id} className="tq__file">
                📎 {file.name}
                <button type="button" onClick={() => { set({ files: draft.files.filter((entry) => entry.id !== file.id) }); tasksApi.removeFile(file.id).catch(() => {}); }}>✕</button>
              </span>
            ))}
            <Button size="small" onClick={() => fileInput.current?.click()}>＋ {t('tasks.v2.files.fromComputer')}</Button>
            {uploading > 0 && <Progress percent={Math.round(uploading * 100)} size="small" style={{ width: 120 }} />}
          </div>
          <input ref={fileInput} type="file" multiple hidden onChange={(event) => { upload([...event.target.files]); event.target.value = ''; }} />
        </div>
      )}
      {chips.has('checklists') && (
        <div className="tq__block">
          {checklist?.items.map((entry) => (
            <div key={entry.key} className="tq__item">
              <span>☐</span>
              <span>{entry.text}</span>
              <button type="button" onClick={() => set({ checklists: [{ ...checklist, items: checklist.items.filter((it) => it.key !== entry.key) }] })}>✕</button>
            </div>
          ))}
          <Input
            autoFocus
            value={item}
            onChange={(event) => setItem(event.target.value)}
            onPressEnter={addItem}
            placeholder={`＋ ${t('tasks.v2.cl.addItem')}`}
            variant="filled"
          />
        </div>
      )}
      {chips.has('project') && (
        <div className="tq__block">
          <ProjectSelect value={draft.projectId} onChange={(projectId) => set({ projectId })} />
        </div>
      )}

      <div className="tq__chips">
        {[
          ['files', '📎', draft.files.length],
          ['checklists', '☑', checklist?.items.length],
          ['project', '🗂', draft.projectId ? 1 : 0],
        ].map(([key, icon, count]) => (
          <button key={key} type="button" className={`te-chip${chips.has(key) ? ' is-on' : ''}`} onClick={() => toggle(key)}>
            <span>{icon}</span>
            {t(`tasks.v2.chips.${key}`)}
            {count ? <b>{count}</b> : null}
          </button>
        ))}
      </div>

      <div className="tq__foot">
        <Button type="primary" size="large" loading={saving} onClick={create}>
          {t('common.create')}
        </Button>
        <Button size="large" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <span className="tq__grow" />
        <button type="button" className="tq__full" onClick={() => onFull?.({ ...draft, descriptionFormat: 'html', description: draft.description ? `<p>${draft.description.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\n/g, '<br>')}</p>` : '' })}>
          {t('tasks.v2.fullForm')} →
        </button>
      </div>
    </Modal>
  );
}

/** "Create" with a menu: full form, or from a template. */
export function CreateButton({ onQuick, onFull, onTemplate, size = 'middle', block }) {
  const { t } = useLocale();
  const [templates, setTemplates] = useState([]);
  const load = (visible) => visible && tasksApi.templates().then((res) => setTemplates(res.data.templates.filter((tpl) => !tpl.recurring))).catch(() => {});
  return (
    <Dropdown.Button
      type="primary"
      size={size}
      onClick={onQuick}
      onOpenChange={load}
      className={block ? 'tq-create is-block' : 'tq-create'}
      menu={{
        items: [
          { key: 'full', label: t('tasks.v2.createFull'), onClick: onFull },
          {
            key: 'tpl',
            label: t('tasks.v2.createFromTemplate'),
            children: templates.length
              ? templates.map((tpl) => ({ key: `t${tpl.id}`, label: tpl.title, onClick: () => onTemplate(draftFromPayload(tpl.payload)) }))
              : [{ key: 'none', disabled: true, label: t('tasks.v2.tpl.none') }],
          },
        ],
      }}
    >
      ＋ {t('common.create')}
    </Dropdown.Button>
  );
}
