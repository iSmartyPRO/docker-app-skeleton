import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Checkbox, Dropdown, Input, Modal, Popover, Progress, Skeleton } from 'antd';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale } from '../../../../context/LocaleContext';
import { errorMessage } from '../../../../lib/errors';
import { UserAvatar } from '../../../shared/People';
import FolderBrowser from '../../../files/components/FolderBrowser';
import { driveApi } from '../../../drive/api';
import { fileUrl, tasksApi } from '../../api';
import { PeopleSelect } from './pickers';
import { HintLabel } from '../../../../help/Hint';

export const uid = () => `k${Math.random().toString(36).slice(2, 9)}`;
const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

/** Block frame: title, optional actions on the right, a close cross. */
export function Block({ icon, title, extra, onRemove, children, tone }) {
  const { t } = useLocale();
  return (
    <section className={`te-block${tone ? ` is-${tone}` : ''}`}>
      <header>
        <span className="te-block__icon">{icon}</span>
        <h4>{title}</h4>
        <span className="te-block__grow" />
        {extra}
        {onRemove && (
          <button type="button" className="te-block__x" onClick={onRemove} aria-label={t('tasks.v2.hideBlock')} title={t('tasks.v2.hideBlock')}>
            ✕
          </button>
        )}
      </header>
      <div className="te-block__body">{children}</div>
    </section>
  );
}

// ── Inline formatting of checklist items ────────────────────────────────────

const ITEM_RE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/\S+)/g;
export function ItemText({ text }) {
  const parts = [];
  let last = 0;
  let i = 0;
  for (const match of String(text).matchAll(ITEM_RE)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = i++;
    if (token.startsWith('**')) parts.push(<b key={key}>{token.slice(2, -2)}</b>);
    else if (token.startsWith('__')) parts.push(<u key={key}>{token.slice(2, -2)}</u>);
    else if (token.startsWith('~~')) parts.push(<s key={key}>{token.slice(2, -2)}</s>);
    else if (token.startsWith('*')) parts.push(<i key={key}>{token.slice(1, -1)}</i>);
    else if (token.startsWith('[')) {
      const [, label, url] = /^\[([^\]]+)\]\((.+)\)$/.exec(token);
      parts.push(<a key={key} href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{label}</a>);
    } else parts.push(<a key={key} href={token} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{token}</a>);
    last = match.index + token.length;
  }
  if (last < String(text).length) parts.push(String(text).slice(last));
  return <>{parts}</>;
}

// ── Checklists ──────────────────────────────────────────────────────────────

function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return children({ setNodeRef, style: { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }, handle: { ...attributes, ...listeners } });
}

