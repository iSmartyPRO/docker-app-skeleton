import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Input, Modal, Popconfirm, Popover, Segmented, Skeleton, Spin, Tag, Tooltip } from 'antd';
import { CopyOutlined, DownloadOutlined, EditOutlined, EyeOutlined, PlusOutlined, QrcodeOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { nowInZone, todayISO } from '../../../lib/datetime';
import { DateTimeField } from '../../../components/ui/DateTimeField';
import { LinkPermissionsPicker, PermissionChips, isWriteLink, normalizePermissions, permissionSentence } from '../../../components/ui/LinkPermissions';
import { copyText, driveApi, driveError, formatBytes } from '../api';
import { EntryIcon } from './EntryList';
import { Hint } from '../../../help/Hint';

/*
 * Public links of one file or folder: the list (state, permissions, copy,
 * QR code, edit, turn off, delete) and the editor (what the recipient may do,
 * upload rules, who may open it, password, expiry) with a live preview of the
 * page the recipient sees.
 */

/*
 * Link expiry in the person's zone: the picker shows their wall-clock time,
 * whole days (disabled dates, max days) are their calendar days.
 */
const expiryDisabled = (maxDays) => (day) => {
  const value = day.format('YYYY-MM-DD');
  return value < todayISO() || Boolean(maxDays && value > nowInZone().add(maxDays, 'day').format('YYYY-MM-DD'));
};

export const linkUrl = (link) => `${window.location.origin}/d/${link.token}`;

const VIEW_KEYS = ['view', 'download'];

/**
 * What the person may grant on this item: viewing always; changes only while
 * administrators allow write links and the file server gives the person the
 * rights (unknown rights: the server decides when the link is saved).
 */
export function grantableKeys(access, config = {}) {
  if (config.linkWrite === false) return VIEW_KEYS;
  const known = access && access.known !== false;
  const write = !known || Boolean(access.write);
  const del = !known || Boolean(access.delete);
  const keys = [...VIEW_KEYS];
  if (write) keys.push('upload', 'mkdir', 'replace');
  if (write && del) keys.push('rename');
  if (del) keys.push('delete');
  return keys;
}

const extrasOf = (link) => ({
  maxSize: link?.maxFileMb || null,
  extensions: (link?.allowedExts || []).map((ext) => `.${ext}`).join(', '),
  quota: link?.quotaMb || null,
  requireName: Boolean(link?.requireName),
  requireEmail: Boolean(link?.requireEmail),
  notify: Boolean(link?.notify),
});

export function LinkStatus({ link }) {
  const { t } = useLocale();
  const color = { active: 'green', expired: 'orange', revoked: 'default', owner_inactive: 'red' }[link.status] || 'default';
  return <Tag color={color} bordered={false}>{t(`drive.linkStatus.${link.status}`)}</Tag>;
}

/** The link as a QR code (made in the browser), with a PNG download. */
function QrCard({ url, name }) {
  const { t } = useLocale();
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((mod) => (mod.default || mod).toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' }))
      .then((data) => alive && setSrc(data))
      .catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="dv-qr">
      {src === null ? <Spin /> : src ? <img src={src} alt={t('drive.links.qr')} width={200} height={200} /> : <em>—</em>}
      <span>{t('drive.links.qrHint')}</span>
      {src && (
        <Button size="small" icon={<DownloadOutlined />} href={src} download={`${String(name || 'link').replace(/[\\/:*?"<>|]/g, '_')}-qr.png`}>
          {t('drive.links.qrDownload')}
        </Button>
      )}
    </div>
  );
}

export function LinkRow({ link, onChange, onEdit, showItem, showOwner, fresh }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const run = async (action) => {
    try {
      await action();
      onChange?.();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  const active = link.status === 'active';
  const url = linkUrl(link);
  const writes = isWriteLink(link.permissions);
  return (
    <div className={`dv-linkcard is-${link.status}${fresh ? ' is-new' : ''}`} data-testid="drive-link-row">
      {showItem && (
        <div className="dv-link__item">
          <EntryIcon entry={{ dir: link.kind === 'dir', ext: (link.name.split('.').pop() || '').toLowerCase() }} size={26} />
          <div>
            <strong>{link.name}</strong>
            <span>{link.shareTitle}{link.path ? ` / ${link.path}` : ''}</span>
          </div>
        </div>
      )}
      {link.title && <div className="dv-linkcard__title">“{link.title}”</div>}
      <div className="dv-linkcard__url">
        <code title={url}>{url}</code>
        <Tooltip title={t('common.copy')}>
          <Button size="small" type="text" icon={<CopyOutlined />} disabled={!active} aria-label={t('common.copy')} onClick={() => copyText(url).then(() => message.success(t('common.copied')))} />
        </Tooltip>
        <Popover trigger="click" destroyOnHidden content={<QrCard url={url} name={link.title || link.name} />}>
          <Tooltip title={t('drive.links.qr')}>
            <Button size="small" type="text" icon={<QrcodeOutlined />} disabled={!active} aria-label={t('drive.links.qr')} />
          </Tooltip>
        </Popover>
        <Tooltip title={t('drive.links.open')}>
          <Button size="small" type="text" icon={<EyeOutlined />} disabled={!active} href={url} target="_blank" rel="noopener noreferrer" aria-label={t('drive.links.open')} />
        </Tooltip>
      </div>
      <PermissionChips perms={link.permissions} />
      <div className="dv-linkcard__meta">
        <LinkStatus link={link} />
        <Tag bordered={false}>{link.audience === 'employees' ? `🏢 ${t('drive.audience.employees')}` : `🌐 ${t('drive.audience.anyone')}`}</Tag>
        {link.hasPassword && <Tag bordered={false}>🔒 {t('files.withPassword')}</Tag>}
        {link.notify && <Tag bordered={false}>🔔 {t('drive.links.notifyOn')}</Tag>}
        <span>{link.expiresAt ? t('files.until', { date: formatDateTime(link.expiresAt, locale) }) : t('files.noExpiry')}</span>
        <span>· {t('files.viewsN', { n: link.views })}</span>
        {writes && link.uploadedBytes > 0 && (
          <span>· {link.quotaMb ? t('drive.links.usedOf', { used: formatBytes(link.uploadedBytes), total: formatBytes(link.quotaMb * 1048576) }) : t('drive.links.used', { used: formatBytes(link.uploadedBytes) })}</span>
        )}
        {showOwner && link.owner && <span>· {link.owner.name}</span>}
      </div>
      <div className="dv-linkcard__actions">
        {onEdit && link.status !== 'owner_inactive' && (
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(link)}>
            {t('drive.links.edit')}
          </Button>
        )}
        {link.status !== 'owner_inactive' && (
          <Button size="small" type="text" onClick={() => run(() => driveApi.updateLink(link.id, { revoked: link.status !== 'revoked' }))}>
            {link.status === 'revoked' ? t('files.restoreLink') : t('files.revokeLink')}
          </Button>
        )}
        <Popconfirm title={t('files.deleteLinkConfirm')} onConfirm={() => run(() => driveApi.deleteLink(link.id))}>
          <Button size="small" type="text" danger>{t('common.delete')}</Button>
        </Popconfirm>
      </div>
    </div>
  );
}

/** A small picture of the page the recipient will see. */
export function RecipientPreview({ perms, title, note, name, isFolder, extras }) {
  const { t } = useLocale();
  const uploadOnly = perms.includes('upload') && !perms.includes('view');
  const can = permissionSentence(perms, t);
  return (
    <div className="dv-preview" aria-label={t('drive.links.preview')}>
      <div className="dv-preview__bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>/d/…</span>
      </div>
      <div className="dv-preview__body">
        <span className="dv-preview__eyebrow">{t('drive.links.previewFrom')}</span>
        <strong className="dv-preview__title">{title || (uploadOnly ? t('drive.public.requestTitle', { name }) : name)}</strong>
        {note && <p className="dv-preview__note">{note}</p>}
        <span className="dv-preview__can">{t('drive.public.youCan', { what: can })}</span>
        {uploadOnly ? (
          <div className="dv-preview__drop">
            <span aria-hidden="true">⤒</span>
            {t('drive.public.dropFiles')}
            {extras?.extensions && <em>{extras.extensions}</em>}
          </div>
        ) : (
          <>
            <div className="dv-preview__grid" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span key={index} className={index === 0 && isFolder ? 'is-folder' : ''} />
              ))}
            </div>
            {perms.includes('upload') && <div className="dv-preview__drop is-slim">⤒ {t('drive.public.dropFiles')}</div>}
          </>
        )}
        {(extras?.requireName || extras?.requireEmail) && perms.some((key) => key !== 'view' && key !== 'download') && (
          <span className="dv-preview__ask">👤 {t(extras.requireEmail ? 'drive.links.previewAskEmail' : 'drive.links.previewAskName')}</span>
        )}
      </div>
    </div>
  );
}

