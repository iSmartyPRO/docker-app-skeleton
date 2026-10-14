import { Checkbox, Dropdown, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { formatRelative } from '../../../lib/format';
import { FileIcon } from '../../kb/components/Icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { UserAvatar } from '../../shared/People';
import { formatBytes, nodeSource } from '../api';

/** System folders (the knowledge-base folder) are named in the UI language. */
export function nodeLabel(node, t) {
  return node?.systemTag === 'kb' ? t('apps.kb.name') : node?.name;
}

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

export function NodeIcon({ node, size = 40 }) {
  if (node.kind === 'folder') {
    return (
      <span className="fs-folder-icon" style={{ width: size, height: size }} data-system={node.systemTag || undefined}>
        <MenuIcon name={node.systemTag === 'kb' ? 'graduation' : 'folder'} variant="mono" />
      </span>
    );
  }
  return <FileIcon item={{ kind: 'file', file: node.file }} size={size} />;
}

function Thumb({ node, src }) {
  if (node.kind === 'file' && IMAGE.has(node.file?.ext) && !node.deletedAt) {
    return <img className="fs-card__thumb" src={(src || nodeSource()).file(node)} alt="" loading="lazy" />;
  }
  return <NodeIcon node={node} size={54} />;
}

function SharedMark({ node }) {
  const { t } = useLocale();
  if (!node.shared) return null;
  return (
    <Tooltip title={t('files.sharedMark')}>
      <span className="fs-shared" aria-label={t('files.sharedMark')}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 6.5a3 3 0 0 1 0 5.6M18.5 19c-.3-1.9-1.1-3.3-2.3-4.2" />
        </svg>
      </span>
    </Tooltip>
  );
}

/** Added or last changed through a public link: who and through which link. */
function ViaMark({ node, full = false }) {
  const { t, locale } = useLocale();
  if (!node.via) return null;
  const who = node.via.name || t('files.links.visitor');
  const tip = t('files.via.tip', { action: t(`files.links.action.${node.via.action}`), title: node.via.title || '—', who, when: formatRelative(node.via.at, locale) });
  return (
    <Tooltip title={tip}>
      <span className="fs-via" aria-label={tip}>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
        <span>{full ? t('files.via.short', { who }) : who}</span>
      </span>
    </Tooltip>
  );
}

/**
 * Files and folders as a grid of cards or a table. Clicking opens; the ⋯ menu
 * (and right-click) offers the actions `menu(node)` returns.
 */
export default function NodeList({ nodes, view = 'grid', selected, onToggle, onOpen, menu, showOwner, showPath, emptyText, src }) {
  const { t, locale } = useLocale();
  if (!nodes.length) {
    return (
      <div className="fs-empty">
        <span className="fs-empty__icon"><MenuIcon name="folder" variant="mono" /></span>
        <span>{emptyText || t('files.empty')}</span>
      </div>
    );
  }

  const more = (node) => {
    const items = menu?.(node) || [];
    if (!items.length) return null;
    return (
      <Dropdown trigger={['click']} menu={{ items, onClick: ({ domEvent }) => { domEvent.stopPropagation(); } }}>
        <button type="button" className="fs-more" onClick={(event) => event.stopPropagation()} aria-label={t('files.actions')}>⋯</button>
      </Dropdown>
    );
  };

  const wrap = (node, children) => {
    const items = menu?.(node) || [];
    return items.length ? (
      <Dropdown key={node.id} trigger={['contextMenu']} menu={{ items }}>
        {children}
      </Dropdown>
    ) : (
      children
    );
  };

  const press = (node) => ({
    role: 'button',
    tabIndex: 0,
    onClick: () => onOpen(node),
    onKeyDown: (event) => event.key === 'Enter' && onOpen(node),
  });

  if (view === 'list') {
    return (
      <div className="fs-table">
        <div className="fs-table__head">
          {onToggle && <span />}
          <span>{t('files.name')}</span>
          <span>{showOwner ? t('files.owner') : t('files.modified')}</span>
          <span className="fs-table__size">{t('files.size')}</span>
          <span />
        </div>
        {nodes.map((node) =>
          wrap(
            node,
            <div key={node.id} className={`fs-row${selected?.has(node.id) ? ' is-selected' : ''}`} {...press(node)}>
              {onToggle && (
                <span onClick={(event) => event.stopPropagation()} role="presentation">
                  <Checkbox checked={selected.has(node.id)} onChange={() => onToggle(node)} />
                </span>
              )}
              <span className="fs-row__name">
                <NodeIcon node={node} size={30} />
                <span>
                  <strong>{nodeLabel(node, t)}</strong>
                  {showPath && node.path?.length > 0 && <em>{node.path.join(' / ')}</em>}
                </span>
                <ViaMark node={node} full />
                <SharedMark node={node} />
              </span>
              <span className="fs-row__meta">
                {showOwner && node.owner ? (
                  <span className="person"><UserAvatar user={node.owner} size={20} tip={false} /><span>{node.owner.name}</span></span>
                ) : (
                  formatRelative(node.deletedAt || node.updatedAt, locale)
                )}
              </span>
              <span className="fs-table__size">{node.kind === 'file' ? formatBytes(node.file?.size) : node.childCount !== undefined ? t('files.itemsN', { n: node.childCount }) : ''}</span>
              <span>{more(node)}</span>
            </div>
          )
        )}
      </div>
    );
  }

  return (
    <div className="fs-grid">
      {nodes.map((node) =>
        wrap(
          node,
          <div key={node.id} className={`fs-card${node.kind === 'folder' ? ' is-folder' : ''}${selected?.has(node.id) ? ' is-selected' : ''}`} {...press(node)}>
            {onToggle && (
              <span className="fs-card__check" onClick={(event) => event.stopPropagation()} role="presentation">
                <Checkbox checked={selected.has(node.id)} onChange={() => onToggle(node)} />
              </span>
            )}
            <span className="fs-card__more">{more(node)}</span>
            <div className="fs-card__visual">
              <Thumb node={node} src={src} />
            </div>
            <div className="fs-card__body">
              <strong title={nodeLabel(node, t)}>{nodeLabel(node, t)}</strong>
              <span>
                {node.kind === 'file' ? formatBytes(node.file?.size) : t('files.itemsN', { n: node.childCount ?? 0 })}
                {showOwner && node.owner ? ` · ${node.owner.name}` : ''}
                {showPath && node.path?.length ? ` · ${node.path[node.path.length - 1]}` : ''}
              </span>
              <ViaMark node={node} />
              <SharedMark node={node} />
            </div>
          </div>
        )
      )}
    </div>
  );
}
