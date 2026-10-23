import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { App, Button, Dropdown, Skeleton, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDate } from '../../../lib/datetime';
import ApprovalPath, { useApprovalProcess } from '../../approvals/public/ApprovalPath';
import ApprovalActions from '../../approvals/public/ApprovalActions';
import { HelpButton } from '../../../help/Hint';
import { useContracts } from '../ContractsContext';
import { contractsApi } from '../api';
import { TYPE_KEY, daysLeft, overlayOpen } from '../lib';
import { Avatar, EndDate, Money, StatusPill, TypeTag } from '../components/bits';
import ContractForm from '../components/ContractForm';
import Overview from './Overview';
import Versions from './Versions';
import Discussion from './Discussion';
import Links from './Links';
import History from './History';
import StatusActions from './StatusActions';
import Payments, { PayBar } from './Payments';
import { HighRisksCallout } from './Risks';

const TABS = ['overview', 'payments', 'versions', 'discussion', 'links', 'history'];

/** The money side shows only where it matters: sales to clients, sale types, or contracts that already track money. */
export const paymentsRelevant = (contract) => Boolean(contract && (contract.payments || contract.direction === 'client' || ['sale', 'property_sale'].includes(contract.typeKey)));

/**
 * The contract card over the registry (spec §6.4): header, the approval path
 * with the decision buttons (open high risks right next to them), the manual
 * status steps and the tabs Обзор / Версии / Обсуждение / Связи / История.
 * ↑ / ↓ go to the previous / next contract of the list, Esc closes.
 */
