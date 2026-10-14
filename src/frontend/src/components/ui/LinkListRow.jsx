import { useState } from 'react';
import { App, Button, Dropdown, Modal, Tooltip } from 'antd';
import { CopyOutlined, EditOutlined, EyeOutlined, LinkOutlined, LockOutlined, MoreOutlined, QrcodeOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { PermissionChips } from './LinkPermissions';
import { LinkQr, copyToClipboard, shortUntil } from './LinkSimpleForm';
import './linkShare.css';

/*
 * One public link in a compact list (Files share dialog, Drive link dialog,
 * My links, the administrator's list): the address with the custom part
 * highlighted, permission icons, expiry, password lock and views; copy and
 * edit at hand, everything else under ⋯ (QR, open as recipient, plus the
 * module's own items such as activity, revoke and delete).
 *
 *   url, host, path, address — the full link and its parts for display
 *   custom      — the address is a custom slug (highlighted)
 *   active      — copy/QR/open only work on active links
 *   stateLabel  — a short tag for inactive links ("Expired", "Turned off"…)
 *   menuItems   — antd menu items added after QR / open; onMenu(key) handles them
 *   facts       — extra small facts (nodes) after the standard ones
 *   leading     — content above the address (e.g. the item on My links)
 *   children    — content below (e.g. the activity panel)
 */
export default function LinkListRow({
  url,
  previewUrl,
  host,
  path,
  address,
  custom = false,
  title,
  name,
  active = true,
  stateLabel,
  stateTone = 'muted',
  perms,
  hasPassword,
  expiresAt,
  views,
  facts,
  leading,
  menuItems = [],
  onMenu,
  onEdit,
  fresh = false,
  children,
  testId = 'link-row',
}) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [qr, setQr] = useState(false);
  const copy = () => copyToClipboard(url).then((ok) => (ok ? message.success(t('common.copied')) : message.error(t('files.links.copyFailed'))));
  const menu = {
    items: [
      { key: 'qr', icon: <QrcodeOutlined />, label: t('linkShare.qr'), disabled: !active },
      { key: 'open', icon: <EyeOutlined />, label: t('linkShare.openAsRecipient'), disabled: !active },
      ...(menuItems.length ? [{ type: 'divider' }, ...menuItems] : []),
    ],
    onClick: ({ key, domEvent }) => {
      domEvent?.stopPropagation?.();
      if (key === 'qr') setQr(true);
      else if (key === 'open') window.open(previewUrl || url, '_blank', 'noopener,noreferrer');
      else onMenu?.(key);
    },
  };
  return (
    <div className={`sl-lrow${active ? '' : ' is-inactive'}${fresh ? ' is-fresh' : ''}`} data-testid={testId}>
      {leading}
      <div className="sl-lrow__main">
        <span className={`sl-lrow__badge${custom ? ' is-custom' : ''}`} aria-hidden="true">
          <LinkOutlined />
        </span>
        <div className="sl-lrow__body">
          <div className="sl-lrow__addr" title={url}>
            <span className="sl-lrow__prefix"><span className="sl-lrow__host">{host}</span>{path}</span>
            <span className={custom ? 'sl-lrow__slug' : 'sl-lrow__token'}>{address}</span>
            {stateLabel && <span className={`sl-tag is-${stateTone}`}>{stateLabel}</span>}
          </div>
          {title && <div className="sl-lrow__title">{title}</div>}
          <div className="sl-lrow__facts">
            <PermissionChips perms={perms} compact />
            {hasPassword && (
              <Tooltip title={t('linkShare.withPassword')}>
                <span className="sl-fact" aria-label={t('linkShare.withPassword')}>
                  <LockOutlined />
                </span>
              </Tooltip>
            )}
            <span className="sl-fact">{expiresAt ? t('linkShare.until', { date: shortUntil(expiresAt, locale) }) : t('linkShare.noExpiry')}</span>
            {views !== undefined && views !== null && (
              <Tooltip title={t('linkShare.views')}>
                <span className="sl-fact" aria-label={`${t('linkShare.views')}: ${views}`}>
                  <EyeOutlined /> {views}
                </span>
              </Tooltip>
            )}
            {facts}
          </div>
        </div>
        <div className="sl-lrow__actions">
          <Tooltip title={t('linkShare.copyLink')}>
            <Button type="text" icon={<CopyOutlined />} disabled={!active} onClick={copy} aria-label={t('linkShare.copyLink')} data-testid="link-copy" />
          </Tooltip>
          {onEdit && (
            <Tooltip title={t('linkShare.edit')}>
              <Button type="text" icon={<EditOutlined />} onClick={onEdit} aria-label={t('linkShare.edit')} data-testid="link-edit" />
            </Tooltip>
          )}
          <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} aria-label={t('linkShare.moreActions')} data-testid="link-more" />
          </Dropdown>
        </div>
      </div>
      {children}
      <Modal open={qr} onCancel={() => setQr(false)} footer={null} width={300} centered destroyOnHidden title={t('linkShare.qr')}>
        <LinkQr url={url} name={name || title} />
      </Modal>
    </div>
  );
}
