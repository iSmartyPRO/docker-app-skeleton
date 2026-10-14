import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import api from '../../services/api';

/*
 * "How it looks in a messenger": the card WhatsApp, Telegram, Slack… show
 * under a shared link, built by the server from the link's public state
 * (GET /api/og/preview, backend services/linkPreview). Collapsed by default;
 * the data is fetched the first time it is opened.
 */
export default function MessengerPreview({ url }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, preview: null, failed: false });

  let path = '/';
  try {
    path = new URL(url, window.location.origin).pathname;
  } catch {
    /* keep "/" */
  }

  useEffect(() => {
    if (!open || state.preview || state.loading) return undefined;
    let alive = true;
    setState({ loading: true, preview: null, failed: false });
    api
      .get('/og/preview', { params: { path } })
      .then((res) => alive && setState({ loading: false, preview: res.data.preview, failed: false }))
      .catch(() => alive && setState({ loading: false, preview: null, failed: true }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path]);

  const preview = state.preview;
  return (
    <div className={`sl-mp${open ? ' is-open' : ''}`} data-testid="messenger-preview">
      <button type="button" className="sl-mp__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>{t('linkShare.messengerPreview')}</span>
        <DownOutlined className="sl-mp__chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="sl-mp__body">
          {state.loading && <Spin size="small" />}
          {state.failed && <div className="sl-mp__hint">{t('linkShare.messengerPreviewFailed')}</div>}
          {preview && (
            <>
              <div className="sl-mp__bubble">
                {preview.image && <img className="sl-mp__image" src={preview.image} alt="" width={preview.width} height={preview.height} loading="lazy" />}
                <div className="sl-mp__text">
                  <div className="sl-mp__title">{preview.title}</div>
                  <div className="sl-mp__desc">{preview.description}</div>
                  <div className="sl-mp__host">{preview.host || preview.siteName}</div>
                </div>
                <div className="sl-mp__url">{url}</div>
              </div>
              <div className="sl-mp__hint">{t('linkShare.messengerPreviewHint')}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
