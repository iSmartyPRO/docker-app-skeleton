import { useEffect, useState } from 'react';
import { App, Alert, Button, Checkbox, Dropdown, Empty, Input, Popover, Skeleton, Tag, Tooltip } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  LinkOutlined,
  LockOutlined,
  MoreOutlined,
  PlusOutlined,
  QrcodeOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { nowInZone, todayISO } from '../../../lib/datetime';
import { DateTimeField } from '../../../components/ui/DateTimeField';
import { LinkPermissionsPicker, PermissionChips, isWriteLink } from '../../../components/ui/LinkPermissions';
import { Hint } from '../../../help/Hint';
import { filesApi, formatBytes } from '../api';

/*
 * Public links of a file or folder: a list of link cards (permissions as
 * chips, copy, QR code, "see as recipient", activity) and an editor used both
 * to create and to change a link. The server decides what may be granted
 * (`grantable`) and enforces it again on every visitor request.
 */

const expiryDisabled = (maxDays) => (day) => {
  const value = day.format('YYYY-MM-DD');
  return value < todayISO() || Boolean(maxDays && value > nowInZone().add(maxDays, 'day').format('YYYY-MM-DD'));
};

const linkUrl = (link) => `${window.location.origin}/l/${link.token}`;

function QrCode({ url }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((qr) => qr.toDataURL(url, { margin: 1, width: 240, color: { dark: '#0F172A', light: '#FFFFFF' } }))
      .then((data) => alive && setSrc(data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return src ? <img className="fs-qr" src={src} alt="QR" width={200} height={200} /> : <div className="fs-qr" />;
}

function extrasOf(link, isFolder) {
  const extras = {
    maxSize: link?.maxFileMb || null,
    quota: link?.quotaMb || null,
    requireName: Boolean(link?.requireName),
    requireEmail: Boolean(link?.requireEmail),
    notify: link ? Boolean(link.notify) : true,
  };
  if (isFolder) extras.extensions = link?.extensions || '';
  return extras;
}

/** Create or change a link. */
function LinkEditor({ node, config, grantable, isFolder, link, onSubmit, onCancel }) {
  const { t } = useLocale();
  const [title, setTitle] = useState(link?.title || '');
  const [perms, setPerms] = useState(link?.permissions || ['view', 'download']);
  const [extras, setExtras] = useState(() => extrasOf(link, isFolder));
  const [password, setPassword] = useState('');
  const [dropPassword, setDropPassword] = useState(false);
  const [expires, setExpires] = useState(link?.expiresAt || null);
  const [busy, setBusy] = useState(false);
  const presets = [1, 7, 30].filter((days) => !config.maxLinkDays || days <= config.maxLinkDays);
  const writes = isWriteLink(perms);
  const willHavePassword = Boolean(password) || (link?.hasPassword && !dropPassword);
  const needsPassword = (config.requireLinkPassword || (writes && config.requireWriteLinkPassword)) && !willHavePassword;

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        title,
        permissions: perms,
        expiresAt: expires || null,
        maxFileMb: extras.maxSize || null,
        quotaMb: extras.quota || null,
        requireName: extras.requireName,
        requireEmail: extras.requireName && extras.requireEmail,
        notify: extras.notify,
      };
      if (isFolder) payload.extensions = extras.extensions || '';
      if (!link) payload.password = password || undefined;
      else if (password) payload.password = password;
      else if (dropPassword) payload.password = '';
      if (link && (link.expiresAt || null) === (expires || null)) delete payload.expiresAt;
      await onSubmit(payload);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fs-linkedit">
      <div className="fs-linkedit__field">
        <label className="fs-linkedit__label" htmlFor="fs-link-title">{t('files.links.title')}</label>
        <Input id="fs-link-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={node.name} allowClear />
      </div>
      <div className="fs-linkedit__field">
        <span className="fs-linkedit__label">
          {t('linkPerms.title')} <Hint id="files.linkPermissions" />
        </span>
        <LinkPermissionsPicker value={perms} onChange={setPerms} allowed={grantable} isFolder={isFolder} extras={extras} onExtrasChange={setExtras} maxUploadMb={config.maxUploadMb} />
        {!config.writeLinks && isFolder && <div className="fs-linkedit__note">{t('files.links.writeOff')}</div>}
      </div>
      <div className="fs-linkedit__grid">
        <div className="fs-linkedit__field">
          <span className="fs-linkedit__label">
            {t('files.linkPassword')} <Hint id="files.linkPassword" />
          </span>
          <Input.Password
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={link?.hasPassword ? t('files.links.keepPassword') : needsPassword ? t('files.passwordRequired') : t('files.passwordOptional')}
            autoComplete="new-password"
            disabled={dropPassword}
            status={needsPassword ? 'warning' : undefined}
          />
          {link?.hasPassword && (
            <Checkbox checked={dropPassword} onChange={(event) => setDropPassword(event.target.checked)}>
              {t('files.links.removePassword')}
            </Checkbox>
          )}
        </div>
        <div className="fs-linkedit__field">
          <span className="fs-linkedit__label">
            {t('files.linkExpires')} <Hint id="files.linkExpires" />
          </span>
          <DateTimeField
            value={expires}
            onChange={setExpires}
            placeholder={config.maxLinkDays ? t('files.maxDays', { n: config.maxLinkDays }) : t('files.noExpiry')}
            disabledDate={expiryDisabled(config.maxLinkDays)}
          />
          <div className="fs-linkedit__chips">
            {presets.map((days) => (
              <Button key={days} size="small" onClick={() => setExpires(nowInZone().add(days, 'day').second(0).millisecond(0).toISOString())}>
                {t('files.days', { n: days })}
              </Button>
            ))}
          </div>
        </div>
      </div>
      {needsPassword && <Alert type="warning" showIcon message={writes && config.requireWriteLinkPassword ? t('files.links.writePasswordNeeded') : t('files.links.passwordNeeded')} />}
      <div className="fs-linkedit__actions">
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button type="primary" loading={busy} disabled={needsPassword} onClick={submit} icon={link ? null : <LinkOutlined />}>
          {link ? t('common.save') : t('files.createLink')}
        </Button>
      </div>
    </div>
  );
}