export default function ContractCard({ id, onClose, onChanged, onStep }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const { modules, touch } = useContracts();
  const [params, setParams] = useSearchParams();
  const highlightRisk = Number(params.get('risk')) || null;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(() => (params.get('tab') === 'payments' ? 'payments' : 'overview'));
  const [editing, setEditing] = useState(false);
  const [riskTalk, setRiskTalk] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const seq = useRef(0);
  const { process, setProcess, reload: reloadProcess } = useApprovalProcess(TYPE_KEY, id, { refreshKey });

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await contractsApi.get(id);
      if (mine !== seq.current) return;
      setData(res.data);
      setError(null);
    } catch (err) {
      if (mine === seq.current) setError(err);
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    setError(null);
    setTab(new URLSearchParams(window.location.search).get('tab') === 'payments' ? 'payments' : 'overview');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // A risk linked from the chat: scroll to it once the card is there.
  useEffect(() => {
    if (!data || !highlightRisk) return;
    const timer = setTimeout(() => document.getElementById(`risk-${highlightRisk}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    return () => clearTimeout(timer);
  }, [data, highlightRisk]);

  const changed = useCallback(() => {
    load();
    setRefreshKey((n) => n + 1);
    onChanged?.();
    touch();
  }, [load, onChanged, touch]);

  // Keyboard: Esc closes, ↑ / ↓ walk the list.
  useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented || overlayOpen()) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (event.key === 'Escape' && !typing) onClose();
      if (!typing && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && onStep) {
        event.preventDefault();
        onStep(event.key === 'ArrowDown' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onStep]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const contract = data?.contract;
  const copyLink = () => navigator.clipboard?.writeText(`${window.location.origin}/app/contracts/${id}`).then(() => message.success(t('common.copied')));

  const remove = () =>
    modal.confirm({
      title: t('contracts.card.deleteTitle', { number: contract.number }),
      content: t('contracts.card.deleteText'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await contractsApi.remove(contract.id);
          message.success(t('contracts.card.deleted'));
          touch();
          onChanged?.();
          onClose();
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });

  const discussRisk = (risk) => {
    setRiskTalk(risk);
    setTab('discussion');
  };

  const counts = {
    versions: data?.versions?.length || 0,
    overview: data?.risks?.filter((risk) => risk.status === 'open').length || 0,
  };
  const inApproval = process && ['pending', 'question'].includes(process.status);
  const showApproval = Boolean(process) || data?.can?.start;
  const noticeLeft = contract?.noticeDeadline ? daysLeft(contract.noticeDeadline) : null;
  const payOverdue = Boolean(contract?.payments?.nextDue && daysLeft(contract.payments.nextDue) < 0);

  const panel = (
    <div className="ctr-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="ctr-float">
        <Tooltip title={`${t('common.close')} · Esc`} placement="left">
          <button type="button" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </Tooltip>
        {onStep && (
          <>
            <Tooltip title={`${t('contracts.card.prev')} · ↑`} placement="left">
              <button type="button" onClick={() => onStep(-1)} aria-label={t('contracts.card.prev')}>↑</button>
            </Tooltip>
            <Tooltip title={`${t('contracts.card.next')} · ↓`} placement="left">
              <button type="button" onClick={() => onStep(1)} aria-label={t('contracts.card.next')}>↓</button>
            </Tooltip>
          </>
        )}
        <Tooltip title={t('contracts.card.copyLink')} placement="left">
          <button type="button" onClick={copyLink} aria-label={t('contracts.card.copyLink')}>🔗</button>
        </Tooltip>
      </div>
      <div className="ctr-panel" role="dialog" aria-modal="true" aria-label={contract ? `${contract.number} ${contract.title}` : t('contracts.contract')}>
        <button type="button" className="ctr-panel__close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        {error ? (
          <div className="ctr-panel__error">
            <strong>{error.response?.status === 404 ? t('contracts.card.notFound') : t('contracts.loadError')}</strong>
            <span>{errorMessage(error)}</span>
            <Button onClick={onClose}>{t('common.back')}</Button>
          </div>
        ) : !data ? (
          <div className="ctr-panel__scroll">
            <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 3 }} />
            <Skeleton.Button active block style={{ height: 88, marginTop: 16 }} />
            <Skeleton active paragraph={{ rows: 8 }} />
          </div>
        ) : (
          <div className="ctr-panel__scroll">
            <header className={`ctr-head is-${contract.status}`}>
              <div className="ctr-head__meta">
                <span className="ctr-head__number">{contract.number}</span>
                <StatusPill status={contract.status} size="lg" />
                <TypeTag typeKey={contract.typeKey} />
                {contract.direction && <span className={`ctr-dir is-${contract.direction}`}>{t(`contracts.direction.${contract.direction}`)}</span>}
                <span className="ctr-grow" />
                <HelpButton id="contracts" />
                <Dropdown
                  trigger={['click']}
                  placement="bottomRight"
                  menu={{
                    items: [
                      { key: 'link', label: t('contracts.card.copyLink'), onClick: copyLink },
                      data.can.edit && { key: 'edit', label: t('common.edit'), onClick: () => setEditing(true) },
                      data.can.delete && { type: 'divider' },
                      data.can.delete && { key: 'delete', danger: true, label: t('common.delete'), onClick: remove },
                    ].filter(Boolean),
                  }}
                >
                  <button type="button" className="ctr-icon-btn ctr-head__menu" aria-label={t('contracts.card.menu')}>⋯</button>
                </Dropdown>
              </div>
              <h2 className="ctr-head__title">{contract.title}</h2>
              {(contract.counterparty || contract.legalEntity) && (
                <div className="ctr-head__parties">
                  {contract.counterparty && <span className="ctr-head__cp">{contract.counterparty}</span>}
                  {contract.counterparty && contract.legalEntity && <span className="ctr-head__sep">⇄</span>}
                  {contract.legalEntity && <span className="ctr-muted">{contract.legalEntity.name}</span>}
                </div>
              )}
              <div className="ctr-facts">
                <div className="ctr-fact">
                  <span>{t('contracts.fields.amount')}</span>
                  <strong><Money contract={contract} /></strong>
                  {contract.payments?.total > 0 && (
                    <button type="button" className="ctr-fact__pay" onClick={() => setTab('payments')}>
                      <PayBar percent={contract.payments.percent} overdue={payOverdue} size="sm" />
                      <em>{t('contracts.pay.percent', { p: contract.payments.percent })}</em>
                    </button>
                  )}
                </div>
                <div className="ctr-fact">
                  <span>{t('contracts.card.term')}</span>
                  <strong className="ctr-fact__term">
                    {!contract.startsOn && !contract.endsOn ? (
                      <span className="ctr-muted">—</span>
                    ) : (
                      <>
                        {contract.startsOn ? fmtDate(contract.startsOn) : '…'} — {contract.endsOn ? <EndDate contract={contract} compact /> : t('contracts.fields.noEnd').toLowerCase()}
                      </>
                    )}
                  </strong>
                </div>
                {contract.noticeDeadline && (
                  <div className={`ctr-fact${noticeLeft !== null && noticeLeft >= 0 && noticeLeft <= 14 ? ' is-warn' : ''}`}>
                    <span>{t('contracts.fields.noticeDeadline')}</span>
                    <strong>{fmtDate(contract.noticeDeadline)}</strong>
                  </div>
                )}
                <div className="ctr-fact ctr-fact--people">
                  <span>{t('contracts.card.people')}</span>
                  <strong>
                    <Tooltip title={`${t('contracts.fields.owner')}: ${contract.owner?.name || '—'}`}>
                      <span><Avatar user={contract.owner} size={26} /></span>
                    </Tooltip>
                    <Tooltip title={`${t('contracts.fields.lawyer')}: ${contract.lawyer?.name || '—'}`}>
                      <span className="ctr-fact__lawyer">{contract.lawyer ? <Avatar user={contract.lawyer} size={26} /> : <span className="ctr-muted">⚖ —</span>}</span>
                    </Tooltip>
                  </strong>
                </div>
              </div>
            </header>

            {showApproval && (
              <section className="ctr-approval">
                {process && <ApprovalPath process={process} compact />}
                <div className="ctr-approval__decide">
                  {inApproval && <HighRisksCallout risks={data.risks} onOpen={(risk) => { setTab('overview'); setParams((prev) => { const next = new URLSearchParams(prev); next.set('risk', risk.no); return next; }, { replace: true }); }} />}
                  {data.can.start && !data.versions.length ? (
                    <div className="ctr-approval__need">
                      <span>{t('contracts.card.needFile')}</span>
                      <Button size="small" onClick={() => setTab('versions')}>{t('contracts.card.toVersions')}</Button>
                    </div>
                  ) : (
                    <ApprovalActions type={TYPE_KEY} docId={contract.id} process={process} allowStart={data.can.start} onChange={(next) => { setProcess(next); changed(); }} />
                  )}
                </div>
              </section>
            )}

            <StatusActions data={data} onDone={(next) => { setData(next); changed(); reloadProcess(); }} />

            <nav className="ctr-tabs" role="tablist">
              {TABS.filter((key) => (key !== 'discussion' || modules.chat) && (key !== 'payments' || paymentsRelevant(contract))).map((key) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
                  {t(`contracts.tabs.${key}`)}
                  {key === 'versions' && counts.versions > 0 && <em>{counts.versions}</em>}
                  {key === 'overview' && counts.overview > 0 && <em className="is-risk">{counts.overview}</em>}
                  {key === 'payments' && payOverdue && <em className="is-risk">!</em>}
                </button>
              ))}
            </nav>
            <div className="ctr-tabpane">
              {tab === 'overview' && <Overview data={data} onEdit={() => setEditing(true)} onChanged={changed} onDiscuss={modules.chat ? discussRisk : null} highlightRisk={highlightRisk} />}
              {tab === 'payments' && <Payments contract={contract} onChanged={() => { load(); onChanged?.(); touch(); }} />}
              {tab === 'versions' && <Versions data={data} onChanged={changed} />}
              {tab === 'discussion' && <Discussion data={data} chatEnabled={modules.chat} risk={riskTalk} onRiskDone={() => setRiskTalk(null)} />}
              {tab === 'links' && <Links data={data} onChanged={changed} />}
              {tab === 'history' && <History contract={contract} process={process} refreshKey={refreshKey} />}
            </div>
          </div>
        )}
      </div>
      {contract && (
        <ContractForm
          open={editing}
          contract={contract}
          onClose={(next) => {
            setEditing(false);
            if (next) {
              setData(next);
              changed();
            }
          }}
        />
      )}
    </div>
  );
  return createPortal(panel, document.body);
}
