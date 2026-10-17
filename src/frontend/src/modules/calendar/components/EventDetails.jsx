import { App, Button, Modal, Tooltip } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtTime, inZone } from '../../../lib/datetime';
import { UserAvatar } from '../../shared/People';
import { calendarApi } from '../api';
import { describeRule } from '../recurrence';
import { reminderLabel } from './EventDialog';
import { askScope } from './scope';
import { dayjsLocale } from '../../../i18n/vendor';

/** "Monday, 13 October, 09:00 – 10:00" in the person's zone and time format. */
export function formatRange(event, locale) {
  const lang = dayjsLocale(locale);
  // All-day values are 'YYYY-MM-DD' days (end exclusive); inZone keeps them as is.
  const start = inZone(event.start).locale(lang);
  if (event.allDay) {
    const end = inZone(event.end || event.start).locale(lang).subtract(1, 'day');
    const day = (value) => value.format('dddd, D MMMM');
    return end.isAfter(start, 'day') ? `${day(start)} — ${day(end)}` : day(start);
  }
  const end = inZone(event.end || event.start).locale(lang);
  const date = start.format('dddd, D MMMM');
  const time = (value) => fmtTime(value.toISOString());
  if (end.isSame(start, 'day')) return `${date}, ${time(start)} – ${time(end)}`;
  return `${date}, ${time(start)} — ${end.format('D MMMM')}, ${time(end)}`;
}

const STATUS_ICON = { accepted: '✓', declined: '✕', tentative: '?', needs: '…', needsAction: '…' };

/** Event card: when, where, who; RSVP for attendees; edit / delete. */
export default function EventDetails({ event, open, onClose, onEdit, onChanged }) {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  if (!event) return null;
  const google = event.source === 'google';

  const remove = async () => {
    let scope = 'all';
    if (event.recurring && !google) {
      scope = await askScope(modal, t, 'delete');
      if (!scope) return;
    } else {
      const ok = await new Promise((resolve) =>
        modal.confirm({
          title: t('calendar.deleteConfirm', { title: event.title }),
          okText: t('common.delete'),
          okButtonProps: { danger: true },
          cancelText: t('common.cancel'),
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        })
      );
      if (!ok) return;
    }
    try {
      if (google) await calendarApi.deleteGoogle(event.googleCalendarId, event.id);
      else await calendarApi.deleteEvent(event.id, { scope, occurrence: event.occurrence });
      message.success(t('calendar.deleted'));
      onChanged?.();
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const respond = async (status) => {
    try {
      await calendarApi.rsvp(event.id, status);
      onChanged?.();
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={520} className="event-details" destroyOnHidden>
      <div className="event-details__head" style={{ '--ev': event.color }}>
        <span className="event-details__bar" />
        <div>
          <h2>{event.title || t('calendar.untitled')}</h2>
          <div className="event-details__when">{formatRange(event, locale)}</div>
          {event.rrule && <div className="event-details__repeat">↻ {describeRule(event.rrule, t, locale)}</div>}
          {google && event.recurring && <div className="event-details__repeat">↻ {t('calendar.repeats')}</div>}
        </div>
      </div>

      <div className="event-details__rows">
        <div className="event-details__row">
          <span className="event-details__icon">▦</span>
          <span>{event.calendarName}{google ? ' · Google' : ''}</span>
        </div>
        {event.location && (
          <div className="event-details__row">
            <span className="event-details__icon">⌖</span>
            <span>{event.location}</span>
          </div>
        )}
        {event.meetingUrl && (
          <div className="event-details__row">
            <span className="event-details__icon">▶</span>
            <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer" className="event-details__join">
              {t('calendar.join')}
            </a>
          </div>
        )}
        {event.reminders?.length > 0 && (
          <div className="event-details__row">
            <span className="event-details__icon">⏰</span>
            <span>{event.reminders.map((minutes) => reminderLabel(minutes, t)).join(', ')}</span>
          </div>
        )}
        {event.description && <div className="event-details__desc">{event.description}</div>}
        {event.attendees?.length > 0 && (
          <div className="event-details__people">
            <strong>{t('calendar.attendeesN', { n: event.attendees.length })}</strong>
            {event.attendees.map((person) => (
              <div key={person.id || person.email} className="event-person">
                {person.id ? <UserAvatar user={person} size={26} tip={false} /> : <span className="event-person__mail">@</span>}
                <span className="event-person__name">
                  {person.name}
                  {event.organizer?.id && person.id === event.organizer.id && <em> · {t('calendar.organizer')}</em>}
                </span>
                <Tooltip title={t(`calendar.rsvp.${person.status === 'needsAction' ? 'needs' : person.status}`)}>
                  <span className={`event-person__status is-${person.status}`}>{STATUS_ICON[person.status] || '…'}</span>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>

      {event.myStatus && event.organizer?.id !== undefined && (
        <div className="event-details__rsvp">
          <span>{t('calendar.going')}</span>
          <Segmented
            value={event.myStatus === 'needs' ? null : event.myStatus}
            onChange={respond}
            options={[
              { value: 'accepted', label: t('calendar.rsvp.accepted') },
              { value: 'tentative', label: t('calendar.rsvp.tentative') },
              { value: 'declined', label: t('calendar.rsvp.declined') },
            ]}
          />
        </div>
      )}

      <div className="event-details__actions">
        {google && event.htmlLink && (
          <Button href={event.htmlLink} target="_blank" rel="noopener noreferrer">
            {t('calendar.openInGoogle')} ↗
          </Button>
        )}
        <span style={{ flex: 1 }} />
        {event.canEdit && (
          <>
            <Button danger onClick={remove}>{t('common.delete')}</Button>
            <Button type="primary" onClick={() => onEdit(event)}>{t('common.edit')}</Button>
          </>
        )}
      </div>
    </Modal>
  );
}
