import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { App, Button, Result, Spin, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { copyText } from '../../drive/api';
import { filesApi, nodeSource } from '../api';
import { useFiles } from '../FilesContext';
import { NodeFileView } from '../components/NodeViewer';
import { editorMode } from '../../office/editable';

/** Where the file lives: its folder, its space's root, or "My files". */
function parentOf(node, crumbs) {
  const folder = crumbs[crumbs.length - 1];
  if (node.parentId && folder?.id === node.parentId) return { url: `/app/files/f/${folder.id}`, name: folder.name, load: () => filesApi.folder(folder.id) };
  if (node.spaceId && !node.parentId) return { url: `/app/files/space/${node.spaceId}`, name: null, load: () => filesApi.space(node.spaceId) };
  if (node.level === 'manage' && !node.parentId) return { url: '/app/files', name: null, load: () => filesApi.my() };
  return { url: '/app/files/shared', name: null, load: null };
}

/**
 * /app/files/v/:id — one file on its own page: an address to bookmark or
 * send, the whole window for the viewer, and ‹ › through the folder's files.
 */
export default function FilePage() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { id } = useParams();
  const { config } = useFiles();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const src = useMemo(() => nodeSource(), []);

  useEffect(() => {
    let alive = true;
    setError(null);
    filesApi
      .node(id)
      .then(({ data: next }) => {
        if (!alive) return;
        if (next.node.kind === 'folder') {
          navigate(`/app/files/f/${next.node.id}`, { replace: true });
          return;
        }
        setData(next);
      })
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, [id, navigate]);

  const parent = data ? parentOf(data.node, data.crumbs || []) : null;
  const parentKey = parent?.url;
  useEffect(() => {
    if (!parent?.load) {
      setSiblings([]);
      return undefined;
    }
    let alive = true;
    parent
      .load()
      .then((res) => alive && setSiblings((res.data.items || []).filter((item) => item.kind === 'file')))
      .catch(() => alive && setSiblings([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentKey]);

  if (error) {
    return (
      <Result
        status="404"
        title={t('files.notFound')}
        subTitle={errorMessage(error)}
        extra={
          <Link to="/app/files">
            <Button type="primary">{t('apps.files.name')}</Button>
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

  const { node, crumbs = [] } = data;
  const where = crumbs.map((crumb) => crumb.name).join(' / ') || parent.name || t('apps.files.name');
  const index = siblings.findIndex((item) => item.id === node.id);
  const go = (delta) => {
    const next = siblings[index + delta];
    if (next) navigate(`/app/files/v/${next.id}`, { replace: true });
  };

  return (
    <div className="fs-filepage">
      <NodeFileView
        node={node}
        src={src}
        conversion={config?.conversion}
        lead={
          <Tooltip title={t('drive.backToFolder', { name: where })}>
            <Link to={parent.url} className="fs-filepage__back">
              <span aria-hidden>←</span>
              <em>{where}</em>
            </Link>
          </Tooltip>
        }
        extra={
          <>
            {siblings.length > 1 && index >= 0 && (
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
            )}
            {editorMode(config?.editor, node.file?.ext, ['edit', 'manage'].includes(node.level)) && (
              <Button type="primary" onClick={() => navigate(`/app/files/e/${node.id}`)}>
                {t(editorMode(config?.editor, node.file?.ext, ['edit', 'manage'].includes(node.level)) === 'edit' ? 'office.editOnline' : 'office.openInEditor')}
              </Button>
            )}
            <Tooltip title={t('files.copyPageLinkHint')}>
              <Button onClick={() => copyText(window.location.href).then(() => message.success(t('files.pageLinkCopied')))}>⧉ {t('files.copyPageLink')}</Button>
            </Tooltip>
          </>
        }
      />
    </div>
  );
}
