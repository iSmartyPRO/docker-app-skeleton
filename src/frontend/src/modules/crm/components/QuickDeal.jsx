import { useRef, useState } from 'react';
import { App, Button, Input, InputNumber, Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import ClientPicker, { clientPayload } from './ClientPicker';
import { Glyph } from './bits';

/** «+ Быстрая сделка» at the top of the first column: title, amount, client. */
export default function QuickDeal({ pipeline, stage, onCreated }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { settings } = useCrm();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(null);
  const [currency, setCurrency] = useState(settings.currency || 'KGS');
  const [client, setClient] = useState(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef(null);

  const reset = () => {
    setTitle('');
    setAmount(null);
    setClient(null);
  };

  const submit = async () => {
    if (!title.trim()) {
      titleRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await crmApi.createDeal({ pipelineId: pipeline.id, stageId: stage.id, title: title.trim(), amount: amount || 0, currency, ...clientPayload(client) });
      onCreated?.(res.data.deal);
      reset();
      titleRef.current?.focus();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="crm-quick__open" onClick={() => setOpen(true)}>
        <Glyph name="plus" size={13} />
        {t('crm.quick.button')}
      </button>
    );
  }

  return (
    <div
      className="crm-quick"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <Input
        ref={titleRef}
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onPressEnter={submit}
        placeholder={t('crm.quick.title')}
        maxLength={300}
        aria-label={t('crm.fields.title')}
      />
      <div className="crm-quick__money">
        <InputNumber value={amount} onChange={setAmount} min={0} placeholder={t('crm.fields.amount')} style={{ flex: 1 }} onPressEnter={submit} aria-label={t('crm.fields.amount')} />
        <Select value={currency} onChange={setCurrency} options={(settings.currencies || ['KGS']).map((code) => ({ value: code, label: code }))} style={{ width: 84 }} aria-label={t('crm.fields.currency')} />
      </div>
      <ClientPicker value={client} onChange={(value) => setClient(value)} />
      <div className="crm-quick__foot">
        <Button type="primary" size="small" loading={busy} onClick={submit}>
          {t('common.create')}
        </Button>
        <Button
          size="small"
          type="text"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
