import { useEffect, useRef, useState } from 'react';
import { App, Form, Input, Modal, Select } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { crmApi } from '../api';
import { Glyph } from './bits';

/** A client of the picker from either list: { type, id, name, sub }. */
const asClient = (type, item) => ({ type, id: item.id, name: item.name, sub: type === 'company' ? item.inn : item.company?.name || item.company || '' });

/**
 * Searches companies and contacts of the Companies module (/clients) and can
 * create a new one in place. `value` is "c:<id>" / "p:<id>"; `types` limits
 * the lists (['company'] for a company-only field).
 */
export default function ClientPicker({ value, initial, onChange, types = ['company', 'person'], placeholder, autoFocus, open, onDropdownVisibleChange, variant, size, allowClear = true, className }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [results, setResults] = useState({ companies: [], people: [] });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(null);
  const [known, setKnown] = useState(() => (initial ? [initial] : []));
  const timer = useRef(null);
  const [form] = Form.useForm();

  const search = (q) => {
    setQuery(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await crmApi.clients(q);
        setResults({ companies: data.companies || [], people: data.people || [] });
      } catch {
        setResults({ companies: [], people: [] });
      } finally {
        setLoading(false);
      }
    }, 220);
  };

  useEffect(() => {
    search('');
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initial && !known.some((item) => item.type === initial.type && item.id === initial.id)) setKnown((list) => [...list, initial]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.type, initial?.id]);

  const companies = types.includes('company') ? results.companies.map((item) => asClient('company', item)) : [];
  const people = types.includes('person') ? results.people.map((item) => asClient('person', item)) : [];
  const all = [...companies, ...people, ...known];
  const keyOf = (client) => `${client.type === 'company' ? 'c' : 'p'}:${client.id}`;

  const label = (client) => (
    <span className="crm-client-opt">
      <Glyph name={client.type === 'company' ? 'building' : 'person'} size={14} />
      <span className="crm-client-opt__name">{client.name}</span>
      {client.sub && <em>{client.sub}</em>}
    </span>
  );

  const shownKeys = new Set([...companies, ...people].map(keyOf));
  const extra = known.filter((client) => !shownKeys.has(keyOf(client)) && keyOf(client) === value);
  const options = [];
  if (companies.length || extra.some((c) => c.type === 'company')) {
    options.push({ label: t('crm.client.companies'), title: 'companies', options: [...companies, ...extra.filter((c) => c.type === 'company')].map((c) => ({ value: keyOf(c), label: label(c) })) });
  }
  if (people.length || extra.some((c) => c.type === 'person')) {
    options.push({ label: t('crm.client.people'), title: 'people', options: [...people, ...extra.filter((c) => c.type === 'person')].map((c) => ({ value: keyOf(c), label: label(c) })) });
  }
  const create = [];
  if (types.includes('company')) create.push({ value: '__new_company', label: <span className="crm-client-new">+ {query.trim() ? t('crm.client.createCompanyNamed', { name: query.trim() }) : t('crm.client.createCompany')}</span> });
  if (types.includes('person')) create.push({ value: '__new_person', label: <span className="crm-client-new">+ {query.trim() ? t('crm.client.createPersonNamed', { name: query.trim() }) : t('crm.client.createPerson')}</span> });
  options.push({ label: t('crm.client.new'), title: 'new', options: create });

  const pick = (next) => {
    if (next === '__new_company' || next === '__new_person') {
      const type = next === '__new_company' ? 'company' : 'person';
      form.setFieldsValue({ type, name: query.trim(), phone: '', email: '' });
      setCreating(type);
      return;
    }
    const client = all.find((item) => keyOf(item) === next) || null;
    onChange?.(next || null, client);
  };

  const submitNew = async () => {
    const values = await form.validateFields();
    try {
      const { data } = await crmApi.createClient(values);
      const raw = data.client || data.company || data.person || data;
      const client = { type: raw.type || values.type, id: raw.id, name: raw.name || values.name, sub: '' };
      setKnown((list) => [...list, client]);
      setCreating(null);
      message.success(t('crm.client.created', { name: client.name }));
      onChange?.(keyOf(client), client);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <>
      <Select
        showSearch
        allowClear={allowClear}
        value={value || undefined}
        onChange={pick}
        onSearch={search}
        filterOption={false}
        loading={loading}
        options={options}
        autoFocus={autoFocus}
        open={open}
        onDropdownVisibleChange={onDropdownVisibleChange}
        variant={variant}
        size={size}
        className={className}
        placeholder={placeholder || t('crm.client.placeholder')}
        notFoundContent={loading ? null : t('crm.client.nothing')}
        popupMatchSelectWidth={320}
        style={{ width: '100%' }}
        aria-label={t('crm.fields.client')}
      />
      <Modal
        open={Boolean(creating)}
        title={creating === 'company' ? t('crm.client.newCompany') : t('crm.client.newPerson')}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        onOk={submitNew}
        onCancel={() => setCreating(null)}
        destroyOnHidden
        width={420}
      >
        <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
          <Form.Item name="type" hidden>
            <Segmented options={['company', 'person']} />
          </Form.Item>
          <Form.Item name="name" label={creating === 'company' ? t('crm.client.companyName') : t('crm.client.personName')} rules={[{ required: true, whitespace: true, message: t('common.required') }]}>
            <Input autoFocus maxLength={300} />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item name="phone" label={t('crm.client.phone')}>
              <Input inputMode="tel" maxLength={60} />
            </Form.Item>
            <Form.Item name="email" label={t('crm.client.email')} rules={[{ type: 'email', message: t('crm.client.badEmail') }]}>
              <Input inputMode="email" maxLength={200} />
            </Form.Item>
          </div>
          <p className="dialog-note">{t('crm.client.createNote')}</p>
        </Form>
      </Modal>
    </>
  );
}

/** "c:12" → { companyId: 12, personId: undefined }. */
export function clientPayload(value, keepOther = {}) {
  if (!value) return { companyId: null, personId: null, ...keepOther };
  const [kind, id] = String(value).split(':');
  return kind === 'c' ? { companyId: Number(id), ...keepOther } : { personId: Number(id), ...keepOther };
}
