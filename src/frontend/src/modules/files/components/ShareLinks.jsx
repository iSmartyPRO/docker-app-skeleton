import { useCallback, useEffect, useState } from 'react';
import { App, Button, Input, Skeleton } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, HistoryOutlined, LinkOutlined, PlusOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { LinkPermissionsPicker, isWriteLink } from '../../../components/ui/LinkPermissions';
import LinkSimpleForm, { LinkCreated, copyToClipboard } from '../../../components/ui/LinkSimpleForm';
import LinkListRow from '../../../components/ui/LinkListRow';
import { Hint } from '../../../help/Hint';
import { filesApi, formatBytes } from '../api';

/*
 * The "Public links" tab of the share dialog: a compact list of links and
 * the shared simple/advanced form (components/ui/LinkSimpleForm.jsx) to
 * create or change one. The server decides what may be granted
 * (`grantable`) and enforces it again on every visitor request.
 */

const PATH = '/l/';
const linkUrl = (link) => `${window.location.origin}${PATH}${link.slug || link.token}`;

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

/** What an advanced setting changes, in a few words (shown while "Advanced" is collapsed). */
function summaryOf({ perms, extras, title }, t) {
  const list = [];
  if (title.trim()) list.push(t('linkShare.sum.title', { v: title.trim() }));
  if (isWriteLink(perms)) {
    if (extras.maxSize) list.push(t('linkShare.sum.maxSize', { n: extras.maxSize }));
    if (extras.extensions) list.push(t('linkShare.sum.types', { v: extras.extensions }));
    if (extras.quota) list.push(t('linkShare.sum.quota', { n: extras.quota }));
    if (extras.requireName) list.push(t(extras.requireEmail ? 'linkShare.sum.askEmail' : 'linkShare.sum.askName'));
    if (extras.notify) list.push(t('linkShare.sum.notify'));
  }
  return list;
}

