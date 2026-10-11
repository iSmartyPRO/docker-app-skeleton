import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Modal, Select, Spin } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { roleLabel } from '../../lib/access';

const LEVELS = ['view', 'edit', 'manage'];

/**
 * Access list editor for a module resource (project, calendar…).
 * `load()` → { entries }, `loadSubjects()` → { users, groups, roles },
 * `save(entries)`. `levelKey` prefixes the level descriptions, e.g.
 * "tasks.level" → tasks.level.viewDesc.
 */
export default function AccessDialog({ open, title, load, loadSubjects, save, levelKey, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [entries, setEntries] = useState(null);
  const [subjects, setSubjects] = useState(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState();
  const handlers = useRef({ load, loadSubjects, onClose });
  handlers.current = { load, loadSubjects, onClose };

  useEffect(() => {
    if (!open) return;
    setEntries(null);
    Promise.all([handlers.current.load(), handlers.current.loadSubjects()])
      .then(([access, list]) => {
        setEntries(access.data.entries);
        setSubjects(list.data);
      })
      .catch((err) => {
        message.error(errorMessage(err));
        handlers.current.onClose(false);
      });
  }, [open, message]);

  const options = useMemo(() => {
    if (!subjects || !entries) return [];
    const taken = new Set(entries.map((entry) => `${entry.subjectType}:${entry.subjectId ?? ''}`));
    const make = (subjectType, item, label) => ({
      value: `${subjectType}:${item?.id ?? ''}`,
      label,
      disabled: taken.has(`${subjectType}:${item?.id ?? ''}`),
    });
    return [
      { label: t('kb.access.general'), options: [make('everyone', null, t('kb.access.everyone'))] },
      { label: t('nav.groups'), options: subjects.groups.map((group) => make('group', group, group.name)) },
      { label: t('nav.roles'), options: subjects.roles.map((role) => make('role', role, roleLabel(role, t))) },
      { label: t('nav.users'), options: subjects.users.map((user) => make('user', user, `${user.name} · @${user.username}`)) },
    ];
  }, [subjects, entries, t]);

  const labelOf = (entry) => {
    if (entry.subjectType === 'everyone') return t('kb.access.everyone');
    const pool = { group: subjects?.groups, role: subjects?.roles, user: subjects?.users }[entry.subjectType] || [];
    const found = pool.find((item) => item.id === entry.subjectId);
    if (entry.subjectType === 'role' && found) return roleLabel(found, t);
    return found?.name || entry.label || '—';
  };

  const add = (value) => {
    const [subjectType, rawId] = value.split(':');
    setEntries((list) => [...list, { subjectType, subjectId: rawId ? Number(rawId) : null, level: 'view' }]);
    setAdding(undefined);
  };

  const submit = async () => {
    setSaving(true);
    try {
      await save(entries);
      message.success(t('common.saved'));
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => onClose(false)}
      onOk={submit}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      title={t('kb.access.title', { name: title })}
      width={620}
      destroyOnHidden
    >
      {!entries ? (
        <div className="viewer-loading" style={{ minHeight: 160, display: 'grid', placeItems: 'center' }}>
          <Spin />
        </div>
      ) : (
        <div className="acl">
          <div className="acl__list">
            {entries.length === 0 && <div className="acl__empty">{t('kb.access.nobody')}</div>}
            {entries.map((entry, index) => (
              <div key={`${entry.subjectType}:${entry.subjectId}`} className="acl__row">
                <span className={`acl__badge is-${entry.subjectType}`}>{t(`kb.access.type_${entry.subjectType}`)}</span>
                <span className="acl__name">{labelOf(entry)}</span>
                <Select
                  size="small"
                  value={entry.level}
                  style={{ width: 150 }}
                  onChange={(level) => setEntries((list) => list.map((row, position) => (position === index ? { ...row, level } : row)))}
                  options={LEVELS.map((level) => ({ value: level, label: t(`${levelKey}.${level}`) }))}
                />
                <Button type="text" danger size="small" onClick={() => setEntries((list) => list.filter((_, position) => position !== index))}>
                  ✕
                </Button>
              </div>
            ))}
          </div>
          <Select showSearch value={adding} placeholder={t('kb.access.add')} onChange={add} options={options} optionFilterProp="label" style={{ width: '100%' }} />
          <ul className="acl__legend">
            {LEVELS.map((level) => (
              <li key={level}>
                <strong>{t(`${levelKey}.${level}`)}</strong> — {t(`${levelKey}.${level}Desc`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
