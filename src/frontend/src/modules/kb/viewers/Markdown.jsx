import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

// Links open in a new tab and never get access to this window.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

/**
 * Markdown → sanitized HTML. Raw HTML in articles is stripped of scripts and handlers.
 * `fileUrl(nodeId)` turns embedded files (`kbfile:<id>`) into real URLs.
 */
export default function Markdown({ text, className = '', fileUrl }) {
  const html = useMemo(() => {
    let source = String(text || '');
    if (fileUrl) source = source.replace(/kbfile:(\d{1,10})/g, (match, id) => fileUrl(Number(id)));
    return DOMPurify.sanitize(marked.parse(source), { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input'] });
  }, [text, fileUrl]);
  // eslint-disable-next-line react/no-danger
  return <div className={`kb-prose ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />;
}
