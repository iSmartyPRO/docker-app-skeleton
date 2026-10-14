import { useEffect, useMemo, useState } from 'react';
import { App, Button, Modal, Select, Skeleton, Tabs, Tag } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { Person, UserAvatar } from '../../shared/People';
import { filesApi } from '../api';
import { HintLabel } from '../../../help/Hint';
import ShareLinks from './ShareLinks';

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

/** Share a file or folder with people and by public link. */
export default function ShareDialog({ open, node, config, onClose }) {
  const { t } = useLocale();
  const [changed, setChanged] = useState(false);
  if (!node) return null;
  const owner = node.level === 'manage';
  // Owners always publish links; with "anyone with access" others may too, within their own rights.
  const canLink = owner || config?.linkSharing === 'members';
  return (
    <Modal open={open} title={t('files.shareTitle', { name: node.name })} onCancel={() => onClose(changed)} footer={null} width={680} destroyOnHidden className="sl-modal">
      <Tabs
        items={[
          { key: 'people', label: <HintLabel id="files.sharePeople">{t('files.people')}</HintLabel>, children: <People node={node} onChanged={() => setChanged(true)} /> },
          ...(canLink ? [{ key: 'links', label: t('files.publicLinks'), children: <ShareLinks node={node} config={config} onChanged={() => setChanged(true)} /> }] : []),
        ]}
      />
    </Modal>
  );
}
