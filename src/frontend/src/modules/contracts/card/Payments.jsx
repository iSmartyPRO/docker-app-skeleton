import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Dropdown, Popconfirm, Skeleton, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, InfoCircleOutlined, MoreOutlined, PaperClipOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { contractsApi } from '../api';
import { formatMoney, payError } from '../lib';
import { Empty } from '../components/bits';
import { DepositDialog, DepositStatusDialog, FilePick, PaymentDialog, ScheduleDialog } from './payDialogs';

/** «Оплачено 45 %» bar; `overdue` paints the unpaid part red. */
export function PayBar({ percent, overdue = false, size = 'md' }) {
  return (
    <span className={`ctr-paybar is-${size}${overdue ? ' is-overdue' : ''}${percent >= 100 ? ' is-full' : ''}`} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </span>
  );
}

/** A deposit / row state as a soft pill. */
export function PayState({ state, partial }) {
  const { t } = useLocale();
  return <span className={`ctr-paystate is-${state}`}>{partial && state !== 'paid' ? `${t(`contracts.pay.state.${state}`)} · ${t('contracts.pay.state.partial').toLowerCase()}` : t(`contracts.pay.state.${state}`)}</span>;
}

/** Why Masterplan refused, in words. */
function MasterplanNotes({ unit }) {
  const { t } = useLocale();
  if (!unit?.notes?.length) return null;
  const reason = (code) => {
    const key = `contracts.pay.masterplan.reason.${code}`;
    const text = t(key);
    return text === key ? t('contracts.pay.masterplan.reason.other', { code }) : text;
  };
  return (
    <div className="ctr-pay-alert is-warn" role="status">
      <strong>{t('contracts.pay.masterplan.noteTitle')}</strong>
      {unit.notes.map((note) => (
        <p key={note.action}>{t(`contracts.pay.masterplan.note.${note.action}`, { unit: unit.code || t('contracts.pay.masterplan.title'), reason: reason(note.code) })}</p>
      ))}
      {unit.url && <Link to={unit.url}>{t('contracts.pay.masterplan.open')} →</Link>}
    </div>
  );
}

