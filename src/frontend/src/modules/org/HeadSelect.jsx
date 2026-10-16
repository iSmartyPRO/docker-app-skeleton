import { useEffect, useMemo, useState } from 'react';
import { Avatar, Select } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { orgApi } from './api';
import { initialsOf } from './lib';

let peoplePromise = null;
function loadPeople(force = false) {
  if (force || !peoplePromise) {
    peoplePromise = orgApi
      .people()
      .then((res) => res.data)
      .catch((err) => {
        peoplePromise = null;
        throw err;
      });
  }
  return peoplePromise;
}

/** People for head pickers and placements: { people (accounts), employees (with Employees on) | null }. */
export function useOrgPeople() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    loadPeople()
      .then((value) => alive && setData(value))
      .catch(() => alive && setData({ people: [], employees: null }));
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

const option = (person, kind, secondary) => ({
  value: `${kind}:${person.id}`,
  search: `${person.name} ${person.username || ''} ${person.position || ''}`.toLowerCase(),
  label: (
    <span className="org-opt">
      <Avatar size={20} src={person.avatarUrl || person.photoUrl || undefined}>
        {initialsOf(person.name)}
      </Avatar>
      <span className="org-opt__name">{person.name}</span>
      {secondary && <span className="org-opt__type">{secondary}</span>}
    </span>
  ),
});

/**
 * The head of a unit: an employee (Employees on) or a portal account.
 * value / onChange: { kind: 'employee' | 'user', id } | null.
 */
export default function HeadSelect({ value, onChange, placeholder, id }) {
  const { t } = useLocale();
  const data = useOrgPeople();
  const options = useMemo(() => {
    if (!data) return [];
    const groups = [];
    if (data.employees) groups.push({ label: t('org.head.employees'), options: data.employees.map((person) => option(person, 'employee', person.position || (person.userId ? '' : t('org.head.noAccount')))) });
    groups.push({ label: t('org.head.users'), options: data.people.map((person) => option(person, 'user', person.position)) });
    return groups;
  }, [data, t]);
  return (
    <Select
      id={id}
      showSearch
      allowClear
      value={value ? `${value.kind}:${value.id}` : undefined}
      onChange={(next) => {
        if (!next) return onChange?.(null);
        const [kind, raw] = next.split(':');
        return onChange?.({ kind, id: Number(raw) });
      }}
      options={options}
      loading={!data}
      placeholder={placeholder || t('org.head.placeholder')}
      filterOption={(input, item) => String(item?.search || '').includes(input.toLowerCase())}
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
    />
  );
}
