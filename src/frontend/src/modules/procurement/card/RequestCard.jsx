import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Drawer, Dropdown, Grid, Input, Result, Skeleton, Tabs } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import ApprovalPath, { useApprovalProcess } from '../../approvals/ApprovalPath';
import ApprovalActions from '../../approvals/ApprovalActions';
import { inboxChanged } from '../../approvals/api';
import Conversation from '../../chat/components/Conversation';
import { procApi } from '../api';
import { useProc } from '../ProcContext';
import { DayBadge, Money, StatusPill, Urgency } from '../components/bits';
import DetailsTab from './DetailsTab';
import DocumentsTab from './DocumentsTab';
import MoneyTab, { DeliveryDialog, PaymentDialog } from './MoneyTab';
import HistoryTab from './HistoryTab';

const TYPE = 'procurement.request';

/** Is a dropdown, picker or dialog on top (keys belong to it)? */
function overlayOpen() {
  return Boolean(document.querySelector('.ant-modal-wrap:not([style*="display: none"]), .ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden)'));
}

/** Error codes of the module, in the UI language. */
export function procError(err, t) {
  const code = err?.response?.data?.code;
  const known = code && t(`procurement.errors.${code}`);
  return known && !known.startsWith('procurement.errors.') ? known : errorMessage(err);
}

/**
 * The request card over the list (spec §5.3.2): number, status, urgency and
 * amount; the approval path; the decision buttons; tabs Details, Documents
 * (invoice preview), Discussion (chat), Payments, History. ↑/↓ move through
 * the list.
 */
