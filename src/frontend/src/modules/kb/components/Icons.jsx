import { MenuIcon } from '../../../components/icons/menuIcons';
import { TYPE_STYLE, itemType } from '../fileTypes';

/** Folder tile: the chosen icon in the folder colour on a soft tint of it. */
export function FolderIcon({ folder, config, size = 40 }) {
  const color = folder?.color || config?.defaultColor || '#3B82F6';
  const icon = folder?.icon || config?.defaultIcon || 'folder';
  return (
    <span className="kb-ficon" style={{ '--c': color, width: size, height: size }}>
      <MenuIcon name={icon} variant="mono" />
    </span>
  );
}

/** Document-shaped badge with the type colour and a short label. */
export function FileIcon({ item, size = 40 }) {
  const type = itemType(item);
  const base = TYPE_STYLE[type] || TYPE_STYLE.file;
  // Visual-editor articles are not Markdown.
  const style = type === 'article' && item.format === 'html' ? { ...base, label: 'Aa' } : base;
  const label = item.kind === 'file' ? (item.file?.ext || style.label).toUpperCase().slice(0, 4) : style.label;
  return (
    <span className="kb-doc" style={{ '--c': style.color, width: size * 0.8, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 40" width="100%" height="100%">
        <path d="M4 0h17l11 11v25a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z" fill="var(--kb-doc-paper)" />
        <path d="M21 0v7a4 4 0 0 0 4 4h7" fill="var(--kb-doc-fold)" />
        <rect x="0" y="23" width="32" height="12" rx="0" fill="var(--c)" />
      </svg>
      <span className="kb-doc__label">{label}</span>
    </span>
  );
}
