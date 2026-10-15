import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Spin } from 'antd';
import { useLocale } from '../../../../context/LocaleContext';
import { errorCode, faApi, faError } from '../../api';
import { useFolderAccess } from '../../FolderAccessContext';
import { ChangeSummary, LossList } from './ChangeSummary';

/**
 * Review and apply a draft: the server previews it (before → after, guards,
 * who loses access), then writes it with the revision it was made on.
 * Removing one's own access needs the folder name typed. When the change
 * reaches the children, a propagation can follow right away.
 */
export default function ApplyDialog({ open, folder, revision, draft, via, onClose, onApplied, onReload }) {
  const { t } = useLocale();
  const { change } = useFolderAccess();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [propagate, setPropagate] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setError(null);
    setConfirm('');
    setPropagate(true);
    let alive = true;
    (async () => {
      try {
        const data = await change(() => faApi.ntfsPreview({ shareId: folder.shareId, path: folder.path, revision, ...draft }), { quiet: true, rethrow: true });
        if (alive && data) setPreview(data);
        if (alive && !data) onClose();
      } catch (err) {
        if (alive) setError(err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const code = errorCode(error);
  const blocked = preview && (preview.guards?.errors || []).length > 0;
  const needsName = preview?.selfRemoval || code === 'CONFIRM_SELF_REMOVAL';
  const nameOk = !needsName || confirm.trim().toLowerCase() === String(preview?.confirmName || folder.name || '').toLowerCase();
  const stale = code === 'STALE' || preview?.stale;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await change(() => faApi.ntfsApply({ shareId: folder.shareId, path: folder.path, revision, ...draft, confirmName: needsName ? confirm : undefined, via }), { quiet: true, rethrow: true });
      if (data) onApplied(data, { propagate: Boolean(preview?.inheritableChanged && propagate) });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      width={680}
      title={t('folderAccess.ntfs.apply.title', { folder: folder.display })}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('folderAccess.ntfs.cancel')}
        </Button>,
        stale ? (
          <Button key="reload" type="primary" onClick={onReload}>
            {t('folderAccess.ntfs.apply.reload')}
          </Button>
        ) : (
          <Button key="apply" type="primary" danger={needsName} loading={busy} disabled={!preview || blocked || !nameOk || !preview.summary?.changed} onClick={apply}>
            {t('folderAccess.ntfs.apply.submit')}
          </Button>
        ),
      ]}
    >
      {!preview && !error && (
        <div className="fa-loading">
          <Spin />
        </div>
      )}
      {stale && <Alert type="warning" showIcon className="fa-notice" message={t('folderAccess.ntfs.apply.stale')} description={t('folderAccess.ntfs.apply.staleText')} />}
      {error && !stale && code !== 'CONFIRM_SELF_REMOVAL' && <Alert type="error" showIcon className="fa-notice" message={faError(error, t)} />}
      {preview && (
        <div className="fa-form">
          <div>
            <div className="fa-ntfs-loss__title">{t('folderAccess.ntfs.apply.changes')}</div>
            <ChangeSummary summary={preview.summary} />
          </div>
          <LossList guards={preview.guards} />
          {preview.inheritableChanged && (
            <Checkbox checked={propagate} onChange={(event) => setPropagate(event.target.checked)}>
              {t('folderAccess.ntfs.apply.propagate')}
            </Checkbox>
          )}
          {needsName && (
            <Alert
              type="error"
              showIcon
              message={t('folderAccess.ntfs.apply.selfTitle')}
              description={
                <div className="fa-form">
                  <span>{t('folderAccess.ntfs.apply.selfText', { name: preview.confirmName })}</span>
                  <Input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={preview.confirmName} />
                </div>
              }
            />
          )}
        </div>
      )}
    </Modal>
  );
}
