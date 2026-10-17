import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Checkbox, Drawer, Input, InputNumber, Modal, Popconfirm, Select, Skeleton } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { DeleteOutlined, PaperClipOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDate, todayISO } from '../../../lib/datetime';
import { DateField } from '../../../components/ui/DateTimeField';
import { contractsApi } from '../api';
import { useContracts } from '../ContractsContext';
import { formatMoney, payError } from '../lib';

/*
 * Dialogs of the «Оплаты» tab and the payments registry: the deposit's terms,
 * the deposit's status (finance), a received payment (finance) and the
 * schedule builder (100 % / installments, prefilled from the Masterplan price
 * grid when the contract is linked to an object).
 */

const METHODS = ['bank', 'cash', 'card', 'other'];
const PURPOSES = ['deposit', 'first', 'monthly', 'rest', 'full'];
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
/** 1 234 567.5 in amount fields (digits grouped by thin spaces), parsed back without them. */
const groupDigits = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const [int, dec] = String(value).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')}${dec !== undefined ? `.${dec}` : ''}`;
};
const ungroup = (text) => String(text || '').replace(/[\s\u202f\u00a0]/g, '').replace(',', '.');
const moneyInput = { formatter: groupDigits, parser: ungroup };

/** One file picker button with the chosen name. */
export function FilePick({ file, onChange, label }) {
  const ref = useRef(null);
  return (
    <div className="ctr-pay-file">
      <Button icon={<PaperClipOutlined />} onClick={() => ref.current?.click()}>
        {label}
      </Button>
      {file && (
        <span className="ctr-pay-file__chip">
          {file.name}
          <button type="button" onClick={() => onChange(null)} aria-label="×">✕</button>
        </span>
      )}
      <input ref={ref} type="file" accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx" hidden onChange={(event) => { onChange(event.target.files?.[0] || null); event.target.value = ''; }} />
    </div>
  );
}

/** «Задаток»: create or edit the terms (kind, amount, currency, due day, refund / forfeit conditions). */
export function DepositDialog({ open, contract, deposit, onClose, onDone }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings } = useContracts();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(deposit ? { kind: deposit.kind, amount: deposit.amount, currency: deposit.currency || contract.currency, dueOn: deposit.dueOn, terms: deposit.terms || '' } : { kind: 'deposit', amount: null, currency: contract.currency || settings.defaultCurrency, dueOn: null, terms: '' });
  }, [open, deposit, contract.currency, settings.defaultCurrency]);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const received = deposit && deposit.status !== 'expected';
  const submit = async () => {
    setBusy(true);
    try {
      const payload = { kind: form.kind, dueOn: form.dueOn || null, terms: form.terms || null };
      if (!received) Object.assign(payload, { amount: form.amount, currency: form.currency });
      const res = await contractsApi.saveDeposit(contract.id, payload);
      onDone(res.data);
    } catch (err) {
      message.error(payError(err, t));
    } finally {
      setBusy(false);
    }
  };
  const currencies = settings.currencies?.length ? settings.currencies : ['KGS', 'USD', 'RUB'];
  return (
    <Modal open={open} onCancel={onClose} title={deposit ? t('contracts.pay.deposit.editTitle') : t('contracts.pay.deposit.newTitle')} okText={t('common.save')} onOk={submit} okButtonProps={{ loading: busy, disabled: !(Number(form.amount) > 0) }} destroyOnClose>
      <div className="ctr-pay-form">
        <Segmented block value={form.kind} onChange={(kind) => set({ kind })} options={['deposit', 'advance'].map((kind) => ({ value: kind, label: t(`contracts.pay.deposit.kind.${kind}`) }))} />
        <p className="ctr-pay-hint">{t(`contracts.pay.deposit.hint.${form.kind || 'deposit'}`)}</p>
        <label htmlFor="dep-amount">{t('contracts.pay.deposit.amount')}</label>
        <div className="ctr-pay-form__row">
          <InputNumber {...moneyInput} id="dep-amount" value={form.amount} onChange={(amount) => set({ amount })} min={0.01} step={100} style={{ flex: 1 }} autoFocus inputMode="decimal" disabled={received} />
          <Select value={form.currency} onChange={(currency) => set({ currency })} options={currencies.map((code) => ({ value: code, label: code }))} style={{ width: 96 }} disabled={received} aria-label={t('contracts.pay.deposit.currency')} />
        </div>
        <label>{t('contracts.pay.deposit.dueOn')}</label>
        <DateField value={form.dueOn} onChange={(dueOn) => set({ dueOn })} style={{ width: '100%' }} />
        <label htmlFor="dep-terms">{t('contracts.pay.deposit.terms')}</label>
        <Input.TextArea id="dep-terms" value={form.terms} onChange={(event) => set({ terms: event.target.value })} maxLength={2000} autoSize={{ minRows: 2, maxRows: 6 }} placeholder={t('contracts.pay.deposit.termsPh')} />
      </div>
    </Modal>
  );
}

