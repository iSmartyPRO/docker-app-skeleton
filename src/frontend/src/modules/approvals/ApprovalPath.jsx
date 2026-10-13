import { useCallback, useEffect, useState } from 'react';
import { Avatar, Skeleton, Tooltip } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { fmtDateTime } from '../../lib/datetime';
import { initials } from '../../lib/format';
import { approvalsApi } from './api';
import { shortDuration, slaOf, useApprovalsMeta } from './lib';
import { DueBadge, StatusPill, UrgencyTag } from './components/bits';
import './approvals.css';

/**
 * The process of a document, loaded and kept fresh.
 *   const { process, reload, loading, error, setProcess } = useApprovalProcess('procurement.request', 42);
 * `process` is null while the document never went to approval.
 */
export function useApprovalProcess(type, docId, { refreshKey } = {}) {
  const [state, setState] = useState({ process: undefined, loading: true, error: null });
  const reload = useCallback(() => {
    if (!type || docId === undefined || docId === null) return Promise.resolve();
    setState((prev) => ({ ...prev, loading: true }));
    return approvalsApi
      .process(type, docId)
      .then((res) => setState({ process: res.data.process, loading: false, error: null }))
      .catch((error) => setState((prev) => ({ ...prev, loading: false, error })));
  }, [type, docId]);
  useEffect(() => {
    reload();
  }, [reload, refreshKey]);
  const setProcess = useCallback((process) => setState({ process, loading: false, error: null }), []);
  return { ...state, reload, setProcess };
}

const STATE_GLYPH = { done: '✓', rejected: '✕', returned: '↩', withdrawn: '–', question: '?', current: '', upcoming: '' };

function seatLabel(approver, t) {
  if (approver.kind === 'role') return t('approvals.path.role', { name: approver.name });
  if (approver.kind === 'group') return t('approvals.path.group', { name: approver.name });
  if (approver.kind === 'permission') return t('approvals.path.admins');
  return approver.name;
}

function SeatAvatar({ approver, t }) {
  const who = approver.decidedBy || approver.delegatedTo || (approver.kind === 'user' ? approver : null);
  const decided = approver.decision;
  const tip = (
    <div className="apr-seat-tip">
      <strong>{seatLabel(approver, t)}</strong>
      {approver.delegatedTo && <div>{t('approvals.path.delegatedTo', { name: approver.delegatedTo.name })}</div>}
      {approver.decidedBy && (
        <div>
          {t(`approvals.decision.${decided}`)} · {approver.decidedBy.name}
          {approver.onBehalfOf ? ` ${t('approvals.path.onBehalf', { name: approver.onBehalfOf.name })}` : ''}
        </div>
      )}
      {approver.decidedAt && <div className="apr-seat-tip__muted">{fmtDateTime(approver.decidedAt)}{approver.responseMs !== null && approver.responseMs !== undefined ? ` · ${t('approvals.path.took', { d: shortDuration(approver.responseMs, t) })}` : ''}</div>}
      {approver.comment && <div className="apr-seat-tip__comment">“{approver.comment}”</div>}
    </div>
  );
  return (
    <Tooltip title={tip}>
      <span className={`apr-seat${decided ? ` is-${decided}` : ''}`}>
        {who ? (
          <Avatar size={26} src={who.avatarUrl || undefined}>
            {initials(who.name || '?')}
          </Avatar>
        ) : (
          <Avatar size={26} className="apr-seat__group">
            {approver.kind === 'group' ? '👥' : '◆'}
          </Avatar>
        )}
        {decided && <span className="apr-seat__mark" aria-hidden="true">{decided === 'approved' ? '✓' : decided === 'rejected' ? '✕' : '↩'}</span>}
      </span>
    </Tooltip>
  );
}