const ACTION_ICON = { upload: '⬆', replace: '⟳', mkdir: '📁', rename: '✎', move: '↪', delete: '🗑' };

function LinkActivity({ linkId }) {
  const { t, locale } = useLocale();
  const [events, setEvents] = useState(null);
  useEffect(() => {
    filesApi
      .linkActivity(linkId)
      .then((res) => setEvents(res.data.events))
      .catch(() => setEvents([]));
  }, [linkId]);
  if (!events) return <Skeleton active paragraph={{ rows: 2 }} title={false} />;
  if (!events.length) return <div className="fs-linkact__empty">{t('files.links.noActivity')}</div>;
  return (
    <ul className="fs-linkact">
      {events.map((event) => (
        <li key={event.id}>
          <span className={`fs-linkact__icon is-${event.action}`}>{ACTION_ICON[event.action] || '•'}</span>
          <span className="fs-linkact__text">
            <strong>{event.visitor?.name || t('files.links.visitor')}</strong>
            {event.visitor?.email && <span className="fs-linkact__email"> · {event.visitor.email}</span>}
            <span> {t(`files.links.action.${event.action}`)} </span>
            <span className="fs-linkact__name">{event.name}</span>
            {event.bytes > 0 && <span className="fs-linkact__size"> · {formatBytes(event.bytes)}</span>}
          </span>
          <time>{formatDateTime(event.at, locale, { dateStyle: 'short', timeStyle: 'short' })}</time>
        </li>
      ))}
    </ul>
  );
}

