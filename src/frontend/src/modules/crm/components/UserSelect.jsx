import { useMemo } from 'react';
import { Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { Person } from '../../shared/People';
import { useCrm } from '../CrmContext';

/** Staff picker (from /users) with avatars; `withMe` adds "Me" as the first option. */
export default function UserSelect({ value, onChange, multiple, withMe, placeholder, allowClear = true, className, variant, autoFocus, open, onDropdownVisibleChange, style, size, ariaLabel }) {
  const { t } = useLocale();
  const { users } = useCrm();
  const options = useMemo(
    () => [
      ...(withMe ? [{ value: 'me', search: `${t('crm.me')} me`, label: <span className="person">{t('crm.me')}</span> }] : []),
      ...users.map((user) => ({ value: user.id, search: `${user.name} ${user.username}`.toLowerCase(), label: <Person user={user} size={20} /> })),
    ],
    [users, withMe, t]
  );
  return (
    <Select
      mode={multiple ? 'multiple' : undefined}
      value={value ?? (multiple ? [] : undefined)}
      onChange={onChange}
      options={options}
      showSearch
      allowClear={allowClear}
      placeholder={placeholder}
      filterOption={(input, option) => String(option.search).includes(input.toLowerCase())}
      className={className}
      variant={variant}
      autoFocus={autoFocus}
      open={open}
      onDropdownVisibleChange={onDropdownVisibleChange}
      popupMatchSelectWidth={260}
      maxTagCount="responsive"
      style={style}
      size={size}
      aria-label={ariaLabel || placeholder}
    />
  );
}
