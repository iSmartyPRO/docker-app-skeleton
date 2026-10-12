import { useState } from 'react';
import { Progress } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { formatBytes } from '../api';

function Batch({ batch, onCancel }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const running = batch.status === 'running';
  const finished = batch.done + batch.skipped + batch.failed.length;
  const percent = batch.bytesTotal ? Math.round((batch.bytesDone / batch.bytesTotal) * 100) : batch.total ? Math.round((finished / batch.total) * 100) : running ? 0 : 100;
  const failedN = batch.failed.length;
  let state = 'active';
  if (!running) state = batch.error || (failedN && !batch.done) ? 'exception' : batch.status === 'cancelled' ? 'normal' : 'success';
  return (
    <div className={`upload-panel__row fs-batch is-${batch.status}`} data-testid="folder-upload-batch">
      <div className="fs-batch__head">
        <span className="fs-batch__name" title={batch.label}>📁 {batch.label}</span>
        {running && onCancel && (
          <button type="button" className="fs-batch__cancel" onClick={() => onCancel(batch.id)}>
            {t('folderUpload.cancel')}
          </button>
        )}
      </div>
      {!batch.error && <Progress percent={Math.min(100, percent)} size="small" status={state} showInfo={false} />}
      <div className="fs-batch__meta">
        {batch.error ? (
          <em>{batch.error}</em>
        ) : running && batch.phase === 'folders' ? (
          <span>{t('folderUpload.preparing', { n: batch.folders })}</span>
        ) : (
          <>
            <span data-testid="folder-upload-count">{t('folderUpload.progress', { done: batch.done, total: batch.total })}</span>
            {batch.bytesTotal > 0 && <span>{t('folderUpload.bytes', { done: formatBytes(batch.bytesDone), total: formatBytes(batch.bytesTotal) })}</span>}
          </>
        )}
      </div>
      {!running && !batch.error && (
        <div className="fs-batch__meta">
          {batch.status === 'cancelled' && <span>{t('folderUpload.cancelled')}</span>}
          {batch.skipped > 0 && <span>{t('folderUpload.skippedN', { n: batch.skipped })}</span>}
          {failedN > 0 && (
            <button type="button" className="fs-batch__toggle" onClick={() => setOpen(!open)}>
              {t('folderUpload.failedN', { n: failedN })} {open ? '▴' : '▾'}
            </button>
          )}
        </div>
      )}
      {failedN > 0 && running && <em>{t('folderUpload.failedN', { n: failedN })}</em>}
      {open && failedN > 0 && (
        <ul className="fs-batch__failed" data-testid="folder-upload-failed">
          {batch.failed.slice(0, 200).map((item, index) => (
            <li key={`${item.path}-${index}`}>
              <span title={item.path}>{item.path}</span>
              <em>{item.error}</em>
            </li>
          ))}
          {failedN > 200 && <li>… +{failedN - 200}</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * Floating upload panel: folder uploads (one row per batch, with totals,
 * cancel and the list of failures) above single-file rows (as before).
 */
export default function TransferPanel({ uploads = [], batches = [], onClear, onCancel }) {
  const { t } = useLocale();
  if (!uploads.length && !batches.length) return null;
  const done = uploads.every((upload) => upload.status !== 'uploading') && batches.every((batch) => batch.status !== 'running');
  const count = uploads.length + batches.reduce((sum, batch) => sum + batch.total, 0);
  return (
    <div className="upload-panel" data-testid="upload-panel">
      <div className="upload-panel__head">
        <strong>{done ? t('kb.upload.done') : t('kb.upload.uploading', { count })}</strong>
        {done && (
          <button type="button" onClick={onClear} aria-label="✕">
            ✕
          </button>
        )}
      </div>
      {batches.map((batch) => (
        <Batch key={batch.id} batch={batch} onCancel={onCancel} />
      ))}
      {uploads.map((upload) => (
        <div key={upload.key} className={`upload-panel__row is-${upload.status}`}>
          <span title={upload.name}>{upload.name}</span>
          {upload.status === 'error' ? (
            <em>{upload.error}</em>
          ) : (
            <Progress percent={Math.round(upload.progress * 100)} size="small" status={upload.status === 'done' ? 'success' : 'active'} />
          )}
        </div>
      ))}
    </div>
  );
}
