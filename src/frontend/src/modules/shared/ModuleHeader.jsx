import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Dropdown, Input, Skeleton, Space, Tooltip } from 'antd';
import Segmented from '../../components/ui/Segmented';
import {
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseOutlined,
  CopyOutlined,
  DownOutlined,
  MoreOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';

/*
 * Page header for module screens (Drive, Files): breadcrumbs, title block,
 * one action cluster and a toolbar. The layout follows the header's OWN width
 * (not the viewport), so it behaves the same with the module sidebar open,
 * collapsed to a rail, or hidden on a phone:
 *
 *   wide    ≥ 640px  secondary actions show icon + text
 *   compact ≥ 480px  secondary actions turn into icon buttons with tooltips
 *   phone   < 480px  the primary action and the rest move into a bottom dock,
 *                    the search collapses to an icon, crumbs to "… / parent / current"
 *
 * The width is measured with a ResizeObserver (not a CSS container query):
 * the mode also decides which tooltips exist and where the dock renders, and
 * `container-type` would make the header a containing block for the fixed dock.
 * See docs/extending.md → "Module page header" for the props.
 */

const MODES = [
  ['wide', 640],
  ['compact', 480],
  ['phone', 0],
];
const modeOf = (width) => MODES.find(([, min]) => width >= min)[0];

const HeaderContext = createContext({ mode: 'wide' });
/** 'wide' | 'compact' | 'phone' of the enclosing ModuleHeader. */
export const useHeaderMode = () => useContext(HeaderContext).mode;

function useWidthMode() {
  const ref = useRef(null);
  const [mode, setMode] = useState('wide');
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const update = () => setMode(modeOf(node.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, mode];
}

/** A button that loses its text in the compact modes (the text moves into a tooltip). */
function ActionButton({ action, iconOnly, block }) {
  const { key, label, icon, onClick, href, primary, danger, loading, disabled, tooltip, menu, tour } = action;
  const showText = !iconOnly || !icon;
  const common = { type: primary ? 'primary' : 'default', danger, loading, disabled };
  // `tour`: data-tour anchor of a guided tour step (docs/extending.md → «Guided tours»).
  const anchor = tour ? { 'data-tour': tour } : {};
  let node;
  if (menu?.length) {
    node = (
      <Space.Compact className={`mh-split${block ? ' is-block' : ''}`}>
        <Button {...common} {...anchor} icon={icon} onClick={onClick} href={href} aria-label={showText ? undefined : label}>
          {showText && <span className="mh-btn__text">{label}</span>}
        </Button>
        <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: menu }}>
          <Button {...common} icon={<DownOutlined />} aria-label={label} className="mh-split__arrow" />
        </Dropdown>
      </Space.Compact>
    );
  } else {
    node = (
      <Button {...common} {...anchor} icon={icon} onClick={onClick} href={href} aria-label={showText ? undefined : label} block={block}>
        {showText && <span className="mh-btn__text">{label}</span>}
      </Button>
    );
  }
  // No hint tooltips in the phone dock: a tap would pop them up over the button.
  const tip = block ? null : showText ? tooltip : tooltip ? `${label} — ${tooltip}` : label;
  return tip ? (
    <Tooltip key={key} title={tip} mouseEnterDelay={showText ? 0.6 : 0.1}>
      {menu?.length ? <span className={`mh-tipwrap${block ? ' is-block' : ''}`}>{node}</span> : node}
    </Tooltip>
  ) : (
    node
  );
}

function MoreButton({ items, label }) {
  const { t } = useLocale();
  if (!items?.length) return null;
  const text = label || t('moduleHeader.more');
  return (
    <Tooltip title={text} mouseEnterDelay={0.3}>
      <Dropdown trigger={['click']} placement="bottomRight" menu={{ items }}>
        <Button icon={<MoreOutlined />} aria-label={text} className="mh-more" />
      </Dropdown>
    </Tooltip>
  );
}

