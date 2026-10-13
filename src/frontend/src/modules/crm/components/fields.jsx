import { Input, InputNumber, Select, Switch } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { Person } from '../../shared/People';
import { useCrm } from '../CrmContext';
import { formatDay, formatMoney, formatNumber } from '../lib';
import UserSelect from './UserSelect';
import { DateField } from '../../../components/ui/DateTimeField';

/** Is a custom value empty (shows «не заполнено»)? */
export function isEmptyValue(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** The edit control of a custom field, by type. Dates travel as YYYY-MM-DD. */
export function FieldInput({ field, value, onChange, currency, autoFocus, onCommit, ...rest }) {
  const { t } = useLocale();
  const common = { autoFocus, 'aria-label': field.label, ...rest };
  switch (field.type) {
    case 'textarea':
      return <Input.TextArea {...common} value={value ?? ''} onChange={(event) => onChange(event.target.value)} autoSize={{ minRows: 2, maxRows: 8 }} maxLength={5000} />;
    case 'number':
      return <InputNumber {...common} value={value ?? null} onChange={(next) => onChange(next ?? null)} style={{ width: '100%' }} onPressEnter={onCommit} />;
    case 'money':
      return <InputNumber {...common} value={value ?? null} onChange={(next) => onChange(next ?? null)} min={0} addonAfter={currency} style={{ width: '100%' }} onPressEnter={onCommit} />;
    case 'date':
      return <DateField {...common} value={value || null} onChange={(day) => onChange(day)} style={{ width: '100%' }} />;
    case 'select':
      return <Select {...common} allowClear value={value ?? undefined} onChange={(next) => onChange(next ?? null)} options={(field.options || []).map((option) => ({ value: option, label: option }))} style={{ width: '100%' }} placeholder={t('crm.fields.choose')} />;
    case 'multiselect':
      return <Select {...common} mode="multiple" allowClear value={value || []} onChange={onChange} options={(field.options || []).map((option) => ({ value: option, label: option }))} style={{ width: '100%' }} placeholder={t('crm.fields.choose')} />;
    case 'bool':
      return <Switch {...common} checked={Boolean(value)} onChange={onChange} />;
    case 'url':
      return <Input {...common} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder="https://" inputMode="url" maxLength={1000} onPressEnter={onCommit} />;
    case 'user':
      return <UserSelect {...common} value={value ?? undefined} onChange={(next) => onChange(next ?? null)} style={{ width: '100%' }} />;
    default:
      return <Input {...common} value={value ?? ''} onChange={(event) => onChange(event.target.value)} maxLength={1000} onPressEnter={onCommit} />;
  }
}

/** A custom value as text: money in the deal currency, dates, people, links. */
export function FieldValue({ field, value, currency }) {
  const { t, locale } = useLocale();
  const { userById } = useCrm();
  if (field.type === 'bool') return <span>{value ? t('common.yes') : t('common.no')}</span>;
  if (isEmptyValue(value)) return <span className="crm-unset">{t('crm.fields.unset')}</span>;
  switch (field.type) {
    case 'number':
      return <span>{formatNumber(value, locale)}</span>;
    case 'money':
      return <span className="crm-money">{formatMoney(value, currency, locale)}</span>;
    case 'date':
      return <span>{formatDay(value, locale, true)}</span>;
    case 'multiselect':
      return (
        <span className="crm-tags">
          {(Array.isArray(value) ? value : [value]).map((item) => (
            <span key={item} className="crm-tag">{item}</span>
          ))}
        </span>
      );
    case 'url': {
      const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="crm-link">
          {String(value).replace(/^https?:\/\//i, '')}
        </a>
      );
    }
    case 'user': {
      const user = typeof value === 'object' ? value : userById(value);
      return user ? <Person user={user} size={20} /> : <span>#{value}</span>;
    }
    case 'textarea':
      return <span className="crm-multiline">{value}</span>;
    default:
      return <span>{String(value)}</span>;
  }
}

/** Short text of a value for table cells and tooltips. */
export function fieldText(field, value, { locale, t, currency, userById }) {
  if (field.type === 'bool') return value ? t('common.yes') : value === false ? t('common.no') : '';
  if (isEmptyValue(value)) return '';
  if (field.type === 'money') return formatMoney(value, currency, locale);
  if (field.type === 'number') return formatNumber(value, locale);
  if (field.type === 'date') return formatDay(value, locale, true);
  if (field.type === 'multiselect') return (Array.isArray(value) ? value : [value]).join(', ');
  if (field.type === 'user') return (typeof value === 'object' ? value : userById?.(value))?.name || '';
  return String(value);
}
