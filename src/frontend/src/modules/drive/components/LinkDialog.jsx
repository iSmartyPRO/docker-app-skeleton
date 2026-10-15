import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Input, Modal, Segmented, Skeleton, Tag } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, LinkOutlined, PlusOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { LinkPermissionsPicker, isWriteLink, normalizePermissions, permissionSentence } from '../../../components/ui/LinkPermissions';
import LinkSimpleForm, { LinkCreated, copyToClipboard } from '../../../components/ui/LinkSimpleForm';
import LinkListRow from '../../../components/ui/LinkListRow';
import { driveApi, driveError, formatBytes } from '../api';
import { EntryIcon } from './EntryList';
import { Hint } from '../../../help/Hint';

/*
 * Public links of one file or folder: a compact list (address, permissions,
 * expiry, password, views; copy, edit, ⋯ for QR, open, turn off, delete) and
 * the shared simple/advanced form (components/ui/LinkSimpleForm.jsx). The
 * advanced part holds what the recipient may do in detail, upload rules,
 * title and message, who may open it and a preview of the recipient's page.
 */

const PATH = '/d/';
export const linkUrl = (link) => `${window.location.origin}${PATH}${link.slug || link.token}`;

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

const STATE_TONE = { expired: 'warn', owner_inactive: 'bad', revoked: 'muted' };

