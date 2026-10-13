import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { App, Button, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDateTime, getRegional, inZone, nowInZone } from '../../../lib/datetime';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import DealCard from '../components/DealCard';
import { Empty } from '../components/bits';

/** The column under the pointer; the closest one when the pointer is between columns. */
const collision = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCorners(args);
};

const COLUMNS = ['overdue', 'today', 'week', 'nextWeek', 'later', 'none'];
const TONES = { overdue: '#EF4444', today: '#F59E0B', week: '#3B82F6', nextWeek: '#6366F1', later: '#8B5CF6', none: '#94A3B8' };

/** First day of the week of `date` (the person's week start: 1 Monday, 0 Sunday, 6 Saturday). */
const weekStartOf = (date) => date.subtract((date.day() - getRegional().weekStart + 7) % 7, 'day').startOf('day');

/**
 * New due moment of the nearest activity when its deal is dropped in a column;
 * the time of day (in the person's zone) stays. Overdue and «no activities» are
 * not drop targets. Works on dayjs objects in the person's zone.
 */
export function dueFor(column, dueAt) {
  const now = nowInZone();
  const old = dueAt ? inZone(dueAt) : now.hour(10).minute(0);
  const zone = getRegional().timeZone;
  // Re-anchor in the zone so the wall-clock time survives a DST change between the days.
  const at = (day) => dayjs.tz(`${day.format('YYYY-MM-DD')}T${old.format('HH:mm')}:00`, zone);
  const thisMonday = weekStartOf(now);
  switch (column) {
    case 'today': {
      const target = at(now);
      return target.isBefore(now) ? now.add(1, 'hour').minute(0).second(0).millisecond(0) : target;
    }
    case 'week': {
      const tomorrow = now.add(1, 'day');
      return tomorrow.isBefore(thisMonday.add(7, 'day')) ? at(tomorrow) : at(thisMonday.add(6, 'day'));
    }
    case 'nextWeek':
      return at(thisMonday.add(7, 'day'));
    case 'later':
      return at(thisMonday.add(14, 'day'));
    default:
      return null;
  }
}

function DraggableDeal({ deal, onOpen, onActivity, stage }) {
  const disabled = !deal.activity?.next || deal.canEdit === false;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `d${deal.id}`, disabled });
  return <DealCard ref={setNodeRef} deal={deal} onOpen={onOpen} onActivity={onActivity} dragging={isDragging} showStage stage={stage} {...attributes} {...listeners} />;
}

function Column({ column, onOpen, onActivity, stageById, onMore }) {
  const { t } = useLocale();
  const droppable = column.key !== 'none' && column.key !== 'overdue';
  const { setNodeRef, isOver } = useDroppable({ id: `c:${column.key}`, disabled: !droppable });
  return (
    <section className={`crm-col crm-acol is-${column.key}${isOver ? ' is-over' : ''}`} style={{ '--c': TONES[column.key] }} aria-label={t(`crm.acts.col.${column.key}`)}>
      <header className="crm-acol__head">
        <span className="status-pip" />
        <strong>{t(`crm.acts.col.${column.key}`)}</strong>
        <span className="crm-acol__count">{column.count ?? column.deals.length}</span>
      </header>
      <div ref={setNodeRef} className="crm-col__body">
        {column.deals.map((deal) => (
          <DraggableDeal key={deal.id} deal={deal} onOpen={onOpen} onActivity={onActivity} stage={stageById(deal.stageId)} />
        ))}
        {!column.deals.length && <div className="crm-col__empty">{t(`crm.acts.empty.${column.key}`)}</div>}
        {column.hasMore && (
          <Button className="crm-col__more" type="text" block onClick={() => onMore(column)}>
            {t('crm.board.more', { n: Math.max(0, column.count - column.deals.length) })}
          </Button>
        )}
      </div>
    </section>
  );
}

/** Deals by their nearest open activity; drag to reschedule that activity. */
export default function ActivitiesView({ params, version, onOpen, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { stageById } = useCrm();
  const [columns, setColumns] = useState(null);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null);
  const key = JSON.stringify(params);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await crmApi.activityBoard(JSON.parse(key));
      if (mine !== seq.current) return;
      const byKey = Object.fromEntries((res.data.columns || []).map((column) => [column.key, column]));
      setColumns(COLUMNS.map((name) => ({ key: name, deals: byKey[name]?.deals || [], count: byKey[name]?.count ?? (byKey[name]?.deals || []).length, hasMore: Boolean(byKey[name]?.hasMore) })));
      setError(null);
    } catch (err) {
      if (mine === seq.current) setError(err);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load, version]);

  const onMore = async (column) => {
    try {
      const res = await crmApi.activityBoard({ ...JSON.parse(key), column: column.key, offset: column.deals.length });
      const page = (res.data.columns || [])[0];
      if (!page) return;
      setColumns((prev) =>
        prev.map((item) => {
          if (item.key !== column.key) return item;
          const seen = new Set(item.deals.map((deal) => deal.id));
          return { ...item, deals: [...item.deals, ...page.deals.filter((deal) => !seen.has(deal.id))], hasMore: page.hasMore };
        })
      );
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const onDragEnd = async ({ active: dragged, over }) => {
    setActive(null);
    if (!over) return;
    const target = String(over.id).slice(2);
    const from = columns.find((column) => column.deals.some((deal) => `d${deal.id}` === dragged.id));
    const deal = from?.deals.find((item) => `d${item.id}` === dragged.id);
    if (!deal || !from || from.key === target) return;
    if (target === 'none' || target === 'overdue') {
      message.info(t('crm.acts.cannotDrop'));
      return;
    }
    const next = deal.activity.next;
    const dueAt = dueFor(target, next.dueAt);
    const moved = { ...deal, activity: { ...deal.activity, next: { ...next, dueAt: dueAt.toISOString(), overdue: false }, overdue: Math.max(0, (deal.activity.overdue || 0) - (next.overdue ? 1 : 0)) } };
    const previous = columns;
    setColumns((prev) =>
      prev.map((column) => {
        if (column.key === from.key) return { ...column, deals: column.deals.filter((item) => item.id !== deal.id), count: Math.max(0, column.count - 1) };
        if (column.key === target) return { ...column, deals: [moved, ...column.deals], count: column.count + 1 };
        return column;
      })
    );
    try {
      await crmApi.updateActivity(next.id, { dueAt: dueAt.toISOString() });
      message.success(t('crm.acts.moved', { when: fmtDateTime(dueAt.toISOString()) }));
      onChanged?.();
    } catch (err) {
      setColumns(previous);
      message.error(errorMessage(err));
    }
  };

  if (error && !columns) return <Empty title={t('crm.loadError')} text={errorMessage(error)} action={<Button onClick={load}>{t('common.retry')}</Button>} />;
  if (!columns) {
    return (
      <div className="crm-board is-loading" aria-busy="true">
        {COLUMNS.map((name) => (
          <div key={name} className="crm-col is-skeleton">
            <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 0 }} />
            <div className="crm-card-skel" />
          </div>
        ))}
      </div>
    );
  }

  const activeDeal = active && columns.flatMap((column) => column.deals).find((deal) => `d${deal.id}` === active);

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={({ active: item }) => setActive(item.id)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="crm-board crm-board--acts">
        {columns.map((column) => (
          <Column key={column.key} column={column} onMore={onMore} onOpen={onOpen} onActivity={() => { load(); onChanged?.(); }} stageById={stageById} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>{activeDeal ? <DealCard deal={activeDeal} overlay showStage stage={stageById(activeDeal.stageId)} /> : null}</DragOverlay>
    </DndContext>
  );
}
