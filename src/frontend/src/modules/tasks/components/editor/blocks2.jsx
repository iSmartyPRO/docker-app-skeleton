import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { App, Button, Checkbox, DatePicker, Input, InputNumber, Modal, Radio, Segmented, Select, Switch, Tag, TimePicker } from 'antd';
import { useLocale } from '../../../../context/LocaleContext';
import { errorMessage } from '../../../../lib/errors';
import { Person } from '../../../shared/People';
import { tasksApi } from '../../api';
import { labelColor } from '../bits';
import { Block } from './blocks1';
import { PeopleSelect, ProjectSelect, TaskSelect } from './pickers';
import WhenPicker, { ChannelWarnings, defaultWhen } from '../../../../components/ui/WhenPicker';
import { HintLabel } from '../../../../help/Hint';

const durationText = (from, to, t) => {
  if (!from || !to) return null;
  const minutes = Math.max(0, dayjs(to).diff(dayjs(from), 'minute'));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return [days && t('tasks.v2.plan.days', { n: days }), hours && t('tasks.v2.plan.hours', { n: hours }), !days && !hours && t('tasks.v2.plan.minutes', { n: minutes % 60 })].filter(Boolean).join(' ');
};

export function ProjectBlock({ value, onChange, onRemove, onCreate, disabled }) {
  const { t } = useLocale();
  return (
    <Block icon="🗂" title={t('tasks.v2.chips.project')} onRemove={onRemove}>
      {disabled ? <span className="te-muted">—</span> : <ProjectSelect value={value} onChange={onChange} onCreate={onCreate} />}
    </Block>
  );
}

export function PeopleBlock({ icon, title, value, onChange, onRemove, disabled, hint, exclude }) {
  const { t } = useLocale();
  return (
    <Block icon={icon} title={title} onRemove={onRemove}>
      <PeopleSelect multiple value={value} onChange={onChange} disabled={disabled} placeholder={t('tasks.v2.addPeople')} exclude={exclude} />
      {hint && <div className="te-hint">{hint}</div>}
    </Block>
  );
}

export function FlowBlock({ value, onChange, onRemove, disabled }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [flows, setFlows] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', memberIds: [], distribution: 'queue' });
  const load = () => tasksApi.flows().then((res) => setFlows(res.data.flows)).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  const current = flows.find((flow) => flow.id === value);
  return (
    <Block icon="🌊" title={<HintLabel id="tasks.flow">{t('tasks.v2.chips.flow')}</HintLabel>} onRemove={onRemove}>
      <Select
        value={value || undefined}
        onChange={(next) => onChange(next || null)}
        allowClear
        disabled={disabled}
        placeholder={t('tasks.v2.flow.choose')}
        className="te-select"
        variant="borderless"
        style={{ minWidth: 240 }}
        options={flows.map((flow) => ({ value: flow.id, label: <span className="status-option"><span className="mod-dot" style={{ '--c': flow.color }} />{flow.name}</span> }))}
        dropdownRender={(menu) => (
          <div>
            {menu}
            <button type="button" className="te-create" onMouseDown={(event) => event.preventDefault()} onClick={() => setCreating(true)}>
              ＋ {t('tasks.v2.flow.create')}
            </button>
          </div>
        )}
      />
      {current && (
        <div className="te-flowstats">
          <span>{t(`tasks.v2.flow.dist.${current.distribution}`)}</span>
          <span>{t('tasks.v2.flow.open', { n: current.open })}</span>
          {current.overdue > 0 && <span className="is-bad">{t('tasks.v2.flow.overdue', { n: current.overdue })}</span>}
          <span>{current.efficiency == null ? t('tasks.v2.flow.noStats') : t('tasks.v2.flow.efficiency', { n: current.efficiency })}</span>
        </div>
      )}
      <Modal
        open={creating}
        title={t('tasks.v2.flow.create')}
        onCancel={() => setCreating(false)}
        okText={t('common.create')}
        okButtonProps={{ disabled: !form.name.trim() }}
        onOk={async () => {
          try {
            const res = await tasksApi.saveFlow(form);
            await load();
            onChange(res.data.id);
            setCreating(false);
            setForm({ name: '', memberIds: [], distribution: 'queue' });
          } catch (err) {
            message.error(errorMessage(err));
          }
        }}
        destroyOnHidden
      >
        <div className="te-formgrid">
          <Input autoFocus placeholder={t('tasks.v2.flow.name')} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <PeopleSelect multiple value={form.memberIds} onChange={(memberIds) => setForm({ ...form, memberIds })} placeholder={t('tasks.v2.flow.team')} />
          <Radio.Group value={form.distribution} onChange={(event) => setForm({ ...form, distribution: event.target.value })}>
            {['queue', 'least', 'manual'].map((key) => (
              <Radio key={key} value={key} className="te-radio">
                <b>{t(`tasks.v2.flow.dist.${key}`)}</b>
                <em>{t(`tasks.v2.flow.distText.${key}`)}</em>
              </Radio>
            ))}
          </Radio.Group>
        </div>
      </Modal>
    </Block>
  );
}

