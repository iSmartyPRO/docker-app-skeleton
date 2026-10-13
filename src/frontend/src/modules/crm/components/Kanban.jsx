import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, pointerWithin, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { inkOn, sumLines } from '../lib';
import DealCard from './DealCard';
import QuickDeal from './QuickDeal';
import { Glyph } from './bits';

const cardId = (deal) => `d${deal.id}`;
const colId = (stage) => `s${stage.id}`;

/** Zones first, then the closest card or column. */
function collision(args) {
  const zones = pointerWithin(args).filter((entry) => String(entry.id).startsWith('zone:'));
  if (zones.length) return zones;
  return closestCorners({ ...args, droppableContainers: args.droppableContainers.filter((entry) => !String(entry.id).startsWith('zone:')) });
}

function SortableDeal({ deal, onOpen, onActivity }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardId(deal), disabled: deal.canEdit === false });
  return (
    <DealCard
      ref={setNodeRef}
      deal={deal}
      onOpen={onOpen}
      onActivity={onActivity}
      dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    />
  );
}

export function StageHead({ stage, first, count, sum }) {
  const { t, locale } = useLocale();
  const lines = sumLines(sum, locale);
  return (
    <header className="crm-col__head">
      <div className={`crm-plate${first ? ' is-first' : ''} is-${stage.kind}`} style={{ '--c': stage.color, '--ink': inkOn(stage.color) }}>
        <span className="crm-plate__name">{stage.name}</span>
        <span className="crm-plate__count" aria-label={t('crm.board.count', { n: count })}>{count}</span>
      </div>
      <div className="crm-col__sum">{lines.length ? lines.map((line) => <span key={line}>{line}</span>) : <span className="is-zero">—</span>}</div>
    </header>
  );
}

function Column({ stage, deals, first, pipeline, onOpen, onActivity, onLoadMore, onCreated, quick }) {
  const { t } = useLocale();
  const { setNodeRef, isOver } = useDroppable({ id: colId(stage) });
  const [loading, setLoading] = useState(false);
  const more = async () => {
    setLoading(true);
    try {
      await onLoadMore(stage);
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className={`crm-col${isOver ? ' is-over' : ''} is-${stage.kind}`} style={{ '--c': stage.color }} aria-label={stage.name}>
      <StageHead stage={stage} first={first} count={stage.count ?? deals.length} sum={stage.sum} />
      {quick && <QuickDeal pipeline={pipeline} stage={stage} onCreated={onCreated} />}
      <SortableContext items={deals.map(cardId)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="crm-col__body">
          {deals.map((deal) => (
            <SortableDeal key={deal.id} deal={deal} onOpen={onOpen} onActivity={onActivity} />
          ))}
          {!deals.length && <div className="crm-col__empty">{stage.kind === 'open' ? t('crm.board.emptyColumn') : t('crm.board.emptyClosed')}</div>}
          {stage.hasMore && (
            <Button className="crm-col__more" type="text" block loading={loading} onClick={more}>
              {t('crm.board.more', { n: Math.max(0, (stage.count || 0) - deals.length) })}
            </Button>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function Zone({ kind, label }) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${kind}` });
  return (
    <div ref={setNodeRef} className={`crm-zone is-${kind}${isOver ? ' is-over' : ''}`}>
      <Glyph name={kind === 'won' ? 'trophy' : 'close'} size={18} />
      <span>{label}</span>
    </div>
  );
}

/**
 * The Kanban: one column per stage, cards dragged between and within columns
 * (mouse, touch after a short press, keyboard). While dragging, Won / Lost
 * zones appear at the bottom. The parent persists:
 * onMove(deal, stageId, { beforeId, afterId }) and onClose(deal, 'won'|'lost').
 */
export default function Kanban({ pipeline, stages, onOpen, onActivity, onMove, onClose, onLoadMore, onCreated, canCreate }) {
  const { t } = useLocale();
  const [columns, setColumns] = useState({});
  const [activeId, setActiveId] = useState(null);
  const origin = useRef(null);
  const scroller = useRef(null);

  useEffect(() => {
    setColumns(Object.fromEntries(stages.map((stage) => [colId(stage), stage.deals || []])));
  }, [stages]);

  const byId = useMemo(() => {
    const map = new Map();
    stages.forEach((stage) => (stage.deals || []).forEach((deal) => map.set(cardId(deal), deal)));
    return map;
  }, [stages]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columnOf = (id) => (columns[id] ? id : Object.keys(columns).find((key) => columns[key].some((deal) => cardId(deal) === id)));

  const reset = () => setColumns(Object.fromEntries(stages.map((stage) => [colId(stage), stage.deals || []])));

  const onDragStart = ({ active }) => {
    setActiveId(active.id);
    origin.current = columnOf(active.id);
  };

  const onDragOver = ({ active, over }) => {
    if (!over || String(over.id).startsWith('zone:')) return;
    const from = columnOf(active.id);
    const to = columnOf(over.id);
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const moving = prev[from].find((deal) => cardId(deal) === active.id);
      if (!moving) return prev;
      const target = [...prev[to]];
      const overIndex = target.findIndex((deal) => cardId(deal) === over.id);
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, moving);
      return { ...prev, [from]: prev[from].filter((deal) => cardId(deal) !== active.id), [to]: target };
    });
  };

  const onDragEnd = ({ active, over }) => {
    setActiveId(null);
    const deal = byId.get(active.id);
    if (!over || !deal) {
      reset();
      return;
    }
    if (String(over.id).startsWith('zone:')) {
      reset();
      onClose(deal, String(over.id).slice(5));
      return;
    }
    const to = columnOf(over.id);
    if (!to) {
      reset();
      return;
    }
    let list = columns[to];
    const oldIndex = list.findIndex((item) => cardId(item) === active.id);
    const newIndex = list.findIndex((item) => cardId(item) === over.id);
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
      list = arrayMove(list, oldIndex, newIndex);
      setColumns((prev) => ({ ...prev, [to]: list }));
    }
    const index = list.findIndex((item) => cardId(item) === active.id);
    if (origin.current === to && oldIndex === newIndex) return;
    onMove(deal, Number(to.slice(1)), { beforeId: list[index - 1]?.id || null, afterId: list[index + 1]?.id || null });
  };

  const active = activeId ? byId.get(activeId) : null;
  const firstOpen = stages.find((stage) => stage.kind === 'open');

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        reset();
      }}
      accessibility={{ screenReaderInstructions: { draggable: t('crm.board.dragHint') } }}
    >
      <div className="crm-board" ref={scroller}>
        {stages.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            pipeline={pipeline}
            first={stage === stages[0]}
            deals={columns[colId(stage)] || []}
            onOpen={onOpen}
            onActivity={onActivity}
            onLoadMore={onLoadMore}
            onCreated={onCreated}
            quick={canCreate && stage === firstOpen}
          />
        ))}
      </div>
      {createPortal(
        <div className={`crm-zones${active ? ' is-on' : ''}`} aria-hidden={!active}>
          <Zone kind="won" label={t('crm.stage.wonDrop')} />
          <Zone kind="lost" label={t('crm.stage.lostDrop')} />
        </div>,
        document.body
      )}
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>{active ? <DealCard deal={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
