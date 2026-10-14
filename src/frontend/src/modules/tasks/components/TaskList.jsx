import { useState } from 'react';
import { Checkbox } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { Person } from '../../shared/People';
import { ChecklistBadge, CommentBadge, DueChip, LabelTag, PriorityIcon } from './bits';
import { AcceptBadge, OrderBadge, isLate } from './acceptance';

function Row({ task, onOpen, onToggle, showProject, canEdit }) {
  const done = task.statusCategory === 'done';
  return (
    <div className={`task-row${done ? ' is-done' : ''}${isLate(task) ? ' is-late' : ''}`} role="button" tabIndex={0} onClick={() => onOpen(task)} onKeyDown={(event) => event.key === 'Enter' && onOpen(task)}>
      <span className="task-row__check" onClick={(event) => event.stopPropagation()} role="presentation">
        <Checkbox checked={done} disabled={!canEdit(task)} onChange={(event) => onToggle(task, event.target.checked)} />
      </span>
      <PriorityIcon value={task.priority} />
      <span className="task-row__ref">
        {showProject && <span className="mod-dot" style={{ '--c': task.project.color }} />}
        {task.ref}
      </span>
      <span className="task-row__title">
        {task.important && <span className="task-flame" title="🔥">🔥</span>}
        <span>{task.title}</span>
        <OrderBadge task={task} compact />
        <AcceptBadge task={task} compact />
        {task.deferred && <span className="task-deferred">⏸</span>}
        {task.subtasks > 0 && <span className="task-subs">⤵ {task.subtasks}</span>}
        {task.labels.slice(0, 2).map((label) => (
          <LabelTag key={label} label={label} />
        ))}
      </span>
      <span className="task-row__meta">
        <ChecklistBadge done={task.checklist.done} total={task.checklist.total} />
        <CommentBadge count={task.comments} />
      </span>
      <span className="task-row__due">
        <DueChip dueAt={task.dueAt} dueTime={task.dueTime} done={done} compact />
      </span>
      <span className="task-row__who">{task.assignee ? <Person user={task.assignee} /> : <span className="task-row__none">—</span>}</span>
    </div>
  );
}

/**
 * Tasks grouped into sections (statuses of a project, or date buckets for
 * "My tasks"). Sections can collapse; done ones start collapsed.
 */
export default function TaskList({ groups, onOpen, onToggle, showProject, canEdit = () => true }) {
  const { t } = useLocale();
  const [collapsed, setCollapsed] = useState(() => new Set(groups.filter((group) => group.collapsed).map((group) => group.key)));
  const toggle = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <div className="task-list">
      {groups.map((group) =>
        group.tasks.length || group.alwaysShow ? (
          <section key={group.key} className={`task-group${group.tone ? ` is-${group.tone}` : ''}`} style={{ '--c': group.color }}>
            <button type="button" className="task-group__head" onClick={() => toggle(group.key)}>
              <span className={`task-group__caret${collapsed.has(group.key) ? '' : ' is-open'}`} aria-hidden="true"><RightOutlined /></span>
              {group.color && <span className="status-pip" />}
              <strong>{group.label}</strong>
              <span className="task-group__count">{group.tasks.length}</span>
            </button>
            {group.hint && !collapsed.has(group.key) && <div className="task-group__hint">{group.hint}</div>}
            {!collapsed.has(group.key) && (
              <div className="task-group__rows">
                {group.tasks.map((task) => (
                  <Row key={task.id} task={task} onOpen={onOpen} onToggle={onToggle} showProject={showProject} canEdit={canEdit} />
                ))}
                {!group.tasks.length && <div className="task-group__empty">{t('tasks.emptyColumn')}</div>}
              </div>
            )}
          </section>
        ) : null
      )}
    </div>
  );
}
