import { useEffect, useState } from 'react';
import { Alert, App, Button, Input, Modal } from 'antd';
import { useLocale } from '../../../../../context/LocaleContext';
import { errorCode, faApi, faError } from '../../api';
import { useAccess } from '../../AccessContext';
import { ChangeSummary, LossList } from './ChangeSummary';
import PropagateDialog from './PropagateDialog';

/**
 * Undo of an NTFS change: writes back the folder's previous descriptor. When
 * the folder changed since, the server answers STALE with the difference
 * (now → after the undo) and the revision it was made on; the person confirms
 * to restore anyway (refused again if the folder changes once more). When the
 * restored folder passes other entries down, the server starts an "inherit"
 * propagation and its progress is shown here.
 */
export default function NtfsUndoDialog({ row, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { change } = useAccess();
  const [done, setDone] = useState(null);
  const [stale, setStale] = useState(null);
  const [needsName, setNeedsName] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDone(null);
    setStale(null);
    setNeedsName(false);
    setConfirm('');
    setError(null);
  }, [row]);
  if (!row) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await change(
        () => faApi.ntfsUndo(row.id, { force: Boolean(stale), revision: stale?.revision || undefined, confirmName: needsName ? confirm : undefined }),
        { quiet: true, rethrow: true }
      );
      if (!data) return;
      if (data.journalWarning) message.warning(t('folderAccess.ntfs.journalWarning'));
      if (data.job || data.propagationError) setDone(data);
      else onClose(true);
    } catch (err) {
      const code = errorCode(err);
      // STALE again after a forced attempt: the folder changed once more, show the new difference.
      if (code === 'STALE') setStale(err.response?.data?.info || {});
      else if (code === 'CONFIRM_SELF_REMOVAL') setNeedsName(true);
      else setError(err);
    } finally {
      setBusy(false);
    }
  };
  if (done?.job) return <PropagateDialog open folder={done.folder} job={done.job} onClose={() => onClose(true)} />;
  if (done?.propagationError) {
    return (
      <Modal open title={t('folderAccess.ntfs.undo.title', { folder: row.group?.name || '' })} onCancel={() => onClose(true)} footer={[<Button key="close" type="primary" onClick={() => onClose(true)}>{t('folderAccess.ntfs.close')}</Button>]}>
        <Alert
          type="warning"
          showIcon
          message={t('folderAccess.ntfs.undo.propagationFailed')}
          description={faError({ response: { data: { code: done.propagationError.code, error: done.propagationError.message } } }, t)}
        />
      </Modal>
    );
  }
  const blocked = (stale?.guards?.errors || []).length > 0;
  const confirmName = stale?.confirmName || String(row.before?.folder?.path || '').split('/').pop() || row.group?.name || '';

  return (
    <Modal
      open
      width={640}
      title={t('folderAccess.ntfs.undo.title', { folder: row.group?.name || '' })}
      onCancel={() => onClose(false)}
      footer={[
        <Button key="cancel" onClick={() => onClose(false)}>
          {t('folderAccess.ntfs.cancel')}
        </Button>,
        <Button key="ok" type="primary" danger={Boolean(stale) || needsName} loading={busy} disabled={blocked || (needsName && confirm.trim().toLowerCase() !== confirmName.toLowerCase())} onClick={run}>
          {stale ? t('folderAccess.ntfs.undo.force') : t('folderAccess.journal.undo')}
        </Button>,
      ]}
    >
      {!stale && <p>{t('folderAccess.ntfs.undo.text')}</p>}
      {stale && (
        <div className="fa-form">
          <Alert type="warning" showIcon message={t('folderAccess.ntfs.undo.stale')} description={t('folderAccess.ntfs.undo.staleText')} />
          <ChangeSummary summary={stale.summary} />
          <LossList guards={stale.guards} />
        </div>
      )}
      {needsName && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message={t('folderAccess.ntfs.apply.selfTitle')}
          description={
            <div className="fa-form">
              <span>{t('folderAccess.ntfs.apply.selfText', { name: confirmName })}</span>
              <Input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={confirmName} />
            </div>
          }
        />
      )}
      {error && <Alert type="error" showIcon style={{ marginTop: 12 }} message={faError(error, t)} />}
    </Modal>
  );
}
