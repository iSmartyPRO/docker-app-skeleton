import { useEffect, useState } from 'react';
import { App, Alert, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { todayISO } from '../../../lib/datetime';
import { DateField } from '../../../components/ui/DateTimeField';
import { userOptions } from '../../shared/People';
import { mpApi, errorCode } from '../api';
import { useMp } from '../MpContext';
import { HELD, STATUSES, TIMED } from '../lib';
import { StatusTag } from './bits';
import { conflictText } from './StatusDialog';
import '../mp-pricing.css';

const CONTRACTUAL = new Set(['contract', 'sold', 'handed']);

/**
 * «Перенести статус» — status migration by a Masterplan administrator: any
 * status from any status, bypassing the chain, the CRM deal and the timers
 * (a reserve / booking expires only when an end date is given). A reason is
 * required; the history gets a «migration» event. `open` = { node } for one
 * unit (its version goes along) or { ids } for several selected units.
 */
export default function MigrateDialog({ open, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { users } = useMp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [to, setTo] = useState(null);
  const node = open?.node || null;
  const unit = node?.unit || {};
  const ids = open?.ids || null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    setTo(null);
    form.resetFields();
    form.setFieldsValue({ date: todayISO(), clientName: unit.client?.name || '', managerId: unit.manager?.id || null, contractNumber: unit.contract?.number || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const held = to && HELD.has(to);
  const submit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      to,
      reason: values.reason,
      date: values.date || undefined,
      clientName: held ? values.clientName || undefined : undefined,
      managerId: held ? values.managerId || undefined : undefined,
      endsAt: TIMED.has(to) ? values.endsAt || undefined : undefined,
      contractNumber: held ? values.contractNumber || undefined : undefined,
      contractDate: held ? values.contractDate || undefined : undefined,
      contractAmount: held && values.contractAmount !== null ? values.contractAmount : undefined,
      paidAmount: held && values.paidAmount !== null ? values.paidAmount : undefined,
      actDate: to === 'handed' ? values.actDate || undefined : undefined,
    };
    try {
      if (ids) {
        const res = await mpApi.migrateMany({ ...payload, ids });
        if (res.data.affected) message.success(t('mp.migrate.doneMany', { n: res.data.affected }));
        if (res.data.skipped.length) setResult(res.data);
        else onClose(true);
      } else {
        const res = await mpApi.migrate(node.id, { ...payload, version: unit.version });
        message.success(t('mp.migrate.done', { code: node.code || node.name, status: t(`mp.status.${to}`) }));
        onClose(res.data.node);
      }
    } catch (err) {
      const code = errorCode(err);
      setError(['REASON_REQUIRED', 'ENDS_IN_PAST'].includes(code) ? t(`mp.migrate.err.${code}`) : code === 'VERSION_CONFLICT' ? conflictText(err, t) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const title = ids ? t('mp.migrate.titleMany', { n: ids.length }) : t('mp.migrate.title');
  return (
    <Modal
      open
      title={title}
      width={560}
      onCancel={() => onClose(result ? Boolean(result.affected) : null)}
      onOk={result ? () => onClose(true) : submit}
      okText={result ? t('common.close') : t('mp.migrate.apply')}
      cancelText={t('common.cancel')}
      okButtonProps={{ disabled: !result && !to }}
      confirmLoading={busy}
      destroyOnClose
    >
      {result ? (
        <Alert
          type="warning"
          showIcon
          message={t('mp.bulk.skipped', { n: result.skipped.length })}
          description={
            <ul className="mp-skipped">
              {result.skipped.slice(0, 12).map((item) => (
                <li key={item.id}><b>{item.code || `#${item.id}`}</b> — {t(`mp.bulk.reason.${item.reason}`) === `mp.bulk.reason.${item.reason}` ? item.reason : t(`mp.bulk.reason.${item.reason}`)}</li>
              ))}
            </ul>
          }
        />
      ) : (
        <>
          <p className="mp-migrate-note">{t('mp.migrate.lead')}</p>
          {node && (
            <div className="mp-dlg-unit">
              <b>{node.code || node.name}</b>
              <StatusTag status={unit.status} />
              {to && <span className="mp-dlg-arrow">→</span>}
              {to && <StatusTag status={to} />}
            </div>
          )}
          {error && <Alert type="error" showIcon message={error} className="mp-dlg-alert" />}
          <Form form={form} layout="vertical" requiredMark={false}>
            <div className="form-grid-2">
              <Form.Item label={t('mp.migrate.to')} required>
                <Select value={to} onChange={setTo} placeholder={t('mp.action.choose')} options={STATUSES.map((status) => ({ value: status, label: t(`mp.status.${status}`) }))} />
              </Form.Item>
              <Form.Item name="date" label={t('mp.migrate.date')} extra={t('mp.migrate.dateHint')}>
                <DateField style={{ width: '100%' }} />
              </Form.Item>
            </div>
            {held && (
              <>
                <div className="form-grid-2">
                  <Form.Item name="clientName" label={t('mp.action.client')}>
                    <Input maxLength={200} />
                  </Form.Item>
                  <Form.Item name="managerId" label={t('mp.action.manager')}>
                    <Select allowClear showSearch optionFilterProp="search" options={userOptions(users)} />
                  </Form.Item>
                </div>
                {TIMED.has(to) && (
                  <Form.Item name="endsAt" label={t('mp.migrate.endsAt')} extra={t('mp.migrate.endsAtHint')}>
                    <DateField style={{ width: '100%' }} />
                  </Form.Item>
                )}
                <div className="form-grid-2">
                  <Form.Item name="contractNumber" label={t('mp.action.contractNumber')}>
                    <Input maxLength={60} />
                  </Form.Item>
                  <Form.Item name="contractDate" label={t('mp.action.contractDate')} extra={CONTRACTUAL.has(to) ? t('mp.migrate.contractDateHint') : null}>
                    <DateField style={{ width: '100%' }} />
                  </Form.Item>
                </div>
                <div className="form-grid-2">
                  <Form.Item name="contractAmount" label={t('mp.action.contractAmount')} extra={CONTRACTUAL.has(to) ? t('mp.migrate.amountHint') : null}>
                    <InputNumber min={0} style={{ width: '100%' }} addonAfter={unit.currency} />
                  </Form.Item>
                  <Form.Item name="paidAmount" label={t('mp.action.paidAmount')}>
                    <InputNumber min={0} style={{ width: '100%' }} addonAfter={unit.currency} />
                  </Form.Item>
                </div>
                {to === 'handed' && (
                  <Form.Item name="actDate" label={t('mp.action.actDate')}>
                    <DateField style={{ width: '100%' }} />
                  </Form.Item>
                )}
              </>
            )}
            <Form.Item name="reason" label={t('mp.action.reason')} rules={[{ required: true, whitespace: true, message: t('mp.migrate.err.REASON_REQUIRED') }]}>
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={300} />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}
