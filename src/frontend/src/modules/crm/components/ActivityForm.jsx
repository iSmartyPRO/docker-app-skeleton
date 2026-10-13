import { useState } from 'react';
import dayjs from 'dayjs';
import { App, Button, Input, Select } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { getRegional, inZone } from '../../../lib/datetime';
import { DateField, TimeField } from '../../../components/ui/DateTimeField';
import WhenPicker, { defaultWhen } from '../../../components/ui/WhenPicker';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import { ACTIVITY_KINDS, REMIND_OPTIONS } from '../lib';
import { ActivityIcon } from './bits';
import UserSelect from './UserSelect';

export function KindPicker({ value, onChange }) {
  const { t } = useLocale();
  return (
    <div className="crm-kinds" role="radiogroup" aria-label={t('crm.act.kindLabel')}>
      {ACTIVITY_KINDS.map((kind) => (
        <button key={kind} type="button" role="radio" aria-checked={value === kind} className={value === kind ? 'is-on' : ''} onClick={() => onChange(kind)}>
          <ActivityIcon kind={kind} />
          <span>{t(`crm.act.kind.${kind}`)}</span>
        </button>
      ))}
    </div>
  );
}

/** Any moment (ISO, Date, dayjs) → ISO instant with whole minutes, or null. */
const toIso = (value) => (value ? dayjs(value).second(0).millisecond(0).toISOString() : null);

/** A day ('YYYY-MM-DD') and a wall-clock time ('HH:mm') in the person's zone → ISO instant. */
const joinDayTime = (day, time) => dayjs.tz(`${day}T${time}:00`, getRegional().timeZone).toISOString();

export function remindLabel(minutes, t) {
  if (minutes === null || minutes === undefined) return t('crm.act.remind.none');
  if (minutes === 0) return t('crm.act.remind.atTime');
  if (minutes < 60) return t('crm.act.remind.minutes', { n: minutes });
  if (minutes < 1440) return t('crm.act.remind.hours', { n: minutes / 60 });
  return t('crm.act.remind.days', { n: minutes / 1440 });
}

/**
 * Plan an activity (call, meeting, task…) or edit one. `compact` is the short
 * form of the card's «+ Дело» popover; the full form adds the owner, a
 * reminder and a note.
 */
export default function ActivityForm({ dealId, activity, compact, onDone, onCancel, autoFocus = true }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { message } = App.useApp();
  const { settings } = useCrm();
  const remindersOn = settings.activityReminders !== false;
  const [kind, setKind] = useState(activity?.kind || 'call');
  const [title, setTitle] = useState(activity?.title || '');
  const [note, setNote] = useState(activity?.note || '');
  // The due moment as an ISO instant; the compact form edits its day and time in the person's zone.
  const [due, setDue] = useState(() => (activity ? toIso(activity.dueAt) : toIso(defaultWhen())));
  const dueLocal = inZone(due || toIso(defaultWhen()));
  const [ownerId, setOwnerId] = useState(activity?.owner?.id || user.id);
  const [remind, setRemind] = useState(activity ? activity.remindMinutes ?? null : remindersOn ? 15 : null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const payload = {
      kind,
      title: title.trim() || t(`crm.act.kind.${kind}`),
      note: note.trim(),
      dueAt: due,
      ownerId,
      remindMinutes: due && remindersOn ? remind : null,
    };
    try {
      const res = activity ? await crmApi.updateActivity(activity.id, payload) : await crmApi.addActivity(dealId, payload);
      message.success(activity ? t('crm.act.saved') : t('crm.act.added'));
      if (!activity) {
        setTitle('');
        setNote('');
        setDue(toIso(defaultWhen()));
      }
      onDone?.(res.data.activity);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onKey = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey || !event.shiftKey) && event.target.tagName === 'INPUT') {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className={`crm-actform${compact ? ' is-compact' : ''}`} onKeyDown={onKey}>
      <KindPicker value={kind} onChange={setKind} />
      <Input autoFocus={autoFocus} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t(`crm.act.titlePlaceholder.${kind}`)} maxLength={300} aria-label={t('crm.act.title')} />
      {compact ? (
        <div className="crm-actform__when">
          <DateField value={due ? dueLocal.format('YYYY-MM-DD') : null} onChange={(day) => setDue(day ? joinDayTime(day, dueLocal.format('HH:mm')) : null)} aria-label={t('crm.act.due')} />
          <TimeField value={due ? dueLocal.format('HH:mm') : null} onChange={(time) => time && setDue(joinDayTime(dueLocal.format('YYYY-MM-DD'), time))} needConfirm={false} allowClear={false} aria-label={t('crm.act.time')} />
        </div>
      ) : (
        <>
          <WhenPicker value={due} onChange={(next) => setDue(toIso(next))} />
          <div className="crm-actform__row">
            <label>
              <span>{t('crm.act.owner')}</span>
              <UserSelect value={ownerId} onChange={(id) => setOwnerId(id || user.id)} allowClear={false} />
            </label>
            {remindersOn && (
              <label>
                <span>{t('crm.act.remindLabel')}</span>
                <Select value={remind ?? 'none'} onChange={(next) => setRemind(next === 'none' ? null : next)} options={[{ value: 'none', label: remindLabel(null, t) }, ...REMIND_OPTIONS.map((minutes) => ({ value: minutes, label: remindLabel(minutes, t) }))]} />
              </label>
            )}
          </div>
          <Input.TextArea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('crm.act.notePlaceholder')} autoSize={{ minRows: 1, maxRows: 5 }} maxLength={4000} aria-label={t('crm.act.note')} />
        </>
      )}
      <div className="crm-actform__foot">
        <Button type="primary" loading={busy} onClick={submit}>
          {activity ? t('common.save') : t('crm.act.plan')}
        </Button>
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
      </div>
    </div>
  );
}