/** "… / parent / current" style trail; hidden middle items open from the "…" button. */
function Crumbs({ items, mode }) {
  const { t } = useLocale();
  if (!items?.length) return null;
  const keepTail = mode === 'phone' ? 2 : mode === 'compact' ? 2 : 3;
  const keepHead = mode === 'phone' ? 0 : 1;
  let shown = items.map((item, index) => ({ ...item, index }));
  let hidden = [];
  if (items.length > keepHead + keepTail + (keepHead ? 1 : 0)) {
    hidden = shown.slice(keepHead, items.length - keepTail);
    shown = [...shown.slice(0, keepHead), null, ...shown.slice(items.length - keepTail)];
  }
  return (
    <nav className="mh-crumbs" aria-label={t('moduleHeader.crumbs')}>
      <ol>
        {shown.map((item, position) => {
          const last = item && item.index === items.length - 1;
          return (
            <li key={item ? item.key || item.index : 'more'} className={item ? (last ? 'is-current' : undefined) : 'is-more'}>
              {position > 0 && <span className="mh-crumbs__sep" aria-hidden="true">/</span>}
              {!item ? (
                <Dropdown trigger={['click']} menu={{ items: hidden.map((entry) => ({ key: entry.key || String(entry.index), label: entry.to ? <Link to={entry.to}>{entry.label}</Link> : entry.label })) }}>
                  <button type="button" className="mh-crumbs__more" aria-label={t('moduleHeader.crumbsMore')}>…</button>
                </Dropdown>
              ) : last || !item.to ? (
                <span className="mh-crumbs__item" aria-current={last ? 'page' : undefined} title={typeof item.label === 'string' ? item.label : undefined}>{item.label}</span>
              ) : (
                <Link className="mh-crumbs__item" to={item.to} title={typeof item.label === 'string' ? item.label : undefined}>{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Search that is a field on wide headers and an icon that expands on phones. */
function HeaderSearch({ value, onChange, onSearch, loading, placeholder, mode, open, setOpen }) {
  const { t } = useLocale();
  const collapsed = mode === 'phone' && !open && !value;
  if (collapsed) {
    return (
      <Tooltip title={placeholder}>
        <Button icon={<SearchOutlined />} aria-label={placeholder || t('moduleHeader.search')} onClick={() => setOpen(true)} className="mh-search-toggle" />
      </Tooltip>
    );
  }
  return (
    <div className="mh-search">
      <Input.Search
        allowClear
        autoFocus={mode === 'phone' && open}
        placeholder={placeholder}
        value={value}
        loading={loading}
        onChange={(event) => onChange?.(event.target.value)}
        onSearch={(text) => onSearch?.(text)}
        onBlur={() => !value && setOpen(false)}
      />
      {mode === 'phone' && (
        <Button
          type="text"
          icon={<CloseOutlined />}
          aria-label={t('common.cancel')}
          onClick={() => {
            onChange?.('');
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Module page header. See docs/extending.md → "Module page header".
 */
export default function ModuleHeader({
  crumbs,
  title,
  icon,
  titleExtra,
  meta,
  description,
  actions = [],
  more,
  moreLabel,
  search,
  filters,
  status,
  selection,
  tools,
  dock = true,
  className = '',
  style,
}) {
  const [ref, mode] = useWidthMode();
  const [searchOpen, setSearchOpen] = useState(false);
  const list = actions.filter(Boolean);
  const primary = list.find((action) => action.primary);
  const docked = dock && mode === 'phone' && Boolean(primary);
  const iconOnly = mode !== 'wide';
  const extras = list.filter((action) => action.node).map((action) => <span key={action.key} hidden>{action.node}</span>);
  const buttons = list.filter((action) => !action.node);
  const searchExpanded = mode === 'phone' && (searchOpen || Boolean(search?.value));
  const hasStart = Boolean(search || filters || status || selection);
  const hasToolbar = hasStart || Boolean(tools);

  return (
    <HeaderContext.Provider value={{ mode }}>
      <header ref={ref} className={`mh ${className}`} data-size={mode} style={style}>
        <Crumbs items={crumbs} mode={mode} />
        <div className="mh-main">
          <h1 className="mh-title">
            {icon && <span className="mh-title__icon">{icon}</span>}
            <span className="mh-title__text" title={typeof title === 'string' ? title : undefined}>
              {title ?? <Skeleton.Input active size="small" />}
            </span>
            {titleExtra && <span className="mh-title__extra">{titleExtra}</span>}
          </h1>
          {!docked && (buttons.length > 0 || more?.length > 0) && (
            <div className="mh-actions">
              {buttons.map((action) => (
                <ActionButton key={action.key} action={action} iconOnly={iconOnly && (!action.primary || mode === 'phone')} />
              ))}
              <MoreButton items={more} label={moreLabel} />
            </div>
          )}
          {meta && <div className="mh-meta">{meta}</div>}
          {description && <p className="mh-lead">{description}</p>}
        </div>
        {hasToolbar && (
          <div className={`mh-toolbar${hasStart ? ' has-start' : ''}${selection ? ' has-selection' : ''}${searchExpanded ? ' is-searching' : ''}`}>
            {selection ? (
              <div className="mh-toolbar__start">{selection}</div>
            ) : (
              <div className="mh-toolbar__start">
                {search && <HeaderSearch {...search} mode={mode} open={searchOpen} setOpen={setSearchOpen} />}
                {filters && !searchExpanded && <div className="mh-filters">{filters}</div>}
                {status && <span className="mh-status">{status}</span>}
              </div>
            )}
            {tools && !searchExpanded && <div className="mh-toolbar__end">{tools}</div>}
          </div>
        )}
        {extras}
        {docked && (
          <div className="mh-dock" role="toolbar">
            {buttons.map((action) => (
              <ActionButton key={action.key} action={action} iconOnly={!action.primary} block={action.primary} />
            ))}
            <MoreButton items={more} label={moreLabel} />
          </div>
        )}
      </header>
    </HeaderContext.Provider>
  );
}

/** Grid / list switch with icons. */
export function ViewToggle({ value, onChange }) {
  const { t } = useLocale();
  return (
    <Segmented
      className="mh-view"
      value={value}
      onChange={onChange}
      options={[
        { value: 'grid', label: <AppstoreOutlined aria-label={t('moduleHeader.viewGrid')} />, title: t('moduleHeader.viewGrid') },
        { value: 'list', label: <UnorderedListOutlined aria-label={t('moduleHeader.viewList')} />, title: t('moduleHeader.viewList') },
      ]}
    />
  );
}

/** Sort field menu; picking the current field again flips the direction. */
export function SortButton({ options, value, desc, onChange }) {
  const { t } = useLocale();
  const current = options.find((option) => option.key === value) || options[0];
  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        selectable: true,
        selectedKeys: [current.key],
        items: options.map((option) => ({ key: option.key, label: option.label })),
        onClick: ({ key }) => onChange(key),
      }}
    >
      <Button type="text" className="mh-sort" aria-label={`${t('moduleHeader.sortBy')}: ${current.label}`}>
        <span className="mh-btn__text">{current.label}</span>
        {desc ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
      </Button>
    </Dropdown>
  );
}

/**
 * "N selected" bar with bulk actions: text buttons on wide headers, icon
 * buttons with tooltips otherwise. `actions` use the header action shape.
 */
export function SelectionBar({ label, actions = [], onClear }) {
  const { t } = useLocale();
  const mode = useHeaderMode();
  return (
    <div className="mh-selection" role="toolbar">
      <strong>{label}</strong>
      <span className="mh-selection__actions">
        {actions.filter(Boolean).map((action) => {
          const iconOnly = mode !== 'wide' && action.icon;
          const button = (
            <Button key={action.key} size="small" type="text" danger={action.danger} icon={action.icon} href={action.href} onClick={action.onClick} aria-label={action.label}>
              {!iconOnly && action.label}
            </Button>
          );
          return iconOnly ? <Tooltip key={action.key} title={action.label}>{button}</Tooltip> : button;
        })}
      </span>
      <Tooltip title={t('moduleHeader.clearSelection')}>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClear} aria-label={t('moduleHeader.clearSelection')} className="mh-selection__clear" />
      </Tooltip>
    </div>
  );
}

/**
 * A long path (UNC, URL) as a chip: truncated in the middle so both the root
 * and the last folder stay readable; click copies, the tooltip shows it whole.
 */
export function PathChip({ value, onCopy, tail = 28 }) {
  const { t } = useLocale();
  if (!value) return null;
  const cut = value.length > tail + 8 ? value.length - tail : value.length;
  // Prefer to cut at a separator so the tail starts with a whole folder name.
  const sep = Math.max(value.lastIndexOf('\\', value.length - 2), value.lastIndexOf('/', value.length - 2));
  const at = sep > 0 && value.length - sep <= tail + 12 ? sep : cut;
  return (
    <Tooltip title={<span className="mh-path__tip">{value}<em>{t('moduleHeader.clickToCopy')}</em></span>}>
      <button type="button" className="mh-path" onClick={onCopy} aria-label={`${t('moduleHeader.copyPath')}: ${value}`}>
        <code>
          <span className="mh-path__head">{value.slice(0, at)}</span>
          <span className="mh-path__tail">{value.slice(at)}</span>
        </code>
        <CopyOutlined className="mh-path__icon" />
      </button>
    </Tooltip>
  );
}
