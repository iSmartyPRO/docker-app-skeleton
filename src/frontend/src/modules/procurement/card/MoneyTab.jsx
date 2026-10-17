import { useEffect, useRef, useState } from 'react';
import { App, Button, Checkbox, Input, InputNumber, Modal, Popconfirm } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { DeleteOutlined, PaperClipOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, todayISO } from '../../../lib/datetime';
import { DateField } from '../../../components/ui/DateTimeField';
import { docUrl, procApi } from '../api';
import { useProc } from '../ProcContext';
import { formatMoney } from '../lib';
import { Empty } from '../components/bits';
import { procError } from './RequestCard';

function FilesInput({ files, onChange, label }) {
  const ref = useRef(null);
  return (
    <div className="prc-files-input">
      <Button icon={<PaperClipOutlined />} onClick={() => ref.current?.click()}>
        {label}
      </Button>
      {files.map((file, index) => (
        <span key={`${file.name}${index}`} className="prc-file-chip">
          {file.name}
          <button type="button" onClick={() => onChange(files.filter((_, i) => i !== index))} aria-label="×">✕</button>
        </span>
      ))}
      <input ref={ref} type="file" multiple accept="image/*,application/pdf,.pdf" hidden onChange={(event) => { onChange([...files, ...event.target.files]); event.target.value = ''; }} />
    </div>
  );
}

