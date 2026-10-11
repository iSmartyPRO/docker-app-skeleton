import { Button, Modal } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import DocumentViewer, { ImageViewer } from '../../kb/viewers/DocumentViewer';
import { asViewerItem, formatBytes } from '../api';
import { NodeIcon } from './NodeList';
import '../../kb/kb.css';
import '../files.css';

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

export const isImage = (node) => node?.kind === 'file' && IMAGE.has(node.file?.ext);

/** Header with name and actions plus the document viewer; in the modal and on the file's own page. */
export function NodeFileView({ node, src, conversion, lead, extra, onClose }) {
  const { t } = useLocale();
  return (
    <>
      <div className="fs-viewer__head">
        {lead}
        <NodeIcon node={node} size={30} />
        <div className="fs-viewer__title">
          <strong title={node.name}>{node.name}</strong>
          <span>{formatBytes(node.file?.size)}</span>
        </div>
        {extra}
        {src.canDownload && <Button type="primary" href={src.file(node, { download: true })}>⤓ {t('kb.download')}</Button>}
        {onClose && <Button type="text" onClick={onClose} aria-label={t('common.close')}>✕</Button>}
      </div>
      <div className="fs-viewer__body kb-viewer kb-viewer--file">
        <DocumentViewer key={`${node.id}:${node.updatedAt}`} item={asViewerItem(node)} src={src} conversion={conversion} />
      </div>
    </>
  );
}

/**
 * Opens a file over the folder: images in the lightbox (with the other images
 * of the folder as a gallery), everything else — PDF, Office, sheets, text,
 * media — in a full-screen modal.
 */
export default function NodeViewer({ node, siblings = [], src, conversion, onNavigate, onClose }) {
  if (!node) return null;
  if (isImage(node)) {
    const images = siblings.filter(isImage).map(asViewerItem);
    const index = Math.max(0, images.findIndex((image) => image.id === node.id));
    return (
      <ImageViewer
        images={images.length ? images : [asViewerItem(node)]}
        index={index}
        onIndex={(next) => onNavigate?.(images[next])}
        onClose={onClose}
        src={src}
        canDownload={src.canDownload}
      />
    );
  }
  return (
    <Modal open onCancel={onClose} footer={null} width="min(1200px, 100vw)" className="fs-viewer" destroyOnHidden closable={false}>
      <NodeFileView node={node} src={src} conversion={conversion} onClose={onClose} />
    </Modal>
  );
}
