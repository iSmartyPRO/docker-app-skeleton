import { useState } from 'react';
import { App, Button, Checkbox, Input, Popconfirm, Segmented, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { UserAvatar } from '../../shared/People';
import { crmApi } from '../api';
import { formatDue, isOverdue } from '../lib';
import ActivityForm, { remindLabel } from '../components/ActivityForm';
import { ActivityIcon, Glyph } from '../components/bits';
import { dayLabel, eventView } from './eventView';

/** Composer: plan an activity or write a comment. */
function Composer({ deal, editable, onActivity, onComment }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [tab, setTab] = useState('activity');
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await crmApi.comment(deal.id, body.trim());
      setBody('');
      onComment();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!editable) return null;
  return (
    <div className={`dp-composer${expanded ? ' is-open' : ''}`}>
      <Segmented
        size="small"
        value={tab}
        onChange={(next) => {
          setTab(next);
          setExpanded(true);
        }}
        options={[
          { value: 'activity', label: t('crm.tl.activity') },
          { value: 'comment', label: t('crm.tl.comment') },
        ]}
      />
      {tab === 'activity' ? (
        expanded ? (
          <ActivityForm
            dealId={deal.id}
            onDone={() => {
              setExpanded(false);
              onActivity();
            }}
            onCancel={() => setExpanded(false)}
          />
        ) : (
          <button type="button" className="dp-composer__fake" onClick={() => setExpanded(true)}>
            <Glyph name="plus" size={14} />
            {t('crm.tl.planPlaceholder')}
          </button>
        )
      ) : (
        <div className="dp-composer__comment">
          <Input.TextArea
            autoFocus={expanded}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send();
            }}
            placeholder={t('crm.tl.commentPlaceholder')}
            autoSize={{ minRows: 2, maxRows: 8 }}
            maxLength={10000}
            aria-label={t('crm.tl.comment')}
          />
          <div className="dp-composer__foot">
            <span className="crm-muted">{t('crm.tl.sendHint')}</span>
            <Button type="primary" loading={busy} disabled={!body.trim()} onClick={send}>
              {t('crm.tl.send')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One open activity of «Что нужно сделать». */
function Todo({ activity, editable, onChanged }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState(false);
  const overdue = activity.overdue ?? isOverdue(activity.dueAt);

  const toggle = async () => {
    setDone(true);
    try {
      await crmApi.updateActivity(activity.id, { done: true });
      message.success(t('crm.act.doneToast'));
      onChanged();
    } catch (err) {
      setDone(false);
      message.error(errorMessage(err));
    }
  };

  const remove = async () => {
    try {
      await crmApi.deleteActivity(activity.id);
      onChanged();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  if (editing) {
    return (
      <li className="dp-todo is-editing">
        <ActivityForm activity={activity} dealId={activity.dealId} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className={`dp-todo${overdue ? ' is-overdue' : ''}${done ? ' is-done' : ''}`}>
      <Checkbox checked={done} disabled={!editable || done} onChange={toggle} aria-label={t('crm.act.markDone', { title: activity.title })} />
      <span className="dp-todo__kind" title={t(`crm.act.kind.${activity.kind}`)}>
        <ActivityIcon kind={activity.kind} />
      </span>
      <div className="dp-todo__main">
        <span className="dp-todo__title">{activity.title || t(`crm.act.kind.${activity.kind}`)}</span>
        <span className="dp-todo__meta">
          <span className="dp-todo__due">{formatDue(activity.dueAt, locale, t)}</span>
          {activity.remindMinutes !== null && activity.remindMinutes !== undefined && activity.dueAt && <span>· ⏰ {remindLabel(activity.remindMinutes, t)}</span>}
        </span>
        {activity.note && <span className="dp-todo__note">{activity.note}</span>}
      </div>
      <UserAvatar user={activity.owner} size={22} />
      {editable && (
        <span className="dp-todo__tools">
          <Tooltip title={t('common.edit')}>
            <button type="button" onClick={() => setEditing(true)} aria-label={t('common.edit')}>
              <Glyph name="edit" size={13} />
            </button>
          </Tooltip>
          <Popconfirm title={t('crm.act.deleteConfirm')} okText={t('common.delete')} okButtonProps={{ danger: true }} cancelText={t('common.cancel')} onConfirm={remove}>
            <button type="button" aria-label={t('common.delete')}>
              <Glyph name="trash" size={13} />
            </button>
          </Popconfirm>
        </span>
      )}
    </li>
  );
}

/** History grouped by day, newest first. */
function History({ events, hasMore, onMore }) {
  const { t, locale } = useLocale();
  const [loading, setLoading] = useState(false);
  const groups = [];
  for (const event of events) {
    const label = dayLabel(event.createdAt, { t, locale });
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(event);
  }
  if (!events.length) return <div className="dp-history__empty">{t('crm.tl.noHistory')}</div>;
  return (
    <div className="dp-history">
      {groups.map((group) => (
        <section key={group.label} className="dp-day">
          <div className="dp-day__label"><span>{group.label}</span></div>
          <ol className="dp-events">
            {group.items.map((event) => {
              const view = eventView(event, { t, locale });
              return (
                <li key={event.id} className={`dp-ev${view.tone ? ` is-${view.tone}` : ''}${view.comment ? ' is-comment' : ''}`}>
                  <span className="dp-ev__icon" aria-hidden="true">
                    {view.comment && event.author ? <UserAvatar user={event.author} size={26} tip={false} /> : view.icon}
                  </span>
                  <div className="dp-ev__body">
                    <div className="dp-ev__head">
                      <strong>{event.author?.name || t('crm.tl.system')}</strong>
                      <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</time>
                    </div>
                    <div className={view.comment ? 'dp-ev__comment' : 'dp-ev__text'}>{view.text}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {hasMore && (
        <Button
          type="text"
          block
          loading={loading}
          onClick={async () => {
            setLoading(true);
            await onMore();
            setLoading(false);
          }}
        >
          {t('crm.tl.more')}
        </Button>
      )}
    </div>
  );
}

/**
 * The right column of the deal card: composer, the pinned list of open
 * activities, then the history.
 */
export default function Timeline({ deal, activities, events, hasMore, editable, onReload, onMoreEvents }) {
  const { t } = useLocale();
  const open = activities.filter((activity) => !activity.doneAt);
  return (
    <div className="dp-timeline">
      <Composer deal={deal} editable={editable} onActivity={onReload} onComment={onReload} />
      <section className="dp-todos" aria-label={t('crm.tl.todo')}>
        <header className="dp-todos__head">
          <Glyph name="pin" size={14} />
          <strong>{t('crm.tl.todo')}</strong>
          {open.length > 0 && <span className="dp-todos__count">{open.length}</span>}
        </header>
        {open.length ? (
          <ul className="dp-todos__list">
            {open.map((activity) => (
              <Todo key={activity.id} activity={{ ...activity, dealId: deal.id }} editable={editable} onChanged={onReload} />
            ))}
          </ul>
        ) : (
          <div className="dp-todos__empty">{t('crm.tl.nothingTodo')}</div>
        )}
      </section>
      <History events={events} hasMore={hasMore} onMore={onMoreEvents} />
    </div>
  );
}
