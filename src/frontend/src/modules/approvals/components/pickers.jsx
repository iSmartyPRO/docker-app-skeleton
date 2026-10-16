import { useEffect, useState } from 'react';
import { Avatar, Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { initials } from '../../../lib/format';
import { approvalsApi } from '../api';

let subjectsPromise = null;

/** People, groups and roles (cached for the page). */
export function loadSubjects(force = false) {
  if (force || !subjectsPromise) {
    subjectsPromise = approvalsApi
      .subjects()
      .then((res) => res.data)
      .catch((err) => {
        subjectsPromise = null;
        throw err;
      });
  }
  return subjectsPromise;
}

export function useSubjects() {
  const [subjects, setSubjects] = useState(null);
  useEffect(() => {
    let alive = true;
    loadSubjects()
      .then((data) => alive && setSubjects(data))
      .catch(() => alive && setSubjects({ users: [], groups: [], roles: [] }));
    return () => {
      alive = false;
    };
  }, []);
  return subjects;
}

const userLabel = (user) => (
  <span className="apr-option">
    <Avatar size={20} src={user.avatarUrl || undefined}>
      {initials(user.name)}
    </Avatar>
    <span>{user.name}</span>
  </span>
);

/** One person (question target, delegate, substitute). */
export function PersonSelect({ value, onChange, exclude = [], placeholder, style, allowClear = false, autoFocus }) {
  const { t } = useLocale();
  const subjects = useSubjects();
  const options = (subjects?.users || [])
    .filter((user) => !exclude.includes(user.id))
    .map((user) => ({ value: user.id, label: userLabel(user), search: `${user.name} ${user.username}`.toLowerCase() }));
  return (
    <Select
      showSearch
      value={value ?? undefined}
      onChange={onChange}
      options={options}
      loading={!subjects}
      allowClear={allowClear}
      autoFocus={autoFocus}
      placeholder={placeholder || t('approvals.pick.person')}
      filterOption={(input, option) => option.search.includes(input.toLowerCase())}
      style={{ width: '100%', ...style }}
      popupMatchSelectWidth={false}
    />
  );
}

/** Approvers of a stage: people, roles and groups in one multi-select ({ kind, id } values). */
export function ApproverSelect({ value = [], onChange, placeholder }) {
  const { t } = useLocale();
  const subjects = useSubjects();
  const encode = (item) => (item.kind === 'manager' ? `manager:${item.level || 1}` : `${item.kind}:${item.id ?? item.key}`);
  const options = [
    {
      label: t('approvals.manager.group'),
      options: [1, 2].map((level) => ({
        value: `manager:${level}`,
        label: (
          <span className="apr-option">
            <span className="apr-option__glyph">★</span>
            {t(`approvals.manager.level${level}`)}
          </span>
        ),
        search: t(`approvals.manager.level${level}`).toLowerCase(),
      })),
    },
    { label: t('approvals.pick.people'), options: (subjects?.users || []).map((user) => ({ value: `user:${user.id}`, label: userLabel(user), search: user.name.toLowerCase() })) },
    { label: t('approvals.pick.roles'), options: (subjects?.roles || []).map((role) => ({ value: `role:${role.id}`, label: <span className="apr-option"><span className="apr-option__glyph">◆</span>{role.name}</span>, search: role.name.toLowerCase() })) },
    { label: t('approvals.pick.groups'), options: (subjects?.groups || []).map((group) => ({ value: `group:${group.id}`, label: <span className="apr-option"><span className="apr-option__glyph">👥</span>{group.name}</span>, search: group.name.toLowerCase() })) },
  ];
  // Permission approvers (module defaults) are kept as they are.
  const permissionValues = value.filter((item) => item.kind === 'permission');
  return (
    <Select
      mode="multiple"
      value={value.filter((item) => item.kind !== 'permission').map(encode)}
      onChange={(list) =>
        onChange([
          ...permissionValues,
          ...list.map((entry) => {
            const [kind, id] = entry.split(':');
            return kind === 'manager' ? { kind, level: Number(id) || 1 } : { kind, id: Number(id) };
          }),
        ])
      }
      options={options}
      loading={!subjects}
      placeholder={placeholder || t('approvals.pick.approvers')}
      filterOption={(input, option) => (option.search || '').includes(input.toLowerCase())}
      style={{ width: '100%' }}
      maxTagCount="responsive"
    />
  );
}
