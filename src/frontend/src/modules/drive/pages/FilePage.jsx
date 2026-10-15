import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Result, Spin, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { driveApi, driveError, editUrl, fileUrl, folderUrl, shareSource } from '../api';
import { editorMode } from '../../office/editable';
import { useDrive } from '../DriveContext';
import { sortEntries, usePrefs } from '../prefs';
import { DriveFileView } from '../components/DriveViewer';
import LinkDialog from '../components/LinkDialog';

function decodePath(raw) {
  return (raw || '')
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join('/');
}

/**
 * /app/drive/v/:shareId/<path> — one file on its own page: an address to
 * bookmark or send, the whole window for the viewer, and ‹ › through the
 * other files of the folder.
 */
export default function FilePage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const params = useParams();
  const shareId = Number(params.shareId);
  const path = decodePath(params['*']);
  const parent = path.split('/').slice(0, -1).join('/');
  const { shares, config } = useDrive();
  const [prefs] = usePrefs();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [linkEntry, setLinkEntry] = useState(null);
  const src = useMemo(() => shareSource(shareId), [shareId]);
  const share = shares?.find((item) => item.id === shareId);

  useEffect(() => {
    let alive = true;
    setError(null);
    driveApi
      .stat(shareId, path)
      .then((res) => {
        if (!alive) return;
        if (res.data.entry?.dir) {
          navigate(folderUrl(shareId, path), { replace: true });
          return;
        }
        setData(res.data);
        driveApi.touchRecent({ shareId, path, size: res.data.entry.size }).catch(() => {});
      })
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, [shareId, path, navigate]);

  // The folder's files, in the order the folder view shows them.
  useEffect(() => {
    let alive = true;
    driveApi
      .list(shareId, parent, prefs.hidden)
      .then((res) => alive && setSiblings(sortEntries(res.data.entries.filter((entry) => !entry.dir), prefs)))
      .catch(() => alive && setSiblings([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId, parent, prefs.hidden, prefs.sort, prefs.desc]);

  const folderLink = folderUrl(shareId, parent);
  const index = siblings.findIndex((entry) => entry.path === path);
  const go = (delta) => {
    const next = siblings[index + delta];
    if (next) navigate(fileUrl(shareId, next.path), { replace: true });
  };

  if (error) {
    return (
      <Result
        status={error?.response?.status === 404 ? '404' : 'warning'}
        title={driveError(error, t)}
        extra={
          <Link to={folderLink}>
            <Button type="primary">{t('drive.openFolder')}</Button>
          </Link>
        }
      />
    );
  }
  if (!data) {
    return (
      <div className="fs-filepage is-loading">
        <Spin size="large" />
      </div>
    );
  }

  const where = [share?.title || data.share?.title, ...parent.split('/').filter(Boolean)].filter(Boolean).join(' / ');
  const canWrite = data.access?.write !== false;
  const nav = siblings.length > 1 && index >= 0 && (
    <span className="fs-filepage__nav">
      <Tooltip title={t('drive.prevFile')}>
        <Button type="text" disabled={index <= 0} onClick={() => go(-1)} aria-label={t('drive.prevFile')}>‹</Button>
      </Tooltip>
      <span>
        {index + 1} / {siblings.length}
      </span>
      <Tooltip title={t('drive.nextFile')}>
        <Button type="text" disabled={index >= siblings.length - 1} onClick={() => go(1)} aria-label={t('drive.nextFile')}>›</Button>
      </Tooltip>
    </span>
  );

  return (
    <div className="fs-filepage" style={{ '--c': share?.color }}>
      <DriveFileView
        entry={data.entry}
        src={src}
        shareId={shareId}
        unc={data.unc}
        conversion={config?.conversion}
        canEdit={canWrite}
        onChanged={() => {}}
        onShare={config?.publicLinks && share?.allowLinks ? setLinkEntry : null}
        lead={
          <Tooltip title={t('drive.backToFolder', { name: where })}>
            <Link to={folderLink} className="fs-filepage__back">
              <span aria-hidden>←</span>
              <em>{where}</em>
            </Link>
          </Tooltip>
        }
        extra={
          <>
            {nav}
            {editorMode(config?.editor, data.entry?.ext || (data.entry?.name || '').split('.').pop(), canWrite) && (
              <Button type="primary" onClick={() => navigate(editUrl(shareId, path))}>
                {t(editorMode(config?.editor, data.entry?.ext || (data.entry?.name || '').split('.').pop(), canWrite) === 'edit' ? 'office.editOnline' : 'office.openInEditor')}
              </Button>
            )}
          </>
        }
      />
      <LinkDialog open={Boolean(linkEntry)} shareId={shareId} entry={linkEntry} config={config || {}} onClose={() => setLinkEntry(null)} />
    </div>
  );
}