export function TagsBlock({ value, onChange, onRemove, disabled, known = [] }) {
  const { t } = useLocale();
  return (
    <Block icon="#" title={t('tasks.v2.chips.tags')} onRemove={onRemove}>
      <Select
        mode="tags"
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={t('tasks.v2.tagsPlaceholder')}
        className="te-select"
        variant="borderless"
        style={{ width: '100%' }}
        options={known.map((label) => ({ value: label, label }))}
        tagRender={({ label, closable, onClose }) => (
          <span className="task-label" style={{ '--c': labelColor(label), marginInlineEnd: 4 }}>
            #{label}
            {closable && (
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>
                ×
              </button>
            )}
          </span>
        )}
      />
    </Block>
  );
}

const TARGETS = ['assignee', 'originator', 'coassignees', 'me'];
const CHANNELS = ['app', 'email', 'messenger'];

export function ReminderDialog({ open, onClose, onSave, hasDeadline }) {
  const { t } = useLocale();
  const [form, setForm] = useState({ targets: ['me'], mode: 'at', remindAt: null, amount: 1, unit: 'hour', channels: ['app'] });
  useEffect(() => {
    if (open) setForm({ targets: ['me'], mode: hasDeadline ? 'before' : 'at', remindAt: defaultWhen(), amount: 1, unit: 'hour', channels: ['app'] });
  }, [open, hasDeadline]);
  const minutes = form.amount * { minute: 1, hour: 60, day: 1440 }[form.unit];
  const valid = form.targets.length && form.channels.length && (form.mode === 'at' ? Boolean(form.remindAt) && form.remindAt.isAfter(dayjs()) : minutes > 0);
  return (
    <Modal
      open={open}
      title={t('tasks.v2.rem.title')}
      onCancel={onClose}
      okText={t('tasks.v2.rem.save')}
      okButtonProps={{ disabled: !valid }}
      onOk={() => onSave({ targets: form.targets, mode: form.mode, remindAt: form.mode === 'at' ? form.remindAt.toISOString() : null, beforeMinutes: form.mode === 'before' ? minutes : null, channels: form.channels })}
      destroyOnHidden
      width={540}
    >
      <div className="te-formgrid">
        <div>
          <label className="te-label">{t('tasks.v2.rem.whom')}</label>
          <Checkbox.Group value={form.targets} onChange={(targets) => setForm({ ...form, targets })} options={TARGETS.map((key) => ({ value: key, label: t(`tasks.v2.rem.targets.${key}`) }))} />
        </div>
        <div>
          <label className="te-label">{t('tasks.v2.rem.when')}</label>
          <Segmented
            value={form.mode}
            onChange={(mode) => setForm({ ...form, mode })}
            options={[
              { value: 'at', label: t('tasks.v2.rem.at') },
              { value: 'before', label: t('tasks.v2.rem.before'), disabled: !hasDeadline },
            ]}
          />
        </div>
        {form.mode === 'at' ? (
          <WhenPicker value={form.remindAt} onChange={(remindAt) => setForm({ ...form, remindAt })} />
        ) : (
          <div className="te-inline">
            <InputNumber min={1} max={999} value={form.amount} onChange={(amount) => setForm({ ...form, amount: amount || 1 })} />
            <Select value={form.unit} onChange={(unit) => setForm({ ...form, unit })} options={['minute', 'hour', 'day'].map((key) => ({ value: key, label: t(`tasks.v2.units.${key}`) }))} style={{ width: 120 }} />
            <span>{t('tasks.v2.rem.beforeDeadline')}</span>
          </div>
        )}
        <div>
          <label className="te-label"><HintLabel id="tasks.reminderChannels">{t('tasks.v2.rem.how')}</HintLabel></label>
          <Checkbox.Group value={form.channels} onChange={(channels) => setForm({ ...form, channels })} options={CHANNELS.map((key) => ({ value: key, label: t(`tasks.v2.rem.channels.${key}`) }))} />
          {form.targets.includes('me') && <ChannelWarnings channels={form.channels} />}
        </div>
      </div>
    </Modal>
  );
}

