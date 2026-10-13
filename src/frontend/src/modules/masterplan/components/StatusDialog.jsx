import { useEffect, useMemo, useState } from 'react';
import { App, Alert, Checkbox, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDateTime, todayISO } from '../../../lib/datetime';
import { DateField } from '../../../components/ui/DateTimeField';
import { userOptions } from '../../shared/People';
import { mpApi, errorCode } from '../api';
import { useMp } from '../MpContext';
import { HELD, STATUSES, TIMED, can, formatMoney } from '../lib';
import { StatusTag } from './bits';
import DealPicker from './DealPicker';

const RANK = Object.fromEntries(STATUSES.map((status, index) => [status, index]));

/** The text of a 409 from the server: "Объект только что забронирован менеджером X". */
export function conflictText(err, t) {
  const holder = err?.response?.data?.info?.holder;
  if (errorCode(err) === 'VERSION_CONFLICT') {
    if (holder?.manager && TIMED.has(holder.status)) return t('mp.conflict.held', { name: holder.manager.name });
    return t('mp.conflict.changed');
  }
  const code = errorCode(err);
  const known = ['RESERVE_LIMIT', 'DEAL_REQUIRED', 'CLIENT_REQUIRED', 'CONTRACT_REQUIRED', 'ACT_DATE_REQUIRED', 'REASON_REQUIRED', 'NOT_OWN', 'EXTEND_LIMIT', 'DEAL_LOCKED', 'PRICE_FIXED', 'PRICE_LIMIT', 'OUT_OF_ZONE', 'DEAL_CLOSED'];
  return known.includes(code) ? t(`mp.err.${code}`) : errorMessage(err);
}

/**
 * Moving a unit to another status (§6.2) or extending its timer. The fields
 * follow the target: a CRM deal for a booking, contract number and date,
 * the act date, a reason for releases and rollbacks. The unit's version goes
 * along, so a stale card gets "Объект только что забронирован менеджером X".
 * `open` = { node, to } | { node, extend: true } | { node, rollback: true }.
 */