/** The deposit block on top: terms, status, who confirmed, the finance actions. */
function DepositBlock({ contract, pay, onChanged }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState(null);
  const deposit = pay.deposit;
  const money = (value) => formatMoney(value, deposit?.currency || pay.currency, locale);
  const done = (data) => {
    setEditing(false);
    setTo(null);
    onChanged(data);
    const sync = (data.masterplanSync || []).find((item) => item && item.result === 'applied' && item.to);
    if (sync) message.success(t('contracts.pay.masterplan.applied', { unit: sync.unit?.code || '', status: t(`mp.status.${sync.to}`) }));
  };
  const call = async (fn) => {
    try {
      onChanged((await fn()).data);
    } catch (err) {
      message.error(payError(err, t));
    }
  };

  if (!deposit) {
    return (
      <section className="ctr-pay-card ctr-pay-deposit is-empty">
        <div className="ctr-pay-deposit__empty">
          <span className="ctr-pay-deposit__icon" aria-hidden="true">🔐</span>
          <div>
            <strong>{t('contracts.pay.deposit.title')}</strong>
            <p>{t('contracts.pay.deposit.hint.deposit')}</p>
          </div>
          {pay.can.plan && (
            <Button icon={<PlusOutlined />} onClick={() => setEditing(true)}>
              {t('contracts.pay.startDeposit')}
            </Button>
          )}
        </div>
        <DepositDialog open={editing} contract={contract} deposit={null} onClose={() => setEditing(false)} onDone={done} />
      </section>
    );
  }

  const late = deposit.status === 'expected' && deposit.dueOn && deposit.dueOn < pay.today;
  const finance = pay.can.finance;
  const statusActions = finance
    ? deposit.status === 'expected'
      ? []
      : [
          deposit.status === 'received' && { key: 'credited', label: t('contracts.pay.deposit.credit') },
          ['received', 'credited'].includes(deposit.status) && { key: 'returned', label: t('contracts.pay.deposit.return') },
          ['received', 'credited'].includes(deposit.status) && { key: 'forfeited', label: t('contracts.pay.deposit.forfeit'), danger: true },
          { type: 'divider' },
          { key: 'expected', label: t('contracts.pay.deposit.undo') },
        ].filter(Boolean)
    : [];
  const menu = [
    pay.can.plan && { key: 'edit', icon: <EditOutlined />, label: t('contracts.pay.deposit.edit') },
    ...statusActions,
    pay.can.plan && deposit.status === 'expected' && { type: 'divider' },
    pay.can.plan && deposit.status === 'expected' && { key: 'remove', icon: <DeleteOutlined />, danger: true, label: t('contracts.pay.deposit.remove') },
  ].filter(Boolean);
  const onMenu = ({ key }) => {
    if (key === 'edit') setEditing(true);
    else if (key === 'remove') call(() => contractsApi.removeDeposit(contract.id));
    else if (key === 'expected') call(() => contractsApi.depositStatus(contract.id, { status: 'expected' }));
    else setTo(key);
  };

  return (
    <section className={`ctr-pay-card ctr-pay-deposit is-${deposit.status}${late ? ' is-late' : ''}`}>
      <header className="ctr-pay-deposit__head">
        <span className="ctr-pay-deposit__kind">
          {t(`contracts.pay.deposit.kindShort.${deposit.kind}`)}
          <Tooltip title={t(`contracts.pay.deposit.hint.${deposit.kind}`)}>
            <InfoCircleOutlined className="ctr-pay-deposit__info" aria-label={t(`contracts.pay.deposit.hint.${deposit.kind}`)} />
          </Tooltip>
        </span>
        <span className={`ctr-depstatus is-${deposit.status}`}>{late ? t('contracts.pay.deposit.overdue') : t(`contracts.pay.deposit.status.${deposit.status}`)}</span>
        <span className="ctr-grow" />
        {finance && deposit.status === 'expected' && (
          <Button type="primary" size="small" onClick={() => setTo('received')}>
            {t('contracts.pay.deposit.confirm')}
          </Button>
        )}
        {menu.length > 0 && (
          <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: menu, onClick: onMenu }}>
            <Button size="small" type="text" icon={<MoreOutlined />} aria-label={t('contracts.card.menu')} />
          </Dropdown>
        )}
      </header>
      <div className="ctr-pay-deposit__body">
        <strong className="ctr-pay-deposit__amount">{money(deposit.amount)}</strong>
        <dl className="ctr-pay-deposit__facts">
          {deposit.dueOn && (
            <div>
              <dt>{t('contracts.pay.deposit.dueOn')}</dt>
              <dd className={late ? 'is-late' : ''}>{fmtDate(deposit.dueOn)}</dd>
            </div>
          )}
          {deposit.receivedOn && deposit.status !== 'expected' && (
            <div>
              <dt>{t('contracts.pay.deposit.receivedOn')}</dt>
              <dd>
                {fmtDate(deposit.receivedOn)}
                {deposit.method ? ` · ${t(`contracts.pay.method.${deposit.method}`)}` : ''}
                {deposit.reference ? ` · № ${deposit.reference}` : ''}
              </dd>
            </div>
          )}
          {['returned', 'forfeited'].includes(deposit.status) && (deposit.settledAmount || deposit.settledOn) && (
            <div>
              <dt>{t(`contracts.pay.deposit.status.${deposit.status}`)}</dt>
              <dd>{t('contracts.pay.deposit.settled', { amount: deposit.settledAmount !== null ? money(deposit.settledAmount) : '—', date: deposit.settledOn ? fmtDate(deposit.settledOn) : '—' })}</dd>
            </div>
          )}
        </dl>
      </div>
      {deposit.terms && <p className="ctr-pay-deposit__terms">{deposit.terms}</p>}
      <footer className="ctr-pay-deposit__foot">
        {deposit.file ? (
          <a href={deposit.file.url} target="_blank" rel="noreferrer" className="ctr-pay-doc">
            <PaperClipOutlined /> {deposit.file.name}
          </a>
        ) : (
          pay.can.plan && <FilePick file={null} onChange={(file) => file && call(() => contractsApi.depositFile(contract.id, file))} label={t('contracts.pay.deposit.attach')} />
        )}
        {deposit.confirmedBy && <span className="ctr-muted ctr-small">{t('contracts.pay.deposit.confirmedBy', { name: deposit.confirmedBy.name || '', when: fmtDateTime(deposit.confirmedAt) })}</span>}
      </footer>
      {pay.totals.depositHeld && <p className="ctr-pay-hint">{t('contracts.pay.deposit.held')}</p>}
      {deposit.currency && pay.currency && deposit.currency !== pay.currency && <p className="ctr-pay-hint">{t('contracts.pay.deposit.otherCurrency')}</p>}
      <DepositDialog open={editing} contract={contract} deposit={deposit} onClose={() => setEditing(false)} onDone={done} />
      <DepositStatusDialog open={Boolean(to)} contract={contract} deposit={deposit} to={to} onClose={() => setTo(null)} onDone={done} />
    </section>
  );
}

