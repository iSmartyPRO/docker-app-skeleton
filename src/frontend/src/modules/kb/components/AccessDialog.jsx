import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Modal, Select, Spin, Switch } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { roleLabel } from '../../../lib/access';
import { kbApi } from '../api';
import { Hint, HintLabel } from '../../../help/Hint';

const LEVELS = ['view', 'edit', 'manage'];

/**
 * Who can see / edit / manage the base, a folder or a material.
 * Inheritance can be switched off to make a private branch.
 */
export default function AccessDialog({ open, type, id, title, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState(null);
  const [entries, setEntries] = useState([]);
  const [inherit, setInherit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setData(null);
    Promise.all([kbApi.access(type, id), kbApi.subjects()])
      .then(([access, list]) => {
        setData(access.data);
        setEntries(access.data.entries);
        setInherit(access.data.inherit !== false);
        setSubjects(list.data);
      })
      .catch((err) => {
        message.error(errorMessage(err));
        closeRef.current(false);
      });
  }, [open, type, id, message]);

  const options = useMemo(() => {
    if (!subjects) return [];
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

  const save = async () => {
    setSaving(true);
    try {
      await kbApi.saveAccess(type, id, { inherit: type === 'root' ? undefined : inherit, entries });
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
      onOk={save}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      title={<HintLabel id="kb.accessLevels">{t('kb.access.title', { name: title })}</HintLabel>}
      width={620}
      destroyOnHidden
    >
      {!data ? (
        <div className="viewer-loading" style={{ minHeight: 160 }}><Spin /></div>
      ) : (
        <div className="acl">
          {type !== 'root' && (
            <div className="acl__inherit">
              <div>
                <strong>{t('kb.access.inherit')} <Hint id="kb.inherit" /></strong>
                <span>{inherit ? t('kb.access.inheritOn') : t('kb.access.inheritOff')}</span>
              </div>
              <Switch checked={inherit} onChange={setInherit} />
            </div>
          )}
          <div className="acl__list">
            {entries.length === 0 && <div className="acl__empty">{inherit && type !== 'root' ? t('kb.access.onlyInherited') : t('kb.access.nobody')}</div>}
            {entries.map((entry, index) => (
              <div key={`${entry.subjectType}:${entry.subjectId}`} className="acl__row">
                <span className={`acl__badge is-${entry.subjectType}`}>{t(`kb.access.type_${entry.subjectType}`)}</span>
                <span className="acl__name">{labelOf(entry)}</span>
                <Select
                  size="small"
                  value={entry.level}
                  style={{ width: 150 }}
                  onChange={(level) => setEntries((list) => list.map((row, position) => (position === index ? { ...row, level } : row)))}
                  options={LEVELS.map((level) => ({ value: level, label: t(`kb.level.${level}`) }))}
                />
                <Button type="text" danger size="small" onClick={() => setEntries((list) => list.filter((_, position) => position !== index))}>✕</Button>
              </div>
            ))}
          </div>
          <Select
            showSearch
            value={adding}
            placeholder={t('kb.access.add')}
            onChange={add}
            options={options}
            optionFilterProp="label"
            style={{ width: '100%' }}
          />
          <ul className="acl__legend">
            {LEVELS.map((level) => (
              <li key={level}><strong>{t(`kb.level.${level}`)}</strong> — {t(`kb.level.${level}Desc`)}</li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
