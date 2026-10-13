import { useEffect, useRef, useState } from 'react';
import { Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { procApi } from '../api';

/**
 * Searches another module through the procurement lookups (companies,
 * projects, objects, deals) or the Contracts API. `value` = { id, label }.
 * `onUnavailable` fires when the source answers 404 (module off / missing).
 */
export function RemoteSelect({ kind, value, onChange, params, placeholder, onUnavailable, allowClear = true, ...rest }) {
  const { t } = useLocale();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const paramsKey = JSON.stringify(params || {});
  const search = (q) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        if (kind === 'contracts') {
          const res = await procApi.contracts(q);
          const items = res.data.items || res.data.contracts || [];
          setOptions(items.map((item) => ({ id: item.id, label: [item.number, item.title].filter(Boolean).join(' · '), hint: item.counterparty || '' })));
        } else {
          const res = await procApi.lookup(kind, { q, ...(params || {}) });
          setOptions(res.data.items);
        }
      } catch (err) {
        setOptions([]);
        // A missing, switched-off or failing source hides the field (a link is optional).
        if (err?.response?.status) onUnavailable?.();
      } finally {
        setLoading(false);
      }
    }, 250);
  };
  useEffect(() => {
    search('');
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, paramsKey]);
  const known = value?.id && !options.some((item) => item.id === value.id) ? [{ id: value.id, label: value.label || `#${value.id}` }] : [];
  return (
    <Select
      showSearch
      allowClear={allowClear}
      value={value?.id ?? undefined}
      filterOption={false}
      onSearch={search}
      loading={loading}
      placeholder={placeholder}
      notFoundContent={loading ? null : t('procurement.nothingFound')}
      onChange={(id) => {
        const item = [...options, ...known].find((option) => option.id === id);
        onChange(id ? { id, label: item?.label || '' } : null);
      }}
      options={[...known, ...options].map((item) => ({
        value: item.id,
        label: (
          <span className="prc-pick">
            <span>{item.label}</span>
            {item.hint && <small>{item.hint}</small>}
          </span>
        ),
      }))}
      {...rest}
    />
  );
}
