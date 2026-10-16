import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Select } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { empApi } from './api';
import { initials } from './lib';

/**
 * Pick an employee (or several) — for any module that wants people rather
 * than portal accounts (docs/employees.md → «Employee picker»):
 *
 *   import EmployeePicker from '../employees/EmployeePicker';
 *   <EmployeePicker value={employeeId} onChange={(id, employee) => …} />
 *   <EmployeePicker multiple unitId={5} />              // limited to a unit (and its subunits)
 *   <EmployeePicker withAccount />                        // only people with a portal account (employee.userId)
 *
 * It searches the server as the person types and shows only what the viewer
 * may see (the directory of employees.view). Render it only while the
 * Employees module is on (settings.modules.employees.enabled).
 */
export default function EmployeePicker({ value, onChange, multiple = false, unitId, withAccount = false, placeholder, allowClear = true, style, disabled, exclude = [], id }) {
  const { t } = useLocale();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const known = useRef(new Map());
  const excludeKey = exclude.join(',');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      empApi
        .list({ q: query || undefined, unitId: unitId || undefined, limit: 50 })
        .then((res) => {
          if (!alive) return;
          const skip = new Set(excludeKey ? excludeKey.split(',').map(Number) : []);
          const list = res.data.items.filter((item) => (!withAccount || item.userId) && !skip.has(item.id));
          list.forEach((item) => known.current.set(item.id, item));
          setItems(list);
        })
        .catch(() => alive && setItems([]))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, unitId, withAccount, excludeKey]);
  // Keep the chosen people visible even when the search does not return them.
  useEffect(() => {
    const ids = [].concat(value ?? []).filter((one) => !known.current.has(one));
    ids.forEach((one) =>
      empApi
        .get(one)
        .then((res) => {
          known.current.set(one, res.data.employee);
          setItems((prev) => [...prev]);
        })
        .catch(() => {})
    );
  }, [JSON.stringify(value ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => {
    const map = new Map(items.map((item) => [item.id, item]));
    for (const one of [].concat(value ?? [])) if (!map.has(one) && known.current.has(one)) map.set(one, known.current.get(one));
    return [...map.values()].map((item) => ({
      value: item.id,
      label: (
        <span className="emp-opt">
          <Avatar size={20} src={item.photoUrl || undefined}>
            {initials(item.name)}
          </Avatar>
          <span className="emp-opt__name">{item.name}</span>
          {(item.position?.name || item.unit?.name) && <span className="emp-opt__meta">{[item.position?.name, item.unit?.name].filter(Boolean).join(' · ')}</span>}
        </span>
      ),
      title: item.name,
    }));
  }, [items, value]);
  return (
    <Select
      id={id}
      showSearch
      filterOption={false}
      onSearch={setQuery}
      value={value ?? undefined}
      onChange={(next) => onChange?.(next ?? null, multiple ? [].concat(next || []).map((one) => known.current.get(one)) : known.current.get(next) || null)}
      options={options}
      loading={loading}
      mode={multiple ? 'multiple' : undefined}
      allowClear={allowClear}
      placeholder={placeholder || t('emp.pick.employee')}
      notFoundContent={loading ? null : t('emp.pick.nothing')}
      style={{ width: '100%', ...style }}
      popupMatchSelectWidth={false}
      disabled={disabled}
      optionLabelProp="title"
    />
  );
}
