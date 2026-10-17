import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Dropdown, Input, Modal, Skeleton } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDateTime, fmtTime, intlOptions, todayISO } from '../../../lib/datetime';
import { PALETTE, UserAvatar } from '../../shared/People';
import { mpApi } from '../api';
import { formatPercent } from '../lib';
import ReportPhotos, { isVideo } from './ReportPhotos';
import MpLightbox from './MpLightbox';
import ReportDialog from './ReportDialog';
import '../mp-reports.css';
import { localeTag } from '../../../i18n/languages';

const dayShift = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** "Сегодня", "Вчера", else "12 октября, пн" (with the year when it is not this year). */
function useDayLabel() {
  const { t, locale } = useLocale();
  return (day) => {
    const today = todayISO();
    const label = day === today ? t('mp.rep.today') : day === dayShift(today, -1) ? t('mp.rep.yesterday') : null;
    const date = new Intl.DateTimeFormat(localeTag(locale), {
      ...intlOptions({}),
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      weekday: 'short',
      year: day.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
    }).format(new Date(`${day}T00:00:00Z`));
    return { label, date };
  };
}

function StatusBadge({ status }) {
  const { t } = useLocale();
  return (
    <span className={`mpr-badge is-${status}`}>
      <span className="mpr-badge__dot" aria-hidden="true" />
      {t(`mp.report.state.${status}`)}
    </span>
  );
}

/** Stage progress the report brings: "40 % → 55 %" with the gain on a bar. */
function Progress({ report }) {
  const { t, locale } = useLocale();
  if (!report.stage) return null;
  const to = report.percent;
  const from = report.prevPercent;
  const hasChange = to !== null && from !== null && from !== undefined && from !== to;
  const delta = hasChange ? Math.round((to - from) * 10) / 10 : 0;
  const lo = to === null ? 0 : hasChange ? Math.min(from, to) : to;
  const hi = to === null ? 0 : hasChange ? Math.max(from, to) : to;
  return (
    <div className="mpr-progress">
      <div className="mpr-progress__top">
        <span className="mpr-progress__stage">{report.stage.name}</span>
        {to !== null && (
          <span className="mpr-progress__nums">
            {hasChange && <span className="mpr-progress__from">{formatPercent(from, locale)}</span>}
            {hasChange && <span className="mpr-progress__arrow" aria-hidden="true">→</span>}
            <b>{formatPercent(to, locale)}</b>
            {hasChange && <span className={`mpr-delta${delta < 0 ? ' is-down' : ''}`}>{delta > 0 ? '+' : '−'}{formatPercent(Math.abs(delta), locale)}</span>}
          </span>
        )}
      </div>
      {to !== null && (
        <div className="mpr-progress__bar" role="img" aria-label={`${t('mp.rep.progress')}: ${hasChange ? `${formatPercent(from, locale)} → ` : ''}${formatPercent(to, locale)}`}>
          <span className="mpr-progress__base" style={{ width: `${lo}%` }} />
          {hasChange && <span className={`mpr-progress__gain${delta < 0 ? ' is-down' : ''}`} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report, compact, onOpenNode, onOpenMedia, onEdit, onDelete, onReview, onReject }) {
  const { t } = useLocale();
  const { user } = useAuth();
  // The author of a report published long ago: say why there is no "Delete".
  const locked = report.status === 'published' && !report.canEdit && user?.id && report.author?.id === user.id;
  const menu = [
    report.canEdit && { key: 'edit', label: t('mp.rep.edit'), onClick: () => onEdit(report) },
    report.canDelete && { key: 'delete', label: t('mp.rep.delete'), danger: true, onClick: () => onDelete(report) },
  ].filter(Boolean);
  const when = report.publishedAt || report.createdAt;
  const photos = report.media.filter((item) => !isVideo(item)).length;
  const videos = report.media.length - photos;
  return (
    <article className={`mpr-card is-${report.status}${compact ? ' is-compact' : ''}`}>
      <header className="mpr-card__head">
        <span className="mpr-avatar" style={{ '--c': PALETTE[(report.author?.id || 0) % PALETTE.length] }}>
          <UserAvatar user={report.author || { name: '?' }} size={compact ? 32 : 38} tip={false} />
        </span>
        <div className="mpr-card__who">
          <b>{report.author?.name || '—'}</b>
          <span>
            <time dateTime={when} title={fmtDateTime(when)}>{fmtTime(when)}</time>
            {report.editedAt && <span title={fmtDateTime(report.editedAt)}> · {t('mp.rep.edited')}</span>}
            {report.visibility === 'internal' && <span> · {t('mp.rep.internal')}</span>}
          </span>
        </div>
        <StatusBadge status={report.status} />
        {menu.length > 0 && (
          <Dropdown menu={{ items: menu }} trigger={['click']} placement="bottomRight">
            <button type="button" className="mpr-iconbtn" aria-label={t('mp.rep.menu')}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="5" cy="12" r="1.9" fill="currentColor" /><circle cx="12" cy="12" r="1.9" fill="currentColor" /><circle cx="19" cy="12" r="1.9" fill="currentColor" /></svg>
            </button>
          </Dropdown>
        )}
      </header>
      <div className="mpr-chips">
        {report.nodes.slice(0, compact ? 4 : 8).map((node) =>
          onOpenNode ? (
            <button key={node.id} type="button" className="mpr-chip is-node" onClick={() => onOpenNode(node.id)}>{node.code || node.name}</button>
          ) : (
            <span key={node.id} className="mpr-chip is-node">{node.code || node.name}</span>
          )
        )}
        {report.nodes.length > (compact ? 4 : 8) && <span className="mpr-chip">+{report.nodes.length - (compact ? 4 : 8)}</span>}
        {!report.stage && <span className="mpr-chip is-muted">{t('mp.rep.noStage')}</span>}
        {report.media.length > 0 && (
          <span className="mpr-card__count">
            {photos > 0 && t('mp.rep.photos', { n: photos })}
            {photos > 0 && videos > 0 && ' · '}
            {videos > 0 && t('mp.rep.videos', { n: videos })}
          </span>
        )}
      </div>
      <Progress report={report} />
      {report.body && <p className="mpr-card__body">{report.body}</p>}
      <ReportPhotos media={report.media} compact={compact} onOpen={(index) => onOpenMedia(report, index)} />
      {report.reviewNote && (
        <div className="mpr-note">
          <span className="mpr-note__label">{t('mp.rep.reviewNote')}</span>
          <p>{report.reviewNote}</p>
          {report.reviewer && <small>{t('mp.rep.byReviewer', { name: report.reviewer.name, when: fmtDateTime(report.reviewedAt) })}</small>}
        </div>
      )}
      {report.canReview && (
        <div className="mpr-review">
          <span className="mpr-review__label">{t('mp.rep.waiting')}</span>
          <Button onClick={() => onReject(report)}>{t('mp.report.reject')}</Button>
          <Button type="primary" onClick={() => onReview(report)}>{t('mp.report.publish')}</Button>
        </div>
      )}
      {report.editUntil && <p className="mpr-card__hint">{t('mp.rep.editUntil', { when: fmtDateTime(report.editUntil) })}</p>}
      {locked && <p className="mpr-card__hint">{t('mp.rep.lockedHint')}</p>}
    </article>
  );
}

/** Placeholder of the feed while it loads. */
export function ReportFeedSkeleton({ compact, count = 2 }) {
  return (
    <div className="mpr-feed" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`mpr-card is-skeleton${compact ? ' is-compact' : ''}`}>
          <div className="mpr-card__head">
            <Skeleton.Avatar active size={compact ? 32 : 38} />
            <Skeleton active title={{ width: 140 }} paragraph={{ rows: 1, width: 80 }} />
          </div>
          <div className="mpr-shimmer mpr-skel-grid" />
        </div>
      ))}
    </div>
  );
}

