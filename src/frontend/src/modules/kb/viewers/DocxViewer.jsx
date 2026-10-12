import { useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import { useLocale } from '../../../context/LocaleContext';

/**
 * docx-preview copies a document's hyperlinks verbatim, so a crafted file could carry
 * `javascript:` links. Only web, mail and in-document anchors survive; outside links
 * open in a new tab without access to this window.
 */
function safeLinks(root) {
  root.querySelectorAll('a[href]').forEach((link) => {
    const href = (link.getAttribute('href') || '').trim();
    if (href.startsWith('#')) return;
    if (/^(https?:|mailto:)/i.test(href)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    } else {
      link.removeAttribute('href');
    }
  });
}

/** Word (.docx) rendered in the browser when no conversion server is set up. */
export default function DocxViewer({ url }) {
  const { t } = useLocale();
  const ref = useRef(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ renderAsync }, res] = await Promise.all([import('docx-preview'), fetch(url, { credentials: 'same-origin' })]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (cancelled) return;
      ref.current.replaceChildren();
      await renderAsync(blob, ref.current, undefined, {
        className: 'docx',
        inWrapper: true,
        ignoreLastRenderedPageBreak: true,
        renderHeaders: true,
        renderFooters: true,
        useBase64URL: true,
      });
      if (ref.current) safeLinks(ref.current);
      if (!cancelled) setState('ready');
    })().catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="docxv">
      {state === 'loading' && <div className="viewer-loading"><Spin /><span>{t('kb.viewer.loading')}</span></div>}
      {state === 'error' && <div className="viewer-empty"><strong>{t('kb.viewer.docError')}</strong></div>}
      <div ref={ref} className="docxv-body" />
    </div>
  );
}