/** The schedule: plan vs fact per row, overdue red, upcoming amber. */
function ScheduleBlock({ pay, onEdit }) {
  const { t, locale } = useLocale();
  const money = (value) => formatMoney(value, pay.currency, locale);
  if (!pay.schedule.length) {
    return (
      <section className="ctr-pay-card">
        <Empty icon="🗓" title={t('contracts.pay.schedule.empty')} text={pay.amount ? t('contracts.pay.schedule.emptyText') : t('contracts.pay.noAmount')} action={pay.can.plan && pay.amount ? <Button type="primary" icon={<PlusOutlined />} onClick={onEdit}>{t('contracts.pay.schedule.build')}</Button> : null} />
      </section>
    );
  }
  const total = pay.totals.total;
  const diff = pay.amount !== null && pay.amount !== undefined ? Math.round((total - pay.amount) * 100) / 100 : 0;
  return (
    <section className="ctr-pay-card">
      <header className="ctr-section__head">
        <h3>{t('contracts.pay.schedule.title')}</h3>
        {pay.plan?.source && <span className="ctr-muted ctr-small">{t('contracts.pay.schedule.fromPlan', { source: pay.plan.source })}</span>}
        <span className="ctr-grow" />
        {pay.can.plan && (
          <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
            {t('contracts.pay.schedule.rebuild')}
          </Button>
        )}
      </header>
      {diff !== 0 && <div className="ctr-pay-alert is-warn">{t('contracts.pay.schedule.mismatch', { sum: money(total), amount: money(pay.amount), diff: money(diff) })}</div>}
      <ol className="ctr-plan">
        {pay.schedule.map((row) => {
          const pct = row.amount > 0 ? Math.min(100, Math.floor((row.paid / row.amount) * 100)) : 0;
          return (
            <li key={row.id} className={`ctr-plan__row is-${row.state}`}>
              <span className="ctr-plan__date">
                <strong>{fmtDate(row.dueOn)}</strong>
                <small>{t(`contracts.pay.purpose.${row.purpose}`)}</small>
              </span>
              <span className="ctr-plan__fact">
                <PayBar percent={pct} overdue={row.state === 'overdue'} size="sm" />
                <small>{row.paid > 0 && row.paid < row.amount ? `${money(row.paid)} / ${money(row.amount)}` : row.state === 'paid' ? money(row.paid) : ' '}</small>
              </span>
              <span className="ctr-plan__amount">{money(row.amount)}</span>
              <PayState state={row.state} partial={row.paid > 0 && row.paid < row.amount} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * «Оплаты»: the deposit on top, the summary with the plan / fact progress, the
 * schedule and the payments received. Finance confirms the deposit and
 * registers payments; the contract's people plan them.
 */
export default function Payments({ contract, onChanged }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [pay, setPay] = useState(null);
  const [error, setError] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(() => {
    contractsApi
      .payments(contract.id)
      .then((res) => {
        setPay(res.data);
        setError(null);
      })
      .catch(setError);
  }, [contract.id]);
  useEffect(() => {
    load();
  }, [load]);

  const changed = (data) => {
    if (data?.schedule) setPay(data);
    else load();
    onChanged?.();
  };
  const removePayment = async (id) => {
    try {
      changed((await contractsApi.removePayment(id)).data);
    } catch (err) {
      message.error(payError(err, t));
    }
  };

  if (error) return <Empty icon="⚠️" title={t('contracts.loadError')} text={payError(error, t)} action={<Button onClick={load}>{t('common.retry')}</Button>} />;
  if (!pay) return <Skeleton active paragraph={{ rows: 6 }} />;
  const money = (value) => formatMoney(value, pay.currency, locale);
  const { totals } = pay;
  const hasPlan = pay.schedule.length > 0;
  const next = totals.next;

  return (
    <div className="ctr-pay">
      {(hasPlan || pay.payments.length > 0) && (
        <section className={`ctr-pay-summary${totals.overdue > 0 ? ' is-overdue' : ''}${totals.full ? ' is-full' : ''}`}>
          <div className="ctr-pay-summary__top">
            <div>
              <span className="ctr-pay-summary__label">{t('contracts.pay.paidOf', { paid: money(totals.paid), total: money(totals.total || pay.amount || 0) })}</span>
              <strong className="ctr-pay-summary__pct">{t('contracts.pay.percent', { p: totals.percent })}</strong>
            </div>
            {pay.can.finance && !totals.full && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setPaying(true)}>
                {t('contracts.pay.addPayment')}
              </Button>
            )}
          </div>
          <PayBar percent={totals.percent} overdue={totals.overdue > 0} size="lg" />
          <dl className="ctr-pay-summary__facts">
            <div>
              <dt>{t('contracts.pay.paidLabel')}</dt>
              <dd>{money(totals.paid)}</dd>
            </div>
            <div>
              <dt>{t('contracts.pay.remaining')}</dt>
              <dd>{money(totals.remaining)}</dd>
            </div>
            <div className={totals.overdue > 0 ? 'is-overdue' : ''}>
              <dt>{t('contracts.pay.overdue')}</dt>
              <dd>{money(totals.overdue)}</dd>
            </div>
            <div className={next ? `is-${next.state}` : ''}>
              <dt>{t('contracts.pay.next')}</dt>
              <dd>{next ? t('contracts.pay.nextOn', { amount: money(next.amount), date: fmtDate(next.dueOn) }) : t('contracts.pay.nothingNext')}</dd>
            </div>
          </dl>
        </section>
      )}

      {!hasPlan && !pay.deposit && !pay.payments.length && (
        <p className="ctr-pay-intro">{pay.can.plan || pay.can.finance ? t('contracts.pay.intro') : t('contracts.pay.readOnly')}</p>
      )}

      {pay.masterplan && (
        <div className="ctr-pay-unit">
          <span aria-hidden="true">🏗</span>
          {pay.masterplan.url ? <Link to={pay.masterplan.url}>{t('contracts.pay.masterplan.unit', { code: pay.masterplan.code })}</Link> : <span>{t('contracts.pay.masterplan.title')}</span>}
          {pay.masterplan.status && <span className={`ctr-mpstatus is-${pay.masterplan.status}`}>{t(`mp.status.${pay.masterplan.status}`)}</span>}
        </div>
      )}
      <MasterplanNotes unit={pay.masterplan} />

      <DepositBlock contract={contract} pay={pay} onChanged={changed} />
      <ScheduleBlock pay={pay} onEdit={() => setScheduling(true)} />

      <section className="ctr-pay-card">
        <header className="ctr-section__head">
          <h3>{t('contracts.pay.payments.title')}</h3>
          <span className="ctr-grow" />
          {pay.can.finance && !hasPlan && (
            <Button size="small" icon={<PlusOutlined />} onClick={() => setPaying(true)}>
              {t('contracts.pay.addPayment')}
            </Button>
          )}
        </header>
        {pay.payments.length ? (
          <ul className="ctr-ledger">
            {pay.payments.map((item) => (
              <li key={item.id}>
                <span className="ctr-ledger__icon" aria-hidden="true">💳</span>
                <span className="ctr-ledger__text">
                  <strong>{money(item.amount)}</strong>
                  <small>
                    {fmtDate(item.paidOn)} · {t(`contracts.pay.method.${item.method}`)}
                    {item.reference ? ` · № ${item.reference}` : ''}
                    {item.author?.name ? ` · ${item.author.name}` : ''}
                  </small>
                  {item.note && <small>{item.note}</small>}
                  {item.file && (
                    <a href={item.file.url} target="_blank" rel="noreferrer" className="ctr-pay-doc">
                      <PaperClipOutlined /> {item.file.name}
                    </a>
                  )}
                </span>
                {pay.can.finance && (
                  <Popconfirm title={t('contracts.pay.payments.removeTitle')} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={() => removePayment(item.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
                  </Popconfirm>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="ctr-section__empty">{pay.can.finance ? t('contracts.pay.payments.emptyFinance') : t('contracts.pay.payments.emptyOther')}</div>
        )}
      </section>

      <ScheduleDialog open={scheduling} contract={contract} pay={pay} onClose={() => setScheduling(false)} onDone={(data) => { setScheduling(false); changed(data); }} />
      <PaymentDialog
        open={paying}
        target={{ id: contract.id, number: contract.number, currency: pay.currency, remaining: totals.remaining, total: totals.total, suggested: next ? next.amount : totals.remaining > 0 ? totals.remaining : null }}
        onClose={() => setPaying(false)}
        onDone={(data) => {
          setPaying(false);
          changed(data);
          const sync = (data.masterplanSync || []).find((item) => item && item.result === 'applied' && item.to);
          if (sync) message.success(t('contracts.pay.masterplan.applied', { unit: sync.unit?.code || '', status: t(`mp.status.${sync.to}`) }));
        }}
      />
    </div>
  );
}
