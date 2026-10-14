import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Dropdown, Result, Skeleton } from 'antd';
import { DownloadOutlined, MoreOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { kbApi, privateSource } from '../api';
import { useKb } from '../KbContext';
import { formatSize } from '../fileTypes';
import { FileIcon } from '../components/Icons';
import ItemDialog from '../components/ItemDialog';
import AccessDialog from '../components/AccessDialog';
import MoveDialog from '../components/MoveDialog';
import DocumentViewer from '../viewers/DocumentViewer';
import { useItemActions } from './useItemActions';

/** A material opened full width: breadcrumbs, meta, actions and the viewer. */
export default function KbItem() {
  const { id } = useParams();
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { config, refreshTree } = useKb();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const src = useMemo(() => privateSource(), []);

  const load = useCallback(() => {
    kbApi
      .item(id)
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch(setError);
  }, [id]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const actions = useItemActions({
    onEdit: (item) => setDialog({ type: 'item', item }),
    onMove: (item) => setDialog({ type: 'move', item }),
    onAccess: (item) => setDialog({ type: 'access', item }),
    onChanged: () => navigate(data ? `/app/kb/f/${data.item.folderId}` : '/app/kb'),
  });

  if (error) {
    return <Result status="404" title={error?.response?.status === 404 ? t('kb.notFound') : errorMessage(error)} extra={<Link to="/app/kb">{t('kb.backHome')}</Link>} />;
  }
  if (!data) return <Skeleton active paragraph={{ rows: 10 }} />;

  const { item, breadcrumbs } = data;
  const menu = actions(item).filter((entry) => entry.key !== 'download');

  return (
    <div className="kb-page kb-item">
      <nav className="kb-crumbs">
        <Link to="/app/kb">{t('apps.kb.name')}</Link>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.id}>
            <span className="kb-crumbs__sep">/</span>
            <Link to={`/app/kb/f/${crumb.id}`}>{crumb.name}</Link>
          </span>
        ))}
      </nav>
      <header className="kb-item__head">
        <FileIcon item={item} size={44} />
        <div className="kb-item__title">
          <h1>{item.title}</h1>
          <span>
            {item.file ? `${item.file.name} · ${formatSize(item.file.size)} · ` : ''}
            {t('kb.updated', { date: formatDateTime(item.updatedAt, locale) })}
            {item.author ? ` · ${item.author}` : ''}
          </span>
        </div>
        <div className="kb-head__actions">
          {item.kind === 'file' && (
            <Button className="mod-act" icon={<DownloadOutlined />} href={src.file(item, { download: true })} aria-label={t('kb.download')} title={t('kb.download')}>
              <span>{t('kb.download')}</span>
            </Button>
          )}
          {menu.length > 0 && (
            <Dropdown menu={{ items: menu }} trigger={['click']}>
              <Button icon={<MoreOutlined />} aria-label={t('common.moreActions')} title={t('common.moreActions')} />
            </Dropdown>
          )}
        </div>
      </header>
      {item.description && <p className="kb-item__desc">{item.description}</p>}
      <div className={`kb-viewer kb-viewer--${item.kind}`}>
        <DocumentViewer item={item} src={src} conversion={config.conversion} />
      </div>

      <ItemDialog open={dialog?.type === 'item'} item={dialog?.item} folderId={item.folderId} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />
      {dialog?.type === 'access' && (
        <AccessDialog open type="item" id={item.id} title={item.title} onClose={() => { setDialog(null); load(); }} />
      )}
      <MoveDialog
        open={dialog?.type === 'move'}
        target={{ type: 'item', id: item.id }}
        onClose={() => setDialog(null)}
        move={(folderId) => kbApi.updateItem(item.id, { folderId })}
        onMoved={() => {
          setDialog(null);
          refreshTree();
          load();
        }}
      />
    </div>
  );
}