function ItemRow({ item, list, lists, ops, disabled, selecting, selected, toggleSelect, handle, rowRef, style }) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [assign, setAssign] = useState(null);
  const fileInput = useRef(null);
  useEffect(() => setText(item.text), [item.text]);
  const wrap = (mark) => ops.updateItem(item, { text: `${mark}${item.text.replace(/^(\*\*|__|~~|\*)|(\*\*|__|~~|\*)$/g, '')}${mark}` });
  const menu = {
    items: [
      { key: 'imp', label: item.important ? t('tasks.v2.cl.unimportant') : `🔥 ${t('tasks.v2.cl.important')}`, onClick: () => ops.updateItem(item, { important: !item.important }) },
      ops.attachToItem && { key: 'files', label: `📎 ${t('tasks.v2.cl.attach')}`, onClick: () => fileInput.current?.click() },
      {
        key: 'fmt',
        label: t('tasks.v2.cl.format'),
        children: [
          { key: 'b', label: <b>{t('tasks.v2.fmt.bold')}</b>, onClick: () => wrap('**') },
          { key: 'i', label: <i>{t('tasks.v2.fmt.italic')}</i>, onClick: () => wrap('*') },
          { key: 'u', label: <u>{t('tasks.v2.fmt.underline')}</u>, onClick: () => wrap('__') },
          { key: 's', label: <s>{t('tasks.v2.fmt.strike')}</s>, onClick: () => wrap('~~') },
          {
            key: 'l',
            label: t('tasks.v2.fmt.link'),
            onClick: () => {
              // eslint-disable-next-line no-alert
              const url = window.prompt(t('tasks.v2.linkPrompt'), 'https://');
              if (url && /^https?:\/\//.test(url)) ops.updateItem(item, { text: `[${item.text}](${url})` });
            },
          },
        ],
      },
      { key: 'right', label: `→ ${t('tasks.v2.cl.indent')}`, disabled: item.level >= 4, onClick: () => ops.updateItem(item, { level: item.level + 1 }) },
      { key: 'left', label: `← ${t('tasks.v2.cl.outdent')}`, disabled: item.level <= 0, onClick: () => ops.updateItem(item, { level: item.level - 1 }) },
      ops.assignItem && { key: 'co', label: `👤 ${t('tasks.v2.cl.coassignee')}`, onClick: () => setAssign('coassignee') },
      ops.assignItem && { key: 'au', label: `👁 ${t('tasks.v2.cl.auditor')}`, onClick: () => setAssign('auditor') },
      lists.length > 1 && {
        key: 'move',
        label: t('tasks.v2.cl.move'),
        children: lists.filter((other) => other.key !== list.key).map((other) => ({ key: other.key, label: other.title, onClick: () => ops.moveItem(item, other) })),
      },
      { type: 'divider' },
      { key: 'del', danger: true, label: t('common.delete'), onClick: () => ops.removeItem(item) },
    ].filter(Boolean),
  };
  return (
    <div ref={rowRef} style={{ ...style, '--level': item.level }} className={`te-item${item.done ? ' is-done' : ''}${item.important ? ' is-important' : ''}`}>
      {!disabled && (
        <span className="te-item__grip" {...handle}>
          ⋮⋮
        </span>
      )}
      {selecting ? (
        <Checkbox checked={selected} onChange={toggleSelect} className="te-item__select" />
      ) : (
        <Checkbox checked={item.done} disabled={disabled} onChange={(event) => ops.updateItem(item, { done: event.target.checked })} />
      )}
      <div className="te-item__text" onClick={() => !disabled && !selecting && setEditing(true)} role="presentation">
        {editing ? (
          <Input.TextArea
            autoFocus
            autoSize
            value={text}
            variant="borderless"
            onChange={(event) => setText(event.target.value)}
            onBlur={() => {
              setEditing(false);
              if (text.trim() && text !== item.text) ops.updateItem(item, { text: text.trim() });
              else setText(item.text);
            }}
            onPressEnter={(event) => {
              event.preventDefault();
              event.target.blur();
            }}
          />
        ) : (
          <span>
            {item.important && <span className="te-item__flame">🔥</span>}
            <ItemText text={item.text} />
          </span>
        )}
        {item.fileIds?.length > 0 && <em className="te-item__files">📎 {item.fileIds.length}</em>}
      </div>
      {item.member && (
        <span className="te-item__member" title={item.member.name}>
          <UserAvatar user={item.member} size={20} tip />
        </span>
      )}
      {!disabled && (
        <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
          <button type="button" className="te-item__more">⋯</button>
        </Dropdown>
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          ops.attachToItem?.(item, [...event.target.files]);
          event.target.value = '';
        }}
      />
      <Modal open={Boolean(assign)} title={assign === 'auditor' ? t('tasks.v2.cl.auditor') : t('tasks.v2.cl.coassignee')} footer={null} onCancel={() => setAssign(null)} destroyOnHidden width={380}>
        <PeopleSelect
          autoFocus
          open
          value={item.member?.id}
          onChange={(userId) => {
            ops.assignItem(item, userId || null, assign);
            setAssign(null);
          }}
          placeholder={t('tasks.v2.choosePerson')}
        />
      </Modal>
    </div>
  );
}

