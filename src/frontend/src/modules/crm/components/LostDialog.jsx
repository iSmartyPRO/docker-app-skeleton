import { useEffect, useState } from 'react';
import { Input, Modal } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { useCrm } from '../CrmContext';

/**
 * Asks why a deal is lost. `open` = { deal } or null; onOk(reason) — the
 * reason is one of the configured ones or free text.
 */
export default function LostDialog({ open, onOk, onCancel }) {
  const { t } = useLocale();
  const { settings } = useCrm();
  const reasons = settings.lostReasons || [];
  const [choice, setChoice] = useState(null);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setChoice(reasons[0] ?? '__other');
      setOther('');
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reason = choice === '__other' ? other.trim() : choice;
  const required = reasons.length > 0;

  const submit = async () => {
    setBusy(true);
    try {
      await onOk(reason || '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(open)}
      title={t('crm.lost.title')}
      okText={t('crm.lost.ok')}
      okButtonProps={{ danger: true, disabled: required && !reason, loading: busy }}
      cancelText={t('common.cancel')}
      onOk={submit}
      onCancel={onCancel}
      width={440}
      destroyOnHidden
    >
      {open?.deal && <p className="dialog-lead">{t('crm.lost.lead', { title: open.deal.title })}</p>}
      <div className="crm-reasons" role="radiogroup" aria-label={t('crm.lost.reason')}>
        {reasons.map((item) => (
          <button key={item} type="button" role="radio" aria-checked={choice === item} className={choice === item ? 'is-on' : ''} onClick={() => setChoice(item)}>
            {item}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={choice === '__other'} className={choice === '__other' ? 'is-on' : ''} onClick={() => setChoice('__other')}>
          {t('crm.lost.other')}
        </button>
      </div>
      {choice === '__other' && (
        <Input.TextArea autoFocus value={other} onChange={(event) => setOther(event.target.value)} placeholder={t('crm.lost.otherPlaceholder')} autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} style={{ marginTop: 12 }} />
      )}
    </Modal>
  );
}
