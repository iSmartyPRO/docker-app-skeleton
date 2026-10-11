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

/** Markdown → sanitized HTML. Raw HTML in articles is stripped of scripts and handlers. */
export default function Markdown({ text, className = '' }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(String(text || '')), { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input'] }),
    [text]
  );
  // eslint-disable-next-line react/no-danger
  return <div className={`kb-prose ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />;
}