/** The stage strip: stages with approvers' avatars, ticks and response times; the current stage highlighted in its SLA colour. */
export function ApprovalStrip({ process, compact = false }) {
  const { t } = useLocale();
  const meta = useApprovalsMeta();
  const soonHours = meta?.settings?.soonHours || 24;
  const sla = process.status === 'pending' ? slaOf(process.dueAt, soonHours) : 'none';
  return (
    <ol className={`apr-path${compact ? ' is-compact' : ''}`}>
      <li className="apr-path__step is-done is-start">
        <span className="apr-path__node" aria-hidden="true">✓</span>
        <div className="apr-path__body">
          <div className="apr-path__name">{t('approvals.path.sent')}</div>
          <div className="apr-path__meta">
            {process.author && <span>{process.author.name}</span>}
            <span>{fmtDateTime(process.startedAt)}</span>
          </div>
        </div>
      </li>
      {process.stages.map((stage) => {
        const current = stage.index === process.currentStage && ['current', 'question'].includes(stage.state);
        const decided = stage.approvers.filter((a) => a.decidedAt);
        const took = stage.finishedAt && stage.startedAt ? new Date(stage.finishedAt) - new Date(stage.startedAt) : null;
        return (
          <li key={`${stage.id}-${stage.index}`} className={`apr-path__step is-${stage.state}${current ? ` is-current sla-${sla}` : ''}`}>
            <span className="apr-path__node" aria-hidden="true">
              {STATE_GLYPH[stage.state] || stage.index + 1}
            </span>
            <div className="apr-path__body">
              <div className="apr-path__name">
                {stage.name || t('approvals.path.stage', { n: stage.index + 1 })}
                {stage.approvers.length > 1 && <span className="apr-path__mode">{t(`approvals.mode.${stage.mode}`)}</span>}
              </div>
              <div className="apr-path__seats">
                {stage.approvers.map((approver, index) => (
                  <SeatAvatar key={approver.seatId || index} approver={approver} t={t} />
                ))}
                {!compact && stage.approvers.length === 1 && <span className="apr-path__who">{seatLabel(stage.approvers[0].delegatedTo ? { ...stage.approvers[0].delegatedTo, kind: 'user' } : stage.approvers[0], t)}</span>}
              </div>
              <div className="apr-path__meta">
                {stage.state === 'done' && took !== null && <span>{t('approvals.path.took', { d: shortDuration(took, t) })}</span>}
                {current && process.status === 'pending' && <DueBadge dueAt={process.dueAt} soonHours={soonHours} />}
                {stage.state === 'question' && <span className="apr-path__q">{t('approvals.status.question')}</span>}
                {stage.state === 'upcoming' && <span className="apr-path__muted">{t('approvals.path.upcoming')}</span>}
                {!current && stage.state !== 'done' && decided.length > 0 && <span>{fmtDateTime(decided[decided.length - 1].decidedAt)}</span>}
              </div>
            </div>
          </li>
        );
      })}
      {process.status === 'approved' && (
        <li className="apr-path__step is-done is-final">
          <span className="apr-path__node" aria-hidden="true">★</span>
          <div className="apr-path__body">
            <div className="apr-path__name">{t('approvals.status.approved')}</div>
            <div className="apr-path__meta">
              <span>{fmtDateTime(process.finishedAt)}</span>
            </div>
          </div>
        </li>
      )}
    </ol>
  );
}

/**
 * <ApprovalPath type="procurement.request" docId={42} /> — the approval path
 * of a document for module cards: status, urgency, deadline and the stage
 * strip. Pass `process` to render one you already loaded.
 */
export default function ApprovalPath({ type, docId, process: given, compact = false, refreshKey, emptyText }) {
  const { t } = useLocale();
  const meta = useApprovalsMeta();
  const loaded = useApprovalProcess(given === undefined ? type : null, given === undefined ? docId : null, { refreshKey });
  const process = given !== undefined ? given : loaded.process;
  if (process === undefined) return <Skeleton active paragraph={{ rows: 2 }} title={false} />;
  if (!process) return <div className="apr-path-empty">{emptyText || t('approvals.path.notSent')}</div>;
  return (
    <section className="apr-path-card">
      <header className="apr-path-card__head">
        <StatusPill status={process.status} />
        <UrgencyTag meta={meta} value={process.urgency} />
        {process.round > 1 && <span className="apr-path-card__round">{t('approvals.path.round', { n: process.round })}</span>}
        {process.skipped?.length > 0 && (
          <Tooltip title={process.skipped.map((s) => s.name).filter(Boolean).join(', ')}>
            <span className="apr-path-card__skipped">{t('approvals.path.skipped', { n: process.skipped.length })}</span>
          </Tooltip>
        )}
      </header>
      <ApprovalStrip process={process} compact={compact} />
    </section>
  );
}