function LinkCard({ link, index, node, config, grantable, isFolder, onRun }) {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const [editing, setEditing] = useState(false);
  const [activity, setActivity] = useState(false);
  const state = link.revoked ? 'revoked' : link.expired ? 'expired' : 'active';
  const url = linkUrl(link);
  const copy = () =>
    navigator.clipboard
      ?.writeText(url)
      .then(() => message.success(t('common.copied')))
      .catch(() => message.error(t('files.links.copyFailed')));

  if (editing) {
    return (
      <div className="fs-link is-editing">
        <div className="fs-link__edithead">{t('files.links.editTitle')}</div>
        <LinkEditor
          node={node}
          config={config}
          grantable={grantable}
          isFolder={isFolder}
          link={link}
          onCancel={() => setEditing(false)}
          onSubmit={async (payload) => {
            if (await onRun(() => filesApi.updateLink(link.id, payload))) {
              setEditing(false);
              message.success(t('files.links.saved'));
            }
          }}
        />
      </div>
    );
  }

  const menu = {
    items: [
      { key: 'edit', icon: <EditOutlined />, label: t('files.links.edit') },
      { key: 'activity', icon: <HistoryOutlined />, label: t('files.links.activity') },
      { type: 'divider' },
      link.revoked
        ? { key: 'restore', icon: <UndoOutlined />, label: t('files.restoreLink') }
        : { key: 'revoke', icon: <StopOutlined />, label: t('files.revokeLink') },
      { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('common.delete') },
    ],
    onClick: ({ key }) => {
      if (key === 'edit') setEditing(true);
      else if (key === 'activity') setActivity((on) => !on);
      else if (key === 'revoke' || key === 'restore') onRun(() => filesApi.updateLink(link.id, { revoked: key === 'revoke' }));
      else if (key === 'delete') {
        modal.confirm({
          title: t('files.deleteLinkConfirm'),
          content: t('files.links.deleteText'),
          okButtonProps: { danger: true },
          okText: t('common.delete'),
          onOk: () => onRun(() => filesApi.deleteLink(link.id)),
        });
      }
    },
  };

  return (
    <div className={`fs-link is-${state}`}>
      <div className="fs-link__head">
        <span className={`fs-link__badge is-${state}`}>
          <LinkOutlined />
        </span>
        <div className="fs-link__headtext">
          <div className="fs-link__title">
            {link.title || t('files.links.untitled', { n: index })}
            {state !== 'active' && (
              <Tag bordered={false} className="fs-link__state">
                {t(`files.linkState.${state}`)}
              </Tag>
            )}
          </div>
          <PermissionChips perms={link.permissions} />
        </div>
        <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
          <Button type="text" icon={<MoreOutlined />} aria-label={t('files.links.more')} />
        </Dropdown>
      </div>
      <div className="fs-link__url">
        <code title={url}>{url}</code>
        <Tooltip title={t('common.copy')}>
          <Button icon={<CopyOutlined />} disabled={state !== 'active'} onClick={copy} aria-label={t('common.copy')} />
        </Tooltip>
        <Popover
          trigger="click"
          content={
            <div className="fs-qrbox">
              <QrCode url={url} />
              <span>{t('files.links.qrHint')}</span>
            </div>
          }
        >
          <Tooltip title={t('files.links.qr')}>
            <Button icon={<QrcodeOutlined />} disabled={state !== 'active'} aria-label={t('files.links.qr')} />
          </Tooltip>
        </Popover>
        <Tooltip title={t('files.links.preview')}>
          <Button icon={<EyeOutlined />} disabled={state !== 'active'} href={`${url}?preview=1`} target="_blank" rel="noopener noreferrer" aria-label={t('files.links.preview')} />
        </Tooltip>
      </div>
      <div className="fs-link__meta">
        {link.hasPassword && (
          <span className="fs-link__fact">
            <LockOutlined /> {t('files.withPassword')}
          </span>
        )}
        <span className="fs-link__fact">{link.expiresAt ? t('files.until', { date: formatDateTime(link.expiresAt, locale) }) : t('files.noExpiry')}</span>
        <span className="fs-link__fact">{t('files.viewsN', { n: link.views })}</span>
        {link.uploads > 0 && <span className="fs-link__fact">{t('files.links.uploadsN', { n: link.uploads, size: formatBytes(link.uploadedBytes) })}</span>}
        {link.quotaMb && <span className="fs-link__fact">{t('files.links.quotaOf', { used: formatBytes(link.uploadedBytes || 0), total: `${link.quotaMb} MB` })}</span>}
        {link.requireName && <span className="fs-link__fact">{t('files.links.asksName')}</span>}
        {link.notify && <span className="fs-link__fact">{t('files.links.notifies')}</span>}
        {!link.mine && link.createdBy && <span className="fs-link__fact">{t('files.links.by', { name: link.createdBy.name })}</span>}
      </div>
      {activity && (
        <div className="fs-link__activity">
          <div className="fs-link__activityhead">{t('files.links.activity')}</div>
          <LinkActivity linkId={link.id} />
        </div>
      )}
    </div>
  );
}

/** The "Public links" tab of the share dialog. */
export default function ShareLinks({ node, config, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [composing, setComposing] = useState(false);
  const load = () =>
    filesApi
      .links(node.id)
      .then((res) => {
        setData(res.data);
        if (!res.data.links.length) setComposing(true);
      })
      .catch((err) => message.error(errorMessage(err)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  if (!config.publicLinks) return <div className="fs-share__empty">{t('files.linksDisabled')}</div>;
  if (!data) return <Skeleton active paragraph={{ rows: 3 }} />;
  const isFolder = data.isFolder ?? node.kind === 'folder';

  const run = async (action) => {
    try {
      await action();
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      message.error(errorMessage(err));
      return false;
    }
  };

  return (
    <div className="fs-links">
      {composing ? (
        <div className="fs-link is-new">
          <div className="fs-link__edithead">{t('files.links.newTitle')}</div>
          <LinkEditor
            node={node}
            config={config}
            grantable={data.grantable}
            isFolder={isFolder}
            onCancel={data.links.length ? () => setComposing(false) : null}
            onSubmit={async (payload) => {
              let created = null;
              const ok = await run(async () => {
                created = (await filesApi.createLink(node.id, payload)).data.link;
              });
              if (ok) {
                setComposing(false);
                navigator.clipboard?.writeText(linkUrl(created)).then(
                  () => message.success(t('files.links.createdCopied')),
                  () => message.success(t('files.links.created'))
                );
              }
            }}
          />
        </div>
      ) : (
        <Button type="dashed" block icon={<PlusOutlined />} onClick={() => setComposing(true)} className="fs-links__new">
          {t('files.links.new')}
        </Button>
      )}
      {data.links.map((link, index) => (
        <LinkCard key={link.id} link={link} index={data.links.length - index} node={node} config={config} grantable={data.grantable} isFolder={isFolder} onRun={run} />
      ))}
      {!data.links.length && !composing && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('files.links.none')} />}
    </div>
  );
}