/** «Отметить оплату»: date, amount (what is left by default), method, payment order no. and file. */
export function PaymentDialog({ open, data, onClose, onDone }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { meta } = useProc();
  const { request } = data;
  const [form, setForm] = useState({});
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ paidOn: todayISO(), amount: request.remaining, method: 'bank', reference: '', note: '' });
      setFiles([]);
    }
  }, [open, request.remaining]);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const submit = async () => {
    setBusy(true);
    try {
      const res = await procApi.pay(request.id, form, files);
      message.success(res.data.request.status === 'paid' || res.data.request.status === 'delivered' ? t('procurement.done.paidFull') : t('procurement.done.paidPart'));
      onDone(res.data);
    } catch (err) {
      message.error(procError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onCancel={onClose} title={`${t('procurement.actions.pay')} · ${request.number}`} okText={t('procurement.pay.ok')} onOk={submit} okButtonProps={{ loading: busy, disabled: !(Number(form.amount) > 0) }} destroyOnClose>
      <div className="prc-form-grid">
        <p className="prc-muted">{t('procurement.pay.left', { left: formatMoney(request.remaining, request.currency, locale), total: formatMoney(request.amount, request.currency, locale) })}</p>
        <label>{t('procurement.pay.amount')}</label>
        <InputNumber value={form.amount} onChange={(amount) => set({ amount })} min={0.01} max={request.remaining} step={0.01} addonAfter={request.currency} style={{ width: '100%' }} autoFocus inputMode="decimal" />
        <label>{t('procurement.pay.date')}</label>
        <DateField value={form.paidOn} onChange={(paidOn) => set({ paidOn })} style={{ width: '100%' }} />
        <label>{t('procurement.pay.method')}</label>
        <Segmented block value={form.method} onChange={(method) => set({ method })} options={meta.paymentMethods.map((key) => ({ value: key, label: t(`procurement.method.${key}`) }))} />
        <label>{t('procurement.pay.reference')}</label>
        <Input value={form.reference} onChange={(event) => set({ reference: event.target.value })} maxLength={80} placeholder="№ 123" />
        <label>{t('procurement.pay.note')}</label>
        <Input.TextArea value={form.note} onChange={(event) => set({ note: event.target.value })} maxLength={500} autoSize={{ minRows: 1, maxRows: 4 }} />
        <FilesInput files={files} onChange={setFiles} label={t('procurement.pay.file')} />
      </div>
    </Modal>
  );
}

/** «Подтвердить поставку»: the day, partial or full, waybill / act. */
export function DeliveryDialog({ open, data, onClose, onDone }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { request } = data;
  const [form, setForm] = useState({});
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ deliveredOn: todayISO(), partial: false, note: '' });
      setFiles([]);
    }
  }, [open]);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const submit = async () => {
    setBusy(true);
    try {
      const res = await procApi.deliver(request.id, { ...form, partial: form.partial ? 'true' : 'false' }, files);
      message.success(t('procurement.done.deliver'));
      onDone(res.data);
    } catch (err) {
      message.error(procError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onCancel={onClose} title={`${t('procurement.actions.deliver')} · ${request.number}`} okText={t('procurement.deliver.ok')} onOk={submit} okButtonProps={{ loading: busy }} destroyOnClose>
      <div className="prc-form-grid">
        <label>{t('procurement.deliver.date')}</label>
        <DateField value={form.deliveredOn} onChange={(deliveredOn) => set({ deliveredOn })} style={{ width: '100%' }} />
        <Checkbox checked={form.partial} onChange={(event) => set({ partial: event.target.checked })}>
          {t('procurement.deliver.partial')}
        </Checkbox>
        <label>{t('procurement.deliver.note')}</label>
        <Input.TextArea value={form.note} onChange={(event) => set({ note: event.target.value })} maxLength={1000} autoSize={{ minRows: 2, maxRows: 5 }} placeholder={t('procurement.deliver.notePlaceholder')} />
        <FilesInput files={files} onChange={setFiles} label={t('procurement.deliver.files')} />
      </div>
    </Modal>
  );
}

/** Payments (progress, list) and deliveries. */
export default function MoneyTab({ data, onChanged, onPay, onDeliver }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { meta } = useProc();
  const { request, payments, deliveries, my } = data;
  const percent = request.amount > 0 ? Math.min(100, Math.round((request.paid / request.amount) * 100)) : 0;
  const money = (value) => formatMoney(value, request.currency, locale);
  const remove = async (call) => {
    try {
      const res = await call();
      onChanged(res.data);
    } catch (err) {
      message.error(procError(err, t));
    }
  };
  return (
    <div className="prc-money-tab">
      <section className="prc-progress">
        <div className="prc-progress__head">
          <span>{t('procurement.pay.progress', { paid: money(request.paid), total: money(request.amount) })}</span>
          <strong>{percent}%</strong>
        </div>
        <div className="prc-progress__bar"><span style={{ width: `${percent}%` }} /></div>
        {request.remaining > 0 && ['to_pay', 'partially_paid'].includes(request.status) && <small className="prc-muted">{t('procurement.pay.leftShort', { left: money(request.remaining) })}</small>}
        {my.canPay && (
          <Button type="primary" onClick={onPay} className="prc-progress__btn">
            {t('procurement.actions.pay')}
          </Button>
        )}
      </section>

      <h4 className="prc-subtitle">{t('procurement.pay.title')}</h4>
      {payments.length ? (
        <ul className="prc-ledger">
          {payments.map((pay) => (
            <li key={pay.id}>
              <span className="prc-ledger__icon" aria-hidden="true">💳</span>
              <span className="prc-ledger__text">
                <strong>{money(pay.amount)}</strong>
                <small>
                  {fmtDate(pay.paidOn)} · {t(`procurement.method.${pay.method}`)}
                  {pay.reference ? ` · ${t('procurement.pay.refShort')} ${pay.reference}` : ''}
                  {pay.author ? ` · ${pay.author.name}` : ''}
                </small>
                {pay.note && <small>{pay.note}</small>}
                {pay.documents.map((doc) => (
                  <a key={doc.id} href={docUrl(doc)} target="_blank" rel="noreferrer" className="prc-ledger__doc">📄 {doc.name}</a>
                ))}
              </span>
              {meta.rights.canPay && !['closed', 'cancelled'].includes(request.status) && (
                <Popconfirm title={t('procurement.pay.removeConfirm')} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={() => remove(() => procApi.removePayment(pay.id))}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
                </Popconfirm>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="💳" title={t('procurement.pay.empty')} text={['draft', 'pending', 'question', 'returned'].includes(request.status) ? t('procurement.pay.emptyBefore') : t('procurement.pay.emptyText')} />
      )}

      <h4 className="prc-subtitle">
        {t('procurement.deliver.title')}
        {my.canDeliver && (
          <Button size="small" onClick={onDeliver}>
            {t('procurement.actions.deliver')}
          </Button>
        )}
      </h4>
      {deliveries.length ? (
        <ul className="prc-ledger">
          {deliveries.map((item) => (
            <li key={item.id}>
              <span className="prc-ledger__icon" aria-hidden="true">🚚</span>
              <span className="prc-ledger__text">
                <strong>{item.partial ? t('procurement.delivery.partial') : t('procurement.delivery.full')}</strong>
                <small>
                  {fmtDate(item.deliveredOn)}
                  {item.author ? ` · ${item.author.name}` : ''}
                </small>
                {item.note && <small>{item.note}</small>}
                {item.documents.map((doc) => (
                  <a key={doc.id} href={docUrl(doc)} target="_blank" rel="noreferrer" className="prc-ledger__doc">📄 {doc.name}</a>
                ))}
              </span>
              {(my.author || my.responsible || my.admin) && !['closed', 'cancelled'].includes(request.status) && (
                <Popconfirm title={t('procurement.deliver.removeConfirm')} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={() => remove(() => procApi.removeDelivery(item.id))}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
                </Popconfirm>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="prc-muted">{t('procurement.deliver.empty')}</p>
      )}
    </div>
  );
}