function ChecklistCard({ list, lists, ops, disabled }) {
  const { t } = useLocale();
  const [hideDone, setHideDone] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [text, setText] = useState('');
  const [title, setTitle] = useState(list.title);
  const input = useRef(null);
  useEffect(() => setTitle(list.title), [list.title]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const done = list.items.filter((item) => item.done).length;
  const shown = hideDone ? list.items.filter((item) => !item.done) : list.items;
  const add = () => {
    const value = text.trim();
    if (!value) return;
    // Several lines pasted at once become several items.
    value.split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => ops.addItem(list, line));
    setText('');
    requestAnimationFrame(() => input.current?.focus());
  };
  const menu = {
    items: [
      { key: 'hide', label: hideDone ? t('tasks.v2.cl.showDone') : t('tasks.v2.cl.hideDone'), onClick: () => setHideDone(!hideDone) },
      { key: 'bulk', label: t('tasks.v2.cl.bulk'), onClick: () => setSelecting(true) },
      { type: 'divider' },
      { key: 'del', danger: true, label: t('tasks.v2.cl.deleteList'), onClick: () => ops.removeList(list) },
    ],
  };
  const ids = [...selected];
  return (
    <div className="te-checklist">
      <div className="te-checklist__head">
        <Input
          className="te-checklist__title"
          variant="borderless"
          value={title}
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => title.trim() && title !== list.title && ops.renameList(list, title.trim())}
          onPressEnter={(event) => event.target.blur()}
        />
        <span className="te-checklist__count">{t('tasks.v2.cl.progress', { done, total: list.items.length })}</span>
        {!disabled && (
          <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
            <button type="button" className="te-item__more">⋯</button>
          </Dropdown>
        )}
      </div>
      {list.items.length > 0 && <Progress percent={Math.round((done / list.items.length) * 100)} showInfo={false} size="small" strokeColor="#10B981" className="te-checklist__bar" />}
      {selecting && (
        <div className="te-bulk">
          <span>{t('tasks.v2.cl.selected', { n: ids.length })}</span>
          <Button size="small" disabled={!ids.length} onClick={() => ops.bulk(list, ids, 'done').then(() => setSelected(new Set()))}>
            ✓ {t('tasks.v2.cl.markDone')}
          </Button>
          <Button size="small" disabled={!ids.length} onClick={() => ops.bulk(list, ids, 'undone').then(() => setSelected(new Set()))}>
            {t('tasks.v2.cl.markUndone')}
          </Button>
          {lists.length > 1 && (
            <Dropdown
              trigger={['click']}
              menu={{ items: lists.filter((other) => other.key !== list.key).map((other) => ({ key: other.key, label: other.title, onClick: () => ops.bulk(list, ids, 'move', other).then(() => setSelected(new Set())) })) }}
            >
              <Button size="small" disabled={!ids.length}>{t('tasks.v2.cl.move')} ▾</Button>
            </Dropdown>
          )}
          <Button size="small" danger disabled={!ids.length} onClick={() => ops.bulk(list, ids, 'delete').then(() => setSelected(new Set()))}>
            {t('common.delete')}
          </Button>
          <Button size="small" type="text" onClick={() => { setSelecting(false); setSelected(new Set()); }}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          const keys = list.items.map((item) => item.key);
          ops.reorder(list, arrayMove(list.items, keys.indexOf(active.id), keys.indexOf(over.id)));
        }}
      >
        <SortableContext items={shown.map((item) => item.key)} strategy={verticalListSortingStrategy}>
          {shown.map((item) => (
            <SortableItem key={item.key} id={item.key}>
              {({ setNodeRef, style, handle }) => (
                <ItemRow
                  item={item}
                  list={list}
                  lists={lists}
                  ops={ops}
                  disabled={disabled}
                  selecting={selecting}
                  selected={selected.has(item.key)}
                  toggleSelect={() => setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.key)) next.delete(item.key);
                    else next.add(item.key);
                    return next;
                  })}
                  handle={handle}
                  rowRef={setNodeRef}
                  style={style}
                />
              )}
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>
      {hideDone && done > 0 && <div className="te-muted">{t('tasks.v2.cl.hiddenN', { n: done })}</div>}
      {!disabled && (
        <Input.TextArea
          ref={input}
          autoSize={{ minRows: 1, maxRows: 6 }}
          value={text}
          variant="filled"
          placeholder={`＋ ${t('tasks.v2.cl.addItem')}`}
          onChange={(event) => setText(event.target.value)}
          onPressEnter={(event) => {
            if (event.shiftKey) return;
            event.preventDefault();
            add();
          }}
          className="te-checklist__add"
        />
      )}
    </div>
  );
}

