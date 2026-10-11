import { useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import { useLocale } from '../../../context/LocaleContext';

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