/** Creates a link or edits one (`initial`). */
export function LinkEditor({ config, isFolder, name, access, initial, onSubmit, onCancel }) {
  const { t } = useLocale();
  const employeesOnly = config.linkAudience === 'employees';
  const allowed = useMemo(() => grantableKeys(access, config), [access, config]);
  const [perms, setPerms] = useState(() => normalizePermissions(initial?.permissions || ['view', 'download'], isFolder));
  const [extras, setExtras] = useState(() => extrasOf(initial));
  const [title, setTitle] = useState(initial?.title || '');
  const [note, setNote] = useState(initial?.note || '');
  const [audience, setAudience] = useState(employeesOnly ? 'employees' : initial?.audience || 'anyone');
  const [password, setPassword] = useState('');
  const [dropPassword, setDropPassword] = useState(false);
  const [expires, setExpires] = useState(initial?.expiresAt || null);
  const [expiresTouched, setExpiresTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const presets = [1, 7, 30].filter((days) => !config.maxLinkDays || days <= config.maxLinkDays);
  const writes = isWriteLink(perms);
  const keepsPassword = Boolean(initial?.hasPassword) && !dropPassword;
  const needsPassword = config.requireLinkPassword || (writes && config.requireWritePassword);
  const passwordMissing = needsPassword && !password && !keepsPassword;
  const setExpiry = (value) => {
    setExpires(value);
    setExpiresTouched(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        permissions: perms,
        audience,
        title,
        note,
        maxFileMb: extras.maxSize || null,
        allowedExts: extras.extensions || '',
        quotaMb: extras.quota || null,
        requireName: Boolean(extras.requireName),
        requireEmail: Boolean(extras.requireName && extras.requireEmail),
        notify: Boolean(extras.notify),
      };
      if (password) payload.password = password;
      else if (initial && dropPassword) payload.password = '';
      if (!initial || expiresTouched) payload.expiresAt = expires || null;
      await onSubmit(payload);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dv-editor" data-testid="drive-link-editor">
      <section className="dv-editor__section">
        <h3>{t('linkPerms.title')}</h3>
        <LinkPermissionsPicker
          value={perms}
          onChange={setPerms}
          allowed={allowed}
          isFolder={isFolder}
          extras={extras}
          onExtrasChange={setExtras}
          maxUploadMb={config.maxUploadMb}
          noTrash
        />
        {config.linkWrite === false && <p className="dv-editor__hint">🔒 {t('drive.links.writeOff')}</p>}
        {config.linkWrite !== false && access?.known && !access.write && <p className="dv-editor__hint">🔒 {t('drive.links.readOnlyHere')}</p>}
        {perms.includes('delete') && <Alert type="warning" showIcon className="dv-editor__alert" message={t('drive.links.deleteWarnTitle')} description={t('drive.links.deleteWarn')} />}
        {writes && <p className="dv-editor__hint">🛡 {t('drive.links.writeAs')}</p>}
      </section>

      {isFolder && (
        <section className="dv-editor__section">
          <h3>{t('drive.links.forRecipient')}</h3>
          <div className="dv-editor__grid">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={perms.includes('view') ? t('drive.links.titlePh') : t('drive.links.titlePhRequest')} aria-label={t('drive.links.titleLabel')} />
            <Input.TextArea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} autoSize={{ minRows: 1, maxRows: 4 }} placeholder={t('drive.links.notePh')} aria-label={t('drive.links.noteLabel')} />
          </div>
        </section>
      )}

      <section className="dv-editor__section dv-linkform">
        <h3>{t('drive.links.access')}</h3>
        <div className="fs-linkform__row">
          <span>{t('drive.audience.title')} <Hint id="drive.linkAudience" /></span>
          <Segmented
            block
            value={audience}
            onChange={setAudience}
            options={[
              { value: 'anyone', label: `🌐 ${t('drive.audience.anyone')}`, disabled: employeesOnly },
              { value: 'employees', label: `🏢 ${t('drive.audience.employees')}` },
            ]}
          />
        </div>
        <p className="dv-linkform__hint">{t(`drive.audience.${audience}Hint`)}</p>
        <div className="fs-linkform__row">
          <span>{t('files.linkPassword')}</span>
          <div className="dv-editor__password">
            <Input.Password
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={keepsPassword ? t('drive.links.passwordKeep') : needsPassword ? t('files.passwordRequired') : t('files.passwordOptional')}
              autoComplete="new-password"
              status={passwordMissing ? 'warning' : undefined}
            />
            {initial?.hasPassword && !needsPassword && (
              <Button size="small" type="link" onClick={() => setDropPassword(!dropPassword)}>
                {dropPassword ? t('drive.links.passwordUndo') : t('drive.links.passwordRemove')}
              </Button>
            )}
          </div>
        </div>
        {writes && config.requireWritePassword && <p className="dv-linkform__hint">{t('drive.links.writePassword')}</p>}
        {initial?.hasPassword && password && <p className="dv-linkform__hint">{t('drive.links.passwordChanged')}</p>}
        <div className="fs-linkform__row">
          <span>{t('files.linkExpires')} <Hint id="drive.linkExpires" /></span>
          <div className="fs-linkform__expiry">
            <DateTimeField
              value={expires}
              onChange={setExpiry}
              placeholder={config.maxLinkDays ? t('files.maxDays', { n: config.maxLinkDays }) : t('files.noExpiry')}
              disabledDate={expiryDisabled(config.maxLinkDays)}
            />
            {presets.map((days) => (
              <Button key={days} size="small" onClick={() => setExpiry(nowInZone().add(days, 'day').second(0).millisecond(0).toISOString())}>{t('files.days', { n: days })}</Button>
            ))}
          </div>
        </div>
      </section>

      <section className="dv-editor__section">
        <h3>{t('drive.links.preview')}</h3>
        <RecipientPreview perms={perms} title={title} note={note} name={name} isFolder={isFolder} extras={extras} />
      </section>

      <div className="dv-editor__foot">
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button type="primary" size="large" loading={busy} disabled={passwordMissing} onClick={submit} data-testid="drive-link-submit">
          {initial ? t('drive.links.save') : <><PlusOutlined /> {t('files.createLink')}</>}
        </Button>
      </div>
    </div>
  );
}

