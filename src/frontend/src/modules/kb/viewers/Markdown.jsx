import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

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

/**
 * Article body → sanitized HTML. `format` is 'md' (Markdown, the default) or
 * 'html' (visual editor). Scripts, handlers, styles sheets and forms are stripped.
 * `fileUrl(nodeId)` turns embedded files (`kbfile:<id>`) into real URLs.
 */
export default function Markdown({ text, className = '', fileUrl, format = 'md' }) {
  const html = useMemo(() => {
    let source = String(text || '');
    if (fileUrl) source = source.replace(/kbfile:(\d{1,10})/g, (match, id) => fileUrl(Number(id)));
    if (format === 'html') {
      return articlePurify.sanitize(source, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'form', 'button', 'select', 'textarea'],
        ADD_ATTR: ['target', 'data-type', 'data-checked'],
      });
    }
    return DOMPurify.sanitize(marked.parse(source), { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input'] });
  }, [text, fileUrl, format]);
  // eslint-disable-next-line react/no-danger
  return <div className={`kb-prose ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />;
}
