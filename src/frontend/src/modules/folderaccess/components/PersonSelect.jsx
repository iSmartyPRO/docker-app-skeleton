import { useEffect, useRef, useState } from 'react';
import { Select, Spin, Tag } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { faApi } from '../api';

/** A directory person (with login and department), found by name / login / e-mail. Value: DN. */
export default function PersonSelect({ value, onChange, mode, kind = 'user', placeholder, style, autoFocus, exclude = [] }) {
  const { t } = useLocale();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const seq = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (text) => {
    clearTimeout(timer.current);
    if (String(text).trim().length < 2) return;
    timer.current = setTimeout(async () => {
      const mine = ++seq.current;
      setLoading(true);
      try {
        const { data } = await faApi.people(text, kind);
        if (mine !== seq.current) return;
        const skip = new Set(exclude.map((dn) => String(dn).toLowerCase()));
        setOptions(
          (data.people || [])
            .filter((person) => !skip.has(person.dn.toLowerCase()))
            .map((person) => ({
              value: person.dn,
              person,
              label: (
                <span className="fa-option">
                  <strong>{person.name}</strong>
                  <span className="fa-muted">{[person.login, person.department].filter(Boolean).join(' · ')}</span>
                  {person.kind !== 'user' && <Tag>{t(`folderAccess.kind.${person.kind}`)}</Tag>}
                  {person.enabled === false && <Tag color="default">{t('folderAccess.disabled')}</Tag>}
                </span>
              ),
            }))
        );
      } catch {
        if (mine === seq.current) setOptions([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
  };

  return (
    <Select
      showSearch
      allowClear
      autoFocus={autoFocus}
      mode={mode}
      value={value}
      onChange={(next, option) => onChange?.(next, option)}
      filterOption={false}
      onSearch={search}
      notFoundContent={loading ? <Spin size="small" /> : t('folderAccess.people.typeToSearch')}
      placeholder={placeholder || t('folderAccess.people.placeholder')}
      options={options}
      labelRender={({ value: dn }) => options.find((item) => item.value === dn)?.person?.name || String(dn).replace(/^CN=([^,]+).*/i, '$1')}
      style={{ minWidth: 260, ...style }}
    />
  );
}