export function reminderText(reminder, t, locale) {
  const whom = reminder.targets.map((key) => t(`tasks.v2.rem.targets.${key}`)).join(', ');
  const how = reminder.channels.map((key) => t(`tasks.v2.rem.channels.${key}`)).join(', ');
  const when =
    reminder.mode === 'at'
      ? new Date(reminder.remindAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : t('tasks.v2.rem.beforeText', { time: reminder.beforeMinutes % 1440 === 0 ? t('tasks.v2.plan.days', { n: reminder.beforeMinutes / 1440 }) : reminder.beforeMinutes % 60 === 0 ? t('tasks.v2.plan.hours', { n: reminder.beforeMinutes / 60 }) : t('tasks.v2.plan.minutes', { n: reminder.beforeMinutes }) });
  return { whom, how, when };
}

export function RemindersBlock({ reminders, onAdd, onDelete, onRemove, hasDeadline, disabled }) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <Block
      icon="⏰"
      title={<HintLabel id="tasks.reminders">{t('tasks.v2.chips.reminders')}</HintLabel>}
      onRemove={onRemove}
      extra={!disabled && <Button size="small" type="text" onClick={() => setOpen(true)}>＋ {t('tasks.v2.rem.add')}</Button>}
    >
      {reminders.length ? (
        <ul className="te-list">
          {reminders.map((reminder) => {
            const text = reminderText(reminder, t, locale);
            return (
              <li key={reminder.id || reminder.key} className={reminder.sentAt ? 'is-done' : ''}>
                <span>⏰ <b>{text.when}</b> · {text.whom} · <em>{text.how}</em>{reminder.sentAt ? ` · ${t('tasks.v2.rem.sent')}` : ''}</span>
                {!disabled && reminder.canDelete !== false && <button type="button" onClick={() => onDelete(reminder)}>✕</button>}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="te-muted">{t('tasks.v2.rem.none')}</div>
      )}
      <ReminderDialog open={open} hasDeadline={hasDeadline} onClose={() => setOpen(false)} onSave={(payload) => { onAdd(payload); setOpen(false); }} />
    </Block>
  );
}

function TaskLine({ task, onRemove, extra }) {
  return (
    <li className={task.statusCategory === 'done' || task.done ? 'is-done' : ''}>
      <Link to={`/app/tasks/${task.ref}`} target="_blank">
        <b>{task.ref}</b> {task.title}
      </Link>
      {extra}
      {task.assignee && <Person user={task.assignee} size={18} />}
      {onRemove && <button type="button" onClick={onRemove}>✕</button>}
    </li>
  );
}

export function ParentBlock({ parent, onChange, onRemove, disabled, exclude }) {
  const { t } = useLocale();
  return (
    <Block icon="⤴" title={t('tasks.v2.chips.parent')} onRemove={onRemove}>
      {parent ? (
        <ul className="te-list">
          <TaskLine task={parent} onRemove={disabled ? null : () => onChange(null)} />
        </ul>
      ) : (
        !disabled && <TaskSelect value={undefined} exclude={exclude} onChange={(id, option) => onChange(id, option)} placeholder={t('tasks.v2.findTask')} />
      )}
      <div className="te-hint">{t('tasks.v2.parentHint')}</div>
    </Block>
  );
}

export function SubtasksBlock({ subtasks, onCreate, onRemove, mode }) {
  const { t } = useLocale();
  return (
    <Block icon="⤵" title={t('tasks.v2.chips.subtasks')} onRemove={onRemove} extra={mode === 'task' && <Button size="small" type="text" onClick={onCreate}>＋ {t('tasks.v2.subtask')}</Button>}>
      {mode !== 'task' ? (
        <div className="te-muted">{t('tasks.v2.subtasksLater')}</div>
      ) : subtasks.length ? (
        <ul className="te-list">
          {subtasks.map((task) => (
            <TaskLine key={task.id} task={task} />
          ))}
        </ul>
      ) : (
        <div className="te-muted">{t('tasks.v2.noSubtasks')}</div>
      )}
    </Block>
  );
}

export function LinksBlock({ links, onAdd, onDelete, onRemove, disabled, exclude }) {
  const { t } = useLocale();
  return (
    <Block icon="🔗" title={t('tasks.v2.chips.links')} onRemove={onRemove}>
      {links.length > 0 && (
        <ul className="te-list">
          {links.map((task) => (
            <TaskLine key={task.id} task={task} onRemove={disabled ? null : () => onDelete(task)} />
          ))}
        </ul>
      )}
      {!disabled && <TaskSelect value={undefined} exclude={exclude} onChange={(id, option) => id && onAdd(id, option)} placeholder={t('tasks.v2.findTask')} />}
    </Block>
  );
}

const KINDS = ['FS', 'SS', 'SF', 'FF'];
export function GanttBlock({ deps, onAdd, onDelete, onRemove, disabled, exclude }) {
  const { t } = useLocale();
  const [kind, setKind] = useState('FS');
  return (
    <Block icon="📊" title={<HintLabel id="tasks.gantt">{t('tasks.v2.chips.gantt')}</HintLabel>} onRemove={onRemove}>
      {deps.length > 0 && (
        <ul className="te-list">
          {deps.map((dep) => (
            <TaskLine key={dep.id || dep.key} task={dep} extra={<Tag bordered={false}>{t(`tasks.v2.gantt.${dep.kind}`)}</Tag>} onRemove={disabled ? null : () => onDelete(dep)} />
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="te-inline te-inline--wrap">
          <div style={{ flex: 1, minWidth: 220 }}>
            <TaskSelect value={undefined} exclude={exclude} onChange={(id, option) => id && onAdd({ taskId: id, ref: option?.ref, title: option?.title, kind })} placeholder={t('tasks.v2.gantt.task')} />
          </div>
          <Select value={kind} onChange={setKind} options={KINDS.map((key) => ({ value: key, label: t(`tasks.v2.gantt.${key}`) }))} style={{ width: 230 }} />
        </div>
      )}
    </Block>
  );
}

export function PlanningBlock({ value, onChange, onRemove, disabled }) {
  const { t } = useLocale();
  const duration = durationText(value.planStart, value.planEnd, t);
  return (
    <Block icon="🗓" title={<HintLabel id="tasks.planning">{t('tasks.v2.chips.planning')}</HintLabel>} onRemove={onRemove}>
      <div className="te-plan">
        <label>
          <span>{t('tasks.v2.plan.start')}</span>
          <DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="DD.MM.YYYY HH:mm" value={value.planStart ? dayjs(value.planStart) : null} disabled={disabled} onChange={(date) => onChange({ planStart: date ? date.toISOString() : null })} />
        </label>
        <label>
          <span>{t('tasks.v2.plan.end')}</span>
          <DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="DD.MM.YYYY HH:mm" value={value.planEnd ? dayjs(value.planEnd) : null} disabled={disabled} onChange={(date) => onChange({ planEnd: date ? date.toISOString() : null })} />
        </label>
        <label>
          <span>{t('tasks.v2.plan.duration')}</span>
          <b>{duration || '—'}</b>
        </label>
      </div>
      <div className="te-switches">
        {[
          ['allowChangeDeadline', 'allowChange'],
          ['skipWeekends', 'skipWeekends'],
          ['deadlineFromSubtasks', 'fromSubtasks'],
        ].map(([key, label]) => (
          <label key={key}>
            <Switch size="small" checked={Boolean(value[key])} disabled={disabled} onChange={(on) => onChange({ [key]: on })} />
            <span>{t(`tasks.v2.plan.${label}`)}</span>
          </label>
        ))}
      </div>
    </Block>
  );
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Live clock for a running timer: the server's total plus the time since it was read. */
export function useTicking(time) {
  const [, force] = useState(0);
  const anchor = useMemo(() => ({ total: time?.total || 0, at: Date.now() }), [time]);
  useEffect(() => {
    if (!time?.running) return undefined;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [time?.running]);
  return anchor.total + (time?.running ? (Date.now() - anchor.at) / 1000 : 0);
}

export function TimeBlock({ value, onChange, onRemove, disabled, task, onTimer }) {
  const { t } = useLocale();
  const spent = useTicking(task?.time);
  const hours = Math.floor((value.timeEstimate || 0) / 60);
  const minutes = (value.timeEstimate || 0) % 60;
  return (
    <Block icon="⏱" title={<HintLabel id="tasks.timeTracking">{t('tasks.v2.chips.time')}</HintLabel>} onRemove={onRemove}>
      <div className="te-switches">
        <label>
          <Switch size="small" checked={Boolean(value.timeTracking)} disabled={disabled} onChange={(on) => onChange({ timeTracking: on })} />
          <span>{t('tasks.v2.time.track')}</span>
        </label>
      </div>
      <div className="te-inline">
        <span>{t('tasks.v2.time.plan')}</span>
        <InputNumber min={0} max={9999} value={hours} disabled={disabled} onChange={(h) => onChange({ timeEstimate: (h || 0) * 60 + minutes })} addonAfter={t('tasks.v2.units.hShort')} style={{ width: 120 }} />
        <InputNumber min={0} max={59} value={minutes} disabled={disabled} onChange={(m) => onChange({ timeEstimate: hours * 60 + (m || 0) })} addonAfter={t('tasks.v2.units.mShort')} style={{ width: 120 }} />
      </div>
      {task && value.timeTracking && (
        <div className="te-timer">
          <b>{formatClock(spent)}</b>
          {value.timeEstimate ? <em>/ {formatClock(value.timeEstimate * 60)}</em> : null}
          <Button size="small" type={task.time?.running ? 'default' : 'primary'} onClick={() => onTimer(task.time?.running ? 'stop' : 'start')} disabled={disabled}>
            {task.time?.running ? `⏸ ${t('tasks.v2.time.stop')}` : `▶ ${t('tasks.v2.time.start')}`}
          </Button>
        </div>
      )}
    </Block>
  );
}

export function FieldsBlock({ value, onChange, onRemove, disabled }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [fields, setFields] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'string' });
  const load = () => tasksApi.fields().then((res) => setFields(res.data.fields)).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  const set = (id, next) => onChange({ ...(value || {}), [id]: next });
  return (
    <Block icon="✚" title={t('tasks.v2.chips.fields')} onRemove={onRemove} extra={!disabled && <Button size="small" type="text" onClick={() => setAdding(!adding)}>＋ {t('tasks.v2.fields.add')}</Button>}>
      {adding && (
        <div className="te-inline te-inline--wrap te-fieldadd">
          <Input placeholder={t('tasks.v2.fields.name')} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} style={{ flex: 1, minWidth: 180 }} />
          <Segmented value={form.type} onChange={(type) => setForm({ ...form, type })} options={['string', 'number', 'datetime', 'bool'].map((key) => ({ value: key, label: t(`tasks.v2.fields.types.${key}`) }))} />
          <Button
            type="primary"
            disabled={!form.name.trim()}
            onClick={async () => {
              try {
                await tasksApi.addField(form);
                setForm({ name: '', type: 'string' });
                setAdding(false);
                load();
              } catch (err) {
                message.error(errorMessage(err));
              }
            }}
          >
            {t('common.create')}
          </Button>
        </div>
      )}
      <div className="te-fields">
        {fields.map((field) => {
          const current = value?.[field.id];
          let control;
          if (field.type === 'number') control = <InputNumber value={current} disabled={disabled} onChange={(next) => set(field.id, next)} style={{ width: 180 }} />;
          else if (field.type === 'datetime') control = <DatePicker showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" value={current ? dayjs(current) : null} disabled={disabled} onChange={(date) => set(field.id, date ? date.toISOString() : null)} />;
          else if (field.type === 'bool') control = <Switch checked={Boolean(current)} disabled={disabled} onChange={(on) => set(field.id, on)} />;
          else control = <Input value={current || ''} disabled={disabled} onChange={(event) => set(field.id, event.target.value)} style={{ maxWidth: 360 }} />;
          return (
            <label key={field.id}>
              <span>{field.name}</span>
              {control}
            </label>
          );
        })}
        {!fields.length && !adding && <div className="te-muted">{t('tasks.v2.fields.none')}</div>}
      </div>
    </Block>
  );
}

// ── Recurring ───────────────────────────────────────────────────────────────

export function defaultRecurrence() {
  return {
    every: 1,
    unit: 'week',
    weekdays: [((dayjs().day() + 6) % 7) + 1],
    start: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    time: '09:00',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    end: { mode: 'never', count: 10, date: null },
    deadline: { amount: 1, unit: 'day' },
    weekends: 'keep',
  };
}

export function RecurrenceForm({ value, onChange, disabled }) {
  const { t, locale } = useLocale();
  const rec = value || defaultRecurrence();
  const set = (patch) => onChange({ ...rec, ...patch });
  const names = Array.from({ length: 7 }, (_, i) => dayjs().day(i + 1).toDate().toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short' }));
  return (
    <div className="te-recur">
      <div className="te-inline">
        <span>{t('tasks.v2.rec.every')}</span>
        <InputNumber min={1} max={365} value={rec.every} disabled={disabled} onChange={(every) => set({ every: every || 1 })} style={{ width: 80 }} />
        <Select value={rec.unit} disabled={disabled} onChange={(unit) => set({ unit })} options={['day', 'week', 'month', 'year'].map((key) => ({ value: key, label: t(`tasks.v2.rec.units.${key}`) }))} style={{ width: 130 }} />
      </div>
      {rec.unit === 'week' && (
        <div className="te-weekdays">
          {names.map((name, index) => (
            <button
              key={name}
              type="button"
              disabled={disabled}
              className={rec.weekdays.includes(index + 1) ? 'is-on' : ''}
              onClick={() => set({ weekdays: rec.weekdays.includes(index + 1) ? rec.weekdays.filter((d) => d !== index + 1) : [...rec.weekdays, index + 1].sort() })}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="te-inline te-inline--wrap">
        <span>{t('tasks.v2.rec.start')}</span>
        <DatePicker value={dayjs(rec.start)} disabled={disabled} allowClear={false} format="DD.MM.YYYY" onChange={(date) => date && set({ start: date.format('YYYY-MM-DD') })} />
        <span>{t('tasks.v2.rec.time')}</span>
        <TimePicker format="HH:mm" minuteStep={5} value={dayjs(`2000-01-01T${rec.time}`)} disabled={disabled} allowClear={false} needConfirm={false} onChange={(time) => time && set({ time: time.format('HH:mm') })} />
      </div>
      <div className="te-inline te-inline--wrap">
        <span>{t('tasks.v2.rec.end')}</span>
        <Segmented value={rec.end.mode} disabled={disabled} onChange={(mode) => set({ end: { ...rec.end, mode } })} options={['never', 'count', 'date'].map((key) => ({ value: key, label: t(`tasks.v2.rec.endModes.${key}`) }))} />
        {rec.end.mode === 'count' && <InputNumber min={1} max={1000} value={rec.end.count} disabled={disabled} onChange={(count) => set({ end: { ...rec.end, count: count || 1 } })} addonAfter={t('tasks.v2.rec.times')} style={{ width: 140 }} />}
        {rec.end.mode === 'date' && <DatePicker value={rec.end.date ? dayjs(rec.end.date) : null} disabled={disabled} format="DD.MM.YYYY" onChange={(date) => set({ end: { ...rec.end, date: date ? date.format('YYYY-MM-DD') : null } })} />}
      </div>
      <div className="te-inline te-inline--wrap">
        <span>{t('tasks.v2.rec.deadline')}</span>
        <InputNumber min={0} max={1000} value={rec.deadline?.amount || 0} disabled={disabled} onChange={(amount) => set({ deadline: amount ? { amount, unit: rec.deadline?.unit || 'day' } : null })} style={{ width: 80 }} />
        <Select value={rec.deadline?.unit || 'day'} disabled={disabled} onChange={(unit) => set({ deadline: { amount: rec.deadline?.amount || 1, unit } })} options={['hour', 'day', 'week'].map((key) => ({ value: key, label: t(`tasks.v2.units.${key}`) }))} style={{ width: 110 }} />
        <span className="te-muted">{t('tasks.v2.rec.afterCreation')}</span>
      </div>
      <div className="te-inline">
        <span>{t('tasks.v2.rec.weekends')}</span>
        <Segmented value={rec.weekends} disabled={disabled} onChange={(weekends) => set({ weekends })} options={['keep', 'skip'].map((key) => ({ value: key, label: t(`tasks.v2.rec.weekendModes.${key}`) }))} />
      </div>
    </div>
  );
}

export function RecurringBlock({ mode, value, onChange, task, onRemove, onSaveTemplate, disabled }) {
  const { t, locale } = useLocale();
  if (mode === 'task' && task?.template?.recurring) {
    return (
      <Block icon="🔁" title={<HintLabel id="tasks.recurring">{t('tasks.v2.chips.recurring')}</HintLabel>} onRemove={onRemove}>
        <RecurrenceForm value={task.template.recurrence} onChange={(rec) => onSaveTemplate({ ...task.template, recurrence: rec })} disabled={disabled} />
        <div className="te-hint">
          {task.template.active && task.template.nextRunAt
            ? t('tasks.v2.rec.next', { at: new Date(task.template.nextRunAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })
            : t('tasks.v2.rec.finished')}
          {' · '}
          {t('tasks.v2.rec.templateHint')}
        </div>
      </Block>
    );
  }
  return (
    <Block icon="🔁" title={<HintLabel id="tasks.recurring">{t('tasks.v2.chips.recurring')}</HintLabel>} onRemove={onRemove}>
      {mode === 'task' ? (
        <>
          <RecurrenceForm value={value} onChange={onChange} disabled={disabled} />
          <Button type="primary" size="small" onClick={() => onSaveTemplate({ recurrence: value || defaultRecurrence(), make: true })} disabled={disabled}>
            {t('tasks.v2.rec.makeRecurring')}
          </Button>
        </>
      ) : (
        <>
          <RecurrenceForm value={value} onChange={onChange} />
          <div className="te-hint">{t('tasks.v2.rec.draftHint')}</div>
        </>
      )}
    </Block>
  );
}
