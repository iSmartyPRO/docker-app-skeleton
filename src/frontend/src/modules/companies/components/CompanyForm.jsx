import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, AutoComplete, Button, Collapse, Drawer, Form, Input, InputNumber, Select, Tag } from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { DateField } from '../../../components/ui/DateTimeField';
import { errorMessage } from '../../../lib/errors';
import { cmpApi, relationLabel } from '../api';
import { useCompanies } from '../CompaniesContext';
import { formatDate } from './ui';
import { HintLabel } from '../../../help/Hint';

// Dates here are calendar days ('YYYY-MM-DD'): DateField edits them without any zone shift.
const dateProps = {
  getValueProps: (value) => ({ value: value ? String(value).slice(0, 10) : null }),
};

const EMPTY = {
  kind: 'legal',
  status: 'active',
  phones: [],
  emails: [],
  bank_accounts: [],
  relations: [],
  tags: [],
  messengers: {},
  ids: {},
  custom: {},
};

function ContactRows({ name, placeholder, labelPlaceholder, addText, type }) {
  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <div className="cmp-rows">
          {fields.map((field) => (
            <div key={field.key} className="cmp-rows__row">
              <Form.Item name={[field.name, 'value']} noStyle>
                <Input placeholder={placeholder} type={type} />
              </Form.Item>
              <Form.Item name={[field.name, 'label']} noStyle>
                <Input placeholder={labelPlaceholder} className="cmp-rows__label" />
              </Form.Item>
              <Button type="text" onClick={() => remove(field.name)} aria-label="remove">✕</Button>
            </div>
          ))}
          <Button type="dashed" size="small" onClick={() => add({ value: '', label: '' })}>+ {addText}</Button>
        </div>
      )}
    </Form.List>
  );
}

