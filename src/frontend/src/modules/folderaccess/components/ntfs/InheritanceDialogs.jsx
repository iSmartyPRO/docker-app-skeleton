import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Spin } from 'antd';
import { useLocale } from '../../../../context/LocaleContext';
import { faApi, faError } from '../../api';
import { useFolderAccess } from '../../FolderAccessContext';
import { LossList } from './ChangeSummary';

/**
 * "Block inheritance" as Windows asks it: convert the inherited entries into
 * explicit ones, or remove them (then: who loses access, from a server preview).
 */
export function DisableInheritanceDialog({ open, folder, revision, removeDraft, onChoose, onClose }) {
  const { t } = useLocale();
  const { change } = useFolderAccess();
  const [step, setStep] = useState('choose');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setStep('choose');
      setPreview(null);
      setError(null);
    }
  }, [open]);
  if (!open) return null;

  const askRemove = async () => {
    setStep('remove');
    try {
      const data = await change(() => faApi.ntfsPreview({ shareId: folder.shareId, path: folder.path, revision, ...removeDraft }), { quiet: true, rethrow: true });
      if (data) setPreview(data);
      else onClose();
    } catch (err) {
      setError(err);
    }
  };

  if (step === 'remove') {
    const blocked = (preview?.guards?.errors || []).length > 0;
    return (
      <Modal
        open
        title={t('folderAccess.ntfs.inherit.removeTitle')}
        onCancel={onClose}
        footer={[
          <Button key="back" onClick={() => setStep('choose')}>
            {t('folderAccess.ntfs.back')}
          </Button>,
          <Button key="ok" type="primary" danger disabled={!preview || blocked} onClick={() => onChoose('remove')}>
            {t('folderAccess.ntfs.inherit.removeConfirm')}
          </Button>,
        ]}
      >
        {!preview && !error && (
          <div className="fa-loading">
            <Spin />
          </div>
        )}
        {error && <Alert type="error" showIcon message={faError(error, t)} />}
        {preview && (
          <>
            <p>{t('folderAccess.ntfs.inherit.removeText')}</p>
            {(preview.guards?.loss || []).length === 0 && <p className="fa-muted">{t('folderAccess.ntfs.inherit.nobodyLoses')}</p>}
            <LossList guards={preview.guards} />
          </>
        )}
      </Modal>
    );
  }

  return (
    <Modal open title={t('folderAccess.ntfs.inherit.blockTitle')} onCancel={onClose} footer={null} width={560}>
      <p>{t('folderAccess.ntfs.inherit.blockText')}</p>
      <div className="fa-ntfs-choices">
        <Button block onClick={() => onChoose('convert')}>
          {t('folderAccess.ntfs.inherit.convert')}
        </Button>
        <Button block danger onClick={askRemove}>
          {t('folderAccess.ntfs.inherit.remove')}
        </Button>
        <Button block type="text" onClick={onClose}>
          {t('folderAccess.ntfs.cancel')}
        </Button>
      </div>
    </Modal>
  );
}

/** "Enable inheritance": the parent's inheritable entries are added back (the explicit ones stay). */
export function EnableInheritanceDialog({ open, onConfirm, onClose }) {
  const { t } = useLocale();
  if (!open) return null;
  return (
    <Modal open title={t('folderAccess.ntfs.inherit.enableTitle')} onCancel={onClose} onOk={onConfirm} okText={t('folderAccess.ntfs.inherit.enable')}>
      <p>{t('folderAccess.ntfs.inherit.enableText')}</p>
    </Modal>
  );
}