export function LinkRow({ link, onChange, onEdit, showItem, showOwner, fresh }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const run = async (action) => {
    try {
      await action();
      onChange?.();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  const active = link.status === 'active';
  const writes = isWriteLink(link.permissions);
  const facts = (
    <>
      {link.audience === 'employees' && <span className="sl-fact">🏢 {t('drive.audience.employees')}</span>}
      {link.notify && <span className="sl-fact">🔔 {t('drive.links.notifyOn')}</span>}
      {writes && link.uploadedBytes > 0 && (
        <span className="sl-fact">
          {link.quotaMb ? t('drive.links.usedOf', { used: formatBytes(link.uploadedBytes), total: formatBytes(link.quotaMb * 1048576) }) : t('drive.links.used', { used: formatBytes(link.uploadedBytes) })}
        </span>
      )}
      {showOwner && link.owner && <span className="sl-fact">👤 {link.owner.name}</span>}
    </>
  );
  const menuItems = [
    ...(link.status !== 'owner_inactive'
      ? [link.status === 'revoked' ? { key: 'restore', icon: <UndoOutlined />, label: t('files.restoreLink') } : { key: 'revoke', icon: <StopOutlined />, label: t('files.revokeLink') }]
      : []),
    { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('common.delete') },
  ];
  const onMenu = (key) => {
    if (key === 'revoke' || key === 'restore') run(() => driveApi.updateLink(link.id, { revoked: key === 'revoke' }));
    else if (key === 'delete') {
      modal.confirm({
        title: t('files.deleteLinkConfirm'),
        okButtonProps: { danger: true },
        okText: t('common.delete'),
        onOk: () => run(() => driveApi.deleteLink(link.id)),
      });
    }
  };
  const url = linkUrl(link);
  return (
    <LinkListRow
      testId="drive-link-row"
      url={url}
      previewUrl={`${url}?preview=1`}
      host={window.location.host}
      path={PATH}
      address={link.slug || link.token}
      custom={Boolean(link.slug)}
      title={link.title ? `“${link.title}”` : null}
      name={link.title || link.name}
      active={active}
      stateLabel={active ? null : t(`drive.linkStatus.${link.status}`)}
      stateTone={STATE_TONE[link.status] || 'muted'}
      perms={link.permissions}
      hasPassword={link.hasPassword}
      expiresAt={link.expiresAt}
      views={link.views}
      facts={facts}
      menuItems={menuItems}
      onMenu={onMenu}
      onEdit={onEdit && link.status !== 'owner_inactive' ? () => onEdit(link) : undefined}
      fresh={fresh}
      leading={
        showItem ? (
          <div className="sl-lrow__item">
            <EntryIcon entry={{ dir: link.kind === 'dir', ext: (link.name.split('.').pop() || '').toLowerCase() }} size={26} />
            <div>
              <strong>{link.name}</strong>
              <span>{link.shareTitle}{link.path ? ` / ${link.path}` : ''}</span>
            </div>
          </div>
        ) : null
      }
    />
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

/** What an advanced setting changes, in a few words (shown while "Advanced" is collapsed). */
function summaryOf({ perms, extras, title, note, audience, employeesOnly }, t) {
  const list = [];
  if (title.trim()) list.push(t('linkShare.sum.title', { v: title.trim() }));
  if (note.trim()) list.push(t('linkShare.sum.note'));
  if (audience === 'employees' && !employeesOnly) list.push(t('linkShare.sum.employees'));
  if (isWriteLink(perms)) {
    if (extras.maxSize) list.push(t('linkShare.sum.maxSize', { n: extras.maxSize }));
    if (extras.extensions) list.push(t('linkShare.sum.types', { v: extras.extensions }));
    if (extras.quota) list.push(t('linkShare.sum.quota', { n: extras.quota }));
    if (extras.requireName) list.push(t(extras.requireEmail ? 'linkShare.sum.askEmail' : 'linkShare.sum.askName'));
    if (extras.notify) list.push(t('linkShare.sum.notify'));
  }
  return list;
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
  const checkSlug = useCallback((slug) => driveApi.checkSlug(slug, initial?.id).then((res) => res.data), [initial?.id]);
  const writes = isWriteLink(perms);

  const advanced = (
    <>
      <div className="sl-adv__section">
        <span className="sl-adv__label">{t('linkPerms.title')}</span>
        <LinkPermissionsPicker value={perms} onChange={setPerms} allowed={allowed} isFolder={isFolder} extras={extras} onExtrasChange={setExtras} maxUploadMb={config.maxUploadMb} noTrash />
        {config.linkWrite === false && <p className="dv-editor__hint">🔒 {t('drive.links.writeOff')}</p>}
        {config.linkWrite !== false && access?.known && !access.write && <p className="dv-editor__hint">🔒 {t('drive.links.readOnlyHere')}</p>}
        {perms.includes('delete') && <Alert type="warning" showIcon className="dv-editor__alert" message={t('drive.links.deleteWarnTitle')} description={t('drive.links.deleteWarn')} />}
        {writes && <p className="dv-editor__hint">🛡 {t('drive.links.writeAs')}</p>}
      </div>
      {isFolder && (
        <div className="sl-adv__section">
          <span className="sl-adv__label">{t('drive.links.forRecipient')}</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={perms.includes('view') ? t('drive.links.titlePh') : t('drive.links.titlePhRequest')} aria-label={t('drive.links.titleLabel')} />
          <Input.TextArea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} autoSize={{ minRows: 1, maxRows: 4 }} placeholder={t('drive.links.notePh')} aria-label={t('drive.links.noteLabel')} />
        </div>
      )}
      <div className="sl-adv__section">
        <span className="sl-adv__label">
          {t('drive.audience.title')} <Hint id="drive.linkAudience" />
        </span>
        <Segmented
          block
          value={audience}
          onChange={setAudience}
          options={[
            { value: 'anyone', label: `🌐 ${t('drive.audience.anyone')}`, disabled: employeesOnly },
            { value: 'employees', label: `🏢 ${t('drive.audience.employees')}` },
          ]}
        />
        <p className="sl-adv__note">{t(`drive.audience.${audience}Hint`)}</p>
      </div>
      <div className="sl-adv__section">
        <span className="sl-adv__label">{t('drive.links.preview')}</span>
        <RecipientPreview perms={perms} title={title} note={note} name={name} isFolder={isFolder} extras={extras} />
      </div>
    </>
  );

  return (
    <div data-testid="drive-link-editor">
      <LinkSimpleForm
        isFolder={isFolder}
        name={name}
        initial={initial || null}
        perms={perms}
        onPermsChange={setPerms}
        allowed={allowed}
        config={{ maxLinkDays: config.maxLinkDays, requireLinkPassword: config.requireLinkPassword }}
        writePasswordRequired={writes && Boolean(config.requireWritePassword)}
        host={window.location.host}
        path={PATH}
        checkSlug={checkSlug}
        advanced={advanced}
        advancedHint={t('linkShare.advancedHintDrive')}
        advancedSummary={summaryOf({ perms, extras, title, note, audience, employeesOnly }, t)}
        notes={audience === 'employees' ? <div className="sl-row__note">🏢 {t('linkShare.employeesOnlyNote')}</div> : null}
        onCancel={onCancel}
        onSubmit={(basics, extra) =>
          onSubmit(
            {
              ...basics,
              audience,
              title,
              note,
              maxFileMb: extras.maxSize || null,
              allowedExts: extras.extensions || '',
              quotaMb: extras.quota || null,
              requireName: Boolean(extras.requireName),
              requireEmail: Boolean(extras.requireName && extras.requireEmail),
              notify: Boolean(extras.notify),
            },
            extra
          )
        }
      />
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
    <Modal open={Boolean(link)} onCancel={onClose} footer={null} width={680} destroyOnHidden title={link ? t('drive.links.editTitle', { name: link.name }) : ''} className="dv-linkdialog sl-modal">
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
  // view: { mode: 'list' } | { mode: 'new' } | { mode: 'edit', link } | { mode: 'done', link, copied, password }
  const [view, setView] = useState({ mode: 'list' });
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
      load().then((list) => setView({ mode: list && !list.length ? 'new' : 'list' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shareId, entry?.path]);
  if (!entry) return null;
  const isFolder = Boolean(entry.dir);
  const back = links?.length ? () => setView({ mode: 'list' }) : null;

  const submit = async (payload, extra, initial) => {
    try {
      if (initial) {
        await driveApi.updateLink(initial.id, payload);
        message.success(t('drive.links.saved'));
        setFresh(initial.id);
        setView({ mode: 'list' });
      } else {
        const { data } = await driveApi.createLink(shareId, { ...payload, path: entry.path });
        const copied = await copyToClipboard(linkUrl(data.link));
        setFresh(data.link.id);
        setView({ mode: 'done', link: data.link, copied, password: payload.password || extra?.password || '' });
      }
      await load();
    } catch (err) {
      message.error(driveError(err, t));
    }
  };

  let body;
  if (!config.publicLinks) body = <div className="fs-share__empty">{t('files.linksDisabled')}</div>;
  else if (!links || !access) body = <Skeleton active paragraph={{ rows: 3 }} />;
  else if (view.mode === 'done') {
    const url = linkUrl(view.link);
    body = (
      <LinkCreated
        url={url}
        previewUrl={`${url}?preview=1`}
        host={window.location.host}
        path={PATH}
        address={view.link.slug || view.link.token}
        password={view.password}
        copied={view.copied}
        name={entry.name}
        onDone={() => setView({ mode: 'list' })}
        onAnother={() => setView({ mode: 'new' })}
      />
    );
  } else if (view.mode === 'new' || view.mode === 'edit') {
    const editing = view.mode === 'edit' ? view.link : null;
    body = (
      <div className="sl-form">
        {back && (
          <Button type="link" className="sl-back" icon={<ArrowLeftOutlined />} onClick={back}>
            {t('linkShare.back')}
          </Button>
        )}
        <LinkEditor
          key={editing?.id || 'new'}
          config={config}
          isFolder={isFolder}
          name={entry.name}
          access={access}
          initial={editing}
          onCancel={back}
          onSubmit={(payload, extra) => submit(payload, extra, editing)}
        />
      </div>
    );
  } else if (!links.length) {
    body = (
      <div className="sl-empty">
        <span className="sl-empty__icon"><LinkOutlined /></span>
        <h3>{t('linkShare.emptyTitle')}</h3>
        <p>{t('linkShare.emptyText', { name: entry.name })}</p>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setView({ mode: 'new' })}>
          {t('linkShare.emptyCta')}
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="sl-list">
        <div className="sl-list__head">
          <span className="sl-list__count">{t('linkShare.linksCount', { n: links.length })}</span>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setView({ mode: 'new' })} data-testid="drive-link-new">
            {t('linkShare.newLink')}
          </Button>
        </div>
        {links.map((link) => (
          <LinkRow key={link.id} link={link} onChange={load} onEdit={(item) => setView({ mode: 'edit', link: item })} fresh={fresh === link.id} />
        ))}
      </div>
    );
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={680} destroyOnHidden title={null} className="dv-linkdialog sl-modal">
      <div className="dv-linkdialog__head">
        <EntryIcon entry={entry} size={40} />
        <div>
          <span className="share-hero__eyebrow">{t('drive.shareLink')}</span>
          <h2>{entry.name}</h2>
        </div>
      </div>
      {view.mode !== 'done' && (
        <div className="dv-linkdialog__trust">
          <span aria-hidden="true">🛡</span>
          <p>{t('drive.linkTrust')}</p>
        </div>
      )}
      {body}
    </Modal>
  );
}
