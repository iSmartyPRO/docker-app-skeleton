import { useEffect, useState } from 'react';
import { App, Button, Select, Tooltip } from 'antd';
import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDateTime } from '../../../lib/datetime';
import { docUrl, procApi } from '../api';
import { useProc } from '../ProcContext';
import { DOC_ICONS, canPreview, formatSize, isImage } from '../lib';
import { Empty } from '../components/bits';
import DropZone from '../components/DropZone';
import { procError } from './RequestCard';

/** Documents with a preview of the invoice (PDF or picture), upload, camera, «from Files». */
export default function DocumentsTab({ data, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { meta } = useProc();
  const { request, documents, my } = data;
  const [selected, setSelected] = useState(null);
  const [progress, setProgress] = useState(null);
  const [kind, setKind] = useState(documents.some((doc) => doc.kind === 'invoice') ? 'other' : 'invoice');
  useEffect(() => {
    if (!documents.find((doc) => doc.id === selected)) setSelected((documents.find((doc) => doc.kind === 'invoice' && canPreview(doc)) || documents.find(canPreview))?.id || null);
  }, [documents, selected]);
  const current = documents.find((doc) => doc.id === selected);
  const refresh = () => procApi.get(request.id).then((res) => onChanged(res.data));
  const upload = async (files) => {
    setProgress(0);
    try {
      await procApi.upload(request.id, files, kind, (event) => setProgress(Math.round((event.loaded / (event.total || 1)) * 100)));
      message.success(t('procurement.docs.uploaded', { n: files.length }));
      await refresh();
    } catch (err) {
      message.error(procError(err, t));
    } finally {
      setProgress(null);
    }
  };
  const link = async (nodes) => {
    try {
      for (const node of nodes) await procApi.linkFile(request.id, node.id, kind);
      await refresh();
    } catch (err) {
      message.error(procError(err, t));
    }
  };
  const setDocKind = async (doc, next) => {
    try {
      await procApi.setDocKind(doc.id, next);
      await refresh();
    } catch (err) {
      message.error(procError(err, t));
    }
  };
  const remove = async (doc) => {
    try {
      await procApi.removeDoc(doc.id);
      await refresh();
    } catch (err) {
      message.error(procError(err, t));
    }
  };
  const kinds = meta.docKinds.map((key) => ({ value: key, label: `${DOC_ICONS[key]} ${t(`procurement.docKind.${key}`)}` }));
  return (
    <div className="prc-docs">
      {current && (
        <div className="prc-preview">
          {isImage(current) ? <img src={docUrl(current)} alt={current.name} /> : <iframe src={docUrl(current)} title={current.name} />}
        </div>
      )}
      {documents.length ? (
        <ul className="prc-doclist">
          {documents.map((doc) => (
            <li key={doc.id} className={doc.id === selected ? 'is-active' : ''}>
              <button type="button" className="prc-doclist__main" onClick={() => (canPreview(doc) ? setSelected(doc.id) : window.open(docUrl(doc, true), '_blank'))}>
                <span className="prc-doclist__icon" aria-hidden="true">{DOC_ICONS[doc.kind] || '📎'}</span>
                <span className="prc-doclist__text">
                  <strong>{doc.name}</strong>
                  <small>
                    {t(`procurement.docKind.${doc.kind}`)} · {formatSize(doc.size)} · {doc.uploadedBy?.name} · {fmtDateTime(doc.createdAt)}
                  </small>
                </span>
              </button>
              {my.canAddDocuments && !doc.paymentId && (
                <Select size="small" value={doc.kind} options={kinds} onChange={(next) => setDocKind(doc, next)} popupMatchSelectWidth={false} className="prc-doclist__kind" />
              )}
              <Tooltip title={t('procurement.docs.download')}>
                <Button size="small" type="text" icon={<DownloadOutlined />} href={docUrl(doc, true)} />
              </Tooltip>
              {my.canAddDocuments && !doc.paymentId && (
                <Tooltip title={t('common.delete')}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(doc)} />
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="🧾" title={t('procurement.docs.empty')} text={t('procurement.docs.emptyText')} />
      )}
      {my.canAddDocuments && (
        <div className="prc-docs__add">
          <div className="prc-docs__kind">
            <span>{t('procurement.docs.addAs')}</span>
            <Select value={kind} onChange={setKind} options={kinds} style={{ minWidth: 200 }} />
          </div>
          <DropZone onFiles={upload} onNodes={link} progress={progress} compact />
        </div>
      )}
    </div>
  );
}
