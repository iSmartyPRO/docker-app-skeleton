import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { App, Button, DatePicker, Input, Modal, Popconfirm, Select, Skeleton, Switch, Tabs, Tag, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { Person, UserAvatar } from '../../shared/People';
import { filesApi } from '../api';

function People({ node, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState(null);
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState();

  useEffect(() => {
    Promise.all([filesApi.shares(node.id), filesApi.subjects()])
      .then(([shares, list]) => {
        setData(shares.data);
        setEntries(shares.data.entries);
        setSubjects(list.data);
      })
      .catch((err) => message.error(errorMessage(err)));
  }, [node.id, message]);

  const options = useMemo(() => {
    if (!subjects) return [];
    const taken = new Set(entries.map((entry) => `${entry.subjectType}:${entry.subjectId}`));
    return [
      {
        label: t('nav.users'),
        options: subjects.users
          .filter((user) => user.id !== node.ownerId)
          .map((user) => ({ value: `user:${user.id}`, label: <Person user={user} size={20} />, search: `${user.name} ${user.username}`.toLowerCase(), disabled: taken.has(`user:${user.id}`) })),
      },
      {
        label: t('nav.groups'),
        options: subjects.groups.map((group) => ({ value: `group:${group.id}`, label: `👥 ${group.name}`, search: group.name.toLowerCase(), disabled: taken.has(`group:${group.id}`) })),
      },
    ];
  }, [subjects, entries, node.ownerId, t]);

  if (!data || !subjects) return <Skeleton active paragraph={{ rows: 4 }} />;
  const editable = data.canManage;

  const add = (value) => {
    const [subjectType, rawId] = value.split(':');
    const id = Number(rawId);
    const pool = subjectType === 'user' ? subjects.users : subjects.groups;
    const found = pool.find((item) => item.id === id);
    setEntries((list) => [...list, { subjectType, subjectId: id, level: 'view', label: found?.name, avatarUrl: found?.avatarUrl }]);
    setAdding(undefined);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await filesApi.saveShares(node.id, entries);
      setEntries(res.data.entries);
      message.success(t('files.shareSaved'));
      onChanged?.();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const dirty = JSON.stringify(entries.map((entry) => [entry.subjectType, entry.subjectId, entry.level])) !== JSON.stringify(data.entries.map((entry) => [entry.subjectType, entry.subjectId, entry.level]));

  return (
    <div className="fs-share">
      {editable && (
        <Select
          showSearch
          value={adding}
          onChange={add}
          options={options}
          placeholder={t('files.addPeople')}
          filterOption={(input, option) => String(option.search || '').includes(input.toLowerCase())}
          style={{ width: '100%' }}
          size="large"
        />
      )}
      <div className="fs-share__list">
        <div className="fs-share__row is-owner">
          <span className="fs-share__who">{node.owner ? <Person user={node.owner} size={28} /> : t('files.you')}</span>
          <Tag bordered={false}>{t('files.ownerRole')}</Tag>
        </div>
        {entries.map((entry, index) => (
          <div key={`${entry.subjectType}:${entry.subjectId}`} className="fs-share__row">
            <span className="fs-share__who">
              {entry.subjectType === 'group' ? (
                <span className="fs-share__group">👥</span>
              ) : (
                <UserAvatar user={{ name: entry.label, avatarUrl: entry.avatarUrl }} size={28} tip={false} />
              )}
              <span>{entry.label || '—'}</span>
            </span>
            <Select
              size="small"
              value={entry.level}
              disabled={!editable}
              style={{ width: 160 }}
              onChange={(level) => setEntries((list) => list.map((row, position) => (position === index ? { ...row, level } : row)))}
              options={[
                { value: 'view', label: t('files.level.view') },
                { value: 'edit', label: t('files.level.edit') },
              ]}
            />
            {editable && (
              <Button type="text" danger size="small" onClick={() => setEntries((list) => list.filter((_, position) => position !== index))}>✕</Button>
            )}
          </div>
        ))}
        {!entries.length && <div className="fs-share__empty">{t('files.notShared')}</div>}
      </div>
      <ul className="acl__legend">
        <li><strong>{t('files.level.view')}</strong> — {t('files.level.viewDesc')}</li>
        <li><strong>{t('files.level.edit')}</strong> — {t('files.level.editDesc')}</li>
      </ul>
      {editable && (
        <div className="fs-share__actions">
          <Button type="primary" disabled={!dirty} loading={saving} onClick={save}>{t('common.save')}</Button>
        </div>
      )}
    </div>
  );
}

function LinkForm({ config, onCreate }) {
  const { t } = useLocale();
  const [password, setPassword] = useState('');
  const [expires, setExpires] = useState(null);
  const [download, setDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const presets = [1, 7, 30].filter((days) => !config.maxLinkDays || days <= config.maxLinkDays);
  return (
    <div className="fs-linkform">
      <div className="fs-linkform__row">
        <span>{t('files.linkPassword')}</span>
        <Input.Password value={password} onChange={(event) => setPassword(event.target.value)} placeholder={config.requireLinkPassword ? t('files.passwordRequired') : t('files.passwordOptional')} autoComplete="new-password" />
      </div>
      <div className="fs-linkform__row">
        <span>{t('files.linkExpires')}</span>
        <div className="fs-linkform__expiry">
          <DatePicker
            value={expires}
            onChange={setExpires}
            showTime={{ format: 'HH:mm' }}
            format="DD.MM.YYYY HH:mm"
            placeholder={config.maxLinkDays ? t('files.maxDays', { n: config.maxLinkDays }) : t('files.noExpiry')}
            disabledDate={(day) => day.isBefore(dayjs(), 'day') || (config.maxLinkDays && day.isAfter(dayjs().add(config.maxLinkDays, 'day')))}
          />
          {presets.map((days) => (
            <Button key={days} size="small" onClick={() => setExpires(dayjs().add(days, 'day'))}>{t('files.days', { n: days })}</Button>
          ))}
        </div>
      </div>
      <div className="fs-linkform__row">
        <span>{t('files.allowDownload')}</span>
        <Switch checked={download} onChange={setDownload} />
      </div>
      <Button
        type="primary"
        block
        loading={busy}
        disabled={config.requireLinkPassword && !password}
        onClick={async () => {
          setBusy(true);
          try {
            await onCreate({ password: password || undefined, expiresAt: expires ? expires.toISOString() : null, allowDownload: download });
            setPassword('');
            setExpires(null);
          } finally {
            setBusy(false);
          }
        }}
      >
        + {t('files.createLink')}
      </Button>
    </div>
  );
}

function Links({ node, config, onChanged }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [links, setLinks] = useState(null);
  const load = () => filesApi.links(node.id).then((res) => setLinks(res.data.links)).catch((err) => message.error(errorMessage(err)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  if (!config.publicLinks) return <div className="fs-share__empty">{t('files.linksDisabled')}</div>;
  if (!links) return <Skeleton active paragraph={{ rows: 3 }} />;
  const url = (link) => `${window.location.origin}/l/${link.token}`;
  const run = async (action) => {
    try {
      await action();
      await load();
      onChanged?.();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div className="fs-links">
      {links.map((link) => {
        const state = link.revoked ? 'revoked' : link.expired ? 'expired' : 'active';
        return (
          <div key={link.id} className={`fs-link is-${state}`}>
            <div className="fs-link__url">
              <code>{url(link)}</code>
              <Tooltip title={t('common.copy')}>
                <Button size="small" disabled={state !== 'active'} onClick={() => navigator.clipboard?.writeText(url(link)).then(() => message.success(t('common.copied')))}>⧉</Button>
              </Tooltip>
            </div>
            <div className="fs-link__meta">
              <Tag color={state === 'active' ? 'green' : 'default'} bordered={false}>{t(`files.linkState.${state}`)}</Tag>
              {link.hasPassword && <Tag bordered={false}>🔒 {t('files.withPassword')}</Tag>}
              {!link.allowDownload && <Tag bordered={false}>{t('files.viewOnly')}</Tag>}
              <span>{link.expiresAt ? t('files.until', { date: formatDateTime(link.expiresAt, locale) }) : t('files.noExpiry')}</span>
              <span>· {t('files.viewsN', { n: link.views })}</span>
            </div>
            <div className="fs-link__actions">
              <Button size="small" type="text" onClick={() => run(() => filesApi.updateLink(link.id, { revoked: !link.revoked }))}>
                {link.revoked ? t('files.restoreLink') : t('files.revokeLink')}
              </Button>
              <Popconfirm title={t('files.deleteLinkConfirm')} onConfirm={() => run(() => filesApi.deleteLink(link.id))}>
                <Button size="small" type="text" danger>{t('common.delete')}</Button>
              </Popconfirm>
            </div>
          </div>
        );
      })}
      <LinkForm config={config} onCreate={(payload) => run(() => filesApi.createLink(node.id, payload))} />
    </div>
  );
}

/** Share a file or folder with people and by public link. */
export default function ShareDialog({ open, node, config, onClose }) {
  const { t } = useLocale();
  const [changed, setChanged] = useState(false);
  if (!node) return null;
  const owner = node.level === 'manage';
  return (
    <Modal open={open} title={t('files.shareTitle', { name: node.name })} onCancel={() => onClose(changed)} footer={null} width={640} destroyOnHidden>
      <Tabs
        items={[
          { key: 'people', label: t('files.people'), children: <People node={node} onChanged={() => setChanged(true)} /> },
          ...(owner ? [{ key: 'links', label: t('files.publicLinks'), children: <Links node={node} config={config} onChanged={() => setChanged(true)} /> }] : []),
        ]}
      />
    </Modal>
  );
}
