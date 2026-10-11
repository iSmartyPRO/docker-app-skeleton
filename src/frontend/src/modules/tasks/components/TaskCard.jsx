import { forwardRef } from 'react';
import { UserAvatar } from '../../shared/People';
import { ChecklistBadge, CommentBadge, DueChip, LabelTag, PriorityIcon } from './bits';

/** Compact card used on the board, in overlays and in lists of "my tasks". */
const TaskCard = forwardRef(function TaskCard({ task, onOpen, dragging, overlay, showProject, style, ...rest }, ref) {
  const done = task.statusCategory === 'done';
  return (
    <div
      ref={ref}
      style={style}
      className={`task-card${dragging ? ' is-dragging' : ''}${overlay ? ' is-overlay' : ''}${done ? ' is-done' : ''}`}
      onClick={() => onOpen?.(task)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen?.(task);
      }}
      role="button"
      tabIndex={0}
      {...rest}
    >
      <div className="task-card__top">
        <span className="task-card__ref">
          {showProject && <span className="mod-dot" style={{ '--c': task.project.color }} />}
          {task.ref}
        </span>
        <PriorityIcon value={task.priority} />
      </div>
      <div className="task-card__title">{task.title}</div>
      {task.labels.length > 0 && (
        <div className="task-card__labels">
          {task.labels.slice(0, 3).map((label) => (
            <LabelTag key={label} label={label} />
          ))}
          {task.labels.length > 3 && <span className="task-card__more">+{task.labels.length - 3}</span>}
        </div>
      )}
      <div className="task-card__foot">
        <DueChip dueAt={task.dueAt} dueTime={task.dueTime} done={done} compact />
        <ChecklistBadge done={task.checklist.done} total={task.checklist.total} />
        <CommentBadge count={task.comments} />
        <span className="task-card__grow" />
        <UserAvatar user={task.assignee} size={24} />
      </div>
    </div>
  );
});

export default TaskCard;
