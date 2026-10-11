import { useEffect, useRef, useState } from 'react';
import { Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { cmpApi } from '../api';
import { useCompanies } from '../CompaniesContext';
import { Avatar, Flag } from './ui';

/** Searches companies as you type. `value` is a company id; `initial` = [{ id, name }]. */
export function CompanyPicker({ value, onChange, initial = [], placeholder, excludeId }) {
  const { t } = useLocale();
  const { meta } = useCompanies();
  const [options, setOptions] = useState(initial);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const search = (q) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await cmpApi.companies({ q, limit: 20 });
        setOptions(data.items);
      } finally {
        setLoading(false);
      }
    }, 250);
  };
  useEffect(() => {
    search('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Select
      showSearch
      allowClear
      value={value}
      onChange={onChange}
      filterOption={false}
      onSearch={search}
      loading={loading}
      placeholder={placeholder || t('companies.pickCompany')}
      notFoundContent={loading ? null : t('companies.nothingFound')}
      options={options.filter((item) => item.id !== excludeId).map((item) => ({
        value: item.id,
        label: (
          <span className="cmp-pick">
            <Avatar name={item.name} size={20} square />
            <span>{item.name}</span>
            {item.country && <Flag meta={meta} country={item.country} />}
          </span>
        ),
      }))}
    />
  );
}

/** Searches contacts as you type. */
export function PersonPicker({ value, onChange, placeholder }) {
  const { t } = useLocale();
  const [options, setOptions] = useState([]);
  const timer = useRef(null);
  const search = (q) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { data } = await cmpApi.people({ q, limit: 20 });
      setOptions(data.items);
    }, 250);
  };
  useEffect(() => {
    search('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Select
      showSearch
      value={value}
      onChange={onChange}
      filterOption={false}
      onSearch={search}
      placeholder={placeholder || t('companies.pickPerson')}
      options={options.map((item) => ({
        value: item.id,
        label: (
          <span className="cmp-pick">
            <Avatar name={item.fullName} size={20} />
            <span>{item.fullName}</span>
            {item.current && <em>{item.current.companyName}</em>}
          </span>
        ),
      }))}
    />
  );
}