/** Rights of the person on the item's folder (for the permissions they may grant). */
function useItemAccess(open, shareId, entry) {
  const [access, setAccess] = useState(null);
  useEffect(() => {
    if (!open || !entry || shareId == null) return undefined;
    let alive = true;
    setAccess(null);
    const folder = entry.dir ? entry.path : entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    driveApi
      .stat(shareId, folder)
      .then((res) => alive && setAccess(res.data.access || { known: false }))
      .catch(() => alive && setAccess({ known: false }));
    return () => {
      alive = false;
    };
  }, [open, shareId, entry?.path, entry?.dir]);
  return access;
}

/** Edits one link outside the dialog (My links). */
export function LinkEditModal({ link, config, onClose, onSaved }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const entry = link ? { path: link.path, dir: link.kind === 'dir', name: link.name } : null;
  const access = useItemAccess(Boolean(link), link?.shareId, entry);
  return (
    <Modal open={Boolean(link)} onCancel={onClose} footer={null} width={720} destroyOnHidden title={link ? t('drive.links.editTitle', { name: link.name }) : ''} className="dv-linkdialog">
      {link && (!access ? <Skeleton active paragraph={{ rows: 6 }} /> : (
        <LinkEditor
          config={config || {}}
          isFolder={link.kind === 'dir'}
          name={link.name}
          access={access}
          initial={link}
          onCancel={onClose}
          onSubmit={async (payload) => {
            try {
              await driveApi.updateLink(link.id, payload);
              message.success(t('drive.links.saved'));
              onSaved?.();
              onClose();
            } catch (err) {
              message.error(driveError(err, t));
            }
          }}
        />
      ))}
    </Modal>
  );
}