/** Finance: confirm receipt / credit / return / retain the deposit (`to`), with the payment document. */
export function DepositStatusDialog({ open, contract, deposit, to, onClose, onDone }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ receivedOn: deposit?.receivedOn || todayISO(), method: deposit?.method || 'bank', reference: deposit?.reference || '', settledAmount: to === 'returned' ? deposit?.amount : null, settledOn: todayISO(), note: '' });
      setFile(null);
    }
  }, [open, deposit, to]);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  if (!deposit || !to) return null;
  const money = (value) => formatMoney(value, deposit.currency, locale);
  const submit = async () => {
    setBusy(true);
    try {
      const payload = { status: to, note: form.note || undefined };
      if (to === 'received') Object.assign(payload, { receivedOn: form.receivedOn, method: form.method, reference: form.reference });
      if (['returned', 'forfeited'].includes(to)) Object.assign(payload, { settledOn: form.settledOn, settledAmount: form.settledAmount ?? undefined });
      const res = await contractsApi.depositStatus(contract.id, payload, file);
      onDone(res.data);
    } catch (err) {
      message.error(payError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onCancel={onClose} title={t(`contracts.pay.deposit.statusTitle.${to}`)} okText={t(`contracts.pay.deposit.${{ received: 'confirm', credited: 'credit', returned: 'return', forfeited: 'forfeit' }[to]}`)} onOk={submit} okButtonProps={{ loading: busy, danger: to === 'forfeited' }} destroyOnClose>
      <div className="ctr-pay-form">
        <div className="ctr-pay-dlg-sum">
          <span>{t(`contracts.pay.deposit.kindShort.${deposit.kind}`)}</span>
          <strong>{money(deposit.amount)}</strong>
        </div>
        <p className="ctr-pay-hint">{t(`contracts.pay.deposit.statusHint.${to}`)}</p>
        {to === 'received' && (
          <>
            <label>{t('contracts.pay.deposit.receivedOn')}</label>
            <DateField value={form.receivedOn} onChange={(receivedOn) => set({ receivedOn })} style={{ width: '100%' }} />
            <label>{t('contracts.pay.deposit.method')}</label>
            <Segmented block value={form.method} onChange={(method) => set({ method })} options={METHODS.map((key) => ({ value: key, label: t(`contracts.pay.method.${key}`) }))} />
            <label htmlFor="dep-ref">{t('contracts.pay.deposit.reference')}</label>
            <Input id="dep-ref" value={form.reference} onChange={(event) => set({ reference: event.target.value })} maxLength={80} placeholder="№ 123" />
            <FilePick file={file} onChange={setFile} label={t('contracts.pay.deposit.file')} />
          </>
        )}
        {['returned', 'forfeited'].includes(to) && (
          <>
            <label htmlFor="dep-settled">{t('contracts.pay.deposit.settledAmount')}</label>
            <InputNumber {...moneyInput} id="dep-settled" value={form.settledAmount} onChange={(settledAmount) => set({ settledAmount })} min={0} style={{ width: '100%' }} addonAfter={deposit.currency} inputMode="decimal" />
            {to === 'returned' && deposit.kind === 'deposit' && (
              <button type="button" className="ctr-link-btn ctr-pay-double" onClick={() => set({ settledAmount: round2(deposit.amount * 2) })}>
                {t('contracts.pay.deposit.double', { amount: money(deposit.amount * 2) })}
              </button>
            )}
            <label>{t('contracts.pay.payments.date')}</label>
            <DateField value={form.settledOn} onChange={(settledOn) => set({ settledOn })} style={{ width: '100%' }} />
          </>
        )}
        <label htmlFor="dep-note">{t('contracts.pay.deposit.note')}</label>
        <Input.TextArea id="dep-note" value={form.note} onChange={(event) => set({ note: event.target.value })} maxLength={1000} autoSize={{ minRows: 1, maxRows: 4 }} />
      </div>
    </Modal>
  );
}

/**
 * «Поступление» (finance): amount (the next payment's or what is left by
 * default), date, method, number, document. Used by the card and the registry.
 * `target` = { id, number, currency, remaining, total, suggested }.
 */
export function PaymentDialog({ open, target, onClose, onDone }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && target) {
      setForm({ amount: target.suggested ?? (target.remaining > 0 ? target.remaining : null), paidOn: todayISO(), method: 'bank', reference: '', note: '' });
      setFile(null);
    }
  }, [open, target]);
  if (!target) return null;
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const money = (value) => formatMoney(value, target.currency, locale);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await contractsApi.addPayment(target.id, form, file);
      message.success(res.data.totals?.full ? t('contracts.pay.payments.doneFull') : t('contracts.pay.payments.done'));
      onDone(res.data);
    } catch (err) {
      message.error(payError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onCancel={onClose} title={`${t('contracts.pay.payments.dialog')} · ${target.number}`} okText={t('contracts.pay.payments.ok')} onOk={submit} okButtonProps={{ loading: busy, disabled: !(Number(form.amount) > 0) }} destroyOnClose>
      <div className="ctr-pay-form">
        {target.total > 0 && <p className="ctr-pay-hint">{t('contracts.pay.payments.left', { left: money(target.remaining), total: money(target.total) })}</p>}
        <label htmlFor="pay-amount">{t('contracts.pay.payments.amount')}</label>
        <InputNumber {...moneyInput} id="pay-amount" value={form.amount} onChange={(amount) => set({ amount })} min={0.01} step={100} addonAfter={target.currency || undefined} style={{ width: '100%' }} autoFocus inputMode="decimal" />
        <small className="ctr-muted">{t('contracts.pay.payments.applied')}</small>
        <label>{t('contracts.pay.payments.date')}</label>
        <DateField value={form.paidOn} onChange={(paidOn) => set({ paidOn })} style={{ width: '100%' }} />
        <label>{t('contracts.pay.payments.method')}</label>
        <Segmented block value={form.method} onChange={(method) => set({ method })} options={METHODS.map((key) => ({ value: key, label: t(`contracts.pay.method.${key}`) }))} />
        <label htmlFor="pay-ref">{t('contracts.pay.payments.reference')}</label>
        <Input id="pay-ref" value={form.reference} onChange={(event) => set({ reference: event.target.value })} maxLength={80} placeholder="№ 123" />
        <label htmlFor="pay-note">{t('contracts.pay.payments.note')}</label>
        <Input.TextArea id="pay-note" value={form.note} onChange={(event) => set({ note: event.target.value })} maxLength={1000} autoSize={{ minRows: 1, maxRows: 4 }} />
        <FilePick file={file} onChange={setFile} label={t('contracts.pay.payments.file')} />
      </div>
    </Modal>
  );
}

