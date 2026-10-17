import { useEffect, useState } from 'react';
import { App, Empty, Modal, Spin } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { driveApi } from '../api';
import { useDrive } from '../DriveContext';
import { EntryIcon } from './EntryList';

/** Move or copy items into another folder on the same server. */
export default function MoveDialog({ open, share, paths, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { shares } = useDrive();
  const [mode, setMode] = useState('move');
  const [place, setPlace] = useState({ shareId: share?.id, path: '' });
  const [entries, setEntries] = useState(null);
  const [busy, setBusy] = useState(false);
  const candidates = (shares || []).filter((item) => item.serverId === share?.serverId && item.state === 'ok' && item.access?.write !== false);

  useEffect(() => {
    if (open) {
      setPlace({ shareId: share?.id, path: '' });
      setMode('move');
    }
  }, [open, share]);

  useEffect(() => {
    if (!open || !place.shareId) return;
    setEntries(null);
    driveApi
      .list(place.shareId, place.path)
      .then((res) => setEntries(res.data.entries.filter((entry) => entry.dir && !(place.shareId === share.id && paths.includes(entry.path)))))
      .catch(() => setEntries([]));
  }, [open, place, share, paths]);

  const current = candidates.find((item) => item.id === place.shareId);
  const parts = place.path ? place.path.split('/') : [];

  const submit = async () => {
    setBusy(true);
    try {
      await driveApi.move(share.id, { paths, toShareId: place.shareId, toPath: place.path, copy: mode === 'copy' });
      message.success(mode === 'copy' ? t('drive.copied') : t('drive.moved'));
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('drive.moveTitle', { n: paths.length })}
      onCancel={() => onClose(false)}
      onOk={submit}
      okText={mode === 'copy' ? t('drive.copyHere') : t('drive.moveHere')}
      cancelText={t('common.cancel')}
      confirmLoading={busy}
      width={720}
      destroyOnHidden
    >
      <Segmented block value={mode} onChange={setMode} options={[{ value: 'move', label: t('drive.move') }, { value: 'copy', label: t('drive.copy') }]} />
      <div className="fs-browser dv-move">
        <aside className="fs-browser__places">
          {candidates.map((item) => (
            <button key={item.id} type="button" className={item.id === place.shareId ? 'is-active' : ''} onClick={() => setPlace({ shareId: item.id, path: '' })}>
              <span className="mod-dot" style={{ '--c': item.color }} />
              {item.title}
            </button>
          ))}
        </aside>
        <section className="fs-browser__main">
          <nav className="fs-browser__crumbs">
            <button type="button" onClick={() => setPlace({ ...place, path: '' })}>{current?.title}</button>
            {parts.map((name, index) => (
              <span key={parts.slice(0, index + 1).join('/')}>
                <span className="fs-browser__sep">/</span>
                <button type="button" onClick={() => setPlace({ ...place, path: parts.slice(0, index + 1).join('/') })}>{name}</button>
              </span>
            ))}
          </nav>
          <div className="fs-browser__list">
            {!entries ? (
              <div className="fs-browser__loading"><Spin /></div>
            ) : !entries.length ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('files.noSubfolders')} />
            ) : (
              entries.map((entry) => (
                <div key={entry.path} className="fs-browser__row" role="button" tabIndex={0} onClick={() => setPlace({ ...place, path: entry.path })} onKeyDown={(event) => event.key === 'Enter' && setPlace({ ...place, path: entry.path })}>
                  <EntryIcon entry={entry} size={26} />
                  <span className="fs-browser__name">{entry.name}</span>
                  <span className="fs-browser__meta">›</span>
                </div>
              ))
            )}
          </div>
          <div className="fs-move__where">{t('drive.destination')}: <strong>{current?.title}{place.path ? ` / ${place.path}` : ''}</strong></div>
        </section>
      </div>
    </Modal>
  );
}
