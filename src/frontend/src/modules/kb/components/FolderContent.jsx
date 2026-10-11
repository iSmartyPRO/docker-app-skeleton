import { Link } from 'react-router-dom';
import { Dropdown, Empty } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { formatRelative } from '../../../lib/format';
import { formatSize, itemType } from '../fileTypes';
import { FileIcon, FolderIcon } from './Icons';

function itemMeta(item, t) {
  if (item.kind === 'article') return t('kb.type.article');
  if (item.kind === 'link') {
    try {
      return new URL(item.url).hostname;
    } catch {
      return t('kb.type.link');
    }
  }
  return `${(item.file?.ext || '').toUpperCase()} · ${formatSize(item.file?.size)}`;
}

// Menu clicks bubble through the React tree (portals included) — keep them
// from also opening the card or following the folder link underneath.
const stop = ({ domEvent }) => {
  domEvent.stopPropagation();
  domEvent.preventDefault();
};

function Menu({ items, children }) {
  if (!items?.length) return children;
  return (
    <Dropdown menu={{ items, onClick: stop }} trigger={['click']} placement="bottomRight">
      {children}
    </Dropdown>
  );
}

/** Keyboard-accessible clickable block (a <button> cannot contain the ⋯ menu button). */
function pressable(onPress) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onPress,
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPress();
      }
    },
  };
}

/**
 * Grid or list of sub-folders and materials. Shared by the signed-in app and
 * public links; `folderLink`, `onOpen` and `actionsFor` adapt it to each.
 */
export default function FolderContent({ folders, items, view, config, src, folderLink, onOpen, actionsFor, folderActionsFor, emptyText }) {
  const { t, locale } = useLocale();

  if (!folders.length && !items.length) {
    return <Empty className="kb-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText || t('kb.emptyFolder')} />;
  }

  const more = (menu) =>
    menu?.length ? (
      <Menu items={menu}>
        <span
          role="button"
          tabIndex={0}
          className="kb-more"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          aria-label={t('kb.actions')}
        >
          ⋯
        </span>
      </Menu>
    ) : null;

  if (view === 'list') {
    return (
      <div className="kb-list">
        {folders.map((folder) => (
          <Link key={`f${folder.id}`} to={folderLink(folder.id)} className="kb-row">
            <FolderIcon folder={folder} config={config} size={34} />
            <span className="kb-row__main">
              <strong>{folder.name}</strong>
              <span>{folder.description || t('kb.counts', { folders: folder.folderCount || 0, items: folder.itemCount || 0 })}</span>
            </span>
            <span className="kb-row__time">{folder.updatedAt ? formatRelative(folder.updatedAt, locale) : ''}</span>
            {more(folderActionsFor?.(folder))}
          </Link>
        ))}
        {items.map((item) => (
          <div key={`i${item.id}`} className="kb-row" {...pressable(() => onOpen(item))}>
            <FileIcon item={item} size={34} />
            <span className="kb-row__main">
              <strong>{item.title}</strong>
              <span>
                {itemMeta(item, t)}
                {item.author ? ` · ${item.author}` : ''}
              </span>
            </span>
            <span className="kb-row__time">{formatRelative(item.updatedAt, locale)}</span>
            {more(actionsFor?.(item))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {folders.length > 0 && (
        <div className="kb-grid kb-grid--folders">
          {folders.map((folder) => (
            <Link key={folder.id} to={folderLink(folder.id)} className="kb-folder" style={{ '--c': folder.color || config?.defaultColor }}>
              <FolderIcon folder={folder} config={config} size={44} />
              <span className="kb-folder__text">
                <strong>{folder.name}</strong>
                <span>{t('kb.counts', { folders: folder.folderCount || 0, items: folder.itemCount || 0 })}</span>
              </span>
              {more(folderActionsFor?.(folder))}
            </Link>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <div className="kb-grid kb-grid--items">
          {items.map((item) => {
            const isImage = itemType(item) === 'image' && item.file?.ext !== 'heic';
            return (
              <div key={item.id} className="kb-card" {...pressable(() => onOpen(item))}>
                <span className={`kb-card__cover${isImage ? ' is-image' : ''}`}>
                  {isImage ? <img src={src.file(item)} alt="" loading="lazy" /> : <FileIcon item={item} size={58} />}
                </span>
                <span className="kb-card__body">
                  <strong title={item.title}>{item.title}</strong>
                  <span>{itemMeta(item, t)}</span>
                </span>
                {more(actionsFor?.(item))}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
