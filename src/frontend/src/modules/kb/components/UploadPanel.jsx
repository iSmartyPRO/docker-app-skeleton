import { Progress } from 'antd';
import { useLocale } from '../../../context/LocaleContext';

/** Floating panel with per-file upload progress. */
export default function UploadPanel({ uploads, onClear }) {
  const { t } = useLocale();
  if (!uploads.length) return null;
  const done = uploads.every((upload) => upload.status !== 'uploading');
  return (
    <div className="upload-panel">
      <div className="upload-panel__head">
        <strong>{done ? t('kb.upload.done') : t('kb.upload.uploading', { count: uploads.length })}</strong>
        {done && (
          <button type="button" onClick={onClear}>
            ✕
          </button>
        )}
      </div>
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
