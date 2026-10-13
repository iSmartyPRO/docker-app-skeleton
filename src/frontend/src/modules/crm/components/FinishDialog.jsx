import { Modal } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { Glyph } from './bits';

/** «Завершить сделку»: won or lost (lost then asks for the reason). */
export default function FinishDialog({ open, onChoose, onCancel }) {
  const { t } = useLocale();
  return (
    <Modal open={Boolean(open)} title={t('crm.stage.finishTitle')} footer={null} onCancel={onCancel} width={420} destroyOnHidden>
      {open?.deal && <p className="dialog-lead">{open.deal.title}</p>}
      <div className="crm-finish">
        <button type="button" className="crm-finish__btn is-won" onClick={() => onChoose('won')}>
          <Glyph name="trophy" size={22} />
          <strong>{t('crm.stage.won')}</strong>
          <span>{t('crm.stage.wonHint')}</span>
        </button>
        <button type="button" className="crm-finish__btn is-lost" onClick={() => onChoose('lost')}>
          <Glyph name="close" size={22} />
          <strong>{t('crm.stage.lost')}</strong>
          <span>{t('crm.stage.lostHint')}</span>
        </button>
      </div>
    </Modal>
  );
}
