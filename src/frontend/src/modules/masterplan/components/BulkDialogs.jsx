import { useEffect, useState } from 'react';
import { App, Alert, Input, InputNumber, Modal } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { mpApi } from '../api';

/** Skipped units of a bulk action, with the reason of each. */
function Skipped({ list }) {
  const { t } = useLocale();
  if (!list?.length) return null;
  return (
    <Alert
      type="warning"
      showIcon
      className="mp-dlg-alert"
      message={t('mp.bulk.skipped', { n: list.length })}
      description={
        <ul className="mp-skipped">
          {list.slice(0, 12).map((item) => (
            <li key={item.id}>
              <b>{item.code || `#${item.id}`}</b> — {t(`mp.bulk.reason.${item.reason}`)}
            </li>
          ))}
          {list.length > 12 && <li>…</li>}
        </ul>
      }
    />
  );
}

/** Change prices of several units: by %, by an amount, or set (§9.3, §10.3). */
export function BulkPriceDialog({ ids, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [mode, setMode] = useState('percent');
  const [value, setValue] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    setResult(null);
    setValue(null);
    setReason('');
  }, [ids]);
  if (!ids) return null;
  const submit = async () => {
    if (value === null || value === undefined) return;
    setBusy(true);
    try {
      const res = await mpApi.bulkPrice({ ids, mode, value, reason });
      if (res.data.affected) message.success(t('mp.bulk.priceDone', { n: res.data.affected }));
      if (res.data.skipped.length) setResult(res.data);
      else onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={t('mp.bulk.priceTitle', { n: ids.length })} onCancel={() => onClose(Boolean(result?.affected))} onOk={result ? () => onClose(true) : submit} okText={result ? t('common.close') : t('mp.bulk.apply')} cancelText={t('common.cancel')} confirmLoading={busy} destroyOnClose>
      {result ? (
        <Skipped list={result.skipped} />
      ) : (
        <>
          <Segmented block value={mode} onChange={setMode} options={['percent', 'amount', 'set'].map((key) => ({ value: key, label: t(`mp.bulk.mode.${key}`) }))} />
          <label className="mp-ffield">
            <span>{t(`mp.bulk.value.${mode}`)}</span>
            <InputNumber value={value} onChange={setValue} style={{ width: '100%' }} addonAfter={mode === 'percent' ? '%' : null} min={mode === 'set' ? 0 : undefined} />
          </label>
          <p className="dialog-note">{t('mp.bulk.priceHint')}</p>
          <label className="mp-ffield">
            <span>{t('mp.action.reason')}</span>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder={t('mp.bulk.reasonHint')} />
          </label>
        </>
      )}
    </Modal>
  );
}

/** Close or open sales of several units (management). */
export function BulkStatusDialog({ open, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    setResult(null);
    setReason('');
  }, [open]);
  if (!open) return null;
  const submit = async () => {
    setBusy(true);
    try {
      const res = await mpApi.bulkStatus({ ids: open.ids, to: open.to, reason });
      if (res.data.affected) message.success(t('mp.bulk.statusDone', { n: res.data.affected }));
      if (res.data.skipped.length) setResult(res.data);
      else onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={t(open.to === 'free' ? 'mp.bulk.openTitle' : 'mp.bulk.closeTitle', { n: open.ids.length })} onCancel={() => onClose(Boolean(result?.affected))} onOk={result ? () => onClose(true) : submit} okText={result ? t('common.close') : t('mp.bulk.apply')} cancelText={t('common.cancel')} confirmLoading={busy} destroyOnClose>
      {result ? (
        <Skipped list={result.skipped} />
      ) : (
        <label className="mp-ffield">
          <span>{t('mp.action.reason')}</span>
          <Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} autoSize={{ minRows: 2 }} />
        </label>
      )}
    </Modal>
  );
}