/**
 * The construction journal as a premium photo feed (§7.3): reports grouped by
 * the date of the state, author with avatar, status, objects, stage progress
 * "before → after", comment, photo grid with a full-screen viewer;
 * moderation (publish / return with a comment), correcting and deleting
 * where the server allows it (`canReview`, `canEdit`, `canDelete`).
 *
 * `cursor` + `params` enable "show earlier" (GET /reports with the cursor).
 * `onChanged(kind)` is called after something changed on the server.
 */
export default function ReportFeed({ reports, compact, onChanged, onOpenNode, cursor, params, onCreate, emptyTitle, emptyText }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const dayLabel = useDayLabel();
  const [items, setItems] = useState(reports || []);
  const [next, setNext] = useState(cursor || null);
  const [loading, setLoading] = useState(false);
  const [reject, setReject] = useState(null);
  const [edit, setEdit] = useState(null);
  const [viewer, setViewer] = useState(null);
  const dirty = useRef(false);

  useEffect(() => {
    setItems(reports || []);
    setNext(cursor || null);
  }, [reports, cursor]);

  // In the server's order (date of the state, newest first): a report whose date was corrected moves to its
  // day, so every day has one group (and one key).
  const groups = useMemo(() => {
    const sorted = [...items].sort((a, b) => (a.factDate === b.factDate ? b.id - a.id : a.factDate < b.factDate ? 1 : -1));
    const out = [];
    for (const report of sorted) {
      const last = out[out.length - 1];
      if (last && last.day === report.factDate) last.reports.push(report);
      else out.push({ day: report.factDate, reports: [report] });
    }
    return out;
  }, [items]);

  const replace = (report) => setItems((list) => list.map((item) => (item.id === report.id ? report : item)));
  const drop = (id) => setItems((list) => list.filter((item) => item.id !== id));

  const review = async (report, action, note) => {
    try {
      const res = await mpApi.reviewReport(report.id, { action, note });
      replace(res.data.report);
      message.success(action === 'publish' ? t('mp.report.publishedOk') : t('mp.report.rejectedOk'));
      onChanged?.('review');
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const remove = (report) => {
    modal.confirm({
      title: t('mp.rep.deleteTitle'),
      content: (
        <>
          <p>{t('mp.rep.deleteText', { n: report.media.length })}</p>
          {report.status === 'published' && report.stage && report.percent !== null && <p>{t('mp.rep.deleteTextPublished')}</p>}
        </>
      ),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const res = await mpApi.deleteReport(report.id);
          drop(report.id);
          message.success(res.data?.restored?.length ? t('mp.rep.deletedRestored') : t('mp.rep.deleted'));
          onChanged?.('delete');
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });
  };

  const removeMedia = async (item) => {
    const { report } = viewer;
    try {
      const res = await mpApi.deleteReportMedia(report.id, item.id);
      const updated = res.data.report;
      replace(updated);
      dirty.current = true;
      message.success(t('mp.rep.photo.deleted'));
      if (!updated.media.length) setViewer(null);
      else setViewer({ report: updated, index: Math.min(viewer.index, updated.media.length - 1) });
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const more = async () => {
    setLoading(true);
    try {
      const res = await mpApi.reports({ ...params, cursor: next });
      setItems((list) => [...list, ...res.data.reports.filter((report) => !list.some((item) => item.id === report.id))]);
      setNext(res.data.nextCursor || null);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!items.length) {
    return (
      <div className={`mpr-empty${compact ? ' is-compact' : ''}`}>
        <span className="mpr-empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.8h5.4L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="12" cy="12.3" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
        </span>
        <strong>{emptyTitle || (compact ? t('mp.rep.emptyCard') : t('mp.rep.emptyTitle'))}</strong>
        {(emptyText !== undefined ? emptyText : !compact && t('mp.rep.emptyText')) && <p>{emptyText !== undefined ? emptyText : t('mp.rep.emptyText')}</p>}
        {onCreate && <Button type="primary" onClick={onCreate} icon={<PlusOutlined />}>{t('mp.rep.add')}</Button>}
      </div>
    );
  }

  return (
    <div className={`mpr-feed${compact ? ' is-compact' : ''}`}>
      {groups.map((group) => {
        const { label, date } = dayLabel(group.day);
        return (
          <section key={group.day} className="mpr-day">
            <h3 className="mpr-day__head">
              {label && <span className="mpr-day__label">{label}</span>}
              <span className="mpr-day__date">{date}</span>
              <span className="mpr-day__count">{group.reports.length === 1 ? t('mp.rep.count1') : t('mp.rep.count', { n: group.reports.length })}</span>
            </h3>
            {group.reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                compact={compact}
                onOpenNode={onOpenNode}
                onOpenMedia={(item, index) => setViewer({ report: item, index })}
                onEdit={(item) => setEdit({ projectId: item.projectId, report: item })}
                onDelete={remove}
                onReview={(item) => review(item, 'publish')}
                onReject={(item) => setReject({ report: item, note: '' })}
              />
            ))}
          </section>
        );
      })}
      {next && params && (
        <Button className="mpr-more" block loading={loading} onClick={more}>{t('mp.rep.showMore')}</Button>
      )}
      <Modal
        open={Boolean(reject)}
        title={t('mp.rep.rejectTitle')}
        onCancel={() => setReject(null)}
        onOk={() => {
          review(reject.report, 'reject', reject.note);
          setReject(null);
        }}
        okText={t('mp.report.reject')}
        cancelText={t('common.cancel')}
        destroyOnClose
      >
        {reject && (
          <>
            <p className="mp-muted">{t('mp.rep.rejectHint')}</p>
            <Input.TextArea autoFocus value={reject.note} onChange={(event) => setReject({ ...reject, note: event.target.value })} placeholder={t('mp.report.rejectHint')} autoSize={{ minRows: 3 }} maxLength={500} showCount />
          </>
        )}
      </Modal>
      <ReportDialog
        open={edit}
        onClose={(saved) => {
          setEdit(null);
          if (saved) {
            replace(saved);
            onChanged?.('edit');
          }
        }}
      />
      {viewer && (
        <MpLightbox
          items={viewer.report.media}
          index={viewer.index}
          report={viewer.report}
          onIndex={(index) => setViewer((value) => ({ ...value, index }))}
          onClose={() => {
            setViewer(null);
            if (dirty.current) {
              dirty.current = false;
              onChanged?.('media');
            }
          }}
          onDelete={viewer.report.canEdit ? removeMedia : null}
        />
      )}
    </div>
  );
}
