import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Input, Tooltip } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { tasksApi } from '../../tasks/api';
import { useWidgetData } from '../api';
import { Bars, Donut, Legend, Ring, TimeChart } from '../charts';
import { Kpi, WidgetState, dayTitle, longDay, shortDay, timeOf } from './common';
import { useOptions } from '../options';

const PRIORITY_COLOR = ['#94A3B8', '#3B82F6', '#F59E0B', '#EF4444'];
const CATEGORY_COLOR = { todo: '#94A3B8', active: '#3B82F6', done: '#10B981' };

function dueLabel(task, locale, t) {
  if (!task.dueAt) return null;
  const time = task.dueTime ? ` ${timeOf(task.dueAt, locale)}` : '';
  return `${dayTitle(task.dueAt, locale, t)}${time}`;
}

// ── My tasks ────────────────────────────────────────────────────────────────

export function MyTasks({ widget, size }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { user } = useAuth();
  const options = useOptions();
  const state = useWidgetData('myTasks', widget.settings);
  const [closing, setClosing] = useState(() => new Set());
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const data = state.data;
  const projectId = Number(widget.settings.project) || options?.projects?.[0]?.id;

  const complete = async (task) => {
    setClosing((prev) => new Set([...prev, task.id]));
    try {
      await tasksApi.updateTask(task.ref, { complete: true });
      message.success(t('dashboard.tasks.completed', { ref: task.ref }));
      setTimeout(state.reload, 600);
    } catch (err) {
      setClosing((prev) => new Set([...prev].filter((id) => id !== task.id)));
      message.error(errorMessage(err));
    }
  };

  const add = async () => {
    const text = title.trim();
    if (!text || !projectId) return;
    setAdding(true);
    try {
      const res = await tasksApi.createTask({ projectId, title: text, assigneeId: user?.id });
      setTitle('');
      message.success(t('dashboard.tasks.created', { ref: res.data.task?.ref || '' }));
      state.reload();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="dw-tasks">
      {data && (
        <div className="dw-tasks__summary">
          <span className="dw-pill">{t('dashboard.tasks.openN', { n: data.total })}</span>
          {data.overdue > 0 && <span className="dw-pill is-danger">{t('dashboard.tasks.overdueN', { n: data.overdue })}</span>}
          {data.today > 0 && <span className="dw-pill is-warn">{t('dashboard.tasks.todayN', { n: data.today })}</span>}
        </div>
      )}
      <WidgetState state={state} empty={data && !data.items.length ? t('dashboard.tasks.empty') : null} emptyIcon="✓">
        <ul className="dw-list dw-tasks__list">
          {(data?.items || []).map((task) => (
            <li key={task.id} className={closing.has(task.id) ? 'is-closing' : ''}>
              <div className="dw-task">
                <Tooltip title={t('dashboard.tasks.complete')}>
                  <button type="button" className="dw-check" onClick={() => complete(task)} aria-label={t('dashboard.tasks.complete')}>
                    <span>✓</span>
                  </button>
                </Tooltip>
                <Link to={`/app/tasks/${task.ref}`} className="dw-task__body">
                  <strong>{task.title}</strong>
                  <span className="dw-task__meta">
                    <i style={{ background: task.project.color }} />
                    {task.ref}
                    {size.w >= 5 && task.statusName && <em> · {task.statusName}</em>}
                    {task.checklist?.total > 0 && (
                      <em>
                        {' '}
                        · ☑ {task.checklist.done}/{task.checklist.total}
                      </em>
                    )}
                  </span>
                </Link>
                {task.priority >= 2 && (
                  <Tooltip title={t(`tasks.priority.${task.priority}`)}>
                    <span className="dw-flag" style={{ color: PRIORITY_COLOR[task.priority] }}>⚑</span>
                  </Tooltip>
                )}
                {task.dueAt && <span className={`dw-due${task.overdue ? ' is-overdue' : ''}`}>{dueLabel(task, locale, t)}</span>}
              </div>
            </li>
          ))}
        </ul>
      </WidgetState>
      {widget.settings.quickAdd !== false && projectId && (
        <div className="dw-quickadd">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onPressEnter={add}
            disabled={adding}
            maxLength={300}
            prefix={<span className="dw-quickadd__plus">＋</span>}
            placeholder={t('dashboard.tasks.quickAdd', { project: options?.projects?.find((project) => project.id === projectId)?.name || '' })}
            variant="borderless"
          />
        </div>
      )}
    </div>
  );
}

// ── Task statistics ─────────────────────────────────────────────────────────

export function TaskStats({ widget, size }) {
  const { t } = useLocale();
  const state = useWidgetData('taskStats', widget.settings);
  const data = state.data;
  const view = widget.settings.view || 'status';
  const wide = size.w >= 6;
  let chart = null;
  if (data) {
    const statusData = data.statuses.map((item) => ({ label: item.name, value: item.count, color: item.color || CATEGORY_COLOR[item.category] }));
    if (view === 'priority') {
      chart = <Bars data={data.priorities.slice().reverse().map((item) => ({ key: item.priority, label: t(`tasks.priority.${item.priority}`), value: item.count, color: PRIORITY_COLOR[item.priority] }))} />;
    } else if (view === 'projects') {
      chart = data.projects.length ? <Bars data={data.projects.map((item) => ({ key: item.id, label: item.name, value: item.count, color: item.color }))} /> : null;
    } else {
      chart = (
        <div className={`dw-donutbox${wide ? ' is-wide' : ''}`}>
          <Donut data={statusData} size={wide ? 150 : Math.min(150, size.w * 42)} center={data.open} sub={t('dashboard.stats.open')} />
          {(wide || size.h >= 7) && <Legend data={statusData} />}
        </div>
      );
    }
  }
  return (
    <WidgetState state={state} rows={5}>
      {data && (
        <div className={`dw-stats${wide ? ' is-wide' : ''}`}>
          <div className="dw-kpis">
            <Kpi value={data.open} label={t('dashboard.stats.open')} to="/app/tasks" />
            <Kpi value={data.overdue} label={t('dashboard.stats.overdue')} tone={data.overdue ? 'danger' : null} />
            <Kpi value={data.done} label={t('dashboard.stats.doneIn', { n: data.period })} tone="ok" />
            {wide && (
              <div className="dw-kpi is-ring">
                <Ring value={data.onTimeRate} size={52} thickness={6} color="#10B981" />
                <span>{t('dashboard.stats.onTime')}</span>
              </div>
            )}
          </div>
          <div className="dw-stats__chart">{chart || <div className="dw-empty"><strong>{t('dashboard.tasks.noData')}</strong></div>}</div>
        </div>
      )}
    </WidgetState>
  );
}

// ── Task trend ──────────────────────────────────────────────────────────────

export function TaskTrend({ widget, size }) {
  const { t, locale } = useLocale();
  const state = useWidgetData('taskTrend', widget.settings);
  const data = state.data;
  const total = (list) => list.reduce((sum, value) => sum + value, 0);
  return (
    <WidgetState state={state} rows={5}>
      {data && (
        <div className="dw-trend">
          <div className="dw-trend__head">
            <span className="dw-legend-dot" style={{ '--c': '#6366F1' }}>
              {t('dashboard.trend.created')} <b>{total(data.created)}</b>
            </span>
            <span className="dw-legend-dot" style={{ '--c': '#10B981' }}>
              {t('dashboard.trend.done')} <b>{total(data.done)}</b>
            </span>
          </div>
          <div className="dw-trend__chart">
            <TimeChart
              labels={data.days}
              type={widget.settings.chart || 'area'}
              height={Math.max(120, size.h * 56 - 90)}
              series={[
                { key: 'created', label: t('dashboard.trend.created'), color: '#6366F1', values: data.created },
                { key: 'done', label: t('dashboard.trend.done'), color: '#10B981', values: data.done },
              ]}
              formatLabel={(key) => shortDay(key, locale)}
              formatTip={(key) => longDay(key, locale)}
            />
          </div>
        </div>
      )}
    </WidgetState>
  );
}