/**
 * The schedule builder: 100 % or installments (first payment %, months, first
 * day, monthly day), prefilled from the object's price grid; the rows preview
 * live (server arithmetic) and stay editable before saving.
 */
export function ScheduleDialog({ open, contract, pay, onClose, onDone }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [plans, setPlans] = useState(null);
  const [plan, setPlan] = useState(null);
  const [rows, setRows] = useState([]);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const money = (value) => formatMoney(value, pay.currency, locale);
  const deposit = pay.deposit && !['returned', 'forfeited'].includes(pay.deposit.status) ? pay.deposit : null;

  useEffect(() => {
    if (!open) return;
    const saved = pay.plan && pay.plan.mode !== 'manual' ? pay.plan : null;
    const firstOn = saved?.firstOn || todayISO();
    setPlan({ mode: saved?.mode || 'installments', firstPct: saved?.firstPct ?? 30, months: saved?.months || 12, firstOn, startOn: saved?.startOn || null, day: saved?.day || null, offset: saved?.offset !== false, source: saved?.source || null });
    setRows(pay.schedule.map((row) => ({ id: row.id, dueOn: row.dueOn, amount: row.amount, purpose: row.purpose, note: row.note })));
    setEdited(pay.schedule.length > 0);
    setError(null);
    setPlans(null);
    contractsApi
      .paymentPlans(contract.id)
      .then((res) => setPlans(res.data))
      .catch(() => setPlans({ plans: [] }));
  }, [open, contract.id, pay.plan, pay.schedule]);

  // Live preview of the plan (unless the rows were edited by hand after it).
  useEffect(() => {
    if (!open || !plan || edited) return undefined;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      contractsApi
        .previewSchedule(contract.id, plan)
        .then((res) => {
          if (mine !== seq.current) return;
          setRows(res.data.rows);
          setError(null);
        })
        .catch((err) => mine === seq.current && setError(payError(err, t)));
    }, 250);
    return () => clearTimeout(timer);
  }, [open, plan, edited, contract.id]);

  const setPlanField = (patch) => {
    setEdited(false);
    setPlan((prev) => ({ ...prev, ...patch }));
  };
  const setRow = (index, patch) => {
    setEdited(true);
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const total = useMemo(() => round2(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)), [rows]);
  const amount = pay.amount;
  const diff = amount !== null && amount !== undefined ? round2(total - amount) : 0;

  const save = async (clear = false) => {
    setBusy(true);
    try {
      const payload = clear ? { rows: [] } : { rows: rows.map((row) => ({ id: row.id, dueOn: row.dueOn, amount: row.amount, purpose: row.purpose, note: row.note })), plan: { ...plan, source: plan.source || undefined } };
      const res = await contractsApi.saveSchedule(contract.id, payload);
      onDone(res.data);
    } catch (err) {
      message.error(payError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const picked = plans?.plans?.find((item) => plan?.source?.startsWith(item.name)) || null;
  const pickPlan = (item) => {
    setPlanField({ mode: item.months > 0 && item.firstPct < 100 ? 'installments' : 'full', firstPct: item.firstPct, months: item.months || 0, source: `${item.name}${plans?.unit?.code ? ` · ${plans.unit.code}` : ''}` });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={680}
      title={t('contracts.pay.plan.title')}
      destroyOnClose
      className="ctr-form-drawer ctr-sched-drawer"
      footer={
        <div className="ctr-form-foot">
          {pay.schedule.length > 0 && (
            <Popconfirm title={t('contracts.pay.plan.clearTitle')} okText={t('contracts.pay.plan.clear')} okButtonProps={{ danger: true }} cancelText={t('common.cancel')} onConfirm={() => save(true)}>
              <Button danger type="text">{t('contracts.pay.plan.clear')}</Button>
            </Popconfirm>
          )}
          <span className="ctr-grow" />
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} onClick={() => save(false)} disabled={!rows.length || rows.some((row) => !row.dueOn || !(Number(row.amount) > 0))}>
            {t('contracts.pay.plan.save')}
          </Button>
        </div>
      }
    >
      {!plan ? (
        <Skeleton active />
      ) : (
        <div className="ctr-sched">
          {plans?.plans?.length > 0 && (
            <section className="ctr-sched__grid">
              <div className="ctr-sched__label">{t('contracts.pay.plan.fromGrid', { unit: plans.unit?.code || '' })}</div>
              <div className="ctr-sched__plans">
                {plans.plans.map((item) => {
                  const active = plan.source?.startsWith(item.name);
                  return (
                    <button key={item.key} type="button" className={`ctr-sched__plan${active ? ' is-active' : ''}`} onClick={() => pickPlan(item)}>
                      <strong>{item.name}</strong>
                      <span>{formatMoney(item.total, plans.currency, locale)}</span>
                      {item.months > 0 && <em>{`${item.firstPct} % + ${item.months} × ${formatMoney(item.monthly, plans.currency, locale)}`}</em>}
                    </button>
                  );
                })}
              </div>
              <small className="ctr-muted">{t('contracts.pay.plan.gridHint')}</small>
              {picked && amount && Math.round(picked.total) !== Math.round(amount) && (
                <div className="ctr-pay-alert is-warn">{t('contracts.pay.plan.gridTotal', { total: formatMoney(picked.total, plans.currency, locale), amount: money(amount) })}</div>
              )}
            </section>
          )}
          <Segmented block value={plan.mode} onChange={(mode) => setPlanField({ mode })} options={['full', 'installments'].map((mode) => ({ value: mode, label: t(`contracts.pay.plan.mode.${mode}`) }))} />
          <div className="ctr-sched__fields">
            {plan.mode === 'installments' && (
              <>
                <label>
                  <span>{t('contracts.pay.plan.firstPct')}</span>
                  <InputNumber value={plan.firstPct} onChange={(firstPct) => setPlanField({ firstPct })} min={0} max={99.99} addonAfter="%" style={{ width: '100%' }} />
                </label>
                <label>
                  <span>{t('contracts.pay.plan.months')}</span>
                  <InputNumber value={plan.months} onChange={(months) => setPlanField({ months })} min={1} max={360} style={{ width: '100%' }} />
                </label>
              </>
            )}
            <label>
              <span>{t('contracts.pay.plan.firstOn')}</span>
              <DateField value={plan.firstOn} onChange={(firstOn) => setPlanField({ firstOn })} style={{ width: '100%' }} allowClear={false} />
            </label>
            {plan.mode === 'installments' && (
              <>
                <label>
                  <span>{t('contracts.pay.plan.startOn')}</span>
                  <DateField value={plan.startOn} onChange={(startOn) => setPlanField({ startOn })} style={{ width: '100%' }} placeholder="+1" />
                </label>
                <label>
                  <span>{t('contracts.pay.plan.day')}</span>
                  <InputNumber value={plan.day} onChange={(day) => setPlanField({ day })} min={1} max={31} style={{ width: '100%' }} placeholder={(plan.startOn || plan.firstOn || '').slice(8, 10)} />
                </label>
              </>
            )}
          </div>
          {deposit && (
            <Checkbox checked={plan.offset !== false} onChange={(event) => setPlanField({ offset: event.target.checked })}>
              {t('contracts.pay.plan.offset', { amount: formatMoney(deposit.amount, deposit.currency, locale) })}
            </Checkbox>
          )}
          {plan.mode === 'installments' && <small className="ctr-muted">{t('contracts.pay.plan.rounding')}</small>}
          {error && <div className="ctr-pay-alert is-error">{amount ? error : t('contracts.pay.plan.amountRequired')}</div>}

          <div className="ctr-sched__head">
            <strong>{t('contracts.pay.plan.preview')}</strong>
            <span className="ctr-grow" />
            <span className={`ctr-sched__total${diff ? ' is-off' : ''}`}>{t('contracts.pay.plan.total', { sum: money(total) })}</span>
          </div>
          {diff !== 0 && amount !== null && <div className="ctr-pay-alert is-warn">{t('contracts.pay.schedule.mismatch', { sum: money(total), amount: money(amount), diff: money(diff) })}</div>}
          <ol className="ctr-sched__rows">
            {rows.map((row, index) => (
              <li key={row.id || `n${index}`} className={`ctr-sched__row is-${row.purpose}`}>
                <span className="ctr-sched__no">{index + 1}</span>
                <DateField value={row.dueOn} onChange={(dueOn) => setRow(index, { dueOn })} allowClear={false} className="ctr-sched__date" aria-label={t('contracts.pay.schedule.date')} />
                <Select value={row.purpose} onChange={(purpose) => setRow(index, { purpose })} options={PURPOSES.map((key) => ({ value: key, label: t(`contracts.pay.purpose.${key}`) }))} className="ctr-sched__purpose" aria-label={t('contracts.pay.schedule.purpose')} popupMatchSelectWidth={180} />
                <InputNumber {...moneyInput} value={row.amount} onChange={(value) => setRow(index, { amount: value })} min={0.01} className="ctr-sched__amount" inputMode="decimal" aria-label={t('contracts.pay.schedule.amount')} />
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => { setEdited(true); setRows((prev) => prev.filter((_, i) => i !== index)); }} aria-label={t('common.delete')} />
              </li>
            ))}
          </ol>
          <Button icon={<PlusOutlined />} onClick={() => { setEdited(true); setRows((prev) => [...prev, { dueOn: prev.length ? prev[prev.length - 1].dueOn : todayISO(), amount: amount ? Math.max(0, round2(amount - total)) || null : null, purpose: 'monthly' }]); }}>
            {t('contracts.pay.plan.addRow')}
          </Button>
          {rows.length > 0 && rows[0].dueOn && <small className="ctr-muted">{`${fmtDate(rows[0].dueOn)} — ${fmtDate(rows[rows.length - 1].dueOn)}`}</small>}
        </div>
      )}
    </Drawer>
  );
}
