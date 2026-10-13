import { useState } from 'react';
import dayjs from 'dayjs';
import { App, Button, DatePicker, Input, Select, TimePicker } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
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
  const [due, setDue] = useState(() => (activity ? (activity.dueAt ? dayjs(activity.dueAt) : null) : defaultWhen()));
  const [ownerId, setOwnerId] = useState(activity?.owner?.id || user.id);
  const [remind, setRemind] = useState(activity ? activity.remindMinutes ?? null : remindersOn ? 15 : null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const payload = {
      kind,
      title: title.trim() || t(`crm.act.kind.${kind}`),
      note: note.trim(),
      dueAt: due ? due.second(0).millisecond(0).toISOString() : null,
      ownerId,
      remindMinutes: due && remindersOn ? remind : null,
    };
    try {
      const res = activity ? await crmApi.updateActivity(activity.id, payload) : await crmApi.addActivity(dealId, payload);
      message.success(activity ? t('crm.act.saved') : t('crm.act.added'));
      if (!activity) {
        setTitle('');
        setNote('');
        setDue(defaultWhen());
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
          <DatePicker value={due} onChange={(date) => setDue(date ? (due || defaultWhen()).year(date.year()).month(date.month()).date(date.date()) : null)} format="DD.MM.YYYY" aria-label={t('crm.act.due')} />
          <TimePicker value={due} onChange={(time) => time && setDue((due || defaultWhen()).hour(time.hour()).minute(time.minute()))} format="HH:mm" minuteStep={5} needConfirm={false} allowClear={false} aria-label={t('crm.act.time')} />
        </div>
      ) : (
        <>
          <WhenPicker value={due} onChange={setDue} />
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
