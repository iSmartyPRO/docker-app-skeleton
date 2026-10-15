import { Link } from 'react-router-dom';
import { Dropdown, Tooltip } from 'antd';
import { CopyOutlined, DeleteOutlined, EllipsisOutlined, ExpandAltOutlined, ExportOutlined, HolderOutlined, SettingOutlined } from '@ant-design/icons';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { WIDGET_CATALOG } from '../catalog';

export const SIZE_PRESETS = [
  { key: 's', w: 3, h: 4 },
  { key: 'm', w: 4, h: 5 },
  { key: 'l', w: 6, h: 6 },
  { key: 'wide', w: 8, h: 5 },
  { key: 'full', w: 12, h: 6 },
];

export function widgetTitle(widget, t) {
  return widget.settings?.title?.trim() || t(`dashboard.widgets.${widget.type}.name`);
}

/**
 * Card around a widget: header with icon, title and actions; in edit mode a
 * drag handle, size menu and a resize corner. `bare` widgets (greeting, note)
 * draw their own surface and get a floating toolbar instead of a header.
 */
export default function WidgetFrame({ widget, editing, canEdit, dragHandle, onSettings, onRemove, onResize, onDuplicate, onResizeStart, resizing, children }) {
  const { t } = useLocale();
  const def = WIDGET_CATALOG[widget.type];
  const title = widgetTitle(widget, t);
  const menu = {
    items: [
      { key: 'settings', icon: <SettingOutlined />, label: t('dashboard.frame.settings'), onClick: onSettings },
      {
        key: 'size',
        icon: <ExpandAltOutlined />,
        label: t('dashboard.frame.size'),
        children: SIZE_PRESETS.map((preset) => ({
          key: preset.key,
          label: (
            <span className="dash-sizeopt">
              <span>{t(`dashboard.sizes.${preset.key}`)}</span>
              <em>
                {preset.w}×{preset.h}
              </em>
            </span>
          ),
          onClick: () => onResize(preset),
        })),
      },
      { key: 'duplicate', icon: <CopyOutlined />, label: t('dashboard.frame.duplicate'), onClick: onDuplicate },
      def.link && { key: 'open', icon: <ExportOutlined />, label: <Link to={def.link}>{t('dashboard.frame.open')}</Link> },
      { type: 'divider' },
      { key: 'remove', danger: true, icon: <DeleteOutlined />, label: t('dashboard.frame.remove'), onClick: onRemove },
    ].filter(Boolean),
  };

  // Desktop: a settings shortcut next to «⋯». Touch screens and phones keep
  // only «⋯» (settings is its first item), so the header stays calm.
  const actions = canEdit && (
    <div className="dash-card__actions">
      {editing && (
        <span className="dash-card__grip" {...dragHandle} title={t('dashboard.frame.drag')} aria-label={t('dashboard.frame.drag')}>
          <HolderOutlined />
        </span>
      )}
      <Tooltip title={t('dashboard.frame.settings')}>
        <button type="button" className="dash-card__set" onClick={onSettings} aria-label={t('dashboard.frame.settings')}>
          <SettingOutlined />
        </button>
      </Tooltip>
      <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
        <button type="button" aria-label={t('dashboard.frame.more')}>
          <EllipsisOutlined />
        </button>
      </Dropdown>
    </div>
  );

  return (
    <article className={`dash-card${def.bare ? ' is-bare' : ''}${editing ? ' is-editing' : ''}${resizing ? ' is-resizing' : ''}`} style={{ '--w-accent': def.color }}>
      {def.bare ? (
        actions && <div className="dash-card__float">{actions}</div>
      ) : (
        <header className="dash-card__head" {...(editing ? dragHandle : {})}>
          <span className="dash-card__icon">
            <MenuIcon name={def.icon} variant="mono" />
          </span>
          {def.link && !editing ? (
            <Link to={def.link} className="dash-card__title" title={typeof title === 'string' ? title : undefined}>
              {title}
            </Link>
          ) : (
            <span className="dash-card__title" title={typeof title === 'string' ? title : undefined}>{title}</span>
          )}
          {actions}
        </header>
      )}
      <div className="dash-card__body">{children}</div>
      {editing && canEdit && onResizeStart && (
        <span className="dash-card__resize" onPointerDown={onResizeStart} title={t('dashboard.frame.resize')} aria-hidden>
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path d="M11 4v7H4M11 8v3H8" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      )}
      {resizing && (
        <span className="dash-card__dims">
          {widget.w} × {widget.h}
        </span>
      )}
    </article>
  );
}
