import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Segmented, Skeleton, Space } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { intlOptions, todayISO } from '../../../lib/datetime';
import { localeTag } from '../../../lib/format';
import { HelpButton } from '../../../help/Hint';
import { useContracts } from '../ContractsContext';
import { contractsApi } from '../api';
import { daysLeft, formatMoney } from '../lib';
import { Avatar, Empty, Money, StatusPill } from '../components/bits';
import ContractCard from '../card/ContractCard';

const monthKey = (day) => day.slice(0, 7);
const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

/** Totals per currency: «120 000 $ · 3 500 000 сом». */
function totals(items, locale) {
  const sums = new Map();
  for (const item of items) {
    if (item.framework || item.amount === null || item.amount === undefined) continue;
    sums.set(item.currency || '', (sums.get(item.currency || '') || 0) + Number(item.amount));
  }
  return [...sums.entries()].map(([currency, sum]) => formatMoney(sum, currency, locale)).join(' · ');
}

/**
 * «Календарь окончаний»: twelve months ahead as a heat strip (how many
 * contracts end, how many refusal deadlines fall in each month), then the
 * months one under another with their contracts by day. A card opens on top.
 */
export default function CalendarPage() {
  const { t, locale } = useLocale();
  const { version } = useContracts();
  const [from, setFrom] = useState(() => todayISO().slice(0, 7));
  const [scope, setScope] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const sectionRefs = useRef(new Map());
  const today = todayISO();

  useEffect(() => {
    let alive = true;
    setData(null);
    contractsApi
      .calendar({ from, months: 12 })
      .then((res) => alive && (setData(res.data), setError(null)))
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, [from, version]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => addMonths(from, i)), [from]);
  const monthName = (ym, style = 'long') =>
    new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(localeTag(locale), intlOptions({ month: style, year: style === 'long' ? 'numeric' : undefined, timeZone: 'UTC' }));

  const events = useMemo(() => {
    const out = [];
    for (const item of data?.items || []) {
      if (scope === 'refusal' && !item.noticeDeadline) continue;
      if (item.endsOn && scope !== 'refusal') out.push({ key: `e${item.id}`, kind: 'end', day: item.endsOn, item });
      if (item.noticeDeadline) out.push({ key: `n${item.id}`, kind: 'notice', day: item.noticeDeadline, item });
    }
    return out.filter((event) => months.includes(monthKey(event.day))).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.kind === 'notice' ? -1 : 1));
  }, [data, months, scope]);

  const byMonth = useMemo(() => {
    const map = new Map(months.map((ym) => [ym, []]));
    for (const event of events) map.get(monthKey(event.day))?.push(event);
    return map;
  }, [events, months]);
  const max = Math.max(1, ...[...byMonth.values()].map((list) => list.length));

  const jump = (ym) => sectionRefs.current.get(ym)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="ctr-page">
      <header className="ctr-page__head is-stack">
        <div className="ctr-page__title">
          <h1>
            {t('contracts.calendar.title')} <HelpButton id="contracts" section="calendar" />
          </h1>
          <p>{t('contracts.calendar.subtitle')}</p>
        </div>
        <div className="ctr-page__actions">
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: t('contracts.calendar.all') },
              { value: 'refusal', label: t('contracts.calendar.refusals') },
            ]}
          />
          <Space.Compact>
            <Button icon={<LeftOutlined />} onClick={() => setFrom(addMonths(from, -12))} aria-label={t('contracts.calendar.prev')} title={t('contracts.calendar.prev')} />
            <Button onClick={() => setFrom(today.slice(0, 7))}>{t('contracts.calendar.now')}</Button>
            <Button icon={<RightOutlined />} onClick={() => setFrom(addMonths(from, 12))} aria-label={t('contracts.calendar.next')} title={t('contracts.calendar.next')} />
          </Space.Compact>
        </div>
      </header>

      {error ? (
        <Empty icon="⚠️" title={t('contracts.loadError')} text={errorMessage(error)} />
      ) : !data ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          <div className="ctr-heat" role="list">
            {months.map((ym) => {
              const list = byMonth.get(ym) || [];
              const ends = list.filter((event) => event.kind === 'end').length;
              const notices = list.filter((event) => event.kind === 'notice').length;
              const level = list.length ? Math.ceil((list.length / max) * 4) : 0;
              return (
                <button key={ym} type="button" role="listitem" className={`ctr-heat__cell lvl-${level}${ym === today.slice(0, 7) ? ' is-now' : ''}`} onClick={() => jump(ym)} disabled={!list.length}>
                  <span className="ctr-heat__month">{monthName(ym, 'short')}</span>
                  <strong>{ends || (notices ? '' : '—')}</strong>
                  {notices > 0 && <span className="ctr-heat__notice">↻ {notices}</span>}
                  {ym.endsWith('-01') && <span className="ctr-heat__year">{ym.slice(0, 4)}</span>}
                </button>
              );
            })}
          </div>
          <div className="ctr-heat__legend">
            <span>{t('contracts.calendar.legendEnds')}</span>
            <span>↻ {t('contracts.calendar.legendNotice')}</span>
          </div>

          {!events.length ? (
            <Empty icon="📅" title={t('contracts.calendar.empty')} text={t('contracts.calendar.emptyHint')} />
          ) : (
            <div className="ctr-months">
              {months.map((ym) => {
                const list = byMonth.get(ym) || [];
                if (!list.length) return null;
                const sum = totals(list.filter((event) => event.kind === 'end').map((event) => event.item), locale);
                return (
                  <section key={ym} className="ctr-month" ref={(el) => sectionRefs.current.set(ym, el)}>
                    <header className="ctr-month__head">
                      <h2>{monthName(ym)}</h2>
                      {list.some((event) => event.kind === 'end') && <span>{t('contracts.calendar.monthCount', { n: list.filter((event) => event.kind === 'end').length })}</span>}
                      {list.some((event) => event.kind === 'notice') && <span className="ctr-month__notice">↻ {t('contracts.calendar.monthNotice', { n: list.filter((event) => event.kind === 'notice').length })}</span>}
                      {sum && <span className="ctr-month__sum">{sum}</span>}
                    </header>
                    <ul className="ctr-month__list">
                      {list.map((event) => {
                        const left = daysLeft(event.day, today);
                        const d = new Date(`${event.day}T12:00:00Z`);
                        return (
                          <li key={event.key}>
                            <button type="button" className={`ctr-cal-row is-${event.kind}${left < 0 ? ' is-past' : left <= 7 ? ' is-soon' : ''}`} onClick={() => setOpenId(event.item.id)}>
                              <span className="ctr-cal-row__day">
                                <strong>{d.getUTCDate()}</strong>
                                <em>{d.toLocaleDateString(localeTag(locale), { weekday: 'short', timeZone: 'UTC' })}</em>
                              </span>
                              <span className={`ctr-cal-row__kind is-${event.kind}`}>{event.kind === 'end' ? (event.item.autoRenew ? t('contracts.calendar.renews') : t('contracts.calendar.ends')) : t('contracts.calendar.refusalBy')}</span>
                              <span className="ctr-cal-row__main">
                                <strong>{event.item.counterparty || event.item.title}</strong>
                                <em>
                                  {event.item.number} · {event.item.title}
                                </em>
                              </span>
                              <span className="ctr-cal-row__amount">
                                <Money contract={event.item} />
                              </span>
                              <StatusPill status={event.item.status} />
                              <Avatar user={event.item.owner} size={22} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
      {openId && <ContractCard id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
