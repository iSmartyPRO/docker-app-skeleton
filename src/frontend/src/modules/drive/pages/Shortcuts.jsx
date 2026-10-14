import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Skeleton, Tooltip } from 'antd';
import { CloseOutlined, StarFilled } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { formatRelative } from '../../../lib/format';
import { driveApi, driveError, fileUrl, folderUrl, formatBytes } from '../api';
import { EntryIcon } from '../components/EntryList';
import { useDrive } from '../DriveContext';
import ModuleHeader from '../../shared/ModuleHeader';

/** Recent files or favourites across all drive folders. */
export default function Shortcuts({ kind }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { config } = useDrive();
  const [items, setItems] = useState(null);
  const load = () =>
    (kind === 'recent' ? driveApi.recent() : driveApi.favorites())
      .then((res) => setItems(res.data.items))
      .catch((err) => {
        setItems([]);
        message.error(driveError(err, t));
      });
  useEffect(() => {
    setItems(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const open = (item) => {
    if (item.dir) navigate(folderUrl(item.shareId, item.path));
    else {
      const parent = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
      if (config?.openMode !== 'modal') navigate(fileUrl(item.shareId, item.path));
      else navigate(`${folderUrl(item.shareId, parent)}?open=${encodeURIComponent(item.name)}`);
    }
  };

  return (
    <div className="fs-page">
      <ModuleHeader
        icon={kind === 'recent' ? null : <StarFilled className="dv-head__star" />}
        title={kind === 'recent' ? t('drive.recent') : t('drive.favorites')}
        description={kind === 'recent' ? t('drive.recentLead') : t('drive.favoritesLead')}
      />
      {!items ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !items.length ? (
        <div className="fs-empty">
          <span>{kind === 'recent' ? t('drive.recentEmpty') : t('drive.favoritesEmpty')}</span>
        </div>
      ) : (
        <div className="dv-recent dv-recent--page">
          {items.map((item) => (
            <div key={`${item.shareId}:${item.path}`} className="dv-recent__row" role="button" tabIndex={0} onClick={() => open(item)} onKeyDown={(event) => event.key === 'Enter' && open(item)}>
              <EntryIcon entry={item} size={32} />
              <span className="dv-recent__name">
                <strong>{item.name}</strong>
                <em><span className="mod-dot" style={{ '--c': item.color }} /> {item.shareTitle}{item.path.includes('/') ? ` / ${item.path.slice(0, item.path.lastIndexOf('/'))}` : ''}</em>
              </span>
              <span className="dv-recent__when">{item.dir ? t('drive.folder') : formatBytes(item.size)} · {formatRelative(item.at, locale)}</span>
              {kind === 'favorites' && (
                <Tooltip title={t('drive.unpin')}>
                  <Button
                    size="small"
                    type="text"
                    icon={<CloseOutlined />}
                    aria-label={t('drive.unpin')}
                    onClick={async (event) => {
                      event.stopPropagation();
                      await driveApi.removeFavorite(item.shareId, item.path);
                      load();
                    }}
                  />
                </Tooltip>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
