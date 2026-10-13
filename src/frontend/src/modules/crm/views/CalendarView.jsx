import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import ruLocale from '@fullcalendar/core/locales/ru';
import { App, Button, Segmented, Select } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDate, nowInZone, useRegional } from '../../../lib/datetime';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import { formatMoney, readStore, userKey, writeStore } from '../lib';
import '../../calendar/calendar.css';

function DealEvent({ arg }) {
  const { amount, currency, stage, locale } = arg.event.extendedProps;
  return (
    <div className="crm-cal-ev">
      <span className="crm-cal-ev__title">{arg.event.title}</span>
      {Number(amount) > 0 && <span className="crm-cal-ev__sum">{formatMoney(amount, currency, locale)}</span>}
      {stage && <span className="crm-cal-ev__stage">{stage.name}</span>}
    </div>
  );
}

/**
 * Deals on a month or week grid by the close date or a custom date field;
 * dragging a deal changes that date.
 */
export default function CalendarView({ params, version, onOpen, onChanged }) {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { message } = App.useApp();
  const { settings } = useCrm();
  const regional = useRegional();
  const prefsKey = userKey(user, 'calendar');
  const [prefs, setPrefs] = useState(() => readStore(prefsKey, { view: 'dayGridMonth', field: 'closeDate' }));
  const [title, setTitle] = useState('');
  const calendarRef = useRef(null);
  const key = JSON.stringify(params);
  const dateFields = useMemo(() => (settings.fields || []).filter((field) => field.type === 'date'), [settings.fields]);
  const field = prefs.field === 'closeDate' || dateFields.some((item) => `cf_${item.key}` === prefs.field) ? prefs.field : 'closeDate';

  const savePrefs = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writeStore(prefsKey, next);
  };

  const source = useCallback(
    (info, success, failure) => {
      crmApi
        .calendar({ ...JSON.parse(key), from: dayjs(info.start).format('YYYY-MM-DD'), to: dayjs(info.end).format('YYYY-MM-DD'), field })
        .then((res) =>
          success(
            (res.data.items || []).map((item) => ({
              id: String(item.dealId),
              title: item.title,
              start: String(item.date).slice(0, 10),
              allDay: true,
              extendedProps: { dealId: item.dealId, amount: item.amount, currency: item.currency, stage: item.stage, locale },
            }))
          )
        )
        .catch((err) => {
          message.error(errorMessage(err));
          failure(err);
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, field, locale, version]
  );

  const sources = useMemo(() => [{ events: source }], [source]);
  const plugins = useMemo(() => [dayGridPlugin, interactionPlugin], []);
  const locales = useMemo(() => [ruLocale], []);
  // Deals sit on calendar days (date-only values), so the grid stays in the
  // device's local mode — a day never shifts. Only "today" follows the person's
  // zone: `now` is their wall-clock time read as local.
  const now = useCallback(() => nowInZone(regional).format('YYYY-MM-DDTHH:mm:ss'), [regional]);
  const hour12 = regional.timeFormat === '12';
  const timeFormat = useMemo(() => ({ hour: 'numeric', minute: '2-digit', hour12 }), [hour12]);
  const views = useMemo(() => ({ dayGridWeek: { dayHeaderFormat: { weekday: 'short', day: 'numeric', month: 'short' } } }), []);

  useEffect(() => {
    calendarRef.current?.getApi().changeView(prefs.view);
  }, [prefs.view]);

  const onDrop = async ({ event, revert }) => {
    const date = dayjs(event.start).format('YYYY-MM-DD');
    const dealId = event.extendedProps.dealId;
    try {
      if (field === 'closeDate') await crmApi.updateDeal(dealId, { closeDate: date });
      else {
        const res = await crmApi.deal(dealId);
        const custom = { ...(res.data.deal.custom || {}), [field.slice(3)]: date };
        await crmApi.updateDeal(dealId, { custom, version: res.data.deal.version });
      }
      message.success(t('crm.cal.moved', { title: event.title, date: fmtDate(date, regional) }));
      onChanged?.();
    } catch (err) {
      revert();
      message.error(errorMessage(err));
    }
  };

  const go = (action) => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (action === 'today') api.today();
    else if (action === 'prev') api.prev();
    else api.next();
  };

  return (
    <div className="crm-cal">
      <div className="crm-cal__bar">
        <Button onClick={() => go('today')}>{t('crm.cal.today')}</Button>
        <div className="crm-cal__nav">
          <Button type="text" onClick={() => go('prev')} aria-label={t('crm.cal.prev')}>‹</Button>
          <Button type="text" onClick={() => go('next')} aria-label={t('crm.cal.next')}>›</Button>
        </div>
        <h2 className="crm-cal__title">{title}</h2>
        <span className="mod-toolbar__grow" />
        <Select
          value={field}
          onChange={(next) => savePrefs({ field: next })}
          options={[{ value: 'closeDate', label: t('crm.fields.closeDate') }, ...dateFields.map((item) => ({ value: `cf_${item.key}`, label: item.label }))]}
          style={{ minWidth: 170 }}
          aria-label={t('crm.cal.field')}
        />
        <Segmented value={prefs.view} onChange={(view) => savePrefs({ view })} options={[{ value: 'dayGridMonth', label: t('crm.cal.month') }, { value: 'dayGridWeek', label: t('crm.cal.week') }]} />
      </div>
      <div className={`cal-view crm-cal__view is-${prefs.view}`}>
        <FullCalendar
          ref={calendarRef}
          plugins={plugins}
          initialView={prefs.view}
          headerToolbar={false}
          locales={locales}
          locale={locale === 'ru' ? 'ru' : 'en-gb'}
          firstDay={regional.weekStart}
          now={now}
          eventTimeFormat={timeFormat}
          slotLabelFormat={timeFormat}
          views={views}
          height="100%"
          editable
          eventDurationEditable={false}
          dayMaxEvents
          eventSources={sources}
          eventContent={(arg) => <DealEvent arg={arg} />}
          eventDidMount={({ el, event }) => el.style.setProperty('--ev', event.extendedProps.stage?.color || '#3B82F6')}
          eventClick={({ event }) => onOpen({ id: event.extendedProps.dealId })}
          eventDrop={onDrop}
          datesSet={(info) => setTitle(info.view.title)}
          noEventsText={t('crm.cal.empty')}
        />
      </div>
    </div>
  );
}
