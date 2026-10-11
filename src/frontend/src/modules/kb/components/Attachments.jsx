import { useMemo, useState } from 'react';
import { useLocale } from '../../../context/LocaleContext';
import { formatSize } from '../fileTypes';
import { FileIcon } from './Icons';
import NodeViewer from '../../files/components/NodeViewer';

/** Files of an article (embedded or attached), opened with the same viewers. */
export default function Attachments({ item, src, conversion }) {
  const { t } = useLocale();
  const [viewing, setViewing] = useState(null);
  const nodes = useMemo(
    () =>
      item.attachments
        .filter((file) => file.available)
        .map((file) => ({ id: file.nodeId, kind: 'file', name: file.name, file: { name: file.name, ext: file.ext, size: file.size, mime: file.mime }, updatedAt: item.updatedAt })),
    [item]
  );
  // Viewer URLs go through the article, so readers need only access to it.
  const attachmentSrc = useMemo(
    () => ({
      file: (node, options) => src.attachment(item, node.id, options),
      preview: (node) => src.attachmentPreview(item, node.id),
      canDownload: src.canDownload,
    }),
    [src, item]
  );
  if (!nodes.length) return null;
  return (
    <section className="kb-attachments">
      <h3>{t('kb.attachments', { n: nodes.length })}</h3>
      <div className="kb-attachments__list">
        {nodes.map((node) => (
          <div key={node.id} className="kb-attachment" role="button" tabIndex={0} onClick={() => setViewing(node)} onKeyDown={(event) => event.key === 'Enter' && setViewing(node)}>
            <FileIcon item={{ kind: 'file', file: node.file }} size={34} />
            <span className="kb-attachment__text">
              <strong>{node.name}</strong>
              <span>{formatSize(node.file.size)}</span>
            </span>
            {src.canDownload && (
              <a className="kb-attachment__download" href={attachmentSrc.file(node, { download: true })} onClick={(event) => event.stopPropagation()} aria-label={t('kb.download')}>
                ⤓
              </a>
            )}
          </div>
        ))}
      </div>
      {viewing && (
        <NodeViewer
          node={viewing}
          siblings={nodes}
          src={attachmentSrc}
          conversion={conversion}
          onNavigate={(next) => next && setViewing(nodes.find((entry) => entry.id === next.id))}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}