/** Public links for one file or folder of the drive. */
export default function LinkDialog({ open, shareId, entry, config, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [links, setLinks] = useState(null);
  const [editing, setEditing] = useState(null);
  const [fresh, setFresh] = useState(null);
  const access = useItemAccess(open, shareId, entry);
  const load = () =>
    driveApi
      .links({ shareId, path: entry.path })
      .then((res) => {
        setLinks(res.data.links);
        return res.data.links;
      })
      .catch((err) => message.error(errorMessage(err)));
  useEffect(() => {
    if (open && entry) {
      setLinks(null);
      setFresh(null);
      load().then((list) => setEditing(list && !list.length ? 'new' : null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shareId, entry?.path]);
  if (!entry) return null;
  const isFolder = Boolean(entry.dir);
  const editor = (initial) => (
    <LinkEditor
      key={initial?.id || 'new'}
      config={config}
      isFolder={isFolder}
      name={entry.name}
      access={access}
      initial={initial}
      onCancel={links?.length ? () => setEditing(null) : null}
      onSubmit={async (payload) => {
        try {
          if (initial) {
            await driveApi.updateLink(initial.id, payload);
            message.success(t('drive.links.saved'));
            setFresh(initial.id);
          } else {
            const { data } = await driveApi.createLink(shareId, { ...payload, path: entry.path });
            await copyText(linkUrl(data.link));
            message.success(t('drive.linkCreated'));
            setFresh(data.link.id);
          }
          setEditing(null);
          await load();
        } catch (err) {
          message.error(driveError(err, t));
        }
      }}
    />
  );
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={720} destroyOnHidden title={null} className="dv-linkdialog">
      <div className="dv-linkdialog__head">
        <EntryIcon entry={entry} size={44} />
        <div>
          <span className="share-hero__eyebrow">{t('drive.shareLink')}</span>
          <h2>{entry.name}</h2>
        </div>
      </div>
      <div className="dv-linkdialog__trust">
        <span aria-hidden="true">🛡</span>
        <p>{t('drive.linkTrust')}</p>
      </div>
      {!config.publicLinks ? (
        <div className="fs-share__empty">{t('files.linksDisabled')}</div>
      ) : !links || !access ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <div className="dv-linklist">
          {links.map((link) =>
            editing === link.id ? (
              <div key={link.id} className="dv-linkcard is-editing">
                <div className="dv-linkcard__edithead">{t('drive.links.editing')}</div>
                {editor(link)}
              </div>
            ) : (
              <LinkRow key={link.id} link={link} onChange={load} onEdit={(item) => setEditing(item.id)} fresh={fresh === link.id} />
            )
          )}
          {editing === 'new' ? (
            <div className="dv-linkcard is-editing">
              {links.length > 0 && <div className="dv-linkcard__edithead">{t('drive.links.newLink')}</div>}
              {editor(null)}
            </div>
          ) : (
            <Button block size="large" type="dashed" icon={<PlusOutlined />} onClick={() => setEditing('new')} data-testid="drive-link-new">
              {t('drive.links.newLink')}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
