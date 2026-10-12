import { Checkbox, Dropdown, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { formatRelative } from '../../../lib/format';
import { FileIcon } from '../../kb/components/Icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { CAD, IMAGE, formatBytes } from '../api';

export function EntryIcon({ entry, size = 40 }) {
  if (entry.dir) {
    // The familiar yellow folder of desktop file managers.
    return (
      <span className="dv-folder-icon" style={{ width: size, height: size }} aria-hidden="true">
        <svg viewBox="0 0 40 32" width="100%" height="100%">
          <path d="M2 5.5A3.5 3.5 0 0 1 5.5 2h9.3c.9 0 1.8.4 2.5 1l2.7 2.6h14.5A3.5 3.5 0 0 1 38 9.1v17.4a3.5 3.5 0 0 1-3.5 3.5h-29A3.5 3.5 0 0 1 2 26.5Z" fill="#E5A50A" />
          <path d="M2 11.5A3.5 3.5 0 0 1 5.5 8h29a3.5 3.5 0 0 1 3.5 3.5v15a3.5 3.5 0 0 1-3.5 3.5h-29A3.5 3.5 0 0 1 2 26.5Z" fill="#FFC83D" />
          <path d="M5.5 9.2h29a2.3 2.3 0 0 1 2.3 2.3" fill="none" stroke="#FFE08A" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (CAD.has(entry.ext)) {
    return (
      <span className="kb-doc dv-cad-icon" style={{ '--c': '#C2410C', width: size * 0.8, height: size }} aria-hidden="true">
        <svg viewBox="0 0 32 40" width="100%" height="100%">
          <path d="M4 0h17l11 11v25a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z" fill="var(--kb-doc-paper)" />
          <path d="M21 0v7a4 4 0 0 0 4 4h7" fill="var(--kb-doc-fold)" />
          <path d="M7 19 13 9l6 10H7Zm5 0v-4" stroke="#C2410C" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
          <rect x="0" y="23" width="32" height="12" fill="#C2410C" />
        </svg>
        <span className="kb-doc__label">{entry.ext.toUpperCase()}</span>
      </span>
    );
  }
  return <FileIcon item={{ kind: 'file', file: { ext: entry.ext } }} size={size} />;
}

function Thumb({ entry, src }) {
  if (!entry.dir && IMAGE.has(entry.ext) && src?.thumb) {
    return <img className="fs-card__thumb" src={src.thumb(entry)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />;
  }
  if (!entry.dir && entry.ext === 'svg' && src?.file) {
    return <img className="fs-card__thumb dv-svg-thumb" src={src.file(entry)} alt="" loading="lazy" />;
  }
  return <EntryIcon entry={entry} size={54} />;
}

/**
 * Folder contents as cards or a table. Click opens, the checkbox selects,
 * ⋯ and right-click show `menu(entry)`.
 */
export default function EntryList({ entries, view = 'grid', selected, onToggle, onOpen, menu, src, showPath, emptyText, emptyIcon = 'folder' }) {
  const { t, locale } = useLocale();
  if (!entries.length) {
    return (
      <div className="fs-empty">
        <span className="fs-empty__icon"><MenuIcon name={emptyIcon} variant="mono" /></span>
        <span>{emptyText || t('drive.empty')}</span>
      </div>
    );
  }

  const more = (entry) => {
    const items = menu?.(entry) || [];
    if (!items.length) return null;
    return (
      <Dropdown trigger={['click']} menu={{ items, onClick: ({ domEvent }) => domEvent.stopPropagation() }}>
        <button type="button" className="fs-more" onClick={(event) => event.stopPropagation()} aria-label={t('drive.actions')}>⋯</button>
      </Dropdown>
    );
  };

  const wrap = (entry, children) => {
    const items = menu?.(entry) || [];
    return items.length ? (
      <Dropdown key={entry.path} trigger={['contextMenu']} menu={{ items }}>
        {children}
      </Dropdown>
    ) : (
      children
    );
  };

  const press = (entry) => ({
    role: 'button',
    tabIndex: 0,
    onClick: (event) => {
      if ((event.ctrlKey || event.metaKey) && onToggle) onToggle(entry);
      else onOpen(entry);
    },
    onKeyDown: (event) => event.key === 'Enter' && onOpen(entry),
  });

  const meta = (entry) => (entry.dir ? t('drive.folder') : formatBytes(entry.size));
  const where = (entry) => {
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    return parent || t('drive.root');
  };

  if (view === 'list') {
    return (
      <div className="fs-table dv-table">
        <div className="fs-table__head">
          {onToggle && <span />}
          <span>{t('drive.name')}</span>
          <span>{t('drive.modified')}</span>
          <span className="fs-table__size">{t('drive.size')}</span>
          <span />
        </div>
        {entries.map((entry) =>
          wrap(
            entry,
            <div key={entry.path} className={`fs-row${selected?.has(entry.path) ? ' is-selected' : ''}${entry.hidden ? ' is-hidden' : ''}`} {...press(entry)}>
              {onToggle && (
                <span onClick={(event) => event.stopPropagation()} role="presentation">
                  <Checkbox checked={selected.has(entry.path)} onChange={() => onToggle(entry)} />
                </span>
              )}
              <span className="fs-row__name">
                <EntryIcon entry={entry} size={30} />
                <span>
                  <strong>{entry.name}</strong>
                  {showPath && <em>{where(entry)}</em>}
                </span>
                {entry.readonly && (
                  <Tooltip title={t('drive.readonlyFile')}>
                    <span className="dv-ro">RO</span>
                  </Tooltip>
                )}
              </span>
              <span className="fs-row__meta">{entry.mtime ? formatRelative(entry.mtime, locale) : '—'}</span>
              <span className="fs-table__size">{entry.dir ? '' : formatBytes(entry.size)}</span>
              <span>{more(entry)}</span>
            </div>
          )
        )}
      </div>
    );
  }

  return (
    <div className="fs-grid">
      {entries.map((entry) =>
        wrap(
          entry,
          <div key={entry.path} className={`fs-card${entry.dir ? ' is-folder' : ''}${selected?.has(entry.path) ? ' is-selected' : ''}${entry.hidden ? ' is-hidden' : ''}`} {...press(entry)}>
            {onToggle && (
              <span className="fs-card__check" onClick={(event) => event.stopPropagation()} role="presentation">
                <Checkbox checked={selected.has(entry.path)} onChange={() => onToggle(entry)} />
              </span>
            )}
            <span className="fs-card__more">{more(entry)}</span>
            <div className="fs-card__visual">
              <Thumb entry={entry} src={src} />
            </div>
            <div className="fs-card__body">
              <strong title={entry.name}>{entry.name}</strong>
              <span>
                {meta(entry)}
                {showPath ? ` · ${where(entry)}` : entry.mtime ? ` · ${formatRelative(entry.mtime, locale)}` : ''}
              </span>
            </div>
          </div>
        )
      )}
    </div>
  );
}
