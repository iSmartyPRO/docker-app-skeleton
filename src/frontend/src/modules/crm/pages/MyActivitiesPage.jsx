import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { App, Button, Checkbox, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { crmApi, listOf } from '../api';
import { useCrm } from '../CrmContext';
import { formatDue } from '../lib';
import { ActivityIcon, Empty, StageTag } from '../components/bits';

const GROUPS = ['overdue', 'today', 'tomorrow', 'later', 'noDue'];

function groupOf(activity) {
  if (!activity.dueAt) return 'noDue';
  const due = dayjs(activity.dueAt);
  if (due.isBefore(dayjs())) return 'overdue';
  if (due.isSame(dayjs(), 'day')) return 'today';
  if (due.isSame(dayjs().add(1, 'day'), 'day')) return 'tomorrow';
  return 'later';
}

/** /app/crm/activities — «Мои дела»: my open activities across all deals. */
export default function MyActivitiesPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { touch, version } = useCrm();
  const [items, setItems] = useState(null);
  const [done, setDone] = useState(() => new Set());

  const load = useCallback(async () => {
    try {
      const res = await crmApi.myActivities({ limit: 200 });
      setItems(listOf(res.data, 'activities'));
    } catch (err) {
      message.error(errorMessage(err));
      setItems([]);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load, version]);

  const complete = async (activity) => {
    setDone((prev) => new Set(prev).add(activity.id));
    try {
      await crmApi.updateActivity(activity.id, { done: true });
      message.success(t('crm.act.doneToast'));
      setTimeout(() => setItems((list) => list.filter((item) => item.id !== activity.id)), 500);
      touch();
    } catch (err) {
      setDone((prev) => {
        const next = new Set(prev);
        next.delete(activity.id);
        return next;
      });
      message.error(errorMessage(err));
    }
  };

  const grouped = GROUPS.map((key) => ({ key, items: (items || []).filter((item) => groupOf(item) === key) })).filter((group) => group.items.length);

  return (
    <div className="crm-page crm-page--narrow">
      <header className="crm-head">
        <div>
          <h1>{t('crm.my.title')}</h1>
          <p>{items ? t('crm.my.lead', { n: items.length }) : '…'}</p>
        </div>
        <Button onClick={() => navigate('/app/crm/deals/activities?mine=1')}>{t('crm.my.board')} →</Button>
      </header>
      {!items ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !items.length ? (
        <Empty icon="check" title={t('crm.my.empty')} text={t('crm.my.emptyText')} action={<Button type="primary" onClick={() => navigate('/app/crm')}>{t('crm.my.toDeals')}</Button>} />
      ) : (
        <div className="crm-my">
          {grouped.map((group) => (
            <section key={group.key} className={`crm-my__group is-${group.key}`}>
              <header className="crm-my__head">
                <strong>{t(`crm.my.groups.${group.key}`)}</strong>
                <span className="crm-my__count">{group.items.length}</span>
              </header>
              {group.items.map((activity) => (
                <div key={activity.id} className={`crm-my__row${done.has(activity.id) ? ' is-done' : ''}`}>
                  <Checkbox checked={done.has(activity.id)} disabled={done.has(activity.id)} onChange={() => complete(activity)} aria-label={t('crm.act.markDone', { title: activity.title })} />
                  <span className="dp-todo__kind"><ActivityIcon kind={activity.kind} /></span>
                  <div className="crm-my__main">
                    <span className="crm-my__title">{activity.title}</span>
                    {activity.deal && (
                      <button type="button" className="crm-my__deal" onClick={() => navigate(`/app/crm/deals/${activity.deal.id}`)}>
                        {activity.deal.title}
                        <StageTag stage={activity.deal.stage} />
                      </button>
                    )}
                  </div>
                  <span className={`crm-my__due${group.key === 'overdue' ? ' is-overdue' : ''}`}>{formatDue(activity.dueAt, locale, t)}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