export default function RequestCard({ id, ids = [], onOpen, onClose, onChanged }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { meta } = useProc();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('details');
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);
  const seq = useRef(0);
  const { process, setProcess, reload: reloadProcess } = useApprovalProcess(TYPE, id);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await procApi.get(id);
      if (mine === seq.current) {
        setData(res.data);
        setError(null);
      }
    } catch (err) {
      if (mine === seq.current) setError(err);
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    setError(null);
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (event) => {
      if (overlayOpen() || event.target.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'Escape') return onClose();
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const index = ids.indexOf(id);
      const next = ids[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (index >= 0 && next) {
        event.preventDefault();
        onOpen(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, ids, onOpen, onClose]);

  /** After anything changed: the card, the path, the list, the inbox badge. */
  const changed = useCallback(
    (next) => {
      if (next?.request) setData(next);
      else load();
      reloadProcess();
      setHistoryKey((n) => n + 1);
      onChanged?.();
    },
    [load, reloadProcess, onChanged]
  );

  const run = async (key, call, done) => {
    setBusy(key);
    try {
      const res = await call();
      changed(res?.data);
      inboxChanged();
      if (done) message.success(done);
      return res;
    } catch (err) {
      message.error(procError(err, t));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const confirmAction = (action, { danger = false, withComment = false } = {}) => {
    let comment = '';
    modal.confirm({
      title: t(`procurement.actions.${action}Title`),
      content: (
        <div className="prc-confirm">
          <p>{t(`procurement.actions.${action}Text`)}</p>
          {withComment && <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={2000} placeholder={t('procurement.actions.commentOptional')} onChange={(event) => (comment = event.target.value)} />}
        </div>
      ),
      okText: t(`procurement.actions.${action}`),
      okButtonProps: { danger },
      cancelText: t('common.cancel'),
      onOk: () =>
        action === 'delete'
          ? procApi.remove(id).then(() => {
              message.success(t('procurement.done.delete'));
              onChanged?.();
              onClose();
            }).catch((err) => message.error(procError(err, t)))
          : run(action, () => procApi.action(id, action, { comment }), t(`procurement.done.${action}`)),
    });
  };

  const width = screens.md ? 760 : '100%';
  const request = data?.request;
  const my = data?.my || {};
  const chatOn = Boolean(meta?.modules?.chat);

  const header = request ? (
    <div className="prc-card__head">
      <div className="prc-card__eyebrow">
        <span className="prc-card__no">{request.number}</span>
        <StatusPill status={request.status} />
        <Urgency value={request.urgency} />
      </div>
      <h2 className="prc-card__title">{request.title || t('procurement.untitled')}</h2>
      <div className="prc-card__facts">
        <Money amount={request.amount} currency={request.currency} paid={request.paid} />
        {request.supplier?.name && <span className="prc-muted">{request.supplier.name}</span>}
        {request.payBy && <DayBadge value={request.payBy} done={['paid', 'delivered', 'closed'].includes(request.status)} label={t('procurement.short.payBy')} />}
      </div>
    </div>
  ) : (
    <Skeleton.Input active size="small" />
  );

  const more = [
    my.canEdit && { key: 'edit', label: `✎ ${t('procurement.actions.edit')}`, onClick: () => navigate(`/app/procurement/requests/${id}/edit`) },
    { key: 'duplicate', label: t('procurement.actions.duplicate'), onClick: () => run('duplicate', () => procApi.action(id, 'duplicate'), t('procurement.done.duplicate')).then((res) => res && navigate(`/app/procurement/requests/${res.data.request.id}/edit`)) },
    my.actions?.includes('reopen') && { key: 'reopen', label: t('procurement.actions.reopen'), onClick: () => confirmAction('reopen') },
    my.actions?.includes('cancel') && { type: 'divider' },
    my.actions?.includes('cancel') && { key: 'cancel', danger: true, label: t('procurement.actions.cancel'), onClick: () => confirmAction('cancel', { danger: true, withComment: true }) },
    my.actions?.includes('delete') && { key: 'delete', danger: true, label: t('procurement.actions.delete'), onClick: () => confirmAction('delete', { danger: true }) },
  ].filter(Boolean);

  const tabs = request
    ? [
        { key: 'details', label: t('procurement.tabs.details'), children: <DetailsTab data={data} onChanged={changed} /> },
        { key: 'documents', label: `${t('procurement.tabs.documents')}${data.documents.length ? ` · ${data.documents.length}` : ''}`, children: <DocumentsTab data={data} onChanged={changed} /> },
        chatOn && { key: 'chat', label: t('procurement.tabs.discussion'), children: tab === 'chat' ? <div className="prc-chat"><Conversation entity={{ type: 'procurement', id: request.id }} header="bare" compact placeholder={t('procurement.chatPlaceholder')} /></div> : null },
        { key: 'money', label: `${t('procurement.tabs.payments')}${data.payments.length ? ` · ${data.payments.length}` : ''}`, children: <MoneyTab data={data} onChanged={changed} onPay={() => setDialog('pay')} onDeliver={() => setDialog('deliver')} /> },
        { key: 'history', label: t('procurement.tabs.history'), children: tab === 'history' ? <HistoryTab id={request.id} refreshKey={historyKey} /> : null },
      ].filter(Boolean)
    : [];

  return (
    <Drawer open onClose={onClose} width={width} className="prc-card" title={header} destroyOnClose mask={!screens.md} extra={ids.length > 1 && ids.includes(id) && screens.md ? <span className="prc-card__nav">{ids.indexOf(id) + 1} / {ids.length} <kbd>↑</kbd><kbd>↓</kbd></span> : null}>
      {error ? (
        <Result status={error?.response?.status === 404 ? '404' : 'warning'} title={error?.response?.status === 404 ? t('procurement.notFound') : errorMessage(error)} />
      ) : !request ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          {request.overdue && (
            <div className="prc-alert is-red">
              {t(`procurement.overdueKind.${request.overdueKind}`)}
            </div>
          )}
          {process && <ApprovalPath process={process} />}
          <div className="prc-card__actions">
            {process && (process.my?.canDecide || process.my?.canAnswer || process.my?.canWithdraw || process.my?.canRestart || process.status === 'question') && <ApprovalActions type={TYPE} docId={request.id} process={process} onChange={(next) => { setProcess(next); changed(); }} />}
            <div className="prc-card__buttons">
              {my.actions?.includes('submit') && (
                <Button type="primary" size="large" loading={busy === 'submit'} disabled={my.missing?.length > 0} onClick={() => run('submit', () => procApi.action(id, 'submit', { urgency: request.urgency }), t('procurement.done.submit'))}>
                  {request.status === 'returned' ? t('procurement.actions.resubmit') : t('procurement.actions.submit')}
                </Button>
              )}
              {my.canPay && (
                <Button type="primary" size="large" onClick={() => setDialog('pay')}>
                  {t('procurement.actions.pay')}
                </Button>
              )}
              {my.canDeliver && (
                <Button size="large" onClick={() => setDialog('deliver')}>
                  {t('procurement.actions.deliver')}
                </Button>
              )}
              {my.actions?.includes('close') && (
                <Button size="large" loading={busy === 'close'} onClick={() => confirmAction('close', { withComment: true })}>
                  {t('procurement.actions.close')}
                </Button>
              )}
              {my.canEdit && (
                <Button size="large" onClick={() => navigate(`/app/procurement/requests/${id}/edit`)}>
                  {t('procurement.actions.edit')}
                </Button>
              )}
              <Dropdown menu={{ items: more }} trigger={['click']}>
                <Button size="large" className="prc-more" aria-label={t('procurement.actions.more')}>⋯</Button>
              </Dropdown>
            </div>
            {my.missing?.length > 0 && my.actions?.includes('submit') && (
              <ul className="prc-missing">
                {my.missing.map((code) => (
                  <li key={code}>{t(`procurement.errors.${code}`)}</li>
                ))}
              </ul>
            )}
          </div>
          <Tabs activeKey={tab} onChange={setTab} items={tabs} className="prc-card__tabs" />
        </>
      )}
      {request && (
        <>
          <PaymentDialog open={dialog === 'pay'} data={data} onClose={() => setDialog(null)} onDone={(next) => { setDialog(null); changed(next); }} />
          <DeliveryDialog open={dialog === 'deliver'} data={data} onClose={() => setDialog(null)} onDone={(next) => { setDialog(null); changed(next); }} />
        </>
      )}
    </Drawer>
  );
}