/** Create or change a link. */
function LinkEditor({ node, config, grantable, isFolder, link, onSubmit, onCancel }) {
  const { t } = useLocale();
  const [title, setTitle] = useState(link?.title || '');
  const [perms, setPerms] = useState(link?.permissions || ['view', 'download']);
  const [extras, setExtras] = useState(() => extrasOf(link, isFolder));
  const checkSlug = useCallback((slug) => filesApi.checkSlug(slug, link?.id).then((res) => res.data), [link?.id]);
  const writes = isWriteLink(perms);
  // Only what the person actually customised counts (a new link's "notify" default does not).
  const summary = summaryOf({ perms, extras, title }, t);

  const advanced = (
    <>
      <div className="sl-adv__section">
        <span className="sl-adv__label">
          {t('linkPerms.title')} <Hint id="files.linkPermissions" />
        </span>
        <LinkPermissionsPicker value={perms} onChange={setPerms} allowed={grantable} isFolder={isFolder} extras={extras} onExtrasChange={setExtras} maxUploadMb={config.maxUploadMb} />
        {!config.writeLinks && isFolder && <p className="sl-adv__note">🔒 {t('files.links.writeOff')}</p>}
      </div>
      <div className="sl-adv__section">
        <label className="sl-adv__label" htmlFor="fs-link-title">{t('files.links.title')}</label>
        <Input id="fs-link-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={node.name} allowClear />
      </div>
    </>
  );

  return (
    <LinkSimpleForm
      key={link?.id || 'new'}
      isFolder={isFolder}
      name={node.name}
      initial={link || null}
      perms={perms}
      onPermsChange={setPerms}
      allowed={grantable}
      config={{ maxLinkDays: config.maxLinkDays, requireLinkPassword: config.requireLinkPassword }}
      writePasswordRequired={writes && Boolean(config.requireWriteLinkPassword)}
      host={window.location.host}
      path={PATH}
      checkSlug={checkSlug}
      advanced={advanced}
      advancedHint={t('linkShare.advancedHint')}
      advancedSummary={summary}
      onCancel={onCancel}
      onSubmit={(basics, extra) =>
        onSubmit(
          {
            ...basics,
            title,
            maxFileMb: extras.maxSize || null,
            quotaMb: extras.quota || null,
            requireName: extras.requireName,
            requireEmail: extras.requireName && extras.requireEmail,
            notify: extras.notify,
            ...(isFolder ? { extensions: extras.extensions || '' } : {}),
          },
          extra
        )
      }
    />
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

function LinkRow({ link, onEdit, onRun, fresh }) {
  const { t } = useLocale();
  const { modal } = App.useApp();
  const [activity, setActivity] = useState(false);
  const state = link.revoked ? 'revoked' : link.expired ? 'expired' : 'active';
  const url = linkUrl(link);
  const facts = (
    <>
      {link.uploads > 0 && <span className="sl-fact">⬆ {t('files.links.uploadsN', { n: link.uploads, size: formatBytes(link.uploadedBytes) })}</span>}
      {link.quotaMb && <span className="sl-fact">{t('files.links.quotaOf', { used: formatBytes(link.uploadedBytes || 0), total: formatBytes(link.quotaMb * 1048576) })}</span>}
      {!link.mine && link.createdBy && <span className="sl-fact">{t('files.links.by', { name: link.createdBy.name })}</span>}
    </>
  );
  const menuItems = [
    { key: 'activity', icon: <HistoryOutlined />, label: t('files.links.activity') },
    link.revoked ? { key: 'restore', icon: <UndoOutlined />, label: t('files.restoreLink') } : { key: 'revoke', icon: <StopOutlined />, label: t('files.revokeLink') },
    { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('common.delete') },
  ];
  const onMenu = (key) => {
    if (key === 'activity') setActivity((on) => !on);
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
  };
  return (
    <LinkListRow
      url={url}
      previewUrl={`${url}?preview=1`}
      host={window.location.host}
      path={PATH}
      address={link.slug || link.token}
      custom={Boolean(link.slug)}
      title={link.title}
      active={state === 'active'}
      stateLabel={state === 'active' ? null : t(`files.linkState.${state}`)}
      stateTone={state === 'expired' ? 'warn' : 'muted'}
      perms={link.permissions}
      hasPassword={link.hasPassword}
      expiresAt={link.expiresAt}
      views={link.views}
      facts={facts}
      menuItems={menuItems}
      onMenu={onMenu}
      onEdit={onEdit}
      fresh={fresh}
    >
      {activity && (
        <div className="fs-link__activity">
          <div className="fs-link__activityhead">{t('files.links.activity')}</div>
          <LinkActivity linkId={link.id} />
        </div>
      )}
    </LinkListRow>
  );
}

/** The "Public links" tab of the share dialog. */
export default function ShareLinks({ node, config, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  // view: { mode: 'list' } | { mode: 'new' } | { mode: 'edit', link } | { mode: 'done', link, copied, password }
  const [view, setView] = useState({ mode: 'list' });
  const [fresh, setFresh] = useState(null);
  const load = () =>
    filesApi
      .links(node.id)
      .then((res) => {
        setData(res.data);
        return res.data;
      })
      .catch((err) => message.error(errorMessage(err)));
  useEffect(() => {
    load().then((loaded) => loaded && !loaded.links.length && setView({ mode: 'new' }));
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

  const back = data.links.length ? () => setView({ mode: 'list' }) : null;

  if (view.mode === 'done') {
    const url = linkUrl(view.link);
    return (
      <LinkCreated
        url={url}
        host={window.location.host}
        path={PATH}
        address={view.link.slug || view.link.token}
        password={view.password}
        previewUrl={`${url}?preview=1`}
        copied={view.copied}
        name={node.name}
        onDone={() => setView({ mode: 'list' })}
        onAnother={() => setView({ mode: 'new' })}
      />
    );
  }

  if (view.mode === 'new' || view.mode === 'edit') {
    const editing = view.mode === 'edit' ? view.link : null;
    return (
      <div className="sl-form">
        {back && (
          <Button type="link" className="sl-back" icon={<ArrowLeftOutlined />} onClick={back}>
            {t('linkShare.back')}
          </Button>
        )}
        <LinkEditor
          key={editing?.id || 'new'}
          node={node}
          config={config}
          grantable={data.grantable}
          isFolder={isFolder}
          link={editing}
          onCancel={back}
          onSubmit={async (payload, extra) => {
            if (editing) {
              if (await run(() => filesApi.updateLink(editing.id, payload))) {
                message.success(t('files.links.saved'));
                setFresh(editing.id);
                setView({ mode: 'list' });
              }
              return;
            }
            let created = null;
            const ok = await run(async () => {
              created = (await filesApi.createLink(node.id, payload)).data.link;
            });
            if (ok) {
              const copied = await copyToClipboard(linkUrl(created));
              setFresh(created.id);
              setView({ mode: 'done', link: created, copied, password: payload.password || extra?.password || '' });
            }
          }}
        />
      </div>
    );
  }

  if (!data.links.length) {
    return (
      <div className="sl-empty">
        <span className="sl-empty__icon"><LinkOutlined /></span>
        <h3>{t('linkShare.emptyTitle')}</h3>
        <p>{t('linkShare.emptyText', { name: node.name })}</p>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setView({ mode: 'new' })}>
          {t('linkShare.emptyCta')}
        </Button>
      </div>
    );
  }

  return (
    <div className="sl-list" data-testid="link-list">
      <div className="sl-list__head">
        <span className="sl-list__count">{t('linkShare.linksCount', { n: data.links.length })}</span>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setView({ mode: 'new' })} data-testid="link-new">
          {t('linkShare.newLink')}
        </Button>
      </div>
      {data.links.map((link) => (
        <LinkRow key={link.id} link={link} fresh={fresh === link.id} onRun={run} onEdit={() => setView({ mode: 'edit', link })} />
      ))}
    </div>
  );
}
