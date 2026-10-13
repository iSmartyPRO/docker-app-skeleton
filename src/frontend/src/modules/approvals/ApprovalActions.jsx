import { useState } from 'react';
import { App, Button, Dropdown, Input, Modal, Segmented, Space } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { fmtDateTime } from '../../lib/datetime';
import { approvalsApi, inboxChanged } from './api';
import { URGENCY_GLYPH, urgencyLevels, urgencyName, useApprovalsMeta } from './lib';
import QuestionPopover from './components/QuestionPopover';
import { PersonSelect } from './components/pickers';
import './approvals.css';

/** A modal asking for a required comment (reject, return) or a person (delegate). */
function DecisionModal({ open, kind, onCancel, onSubmit, exclude }) {
  const { t } = useLocale();
  const [comment, setComment] = useState('');
  const [to, setTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const needsPerson = kind === 'delegate';
  const needsComment = kind === 'reject' || kind === 'return';
  const ready = (!needsComment || comment.trim()) && (!needsPerson || to);
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({ comment: comment.trim(), to });
      setComment('');
      setTo(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      title={kind ? t(`approvals.actions.${kind}Title`) : ''}
      onCancel={onCancel}
      onOk={submit}
      okText={kind ? t(`approvals.actions.${kind}`) : ''}
      okButtonProps={{ disabled: !ready, danger: kind === 'reject', loading: busy }}
      destroyOnClose
    >
      {needsPerson && (
        <div className="apr-modal-field">
          <label>{t('approvals.actions.delegateTo')}</label>
          <PersonSelect value={to} onChange={setTo} exclude={exclude} autoFocus />
        </div>
      )}
      <div className="apr-modal-field">
        <label>{needsComment ? t('approvals.actions.commentRequired') : t('approvals.actions.comment')}</label>
        <Input.TextArea value={comment} onChange={(event) => setComment(event.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} maxLength={4000} autoFocus={!needsPerson} />
      </div>
    </Modal>
  );
}

/** Urgency picker as segmented chips. */
export function UrgencyPicker({ value, onChange }) {
  const { t } = useLocale();
  const meta = useApprovalsMeta();
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={urgencyLevels(meta).map((level) => ({
        value: level.key,
        label: (
          <span className="apr-urgency-opt" style={{ '--c': level.color }}>
            {URGENCY_GLYPH[level.icon] || '•'} {urgencyName(level, t)}
          </span>
        ),
      }))}
    />
  );
}

/**
 * Decision buttons for module cards:
 *   <ApprovalActions type="procurement.request" docId={42} process={process} onChange={setProcess} allowStart />
 * Shows what the viewer may do now: approve / question / reject / return /
 * delegate, answer an open question, withdraw, send again, or (allowStart)
 * send to approval with an urgency.
 */
export default function ApprovalActions({ type, docId, process, onChange, allowStart = false, size = 'middle' }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const meta = useApprovalsMeta();
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(null);
  const [answer, setAnswer] = useState('');
  const [urgency, setUrgency] = useState(null);
  const my = process?.my || {};

  const run = async (key, call, done) => {
    setBusy(key);
    try {
      const res = await call();
      onChange?.(res.data.process);
      inboxChanged();
      if (done) message.success(done);
      return res;
    } catch (err) {
      message.error(errorMessage(err));
      throw err;
    } finally {
      setBusy(null);
    }
  };
  const decide = (action, payload = {}) =>
    run(action, () => approvalsApi.decide(process.id, { action, round: process.round, stage: process.currentStage, ...payload }), t(`approvals.done.${action}`));

  const startUrgency = urgency || process?.urgency || meta?.settings?.defaultUrgency || 'normal';

  if (!process) {
    if (!allowStart) return null;
    return (
      <div className="apr-actions apr-actions--start">
        <UrgencyPicker value={startUrgency} onChange={setUrgency} />
        <Button type="primary" size={size} loading={busy === 'start'} onClick={() => run('start', () => approvalsApi.start(type, docId, { urgency: startUrgency }), t('approvals.done.start'))}>
          {t('approvals.actions.start')}
        </Button>
      </div>
    );
  }

  const items = [
    { key: 'return', label: t('approvals.actions.return') },
    { key: 'delegate', label: t('approvals.actions.delegate') },
    { type: 'divider' },
    { key: 'reject', label: t('approvals.actions.reject'), danger: true },
  ];

  return (
    <div className="apr-actions">
      {my.canDecide && (
        <Space wrap size={8}>
          <Button type="primary" size={size} className="apr-btn-approve" loading={busy === 'approve'} onClick={() => decide('approve')}>
            ✓ {t('approvals.actions.approve')}
          </Button>
          <QuestionPopover author={process.author} onSubmit={(comment, to) => decide('question', { comment, to })} placement="bottom">
            <Button size={size} loading={busy === 'question'}>
              ? {t('approvals.actions.question')}
            </Button>
          </QuestionPopover>
          <Dropdown menu={{ items, onClick: ({ key }) => setModal(key) }} trigger={['click']}>
            <Button size={size}>{t('approvals.actions.more')} ▾</Button>
          </Dropdown>
        </Space>
      )}

      {process.status === 'question' && process.question && (
        <div className="apr-question">
          <div className="apr-question__head">
            <span className="apr-question__badge">?</span>
            <span>
              {t('approvals.question.from', { name: process.question.by?.name || '' })}
              {process.question.to ? ` → ${process.question.to.name}` : ''}
            </span>
            <time>{fmtDateTime(process.question.at)}</time>
          </div>
          <p className="apr-question__text">{process.question.text}</p>
          {my.canAnswer && (
            <div className="apr-question__answer">
              <Input.TextArea value={answer} onChange={(event) => setAnswer(event.target.value)} autoSize={{ minRows: 2, maxRows: 6 }} placeholder={t('approvals.answer.placeholder')} maxLength={4000} />
              <Button
                type="primary"
                disabled={!answer.trim()}
                loading={busy === 'answer'}
                onClick={() => run('answer', () => approvalsApi.answer(process.id, answer.trim()), t('approvals.done.answer')).then(() => setAnswer(''))}
              >
                {t('approvals.answer.send')}
              </Button>
            </div>
          )}
        </div>
      )}

      {(my.canRestart || my.canWithdraw || (allowStart && my.canStart)) && (
        <Space wrap size={8} className="apr-actions__author">
          {my.canRestart && (
            <Button type="primary" size={size} loading={busy === 'restart'} onClick={() => run('restart', () => approvalsApi.restart(type || process.type, docId ?? process.docId), t('approvals.done.restart'))}>
              ↻ {t('approvals.actions.restart')}
            </Button>
          )}
          {allowStart && my.canStart && (
            <>
              <UrgencyPicker value={startUrgency} onChange={setUrgency} />
              <Button type="primary" size={size} loading={busy === 'start'} onClick={() => run('start', () => approvalsApi.start(type || process.type, docId ?? process.docId, { urgency: startUrgency }), t('approvals.done.start'))}>
                {t('approvals.actions.startAgain')}
              </Button>
            </>
          )}
          {my.canWithdraw && (
            <Button
              size={size}
              loading={busy === 'withdraw'}
              onClick={() =>
                Modal.confirm({
                  title: t('approvals.actions.withdrawTitle'),
                  content: t('approvals.actions.withdrawText'),
                  okText: t('approvals.actions.withdraw'),
                  okButtonProps: { danger: true },
                  cancelText: t('common.cancel'),
                  onOk: () => run('withdraw', () => approvalsApi.withdraw(type || process.type, docId ?? process.docId), t('approvals.done.withdraw')),
                })
              }
            >
              {t('approvals.actions.withdraw')}
            </Button>
          )}
        </Space>
      )}

      <DecisionModal
        open={Boolean(modal)}
        kind={modal}
        exclude={[]}
        onCancel={() => setModal(null)}
        onSubmit={async (payload) => {
          await decide(modal, payload);
          setModal(null);
        }}
      />
    </div>
  );
}
