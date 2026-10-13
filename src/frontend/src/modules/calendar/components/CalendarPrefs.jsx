import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Drawer, InputNumber, Segmented, Select, Switch } from 'antd';
import { TimeField } from '../../../components/ui/DateTimeField';
import { useRegional } from '../../../lib/datetime';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { Hint } from '../../../help/Hint';
import { calendarApi, calendarLabel } from '../api';

/** Personal calendar settings: how it looks, what it shows, defaults for new events. */
export default function CalendarPrefs({ open, prefs, calendars, tasksAvailable, onClose, onSaved }) {
  const { t } = useLocale();
  const regional = useRegional();
  const { message } = App.useApp();
  const [draft, setDraft] = useState(prefs);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setDraft(prefs);
  }, [open, prefs]);
  if (!draft) return null;
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const save = async (body = draft) => {
    setSaving(true);
    try {
      const res = await calendarApi.savePrefs(body);
      onSaved(res.data.prefs);
      message.success(t('calendarPrefs.saved'));
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    const res = await calendarApi.resetPrefs();
    onSaved(res.data.prefs);
    setDraft(res.data.prefs);
  };
  const row = (key, control, hint) => (
    <div className="calp-row">
      <div>
        <strong>
          {t(`calendarPrefs.${key}`)}
          {hint && <Hint id={`calendar.${hint}`} />}
        </strong>
        <span>{t(`calendarPrefs.${key}Desc`)}</span>
      </div>
      {control}
    </div>
  );
  const writable = calendars.filter((calendar) => calendar.level === 'edit' || calendar.level === 'manage');

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={460}
      title={t('calendarPrefs.title')}
      className="calp"
      destroyOnHidden
      footer={
        <div className="calp-foot">
          <Button type="primary" loading={saving} onClick={() => save()}>
            {t('common.save')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <span style={{ flex: 1 }} />
          <Button type="text" onClick={reset}>
            {t('calendarPrefs.reset')}
          </Button>
        </div>
      }
    >
      <h4 className="calp-h">{t('calendarPrefs.look')}</h4>
      {row(
        'defaultView',
        <Select
          value={draft.defaultView}
          onChange={(defaultView) => set({ defaultView })}
          style={{ width: 170 }}
          options={['month', 'week', 'workweek', 'day', 'agenda'].map((key) => ({ value: key, label: t(`calendar.view.${key}`) }))}
        />
      )}
      {row(
        'weekStart',
        // The week start is a regional setting (portal-wide, overridable per person
        // in Account → Appearance); the calendar follows it instead of keeping its own.
        <Link to="/account/appearance" onClick={onClose}>
          {t(`regional.${{ 1: 'monday', 0: 'sunday', 6: 'saturday' }[regional.weekStart] || 'monday'}`)} →
        </Link>
      )}
      {row(
        'hours',
        <div className="calp-hours">
          <TimeField value={draft.dayStart} minuteStep={30} allowClear={false} needConfirm={false} onChange={(value) => value && set({ dayStart: value })} />
          <span>—</span>
          <TimeField value={draft.dayEnd} minuteStep={30} allowClear={false} needConfirm={false} onChange={(value) => value && set({ dayEnd: value })} />
        </div>,
        'workHours'
      )}
      {row('slotMinutes', <Segmented value={draft.slotMinutes} onChange={(slotMinutes) => set({ slotMinutes })} options={[15, 30, 60].map((n) => ({ value: n, label: `${n}′` }))} />)}
      {row('showWeekends', <Switch checked={draft.showWeekends} onChange={(showWeekends) => set({ showWeekends })} />)}
      {row('showWeekNumbers', <Switch checked={draft.showWeekNumbers} onChange={(showWeekNumbers) => set({ showWeekNumbers })} />)}
      {row('showDeclined', <Switch checked={draft.showDeclined} onChange={(showDeclined) => set({ showDeclined })} />)}

      {tasksAvailable && (
        <>
          <h4 className="calp-h">{t('calendarPrefs.tasks')}</h4>
          {row('showTasks', <Switch checked={draft.showTasks} onChange={(showTasks) => set({ showTasks })} />, 'tasks')}
          {draft.showTasks && (
            <>
              {row(
                'taskScope',
                <Select
                  value={draft.taskScope}
                  onChange={(taskScope) => set({ taskScope })}
                  style={{ width: 200 }}
                  options={['doing', 'participant', 'all'].map((key) => ({ value: key, label: t(`calendarPrefs.scope.${key}`) }))}
                />,
                'taskScope'
              )}
              {row('showDoneTasks', <Switch checked={draft.showDoneTasks} onChange={(showDoneTasks) => set({ showDoneTasks })} />)}
              {row(
                'taskDuration',
                <Select value={draft.taskDuration} onChange={(taskDuration) => set({ taskDuration })} style={{ width: 130 }} options={[15, 30, 60].map((n) => ({ value: n, label: t('calendarPrefs.minutes', { n }) }))} />
              )}
            </>
          )}
        </>
      )}

      <h4 className="calp-h">{t('calendarPrefs.newEvents')}</h4>
      {row(
        'defaultCalendarId',
        <Select
          value={draft.defaultCalendarId || undefined}
          onChange={(defaultCalendarId) => set({ defaultCalendarId: defaultCalendarId || null })}
          allowClear
          placeholder={t('calendar.myCalendar')}
          style={{ width: 200 }}
          options={writable.map((calendar) => ({ value: calendar.id, label: calendarLabel(calendar, t) }))}
        />
      )}
      {row(
        'defaultDuration',
        <Select value={draft.defaultDuration} onChange={(defaultDuration) => set({ defaultDuration })} style={{ width: 130 }} options={[15, 30, 45, 60, 90, 120].map((n) => ({ value: n, label: t('calendarPrefs.minutes', { n }) }))} />
      )}
      {row(
        'defaultReminder',
        <div className="calp-hours">
          <Switch checked={draft.defaultReminder >= 0} onChange={(on) => set({ defaultReminder: on ? 15 : -1 })} />
          {draft.defaultReminder >= 0 && (
            <InputNumber min={0} max={10080} value={draft.defaultReminder} onChange={(value) => set({ defaultReminder: value ?? 0 })} addonAfter={t('calendarPrefs.min')} style={{ width: 130 }} />
          )}
        </div>,
        'reminders'
      )}
    </Drawer>
  );
}