/** Checklists: several per task, each with progress, drag-and-drop, item menus and bulk actions. */
export function ChecklistsBlock({ lists, ops, disabled, onRemove }) {
  const { t } = useLocale();
  return (
    <Block
      icon="☑"
      title={t('tasks.v2.chips.checklists')}
      onRemove={onRemove}
      extra={
        !disabled && (
          <Button size="small" type="text" onClick={() => ops.addList(t('tasks.v2.cl.defaultTitle', { n: lists.length + 1 }))}>
            ＋ {t('tasks.v2.cl.newList')}
          </Button>
        )
      }
    >
      {lists.length ? lists.map((list) => <ChecklistCard key={list.key} list={list} lists={lists} ops={ops} disabled={disabled} />) : (
        !disabled && (
          <Button block type="dashed" onClick={() => ops.addList(t('tasks.v2.cl.defaultTitle', { n: 1 }))}>
            ＋ {t('tasks.v2.cl.newList')}
          </Button>
        )
      )}
    </Block>
  );
}

/** Checklist operations: on the draft (new task) or through the API (existing task). */
export function checklistOps({ mode, task, reload, setDraft, message }) {
  if (mode === 'new') {
    const map = (fn) => setDraft((draft) => ({ ...draft, checklists: fn(draft.checklists || []) }));
    const mapItems = (list, fn) => map((lists) => lists.map((entry) => (entry.key === list.key ? { ...entry, items: fn(entry.items) } : entry)));
    return {
      addList: (title, items = []) => map((lists) => [...lists, { key: uid(), title, items: items.map((text) => ({ key: uid(), text, done: false, level: 0, important: false })) }]),
      renameList: (list, title) => map((lists) => lists.map((entry) => (entry.key === list.key ? { ...entry, title } : entry))),
      removeList: (list) => map((lists) => lists.filter((entry) => entry.key !== list.key)),
      addItem: (list, text) => mapItems(list, (items) => [...items, { key: uid(), text, done: false, level: 0, important: false }]),
      updateItem: (item, patch) => map((lists) => lists.map((entry) => ({ ...entry, items: entry.items.map((it) => (it.key === item.key ? { ...it, ...patch } : it)) }))),
      removeItem: (item) => map((lists) => lists.map((entry) => ({ ...entry, items: entry.items.filter((it) => it.key !== item.key) }))),
      moveItem: (item, target) =>
        map((lists) => lists.map((entry) => (entry.key === target.key ? { ...entry, items: [...entry.items, item] } : { ...entry, items: entry.items.filter((it) => it.key !== item.key) }))),
      reorder: (list, items) => mapItems(list, () => items),
      bulk: async (list, keys, action, target) => {
        if (action === 'delete') mapItems(list, (items) => items.filter((it) => !keys.includes(it.key)));
        else if (action === 'move') map((lists) => lists.map((entry) => (entry.key === target.key ? { ...entry, items: [...entry.items, ...list.items.filter((it) => keys.includes(it.key))] } : entry.key === list.key ? { ...entry, items: entry.items.filter((it) => !keys.includes(it.key)) } : entry)));
        else mapItems(list, (items) => items.map((it) => (keys.includes(it.key) ? { ...it, done: action === 'done' } : it)));
      },
    };
  }
  const run = async (action) => {
    try {
      await action();
      await reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  return {
    addList: (title, items = []) => run(() => tasksApi.addChecklistList(task.ref, { title, items })),
    renameList: (list, title) => run(() => tasksApi.updateChecklistList(list.id, { title })),
    removeList: (list) => run(() => tasksApi.deleteChecklistList(list.id)),
    addItem: (list, text) => run(() => tasksApi.addChecklistItem(task.ref, { checklistId: list.id, text })),
    updateItem: (item, patch) => run(() => tasksApi.updateChecklist(item.id, patch)),
    removeItem: (item) => run(() => tasksApi.deleteChecklist(item.id)),
    moveItem: (item, target) => run(() => tasksApi.updateChecklist(item.id, { checklistId: target.id })),
    reorder: (list, items) => run(() => tasksApi.orderChecklistList(list.id, items.map((it) => it.id))),
    bulk: (list, keys, action, target) => run(() => tasksApi.bulkChecklist({ ids: list.items.filter((it) => keys.includes(it.key)).map((it) => it.id), action, checklistId: target?.id })),
    assignItem: (item, userId, role) => run(() => tasksApi.updateChecklist(item.id, { memberId: userId, memberRole: role })),
    attachToItem: (item, files) =>
      run(async () => {
        const res = await tasksApi.uploadFiles(task.ref, files);
        await tasksApi.updateChecklist(item.id, { fileIds: [...(item.fileIds || []), ...res.data.files.map((file) => file.id)] });
      }),
  };
}

/** Lists of the task (API) in the shape the block expects (stable keys). */
export function taskLists(task) {
  return (task?.checklists || []).map((list) => ({ ...list, key: `l${list.id}`, items: list.items.map((item) => ({ ...item, key: `i${item.id}` })) }));
}

// ── Files ───────────────────────────────────────────────────────────────────

function DrivePicker({ open, onClose, onPick }) {
  const { t } = useLocale();
  const [shares, setShares] = useState(null);
  const [place, setPlace] = useState(null);
  const [entries, setEntries] = useState(null);
  const [chosen, setChosen] = useState([]);
  useEffect(() => {
    if (!open) return;
    setPlace(null);
    setChosen([]);
    driveApi.home().then((res) => setShares(res.data.shares.filter((share) => share.state === 'ok'))).catch(() => setShares([]));
  }, [open]);
  useEffect(() => {
    if (!place) return;
    setEntries(null);
    driveApi.list(place.shareId, place.path).then((res) => setEntries(res.data.entries)).catch(() => setEntries([]));
  }, [place]);
  const crumbs = place?.path ? place.path.split('/') : [];
  return (
    <Modal open={open} title={t('tasks.v2.files.fromDrive')} onCancel={onClose} okText={t('tasks.v2.files.attachN', { n: chosen.length })} okButtonProps={{ disabled: !chosen.length }} onOk={() => onPick(chosen)} width={640} destroyOnHidden>
      {!place ? (
        shares === null ? (
          <Skeleton active />
        ) : (
          <div className="te-picker">
            {shares.map((share) => (
              <button key={share.id} type="button" onClick={() => setPlace({ shareId: share.id, title: share.title, path: '' })}>
                <span className="mod-dot" style={{ '--c': share.color }} />
                {share.title}
              </button>
            ))}
            {!shares.length && <div className="te-muted">{t('tasks.v2.files.noShares')}</div>}
          </div>
        )
      ) : (
        <>
          <div className="te-crumbs">
            <button type="button" onClick={() => setPlace(null)}>⌂</button>
            <button type="button" onClick={() => setPlace({ ...place, path: '' })}>{place.title}</button>
            {crumbs.map((part, index) => (
              <Fragment key={index}>
                <span>/</span>
                <button type="button" onClick={() => setPlace({ ...place, path: crumbs.slice(0, index + 1).join('/') })}>{part}</button>
              </Fragment>
            ))}
          </div>
          {entries === null ? (
            <Skeleton active />
          ) : (
            <div className="te-picker">
              {entries.map((entry) =>
                entry.dir ? (
                  <button key={entry.path} type="button" onClick={() => setPlace({ ...place, path: entry.path })}>
                    📁 {entry.name}
                  </button>
                ) : (
                  <label key={entry.path} className="te-picker__file">
                    <Checkbox
                      checked={chosen.some((item) => item.path === entry.path && item.shareId === place.shareId)}
                      onChange={(event) =>
                        setChosen((prev) => (event.target.checked ? [...prev, { shareId: place.shareId, path: entry.path, name: entry.name, size: entry.size }] : prev.filter((item) => !(item.path === entry.path && item.shareId === place.shareId))))
                      }
                    />
                    <span>{entry.name}</span>
                    <em>{formatSize(entry.size)}</em>
                  </label>
                )
              )}
              {!entries.length && <div className="te-muted">{t('tasks.v2.files.empty')}</div>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/** Files: from the computer, from Files ("Drive") or from a file server. */
export function FilesBlock({ files, taskRef, disabled, onChanged, onRemove, filesEnabled, driveEnabled }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const input = useRef(null);
  const [picker, setPicker] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const upload = async (list) => {
    if (!list.length) return;
    setBusy(true);
    try {
      const res = await tasksApi.uploadFiles(taskRef, list);
      onChanged(res.data.files.map((file) => ({ ...file, kind: 'upload' })), 'add');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const link = async (payloads) => {
    try {
      const added = [];
      for (const payload of payloads) added.push((await tasksApi.linkFile(taskRef, payload)).data.file);
      onChanged(added, 'add');
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  const menu = {
    items: [
      { key: 'pc', label: `💻 ${t('tasks.v2.files.fromComputer')}`, onClick: () => input.current?.click() },
      filesEnabled && { key: 'files', label: `📁 ${t('tasks.v2.files.fromFiles')}`, onClick: () => setPicker('files') },
      driveEnabled && { key: 'drive', label: `🗄 ${t('tasks.v2.files.fromDrive')}`, onClick: () => setPicker('drive') },
    ].filter(Boolean),
  };
  return (
    <Block
      icon="📎"
      title={t('tasks.v2.chips.files')}
      onRemove={onRemove}
      extra={
        !disabled && (
          <Dropdown menu={menu} trigger={['click']}>
            <Button size="small" type="text" loading={busy}>
              ＋ {t('tasks.v2.files.add')}
            </Button>
          </Dropdown>
        )
      }
    >
      <div
        className="te-files"
        onDragOver={(event) => !disabled && event.preventDefault()}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          upload([...event.dataTransfer.files]);
        }}
      >
        {files.map((file) => {
          const href = file.kind === 'upload' ? fileUrl(file, true) : file.kind === 'node' ? `/app/files/v/${file.nodeId}` : `/app/drive/v/${file.shareId}/${(file.path || '').split('/').map(encodeURIComponent).join('/')}`;
          return (
            <div key={file.id} className="te-file">
              {file.image ? <img src={fileUrl(file)} alt="" /> : <span className="te-file__ext">{(file.name.split('.').pop() || '').slice(0, 4).toUpperCase()}</span>}
              <a href={href} target={file.kind === 'upload' ? '_blank' : undefined} rel="noopener noreferrer">
                <b>{file.name}</b>
                <em>
                  {file.kind === 'upload' ? formatSize(file.size) : file.kind === 'node' ? t('tasks.v2.files.kindFiles') : t('tasks.v2.files.kindDrive')}
                  {file.author ? ` · ${file.author}` : ''}
                </em>
              </a>
              {!disabled && (
                <button type="button" onClick={() => onChanged([file], 'remove')} aria-label={t('common.delete')}>
                  ✕
                </button>
              )}
            </div>
          );
        })}
        {!files.length && <div className="te-dropzone" onClick={() => !disabled && input.current?.click()} role="presentation">{t('tasks.v2.files.drop')}</div>}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          upload([...event.target.files]);
          event.target.value = '';
        }}
      />
      <Modal open={picker === 'files'} title={t('tasks.v2.files.fromFiles')} width={760} onCancel={() => setPicker(null)} okButtonProps={{ disabled: !nodes.length }} okText={t('tasks.v2.files.attachN', { n: nodes.length })} onOk={() => { link(nodes.map((node) => ({ nodeId: node.id }))); setPicker(null); }} destroyOnHidden>
        <FolderBrowser mode="files" onSelection={setNodes} />
      </Modal>
      <DrivePicker open={picker === 'drive'} onClose={() => setPicker(null)} onPick={(items) => { link(items); setPicker(null); }} />
    </Block>
  );
}

// ── Results ─────────────────────────────────────────────────────────────────

export function ResultsBlock({ task, required, onRequired, disabled, mode, onAdd, onRemoveResult, onRemove }) {
  const { t, locale } = useLocale();
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const results = task?.results || [];
  const menu = {
    items: [
      mode === 'task' && { key: 'add', label: t('tasks.v2.results.add'), onClick: () => setAdding(true) },
      required ? { key: 'off', label: t('tasks.v2.results.notRequire'), onClick: () => onRequired(false) } : { key: 'on', label: t('tasks.v2.results.require'), onClick: () => onRequired(true) },
    ].filter(Boolean),
  };
  return (
    <Block
      icon="🏁"
      title={<HintLabel id="tasks.results">{t('tasks.v2.chips.results')}</HintLabel>}
      onRemove={onRemove}
      tone={required && !results.length ? 'warn' : null}
      extra={
        !disabled && (
          <Dropdown menu={menu} trigger={['click']}>
            <button type="button" className="te-item__more">⋯</button>
          </Dropdown>
        )
      }
    >
      {required && (
        <div className="te-required">
          <b>{t('tasks.v2.results.required')}</b>
          <span>{t('tasks.v2.results.requiredText')}</span>
        </div>
      )}
      {results.map((result) => (
        <div key={result.id} className="te-result">
          <UserAvatar user={result.author} size={26} tip={false} />
          <div>
            <b>{result.author?.name}</b>
            <em>{new Date(result.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</em>
            <p>{result.body}</p>
            {result.chatFileIds?.length > 0 && <span className="te-muted">📎 {result.chatFileIds.length}</span>}
          </div>
          {result.mine && !disabled && (
            <button type="button" className="te-item__more" onClick={() => onRemoveResult(result)} aria-label={t('common.delete')}>
              ✕
            </button>
          )}
        </div>
      ))}
      {mode === 'task' && !disabled && (adding || (!results.length && required)) && (
        <div className="te-result-form">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} value={text} onChange={(event) => setText(event.target.value)} placeholder={t('tasks.v2.results.placeholder')} />
          <div>
            <Button size="small" onClick={() => { setAdding(false); setText(''); }}>{t('common.cancel')}</Button>
            <Button size="small" type="primary" disabled={!text.trim()} onClick={() => onAdd(text).then(() => { setText(''); setAdding(false); })}>
              {t('tasks.v2.results.save')}
            </Button>
          </div>
        </div>
      )}
      {mode === 'task' && <div className="te-hint">{t('tasks.v2.results.chatHint')}</div>}
    </Block>
  );
}

export { formatSize, Popover };
export const useStableMemo = useMemo;
