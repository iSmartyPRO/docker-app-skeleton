import { Suspense, lazy, useState } from 'react';
import { App, Button, Checkbox, Input, Modal, Progress, Spin, Tooltip, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fmtDateTime } from '../../../lib/datetime';
import { formatBytes } from '../../../lib/format';
import { UserAvatar } from '../../shared/People';
import { contractsApi } from '../api';
import { fileKind } from '../lib';
import { Empty } from '../components/bits';
import '../../../components/documents/documents.css';

// The pdf.js viewer of the Knowledge Base (its styles come with kb.css above).
const PdfViewer = lazy(() => import('../../../components/documents/viewers/PdfViewer'));

/** Preview of a version: PDF and pictures inline (sandboxed), Office through the PDF preview. */
export function VersionPreview({ version, onClose }) {
  const { t } = useLocale();
  const kind = version ? fileKind(version.ext) : null;
  return (
    <Modal open={Boolean(version)} onCancel={onClose} footer={null} width="min(1100px, 96vw)" title={version ? `v${version.no} · ${version.name}` : ''} className="ctr-preview" destroyOnClose>
      {version && kind === 'image' && <img src={contractsApi.fileUrl(version.id)} alt={version.name} className="ctr-preview__img" />}
      {version && (kind === 'pdf' || kind === 'office') && (
        <div className="ctr-preview__pdf">
          <Suspense fallback={<Spin />}>
            <PdfViewer url={kind === 'pdf' ? contractsApi.fileUrl(version.id) : contractsApi.previewUrl(version.id)} downloadUrl={contractsApi.fileUrl(version.id, true)} title={version.name} />
          </Suspense>
        </div>
      )}
      {version && kind === 'other' && (
        <Empty icon="📎" title={t('contracts.versions.noPreview')} action={<Button href={contractsApi.fileUrl(version.id, true)}>{t('contracts.versions.download')}</Button>} />
      )}
    </Modal>
  );
}

/**
 * «Версии»: upload a new version with «что изменено» (it becomes current),
 * the feed of versions with author, time and comment, the current and the
 * signed marks; any version opens or downloads.
 */
export default function Versions({ data, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { contract, versions, can } = data;
  const [file, setFile] = useState(null);
  const [comment, setComment] = useState('');
  const [signed, setSigned] = useState(false);
  const [progress, setProgress] = useState(null);
  const [preview, setPreview] = useState(null);

  const upload = async () => {
    setProgress(0);
    try {
      await contractsApi.upload(contract.id, file, { comment: comment.trim(), signed }, setProgress);
      message.success(t('contracts.versions.uploaded'));
      setFile(null);
      setComment('');
      setSigned(false);
      onChanged();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  const mark = async (version, patch) => {
    try {
      await contractsApi.updateVersion(version.id, patch);
      onChanged();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div className="ctr-versions">
      {can.files && (
        <section className="ctr-upload">
          <Upload.Dragger
            maxCount={1}
            beforeUpload={(next) => {
              setFile(next);
              return false;
            }}
            onRemove={() => setFile(null)}
            fileList={file ? [{ uid: 'f', name: file.name, status: 'done' }] : []}
            className="ctr-upload__drop"
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">{versions.length ? t('contracts.versions.dropNew') : t('contracts.versions.drop')}</p>
            <p className="ant-upload-hint">{t('contracts.versions.dropHint')}</p>
          </Upload.Dragger>
          {file && (
            <div className="ctr-upload__form">
              <Input.TextArea value={comment} onChange={(e) => setComment(e.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} placeholder={versions.length ? t('contracts.versions.changedPh') : t('contracts.versions.firstPh')} autoFocus />
              <div className="ctr-upload__row">
                {can.signedMark && (
                  <Checkbox checked={signed} onChange={(e) => setSigned(e.target.checked)}>
                    {t('contracts.versions.isSigned')}
                  </Checkbox>
                )}
                <span className="ctr-grow" />
                {progress !== null && <Progress percent={Math.round(progress * 100)} size="small" style={{ width: 140 }} />}
                <Button type="primary" loading={progress !== null} onClick={upload} disabled={versions.length > 0 && !comment.trim()}>
                  {t('contracts.versions.upload')}
                </Button>
              </div>
              {versions.length > 0 && !comment.trim() && <div className="ctr-muted ctr-small">{t('contracts.versions.commentNeeded')}</div>}
            </div>
          )}
        </section>
      )}
      {!versions.length ? (
        <Empty icon="🗂" title={t('contracts.versions.empty')} text={can.files ? t('contracts.versions.emptyHint') : null} />
      ) : (
        <ol className="ctr-vfeed">
          {versions.map((version) => {
            const current = version.id === contract.currentVersionId;
            return (
              <li key={version.id} className={`ctr-vitem${current ? ' is-current' : ''}`}>
                <span className="ctr-vitem__no">v{version.no}</span>
                <div className="ctr-vitem__body">
                  <div className="ctr-vitem__head">
                    <button type="button" className="ctr-vitem__name" onClick={() => setPreview(version)}>
                      {version.name}
                    </button>
                    {current && <span className="ctr-badge is-current">{t('contracts.versions.current')}</span>}
                    {version.signed && <span className="ctr-badge is-signed">✍ {t('contracts.versions.signed')}</span>}
                  </div>
                  {version.comment && <p className="ctr-vitem__comment">{version.comment}</p>}
                  <div className="ctr-vitem__meta">
                    {version.author && <UserAvatar user={version.author} size={18} />}
                    <span>{version.author?.name}</span>
                    <span>·</span>
                    <span>{fmtDateTime(version.createdAt)}</span>
                    <span>·</span>
                    <span>{formatBytes(version.size)}</span>
                  </div>
                </div>
                <div className="ctr-vitem__actions">
                  <Tooltip title={t('contracts.versions.open')}>
                    <Button size="small" onClick={() => setPreview(version)} aria-label={t('contracts.versions.open')}>👁</Button>
                  </Tooltip>
                  <Tooltip title={t('contracts.versions.download')}>
                    <Button size="small" href={contractsApi.fileUrl(version.id, true)} aria-label={t('contracts.versions.download')}>⤓</Button>
                  </Tooltip>
                  {can.files && !current && (
                    <Button size="small" onClick={() => mark(version, { current: true })}>
                      {t('contracts.versions.makeCurrent')}
                    </Button>
                  )}
                  {can.signedMark && (
                    <Button size="small" type="text" onClick={() => mark(version, { signed: !version.signed })}>
                      {version.signed ? t('contracts.versions.unmarkSigned') : t('contracts.versions.markSigned')}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <VersionPreview version={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
