import { Button } from 'antd';
import { useLocale } from '../../context/LocaleContext';

/**
 * Floating bar that appears only while a form has unsaved changes.
 * `saveLabel` lets preview-style screens say "Apply" instead of "Save".
 */
export default function SaveBar({ visible, saving, onSave, onReset, message, saveLabel }) {
  const { t } = useLocale();
  return (
    <div className={`save-bar${visible ? ' is-visible' : ''}`} aria-hidden={!visible}>
      <div className="save-bar__inner" role="status">
        <span className="save-bar__dot" aria-hidden="true" />
        <span className="save-bar__text">{message || t('common.unsaved')}</span>
        <div className="save-bar__actions">
          <Button onClick={onReset} disabled={saving || !visible}>
            {t('common.discard')}
          </Button>
          <Button type="primary" onClick={onSave} loading={saving} disabled={!visible}>
            {saveLabel || t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