/** Create or edit a company. Fill it from the register by identifier, then complete by hand. */
export default function CompanyForm({ open, company, onClose }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { meta, staff } = useCompanies();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [registry, setRegistry] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const country = Form.useWatch('country', form) || meta?.settings?.defaultCountry || 'KG';
  const profile = meta?.countries?.[country];
  const primary = profile?.ids?.find((item) => item.primary) || profile?.ids?.[0];

  useEffect(() => {
    if (!open) return;
    setRegistry(null);
    setDuplicates([]);
    form.resetFields();
    form.setFieldsValue(company ? { ...company, owner_id: company.owner?.id || null } : { ...EMPTY, country: meta?.settings?.defaultCountry || 'KG' });
  }, [open, company, form, meta]);

  const countryOptions = useMemo(
    () =>
      (meta?.settings?.countries || Object.keys(meta?.countries || {}))
        .filter((code) => meta?.countries?.[code])
        .map((code) => ({ value: code, label: `${meta.countries[code].flag}  ${meta.countries[code].name[locale] || meta.countries[code].name.en}` })),
    [meta, locale]
  );

  const lookup = async () => {
    const id = form.getFieldValue(['ids', primary.key]);
    if (!id) {
      message.warning(t('companies.enterId', { id: primary.label[locale] }));
      return;
    }
    setLooking(true);
    try {
      const { data } = await cmpApi.lookup(country, id);
      const current = form.getFieldsValue(true);
      const fields = { ...data.fields };
      // Contacts entered by hand are kept; register values fill the rest.
      if (current.phones?.length) delete fields.phones;
      if (current.emails?.length) delete fields.emails;
      form.setFieldsValue({ ...fields, ids: { ...current.ids, ...Object.fromEntries(Object.entries(fields.ids || {}).filter(([, v]) => v)) } });
      setRegistry(data);
      setDuplicates(company ? data.duplicates.filter((item) => item.id !== company.id) : data.duplicates);
      message.success(t('companies.loadedFrom', { source: data.sourceName }));
    } catch (err) {
      const code = err?.response?.data?.code;
      message.error(t(`companies.errors.${code}`) !== `companies.errors.${code}` ? t(`companies.errors.${code}`) : errorMessage(err));
    } finally {
      setLooking(false);
    }
  };

  const submit = async (force = false) => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const payload = {
        ...values,
        force,
        ...(registry ? { registry: { source: registry.source, sourceName: registry.sourceName, checkedAt: registry.checkedAt, url: registry.url }, documentId: registry.documentId } : {}),
      };
      const { data } = company ? await cmpApi.updateCompany(company.id, payload) : await cmpApi.createCompany(payload);
      message.success(company ? t('common.saved') : t('companies.created'));
      onClose(data.company);
    } catch (err) {
      const body = err?.response?.data;
      if (body?.code === 'DUPLICATE') {
        setDuplicates(body.info?.duplicates || []);
      } else if (body?.code === 'INVALID_IDS') {
        form.setFields((body.info?.fields || []).map((key) => ({ name: ['ids', key], errors: [t('companies.invalidId')] })));
      } else {
        message.error(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const customFields = (meta?.settings?.customFields || []).filter((field) => field.entity === 'company' && (!field.countries?.length || field.countries.includes(country)));
  const relationOptions = (meta?.settings?.relations || []).map((relation) => ({ value: relation.key, label: relationLabel(t, relation), color: relation.color }));

  return (
    <Drawer
      open={open}
      onClose={() => onClose(null)}
      width={820}
      destroyOnHidden
      title={company ? t('companies.editCompany') : t('companies.newCompany')}
      className="cmp-drawer"
      footer={
        <div className="cmp-drawer__foot">
          <Button onClick={() => onClose(null)}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} onClick={() => submit(false)}>{company ? t('common.save') : t('companies.create')}</Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false} className="cmp-form" initialValues={EMPTY}>
        <section className="cmp-lookup">
          <div className="cmp-lookup__row">
            <Form.Item name="country" label={<HintLabel id="companies.country">{t('companies.f.country')}</HintLabel>} className="cmp-lookup__country">
              <Select options={countryOptions} showSearch optionFilterProp="label" onChange={() => setRegistry(null)} />
            </Form.Item>
            {primary && (
              <Form.Item
                name={['ids', primary.key]}
                label={<HintLabel id="companies.primaryId">{primary.label[locale] || primary.label.en}</HintLabel>}
                extra={primary.hint ? primary.hint[locale] || primary.hint.en : null}
                className="cmp-lookup__id"
                rules={primary.pattern ? [{ pattern: new RegExp(primary.pattern), message: t('companies.invalidId') }] : []}
              >
                <Input size="large" placeholder={primary.hint ? primary.hint[locale] : ''} inputMode="numeric" onPressEnter={profile?.registry ? lookup : undefined} />
              </Form.Item>
            )}
            {profile?.registry && (
              <Button type="primary" size="large" className="cmp-lookup__btn" loading={looking} onClick={lookup} icon={<DownloadOutlined />}>
                {t('companies.fillFromRegistry')}
              </Button>
            )}
          </div>
          <div className="cmp-lookup__hint">
            {profile?.registry
              ? t('companies.registryHint', { source: profile.registry.name?.[locale] || profile.registry.name?.en || '' })
              : t('companies.noRegistryHint')}
            {country === 'RU' && !meta?.integrations?.dadata && <span> {t('companies.dadataHint')}</span>}
          </div>
          {registry && (
            <Alert
              type="success"
              showIcon
              className="cmp-lookup__ok"
              message={t('companies.loadedBanner', { source: registry.sourceName, date: formatDate(registry.checkedAt, locale) })}
              description={registry.documentId ? `📎 ${t('companies.extractAttached', { name: registry.documentName })}` : null}
            />
          )}
          {duplicates.length > 0 && (
            <Alert
              type="warning"
              showIcon
              className="cmp-lookup__dup"
              message={<HintLabel id="companies.duplicates">{t('companies.duplicateTitle')}</HintLabel>}
              description={
                <div className="cmp-dups">
                  {duplicates.map((item) => (
                    <Link key={item.id} to={`/app/companies/c/${item.id}`} onClick={() => onClose(null)}>
                      {item.name}{item.archived ? ` · ${t('companies.archived')}` : ''} →
                    </Link>
                  ))}
                  <Button size="small" onClick={() => submit(true)}>{t('companies.createAnyway')}</Button>
                </div>
              }
            />
          )}
        </section>

        <Collapse
          ghost
          defaultActiveKey={['main', 'registration', 'management', 'addresses', 'contacts']}
          className="cmp-sections"
          items={[
            {
              key: 'main',
              label: t('companies.section.main'),
              children: (
                <div className="cmp-grid">
                  <Form.Item name="name" label={t('companies.f.name')} rules={[{ required: true, message: t('companies.required') }]} className="is-wide">
                    <Input size="large" placeholder={t('companies.namePlaceholder')} />
                  </Form.Item>
                  <Form.Item name="full_name" label={t('companies.f.full_name')} className="is-wide">
                    <Input />
                  </Form.Item>
                  {country !== 'RU' && (
                    <Form.Item name="local_name" label={`${t('companies.f.local_name')}${profile?.localLanguage ? ` (${profile.localLanguage[locale]})` : ''}`} className="is-wide">
                      <Input />
                    </Form.Item>
                  )}
                  <Form.Item name="legal_form" label={t('companies.f.legal_form')}>
                    <AutoComplete options={(profile?.forms || []).map((value) => ({ value }))} filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())} />
                  </Form.Item>
                  <Form.Item name="kind" label={t('companies.f.kind')}>
                    <Select options={['legal', 'individual', 'branch', 'government', 'other'].map((value) => ({ value, label: t(`companies.kind.${value}`) }))} />
                  </Form.Item>
                  <Form.Item name="relations" label={<HintLabel id="companies.relations">{t('companies.f.relations')}</HintLabel>} className="is-wide">
                    <Select
                      mode="multiple"
                      allowClear
                      options={relationOptions}
                      tagRender={({ value, closable, onClose: close }) => {
                        const option = relationOptions.find((item) => item.value === value);
                        return (
                          <Tag closable={closable} onClose={close} color={option?.color} bordered={false} style={{ marginInlineEnd: 4 }}>
                            {option?.label || value}
                          </Tag>
                        );
                      }}
                    />
                  </Form.Item>
                  <Form.Item name="owner_id" label={<HintLabel id="companies.owner">{t('companies.f.owner')}</HintLabel>}>
                    <Select allowClear showSearch optionFilterProp="label" options={staff.map((user) => ({ value: user.id, label: user.name }))} placeholder={t('companies.nobody')} />
                  </Form.Item>
                  <Form.Item name="tags" label={t('companies.f.tags')}>
                    <Select mode="tags" tokenSeparators={[',']} placeholder={t('companies.tagsPlaceholder')} />
                  </Form.Item>
                  <Form.Item name="industry" label={t('companies.f.industry')}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="employees" label={t('companies.f.employees')}>
                    <Select allowClear options={['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+'].map((value) => ({ value, label: value }))} />
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'registration',
              label: t('companies.section.registration'),
              children: (
                <div className="cmp-grid">
                  {(profile?.ids || []).filter((item) => item !== primary).map((item) => (
                    <Form.Item key={item.key} name={['ids', item.key]} label={item.label[locale] || item.label.en} rules={item.pattern ? [{ pattern: new RegExp(item.pattern), message: t('companies.invalidId') }] : []}>
                      <Input />
                    </Form.Item>
                  ))}
                  <Form.Item name="status" label={t('companies.f.status')}>
                    <Select options={['active', 'liquidating', 'reorganizing', 'liquidated', 'unknown'].map((value) => ({ value, label: t(`companies.status.${value}`) }))} />
                  </Form.Item>
                  <Form.Item name="registered_on" label={t('companies.f.registered_on')} {...dateProps}>
                    <DateField style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="closed_on" label={t('companies.f.closed_on')} {...dateProps}>
                    <DateField style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="founders_count" label={t('companies.f.founders_count')}>
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="registering_authority" label={t('companies.f.registering_authority')} className="is-wide">
                    <Input />
                  </Form.Item>
                  <Form.Item name="activity_code" label={t(country === 'RU' ? 'companies.f.okved' : 'companies.f.activity_code')}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="activity" label={t('companies.f.activity')} className="is-wide">
                    <Input />
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'management',
              label: t('companies.section.management'),
              children: (
                <div className="cmp-grid">
                  <Form.Item name="director_name" label={t('companies.f.director_name')}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="director_title" label={t('companies.f.director_title')}>
                    <AutoComplete options={['Директор', 'Генеральный директор', 'Руководитель', 'Президент', 'Председатель правления', 'Управляющий'].map((value) => ({ value }))} />
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'addresses',
              label: t('companies.section.addresses'),
              children: (
                <div className="cmp-grid">
                  <Form.Item name="legal_address" label={t('companies.f.legal_address')} className="is-wide">
                    <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
                  </Form.Item>
                  <Form.Item
                    name="actual_address"
                    label={
                      <span className="cmp-label-action">
                        {t('companies.f.actual_address')}
                        <button type="button" onClick={() => form.setFieldValue('actual_address', form.getFieldValue('legal_address'))}>{t('companies.sameAsLegal')}</button>
                      </span>
                    }
                    className="is-wide"
                  >
                    <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'contacts',
              label: t('companies.section.contacts'),
              children: (
                <div className="cmp-grid">
                  <Form.Item label={t('companies.f.phones')} className="is-wide">
                    <ContactRows name="phones" type="tel" placeholder={profile?.phoneCode ? `${profile.phoneCode} …` : '+…'} labelPlaceholder={t('companies.phoneLabel')} addText={t('companies.addPhone')} />
                  </Form.Item>
                  <Form.Item label={t('companies.f.emails')} className="is-wide">
                    <ContactRows name="emails" type="email" placeholder="info@company.com" labelPlaceholder={t('companies.emailLabel')} addText={t('companies.addEmail')} />
                  </Form.Item>
                  <Form.Item name="website" label={t('companies.f.website')}>
                    <Input placeholder="company.com" />
                  </Form.Item>
                  <Form.Item name={['messengers', 'telegram']} label="Telegram">
                    <Input placeholder="@company" />
                  </Form.Item>
                  <Form.Item name={['messengers', 'whatsapp']} label="WhatsApp">
                    <Input placeholder={profile?.phoneCode || '+'} />
                  </Form.Item>
                  {country === 'CN' && (
                    <Form.Item name={['messengers', 'wechat']} label="WeChat">
                      <Input />
                    </Form.Item>
                  )}
                </div>
              ),
            },
            {
              key: 'bank',
              label: t('companies.section.bank'),
              children: (
                <Form.List name="bank_accounts">
                  {(fields, { add, remove }) => (
                    <div className="cmp-banks">
                      {fields.map((field) => (
                        <div key={field.key} className="cmp-bank">
                          <div className="cmp-grid">
                            <Form.Item name={[field.name, 'bank']} label={t('companies.bank.bank')} className="is-wide">
                              <Input />
                            </Form.Item>
                            <Form.Item name={[field.name, 'account']} label={t('companies.bank.account')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name={[field.name, 'bic']} label={t('companies.bank.bic')}>
                              <Input />
                            </Form.Item>
                            {country === 'RU' && (
                              <Form.Item name={[field.name, 'corr']} label={t('companies.bank.corr')}>
                                <Input />
                              </Form.Item>
                            )}
                            <Form.Item name={[field.name, 'swift']} label="SWIFT">
                              <Input />
                            </Form.Item>
                            <Form.Item name={[field.name, 'currency']} label={t('companies.bank.currency')}>
                              <AutoComplete options={['KGS', 'RUB', 'USD', 'EUR', 'KZT', 'CNY', 'UZS'].map((value) => ({ value }))} />
                            </Form.Item>
                          </div>
                          <Button type="text" danger size="small" onClick={() => remove(field.name)}>{t('common.delete')}</Button>
                        </div>
                      ))}
                      <Button type="dashed" onClick={() => add({ currency: { KG: 'KGS', RU: 'RUB', KZ: 'KZT', UZ: 'UZS', CN: 'CNY' }[country] || 'USD' })} icon={<PlusOutlined />}>{t('companies.addBank')}</Button>
                    </div>
                  )}
                </Form.List>
              ),
            },
            ...(customFields.length
              ? [
                  {
                    key: 'custom',
                    label: t('companies.section.custom'),
                    children: (
                      <div className="cmp-grid">
                        {customFields.map((field) => (
                          <Form.Item key={field.key} name={['custom', field.key]} label={field.label} {...(field.type === 'date' ? dateProps : {})} className={field.type === 'textarea' ? 'is-wide' : ''}>
                            {field.type === 'number' ? (
                              <InputNumber style={{ width: '100%' }} />
                            ) : field.type === 'date' ? (
                              <DateField style={{ width: '100%' }} />
                            ) : field.type === 'select' ? (
                              <Select allowClear options={field.options.map((value) => ({ value, label: value }))} />
                            ) : field.type === 'textarea' ? (
                              <Input.TextArea autoSize={{ minRows: 2 }} />
                            ) : (
                              <Input />
                            )}
                          </Form.Item>
                        ))}
                      </div>
                    ),
                  },
                ]
              : []),
            {
              key: 'notes',
              label: t('companies.section.notes'),
              children: (
                <Form.Item name="notes" noStyle>
                  <Input.TextArea autoSize={{ minRows: 3, maxRows: 12 }} placeholder={t('companies.notesPlaceholder')} />
                </Form.Item>
              ),
            },
          ]}
        />
      </Form>
    </Drawer>
  );
}
