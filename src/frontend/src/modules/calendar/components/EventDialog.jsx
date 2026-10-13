import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { App, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Switch, TimePicker } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { HintLabel } from '../../../help/Hint';
import { errorMessage } from '../../../lib/errors';
import { ColorSwatches, userOptions } from '../../shared/People';
import { fromPicker, getRegional, nowInZone, pickerFormat, toPicker, useRegional } from '../../../lib/datetime';
import { calendarApi, calendarLabel } from '../api';
import { WEEKDAYS, customFromRule, presetOf, ruleFromCustom, ruleFromPreset } from '../recurrence';
import { askScope } from './scope';

export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];

export function reminderLabel(minutes, t) {
  if (minutes === 0) return t('calendar.reminder.atStart');
  if (minutes % 1440 === 0) return t('calendar.reminder.days', { n: minutes / 1440 });
  if (minutes % 60 === 0) return t('calendar.reminder.hours', { n: minutes / 60 });
  return t('calendar.reminder.minutes', { n: minutes });
}

function weekdayName(code, locale) {
  const date = dayjs('2024-01-01').add(WEEKDAYS.indexOf(code), 'day');
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short' }).format(date.toDate());
}

function CustomRepeat({ value, onChange, start }) {
  const { t, locale } = useLocale();
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="repeat-custom">
      <div className="repeat-custom__line">
        <span>{t('calendar.repeat.every')}</span>
        <InputNumber min={1} max={99} value={value.interval} onChange={(interval) => set({ interval: interval || 1 })} style={{ width: 72 }} />
        <Select
          value={value.freq}
          onChange={(freq) => set({ freq })}
          style={{ width: 140 }}
          options={['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map((freq) => ({ value: freq, label: t(`calendar.repeat.unit_${freq}`) }))}
        />
      </div>
      {value.freq === 'WEEKLY' && (
        <div className="repeat-days">
          {WEEKDAYS.map((code) => {
            const on = value.days.includes(code);
            return (
              <button
                key={code}
                type="button"
                className={on ? 'is-on' : ''}
                onClick={() => set({ days: on ? value.days.filter((day) => day !== code) : [...value.days, code] })}
              >
                {weekdayName(code, locale)}
              </button>
            );
          })}
        </div>
      )}
      <Radio.Group value={value.end} onChange={(event) => set({ end: event.target.value })} className="repeat-end">
        <Radio value="never">{t('calendar.repeat.endNever')}</Radio>
        <Radio value="until">
          {t('calendar.repeat.endUntil')}{' '}
          <DatePicker size="small" value={value.until} onChange={(until) => set({ until, end: 'until' })} disabledDate={(day) => day.isBefore(dayjs(start), 'day')} />
        </Radio>
        <Radio value="count">
          {t('calendar.repeat.endAfter')}{' '}
          <InputNumber size="small" min={1} max={500} value={value.count} onChange={(count) => set({ count, end: 'count' })} style={{ width: 70 }} /> {t('calendar.repeat.occurrences')}
        </Radio>
      </Radio.Group>
    </div>
  );
}

/*
 * The form holds picker values: dayjs objects whose wall-clock time is the
 * person's (toPicker), so a person in Bishkek working from a laptop set to
 * Moscow still picks *their* 9:00. fromPicker() turns them back into instants.
 */
function combine(date, time) {
  return date.hour(time.hour()).minute(time.minute()).second(0).millisecond(0);
}

/**
 * Create / edit an event in a portal calendar or a writable Google calendar.
 * `draft` = { start, end, allDay, calendarId } for a new event; `event` = an
 * occurrence (portal) or a Google item when editing.
 */
export default function EventDialog({ open, draft, event, calendars, googleCalendars, config, onClose }) {
  const { t } = useLocale();
  const regional = useRegional();
  const timeFormat = pickerFormat(regional).time;
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [users, setUsers] = useState([]);
  const [custom, setCustom] = useState(null);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(event);
  const allDay = Form.useWatch('allDay', form);
  const target = Form.useWatch('target', form);
  const preset = Form.useWatch('repeat', form);
  const startDate = Form.useWatch('startDate', form);
  const isGoogle = String(target || '').startsWith('g:');

  const writable = useMemo(() => calendars.filter((calendar) => calendar.level === 'edit' || calendar.level === 'manage'), [calendars]);

  useEffect(() => {
    if (!open) return;
    calendarApi.subjects().then((res) => setUsers(res.data.users)).catch(() => {});
    const source = event || draft || {};
    const isAllDay = Boolean(source.allDay);
    // All-day values are 'YYYY-MM-DD' (end exclusive), timed ones instants.
    const start = toPicker(source.start || nowInZone().add(1, 'hour').startOf('hour').toISOString());
    let end = source.end ? toPicker(source.end) : start.add(1, 'hour');
    if (isAllDay) end = end.subtract(1, 'day');
    const rule = event?.rrule || null;
    const targetValue = event
      ? event.source === 'google'
        ? `g:${event.googleCalendarId}`
        : `c:${event.calendarId}`
      : draft?.target || `c:${(writable.find((calendar) => calendar.mine) || writable[0])?.id}`;
    setCustom(rule && presetOf(rule, start) === 'custom' ? customFromRule(rule, start) : customFromRule(null, start));
    form.setFieldsValue({
      title: event?.title || '',
      target: targetValue,
      allDay: isAllDay,
      startDate: start,
      startTime: start,
      _prevStartDate: start,
      _prevStartTime: start,
      endDate: end,
      endTime: end,
      repeat: presetOf(rule, start),
      location: event?.location || '',
      meetingUrl: event?.meetingUrl || '',
      description: event?.description || '',
      attendees: (event?.attendees || []).filter((person) => person.id && person.id !== event?.organizer?.id).map((person) => person.id),
      reminders: event ? event.reminders || [] : config?.defaultReminder >= 0 ? [config.defaultReminder] : [],
      color: event?.source === 'google' ? null : event?.color && event.color !== calendars.find((c) => c.id === event.calendarId)?.color ? event.color : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Moving the start keeps the duration. */
  const onValuesChange = (changed, all) => {
    if (changed.startDate || changed.startTime) {
      const prevStart = combine(form.getFieldValue('_prevStartDate') || all.startDate, form.getFieldValue('_prevStartTime') || all.startTime);
      const prevEnd = combine(all.endDate, all.endTime);
      const duration = Math.max(0, prevEnd.diff(prevStart, 'minute'));
      const nextStart = combine(all.startDate, all.startTime);
      const nextEnd = nextStart.add(duration || 60, 'minute');
      form.setFieldsValue({ endDate: nextEnd, endTime: nextEnd });
    }
    form.setFieldsValue({ _prevStartDate: all.startDate, _prevStartTime: all.startTime });
  };

  const submit = async () => {
    const values = await form.validateFields();
    const start = values.allDay ? values.startDate.startOf('day') : combine(values.startDate, values.startTime);
    const end = values.allDay ? values.endDate.startOf('day').add(1, 'day') : combine(values.endDate, values.endTime);
    if (!values.allDay && !end.isAfter(start)) {
      message.error(t('calendar.endBeforeStart'));
      return;
    }
    const rrule = values.repeat === 'custom' ? ruleFromCustom(custom, start) : ruleFromPreset(values.repeat, start);
    const payload = {
      title: values.title,
      allDay: values.allDay,
      start: values.allDay ? start.format('YYYY-MM-DD') : fromPicker(start),
      end: values.allDay ? end.format('YYYY-MM-DD') : fromPicker(end),
      // Repeats keep their wall-clock time in this zone (the person's).
      timezone: getRegional().timeZone,
      rrule,
      location: values.location,
      description: values.description,
    };
    const [kind, rawId] = [values.target.slice(0, 1), values.target.slice(2)];

    setSaving(true);
    try {
      let saved;
      if (kind === 'g') {
        saved = editing
          ? (await calendarApi.updateGoogle({ ...payload, googleCalendarId: rawId, eventId: event.id })).data.event
          : (await calendarApi.createGoogle({ ...payload, googleCalendarId: rawId })).data.event;
      } else {
        const body = {
          ...payload,
          calendarId: Number(rawId),
          meetingUrl: values.meetingUrl,
          attendees: values.attendees || [],
          reminders: values.reminders || [],
          color: values.color || null,
        };
        if (editing) {
          let scope = 'all';
          if (event.recurring) {
            scope = await askScope(modal, t, 'edit');
            if (!scope) return;
          }
          if (scope === 'single') {
            delete body.rrule;
          }
          saved = (await calendarApi.updateEvent(event.id, { ...body, scope, occurrence: event.occurrence })).data.event;
        } else {
          saved = (await calendarApi.createEvent(body)).data.event;
        }
      }
      message.success(t(editing ? 'common.saved' : 'calendar.created'));
      onClose(saved);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const targetOptions = [
    {
      label: t('calendar.portalCalendars'),
      options: writable.map((calendar) => ({
        value: `c:${calendar.id}`,
        label: <span className="status-option"><span className="mod-dot" style={{ '--c': calendar.color }} />{calendarLabel(calendar, t)}</span>,
      })),
    },
    ...(googleCalendars?.length && (!editing || event.source === 'google')
      ? [
          {
            label: 'Google Calendar',
            options: googleCalendars.filter((calendar) => calendar.writable).map((calendar) => ({
              value: `g:${calendar.id}`,
              label: <span className="status-option"><span className="mod-dot" style={{ '--c': calendar.color }} />{calendar.name}</span>,
            })),
          },
        ]
      : []),
  ];

  return (
    <Modal
      open={open}
      title={editing ? t('calendar.editEvent') : t('calendar.newEvent')}
      onCancel={() => onClose(null)}
      onOk={submit}
      okText={editing ? t('common.save') : t('common.create')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      width={640}
      destroyOnHidden
      className="event-dialog"
    >
      <Form form={form} layout="vertical" requiredMark={false} onValuesChange={onValuesChange}>
        <Form.Item name="_prevStartDate" hidden><Input /></Form.Item>
        <Form.Item name="_prevStartTime" hidden><Input /></Form.Item>
        <Form.Item name="title" rules={[{ required: true, message: t('common.required') }]}>
          <Input autoFocus size="large" variant="filled" maxLength={300} placeholder={t('calendar.titlePlaceholder')} className="event-dialog__title" />
        </Form.Item>
        <div className="event-when">
          <Form.Item name="startDate" noStyle><DatePicker allowClear={false} format="dd, D MMM" /></Form.Item>
          {!allDay && <Form.Item name="startTime" noStyle><TimePicker className="event-when__time" allowClear={false} format={timeFormat} use12Hours={regional.timeFormat === '12'} minuteStep={5} needConfirm={false} /></Form.Item>}
          <span className="event-when__dash">—</span>
          {!allDay && <Form.Item name="endTime" noStyle><TimePicker className="event-when__time" allowClear={false} format={timeFormat} use12Hours={regional.timeFormat === '12'} minuteStep={5} needConfirm={false} /></Form.Item>}
          <Form.Item name="endDate" noStyle><DatePicker allowClear={false} format="dd, D MMM" disabledDate={(day) => startDate && day.isBefore(startDate, 'day')} /></Form.Item>
        </div>
        <div className="event-row">
          <label className="toolbar-switch">
            <Form.Item name="allDay" valuePropName="checked" noStyle><Switch size="small" /></Form.Item>
            {t('calendar.allDay')}
          </label>
          <Form.Item name="repeat" noStyle>
            <Select
              style={{ minWidth: 220 }}
              disabled={editing && event.source === 'google' && event.recurring}
              options={['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom'].map((value) => ({ value, label: t(`calendar.repeat.${value}`) }))}
            />
          </Form.Item>
        </div>
        {preset === 'custom' && custom && <CustomRepeat value={custom} onChange={setCustom} start={startDate} />}

        <Form.Item name="target" label={t('calendar.calendar')} rules={[{ required: true }]}>
          <Select options={targetOptions} disabled={editing && event.source === 'google'} />
        </Form.Item>

        {!isGoogle && (
          <Form.Item name="attendees" label={t('calendar.attendees')}>
            <Select mode="multiple" showSearch placeholder={t('calendar.attendeesPlaceholder')} options={userOptions(users)} filterOption={(input, option) => option.search.includes(input.toLowerCase())} />
          </Form.Item>
        )}
        <div className="form-grid-2">
          <Form.Item name="location" label={t('calendar.location')}>
            <Input maxLength={300} placeholder={t('calendar.locationPlaceholder')} />
          </Form.Item>
          {!isGoogle && (
            <Form.Item name="meetingUrl" label={t('calendar.meetingUrl')}>
              <Input maxLength={500} placeholder="https://meet.google.com/…" />
            </Form.Item>
          )}
        </div>
        {!isGoogle && (
          <Form.Item name="reminders" label={<HintLabel id="calendar.reminders">{t('calendar.reminders')}</HintLabel>}>
            <Select mode="multiple" placeholder={t('calendar.noReminders')} options={REMINDER_PRESETS.map((value) => ({ value, label: reminderLabel(value, t) }))} maxCount={5} />
          </Form.Item>
        )}
        <Form.Item name="description" label={t('calendar.description')}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} maxLength={10000} />
        </Form.Item>
        {!isGoogle && (
          <Form.Item name="color" label={t('calendar.eventColor')}>
            <ColorSwatches small />
          </Form.Item>
        )}
        <Checkbox.Group style={{ display: 'none' }} />
      </Form>
    </Modal>
  );
}
