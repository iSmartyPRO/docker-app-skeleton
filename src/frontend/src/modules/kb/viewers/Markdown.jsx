import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const ImageViewer = lazy(() => import('./ImageViewer'));

marked.setOptions({ gfm: true, breaks: false });

// Links open in a new tab and never get access to this window.
const safeLinks = (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
};
DOMPurify.addHook('afterSanitizeAttributes', safeLinks);

// Visual-editor articles get their own instance: checklists are shown, not ticked.
const articlePurify = DOMPurify(window);
articlePurify.addHook('afterSanitizeAttributes', (node) => {
  safeLinks(node);
  if (node.tagName === 'INPUT') {
    if (node.getAttribute('type') !== 'checkbox') node.remove();
    else node.setAttribute('disabled', '');
  }
});

// Pictures that are not links open in the lightbox (all pictures of the text form a gallery).
const zoomable = (img) => !img.closest('a') && img.getAttribute('src');
const nameOf = (url) => decodeURIComponent(String(url).split(/[?#]/)[0].split('/').pop() || '');

/**
 * Article body → sanitized HTML. `format` is 'md' (Markdown, the default) or
 * 'html' (visual editor). Scripts, handlers, styles sheets and forms are stripped.
 * `fileUrl(nodeId)` turns embedded files (`kbfile:<id>`) into real URLs.
 * Pictures with a size / layout / caption come as `<figure class="kb-figure"
 * data-width data-align>` and are laid out by the `.kb-prose .kb-figure` rules.
 * Clicking a picture opens it full screen (`zoom={false}` turns that off).
 */
export default function Markdown({ text, className = '', fileUrl, format = 'md', zoom = true }) {
  const box = useRef(null);
  const [gallery, setGallery] = useState(null);
  const html = useMemo(() => {
    let source = String(text || '');
    if (fileUrl) source = source.replace(/kbfile:(\d{1,10})/g, (match, id) => fileUrl(Number(id)));
    if (format === 'html') {
      return articlePurify.sanitize(source, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'form', 'button', 'select', 'textarea'],
        ADD_ATTR: ['target', 'data-type', 'data-checked', 'data-align', 'data-width'],
      });
    }
    return DOMPurify.sanitize(marked.parse(source), { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input'] });
  }, [text, fileUrl, format]);

  const onClick = (event) => {
    const img = event.target.closest?.('img');
    if (!zoom || !img || !box.current?.contains(img) || !zoomable(img)) return;
    const all = [...box.current.querySelectorAll('img')].filter(zoomable);
    const images = all.map((element, index) => {
      const caption = element.closest('figure')?.querySelector('figcaption')?.textContent?.trim();
      return { id: index, title: caption || element.getAttribute('alt') || nameOf(element.src), url: element.src };
    });
    setGallery({ images, index: Math.max(0, all.indexOf(img)) });
  };

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={box}
        className={`kb-prose${zoom ? ' kb-prose--zoom' : ''} ${className}`.trim()}
        onClick={onClick}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {gallery && (
        <Suspense fallback={null}>
          <ImageViewer
            images={gallery.images}
            index={gallery.index}
            onIndex={(index) => setGallery((current) => ({ ...current, index }))}
            onClose={() => setGallery(null)}
            src={{ file: (image) => image.url }}
          />
        </Suspense>
      )}
    </>
  );
}