export default function StatusDialog({ open, onClose, onConflict, caps, dealId: presetDeal }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { crmEnabled, settings, users, me } = useMp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);
  const node = open?.node;
  const unit = node?.unit || {};
  const [to, setTo] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStale(false);
    setTo(open.rollback ? null : open.to || null);
    form.resetFields();
    form.setFieldsValue({
      dealId: presetDeal || unit.deal?.id || null,
      contractAmount: unit.contract?.amount ?? unit.price ?? null,
      contractDate: todayISO(),
      actDate: todayISO(),
      managerId: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rollbackTargets = useMemo(() => STATUSES.filter((status) => status !== 'not_for_sale' && RANK[status] < RANK[unit.status] && !(TIMED.has(unit.status) && status === 'free')), [unit.status]);
  if (!open) return null;
  const extend = Boolean(open.extend);
  const target = to;
  const needsReason = open.rollback || (target === 'free' && TIMED.has(unit.status)) || (target === 'not_for_sale' && HELD.has(unit.status));
  const assign = target === 'reserve' && can(caps, 'booking.release_any');

  const title = extend ? t('mp.action.extend') : open.rollback ? t('mp.action.rollback') : t(`mp.action.to.${target}`);
  const submit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let res;
      if (extend) res = await mpApi.extend(node.id, { version: unit.version });
      else {
        res = await mpApi.setStatus(node.id, {
          to: target,
          version: unit.version,
          reason: values.reason,
          dealId: values.dealId || undefined,
          client: values.clientName ? { name: values.clientName } : undefined,
          managerId: values.managerId || undefined,
          contractNumber: values.contractNumber,
          contractDate: values.contractDate,
          contractAmount: values.contractAmount,
          paidAmount: values.paidAmount,
          actDate: values.actDate,
          paid: values.paid,
          amount: values.amount,
        });
      }
      const next = res.data.node || res.data.unit;
      message.success(extend ? t('mp.action.extended', { when: fmtDateTime(res.data.endsAt) }) : t('mp.action.done', { code: node.code || node.name, status: t(`mp.status.${target}`) }));
      onClose(next);
    } catch (err) {
      setError(conflictText(err, t));
      if (errorCode(err) === 'VERSION_CONFLICT') {
        setStale(true);
        onConflict?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const length = target === 'reserve' ? t('mp.action.reserveFor', { n: settings.reserveHours }) : target === 'booking' ? t('mp.action.bookFor', { n: settings.bookingDays }) : null;
  return (
    <Modal open onCancel={() => onClose(null)} onOk={submit} okText={extend ? t('mp.action.extend') : t('mp.action.confirm')} cancelText={t('common.cancel')} confirmLoading={busy} title={title} destroyOnClose width={520} okButtonProps={{ disabled: stale || (open.rollback && !target) }}>
      <div className="mp-dlg-unit">
        <b>{node.code || node.name}</b>
        <StatusTag status={unit.status} />
        {target && <span className="mp-dlg-arrow">→</span>}
        {target && <StatusTag status={target} />}
      </div>
      {error && <Alert type="error" showIcon message={error} className="mp-dlg-alert" />}
      {extend && <p className="dialog-lead">{t('mp.action.extendText', { kind: t(`mp.status.${unit.status}`), when: fmtDateTime(unit.booking?.endsAt) })}</p>}
      {length && <p className="dialog-lead">{length}</p>}
      <Form form={form} layout="vertical" requiredMark={false}>
        {open.rollback && (
          <Form.Item label={t('mp.action.rollbackTo')} required>
            <Select value={target} onChange={setTo} options={rollbackTargets.map((status) => ({ value: status, label: t(`mp.status.${status}`) }))} placeholder={t('mp.action.choose')} />
          </Form.Item>
        )}
        {['reserve', 'booking'].includes(target) && crmEnabled && (
          <Form.Item name="dealId" label={t('mp.action.deal')} rules={target === 'booking' && settings.requireDeal && !unit.deal ? [{ required: true, message: t('mp.err.DEAL_REQUIRED') }] : []} extra={target === 'booking' ? t('mp.action.dealHint') : t('mp.action.dealOptional')}>
            <DealPicker defaultTitle={t('mp.deal.defaultTitle', { code: node.code || node.name })} initial={unit.deal ? { id: unit.deal.id, title: unit.deal.title, person: unit.client ? { name: unit.client.name } : null } : null} />
          </Form.Item>
        )}
        {target === 'booking' && !crmEnabled && (
          <Form.Item name="clientName" label={t('mp.action.client')} rules={[{ required: true, message: t('mp.err.CLIENT_REQUIRED') }]}>
            <Input maxLength={200} />
          </Form.Item>
        )}
        {assign && (
          <Form.Item name="managerId" label={t('mp.action.manager')} extra={t('mp.action.managerHint')}>
            <Select allowClear showSearch optionFilterProp="search" options={userOptions(users)} placeholder={me?.id ? t('mp.action.me') : ''} />
          </Form.Item>
        )}
        {target === 'booking' && (
          <div className="form-grid-2">
            <Form.Item name="paid" valuePropName="checked">
              <Checkbox>{t('mp.action.paidBooking')}</Checkbox>
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(a, b) => a.paid !== b.paid}>
              {({ getFieldValue }) =>
                getFieldValue('paid') && (
                  <Form.Item name="amount" label={t('mp.action.amount')}>
                    <InputNumber min={0} style={{ width: '100%' }} addonAfter={unit.currency} />
                  </Form.Item>
                )
              }
            </Form.Item>
          </div>
        )}
        {target === 'deposit' && (
          <Form.Item name="paidAmount" label={t('mp.action.paidAmount')}>
            <InputNumber min={0} style={{ width: '100%' }} addonAfter={unit.currency} />
          </Form.Item>
        )}
        {target === 'contract' && (
          <>
            <div className="form-grid-2">
              <Form.Item name="contractNumber" label={t('mp.action.contractNumber')} rules={[{ required: true, message: t('mp.err.CONTRACT_REQUIRED') }]}>
                <Input maxLength={60} />
              </Form.Item>
              <Form.Item name="contractDate" label={t('mp.action.contractDate')} rules={[{ required: true, message: t('mp.err.CONTRACT_REQUIRED') }]}>
                <DateField style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <div className="form-grid-2">
              <Form.Item name="contractAmount" label={t('mp.action.contractAmount')}>
                <InputNumber min={0} style={{ width: '100%' }} addonAfter={unit.currency} />
              </Form.Item>
              <Form.Item name="paidAmount" label={t('mp.action.paidAmount')}>
                <InputNumber min={0} style={{ width: '100%' }} addonAfter={unit.currency} />
              </Form.Item>
            </div>
          </>
        )}
        {target === 'sold' && <p className="dialog-lead">{t('mp.action.soldText', { amount: formatMoney(unit.contract?.amount ?? unit.price, unit.currency, locale) })}</p>}
        {target === 'handed' && (
          <Form.Item name="actDate" label={t('mp.action.actDate')} rules={[{ required: true, message: t('mp.err.ACT_DATE_REQUIRED') }]}>
            <DateField style={{ width: '100%' }} />
          </Form.Item>
        )}
        {needsReason && (
          <Form.Item name="reason" label={t('mp.action.reason')} rules={[{ required: true, whitespace: true, message: t('mp.err.REASON_REQUIRED') }]}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={300} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
