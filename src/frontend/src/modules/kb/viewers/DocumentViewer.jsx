import { Suspense, lazy, useState } from 'react';
import { Button, Spin } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { FileIcon } from '../components/Icons';
import { formatSize, viewerFor } from '../fileTypes';
import Markdown from './Markdown';

const Attachments = lazy(() => import('../components/Attachments'));

// Heavy renderers load only when a document of that type is opened.
const PdfViewer = lazy(() => import('./PdfViewer'));
const SheetViewer = lazy(() => import('./SheetViewer'));
const DocxViewer = lazy(() => import('./DocxViewer'));
const TextViewer = lazy(() => import('./TextViewer'));
const ImageViewer = lazy(() => import('./ImageViewer'));

function Fallback() {
  return (
    <div className="viewer-loading">
      <Spin />
    </div>
  );
}

function NoPreview({ item, src, reason }) {
  const { t } = useLocale();
  return (
    <div className="viewer-empty">
      <FileIcon item={item} size={64} />
      <strong>{item.file?.name || item.title}</strong>
      <span>
        {formatSize(item.file?.size)} · {reason || t('kb.viewer.noPreview')}
      </span>
      {src.canDownload && (
        <Button type="primary" size="large" href={src.file(item, { download: true })}>
          {t('kb.download')}
        </Button>
      )}
    </div>
  );
}

/**
 * Picks the best viewer for a material. `src` builds file / preview URLs for
 * either a signed-in user or a public link visitor.
 */
export default function DocumentViewer({ item, src, conversion }) {
  const { t } = useLocale();
  const [lightbox, setLightbox] = useState(false);
  const viewer = viewerFor(item, { conversion });
  const download = src.canDownload ? src.file(item, { download: true }) : null;

  let body;
  switch (viewer) {
    case 'article':
      body = (
        <>
          <article className="kb-article">
            <Markdown text={item.content} format={item.format} fileUrl={src.attachment ? (nodeId) => src.attachment(item, nodeId) : undefined} />
          </article>
          {item.attachments?.length > 0 && <Attachments item={item} src={src} conversion={conversion} />}
        </>
      );
      break;
    case 'link':
      body = (
        <div className="viewer-empty">
          <FileIcon item={item} size={64} />
          <strong>{item.title}</strong>
          <span className="kb-link-url">{item.url}</span>
          <Button type="primary" size="large" href={item.url} target="_blank" rel="noopener noreferrer">
            {t('kb.openLink')}
          </Button>
        </div>
      );
      break;
    case 'pdf':
      body = <PdfViewer url={src.file(item)} downloadUrl={download} title={item.title} />;
      break;
    case 'converted':
      body = <PdfViewer url={src.preview(item)} downloadUrl={download} title={item.title} />;
      break;
    case 'image':
      body = (
        <div className="imagev" onClick={() => setLightbox(true)} role="presentation">
          <img src={src.file(item)} alt={item.title} />
          <span className="imagev__hint">{t('kb.viewer.clickToZoom')}</span>
          {lightbox && <ImageViewer images={[item]} index={0} onIndex={() => {}} onClose={() => setLightbox(false)} src={src} canDownload={src.canDownload} />}
        </div>
      );
      break;
    case 'sheet':
      body = <SheetViewer url={src.file(item)} ext={item.file.ext} />;
      break;
    case 'docx':
      body = <DocxViewer url={src.file(item)} />;
      break;
    case 'text':
    case 'markdown':
      body = <TextViewer url={src.file(item)} ext={item.file.ext} />;
      break;
    case 'video':
      body = (
        <div className="mediav">
          <video src={src.file(item)} controls playsInline preload="metadata" />
        </div>
      );
      break;
    case 'audio':
      body = (
        <div className="viewer-empty">
          <FileIcon item={item} size={64} />
          <strong>{item.title}</strong>
          <audio src={src.file(item)} controls preload="metadata" />
        </div>
      );
      break;
    default: {
      const office = Boolean(item.file && /^(doc|ppt|pptx|xls|odt|odp|ods|rtf)$/.test(item.file.ext));
      body = <NoPreview item={item} src={src} reason={office ? t('kb.viewer.needsConversion') : undefined} />;
    }
  }

  return <Suspense fallback={<Fallback />}>{body}</Suspense>;
}

export { ImageViewer };
