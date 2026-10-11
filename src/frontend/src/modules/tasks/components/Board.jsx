import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import TaskCard from './TaskCard';

const cardId = (task) => `t${task.id}`;
const columnId = (status) => `s${status.id}`;

function SortableCard({ task, onOpen, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardId(task), disabled });
  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      onOpen={onOpen}
      dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    />
  );
}

function QuickAdd({ onCreate }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const title = value.trim();
    if (!title) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await onCreate(title);
      setValue('');
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <button type="button" className="board-col__add" onClick={() => setOpen(true)}>
        + {t('tasks.addTask')}
      </button>
    );
  }
  return (
    <Input.TextArea
      autoFocus
      autoSize={{ minRows: 2, maxRows: 5 }}
      value={value}
      disabled={busy}
      placeholder={t('tasks.quickPlaceholder')}
      onChange={(event) => setValue(event.target.value)}
      onPressEnter={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
      onBlur={() => !value.trim() && setOpen(false)}
      className="board-col__input"
    />
  );
}

function Column({ status, tasks, onOpen, canEdit, onQuickCreate }) {
  const { t } = useLocale();
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) });
  return (
    <section className={`board-col${isOver ? ' is-over' : ''}`} style={{ '--c': status.color }}>
      <header className="board-col__head">
        <span className="status-pip" />
        <strong>{status.name}</strong>
        <span className="board-col__count">{tasks.length}</span>
      </header>
      <SortableContext items={tasks.map(cardId)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="board-col__body">
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} onOpen={onOpen} disabled={!canEdit(task)} />
          ))}
          {!tasks.length && <div className="board-col__empty">{t('tasks.emptyColumn')}</div>}
        </div>
      </SortableContext>
      {onQuickCreate && <QuickAdd onCreate={(title) => onQuickCreate(title, status.id)} />}
    </section>
  );
}

/**
 * Kanban board. Columns are the project's statuses; cards move between and
 * within columns (mouse, touch with a short press, keyboard). The parent
 * persists the move: onMove(task, statusId, { beforeId, afterId }).
 */
export default function Board({ statuses, tasks, onOpen, onMove, canEdit, onQuickCreate }) {
  const [columns, setColumns] = useState({});
  const [activeId, setActiveId] = useState(null);
  const origin = useRef(null);

  useEffect(() => {
    const next = Object.fromEntries(statuses.map((status) => [columnId(status), []]));
    for (const task of tasks) next[`s${task.statusId}`]?.push(task);
    setColumns(next);
  }, [statuses, tasks]);

  const byId = useMemo(() => new Map(tasks.map((task) => [cardId(task), task])), [tasks]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columnOf = (id) => (columns[id] ? id : Object.keys(columns).find((key) => columns[key].some((task) => cardId(task) === id)));

  const onDragStart = ({ active }) => {
    setActiveId(active.id);
    origin.current = columnOf(active.id);
  };

  const onDragOver = ({ active, over }) => {
    if (!over) return;
    const from = columnOf(active.id);
    const to = columnOf(over.id);
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const moving = prev[from].find((task) => cardId(task) === active.id);
      const target = [...prev[to]];
      const overIndex = target.findIndex((task) => cardId(task) === over.id);
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, moving);
      return { ...prev, [from]: prev[from].filter((task) => cardId(task) !== active.id), [to]: target };
    });
  };

  const onDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const to = columnOf(over.id);
    if (!to) return;
    let list = columns[to];
    const oldIndex = list.findIndex((task) => cardId(task) === active.id);
    const newIndex = list.findIndex((task) => cardId(task) === over.id);
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
      list = arrayMove(list, oldIndex, newIndex);
      setColumns((prev) => ({ ...prev, [to]: list }));
    }
    const index = list.findIndex((task) => cardId(task) === active.id);
    const task = byId.get(active.id);
    const sameColumn = origin.current === to;
    if (sameColumn && oldIndex === newIndex) return;
    onMove(task, Number(to.slice(1)), { beforeId: list[index - 1]?.id || null, afterId: list[index + 1]?.id || null });
  };

  const active = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="board">
        {statuses.map((status) => (
          <Column
            key={status.id}
            status={status}
            tasks={columns[columnId(status)] || []}
            onOpen={onOpen}
            canEdit={canEdit}
            onQuickCreate={onQuickCreate}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        {active ? <TaskCard task={active} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
