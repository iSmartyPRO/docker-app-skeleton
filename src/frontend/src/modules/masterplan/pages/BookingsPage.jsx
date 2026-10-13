import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Segmented, Select, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDateTime, inZone, nowInZone } from '../../../lib/datetime';
import { HelpButton } from '../../../help/Hint';
import { mpApi } from '../api';
import { useMp } from '../MpContext';
import { formatMoney } from '../lib';
import { Countdown, Empty, StatusTag } from '../components/bits';
import UnitCard from '../components/UnitCard';

/** Брони (spec §9.7): active reserves and bookings with a countdown, "today / tomorrow" highlighted, actions by right. */
export default function BookingsPage() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { projects } = useMp();
  const [scope, setScope] = useState('mine');
  const [project, setProject] = useState(null);
  const [kind, setKind] = useState('all');
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await mpApi.bookings({ scope, project: project || undefined, kind: kind === 'all' ? undefined : kind });
      setItems(res.data.bookings);
    } catch (err) {
      message.error(errorMessage(err));
      setItems([]);
    }
  }, [scope, project, kind, message]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  const groups = useMemo(() => {
    const today = nowInZone();
    const out = { today: [], tomorrow: [], later: [] };
    for (const item of items || []) {
      const end = inZone(item.endsAt);
      if (end.isSame(today, 'day') || end.isBefore(today)) out.today.push(item);
      else if (end.isSame(today.add(1, 'day'), 'day')) out.tomorrow.push(item);
      else out.later.push(item);
    }
    return out;
  }, [items]);

  const extend = async (item) => {
    try {
      const res = await mpApi.extend(item.unit.id, { version: item.unit.version });
      message.success(t('mp.action.extended', { when: fmtDateTime(res.data.endsAt) }));
      load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div className="mp-page">
      <header className="mp-head">
        <div>
          <h1>{t('mp.nav.bookings')}</h1>
          <p>{t('mp.bookings.lead')}</p>
        </div>
        <div className="mp-head__actions">
          <HelpButton id="masterplan" section="bookings" />
        </div>
      </header>
      <div className="mod-toolbar">
        <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: t('mp.bookings.mine') }, { value: 'all', label: t('mp.bookings.all') }]} />
        <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: t('mp.bookings.any') }, { value: 'reserve', label: t('mp.status.reserve') }, { value: 'booking', label: t('mp.status.booking') }]} />
        {projects.length > 1 && <Select allowClear value={project} onChange={setProject} placeholder={t('mp.bookings.allProjects')} options={projects.map((item) => ({ value: item.id, label: item.name }))} style={{ minWidth: 200 }} />}
      </div>
      {!items ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !items.length ? (
        <Empty icon="⏳" title={t('mp.bookings.empty')} text={t('mp.bookings.emptyText')} />
      ) : (
        ['today', 'tomorrow', 'later'].map((key) =>
          groups[key].length ? (
            <section key={key} className={`mp-bookings is-${key}`}>
              <h2>{t(`mp.bookings.${key}`)} <span>{groups[key].length}</span></h2>
              <ul>
                {groups[key].map((item) => (
                  <li key={item.id} className="mp-booking">
                    <button type="button" className="mp-booking__unit" onClick={() => setOpen(item.unit.id)}>
                      <b>{item.unit.code || item.unit.name}</b>
                      <span>{item.unit.projectName}</span>
                    </button>
                    <StatusTag status={item.kind} />
                    <Countdown endsAt={item.endsAt} short />
                    <span className="mp-booking__who">{item.manager?.name}</span>
                    <span className="mp-booking__client">{item.client?.name || (item.client === undefined ? '' : '—')}</span>
                    {item.deal && <Link to={`/app/crm/deals/${item.deal.id}`} className="mp-booking__deal">{item.deal.title}</Link>}
                    {item.price && <span className="mp-money">{formatMoney(item.price.amount, item.price.currency, locale)}</span>}
                    <span className="mp-booking__ext">{item.extensions ? t('mp.bookings.extended', { n: item.extensions }) : ''}</span>
                    <span className="mp-booking__actions">
                      {item.canExtend && <Button size="small" onClick={() => extend(item)}>{t('mp.action.extend')}</Button>}
                      {(item.canRelease || item.canBook || item.canDeposit) && <Button size="small" onClick={() => setOpen(item.unit.id)}>{t('mp.bookings.open')}</Button>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        )
      )}
      {open && <UnitCard key={open} nodeId={open} onClose={() => setOpen(null)} onChanged={() => load()} />}
    </div>
  );
}
