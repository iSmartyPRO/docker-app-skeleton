import { useEffect, useState } from 'react';
import { App, AutoComplete, Button, Drawer, Form, Input, Select, Switch } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { DateField } from '../../../components/ui/DateTimeField';
import { errorMessage } from '../../../lib/errors';
import { cmpApi } from '../api';
import { useCompanies } from '../CompaniesContext';
import { CompanyPicker } from './pickers';
import { HintLabel } from '../../../help/Hint';
import { localeTag, pick } from '../../../i18n/languages';

// Dates here are calendar days ('YYYY-MM-DD'): DateField edits them without any zone shift.
const dateProps = {
  getValueProps: (value) => ({ value: value ? String(value).slice(0, 10) : null }),
};

/** Job title suggestions (free text is stored as typed), in the person's language. */
const TITLES = {
  ru: ['Директор', 'Генеральный директор', 'Заместитель директора', 'Главный бухгалтер', 'Бухгалтер', 'Менеджер', 'Менеджер по закупкам', 'Менеджер по продажам', 'Руководитель отдела', 'Юрист', 'Инженер', 'Специалист', 'Ассистент'],
  en: ['Director', 'Chief executive', 'Deputy director', 'Chief accountant', 'Accountant', 'Manager', 'Purchasing manager', 'Sales manager', 'Head of department', 'Lawyer', 'Engineer', 'Specialist', 'Assistant'],
  ky: ['Директор', 'Башкы директор', 'Директордун орун басары', 'Башкы бухгалтер', 'Бухгалтер', 'Менеджер', 'Сатып алуулар боюнча менеджер', 'Сатуу менеджери', 'Бөлүм башчысы', 'Юрист', 'Инженер', 'Адис', 'Жардамчы'],
  tr: ['Direktör', 'Genel müdür', 'Müdür yardımcısı', 'Mali işler müdürü', 'Muhasebeci', 'Yönetici', 'Satın alma uzmanı', 'Satış temsilcisi', 'Departman müdürü', 'Hukukçu', 'Mühendis', 'Uzman', 'Asistan'],
  zh: ['总监', '总经理', '副总经理', '总会计师', '会计', '经理', '采购经理', '销售代表', '部门负责人', '律师', '工程师', '专员', '助理'],
};
export const titleOptions = (locale) => pick(TITLES, locale).map((value) => ({ value }));

/** Labels suggested for phones and e-mails. */
const CONTACT_LABELS = {
  ru: ['рабочий', 'мобильный', 'личный'],
  en: ['work', 'mobile', 'personal'],
  ky: ['жумушчу', 'мобилдик', 'жеке'],
  tr: ['iş', 'cep', 'kişisel'],
  zh: ['工作', '手机', '个人'],
};

/** Languages a contact speaks: names in the person's language (Intl), capitalised where the script has case. */
const SPOKEN = ['ru', 'ky', 'en', 'kk', 'zh', 'tr'];
function languageOptions(locale) {
  let names = null;
  try {
    names = new Intl.DisplayNames([localeTag(locale)], { type: 'language' });
  } catch {
    names = null;
  }
  return SPOKEN.map((code) => {
    const name = names?.of(code) || code;
    return { value: name.charAt(0).toLocaleUpperCase(localeTag(locale)) + name.slice(1) };
  });
}

function Rows({ name, placeholder, add, type }) {
  const { locale } = useLocale();
  return (
    <Form.List name={name}>
      {(fields, { add: push, remove }) => (
        <div className="cmp-rows">
          {fields.map((field) => (
            <div key={field.key} className="cmp-rows__row">
              <Form.Item name={[field.name, 'value']} noStyle>
                <Input placeholder={placeholder} type={type} />
              </Form.Item>
              <Form.Item name={[field.name, 'label']} noStyle>
                <AutoComplete className="cmp-rows__label" options={pick(CONTACT_LABELS, locale).map((value) => ({ value }))} />
              </Form.Item>
              <Button type="text" onClick={() => remove(field.name)}>✕</Button>
            </div>
          ))}
          <Button type="dashed" size="small" onClick={() => push({ value: '', label: '' })}>+ {add}</Button>
        </div>
      )}
    </Form.List>
  );
}

/** Create or edit a contact person; a new person can be placed in a company right away. */
export default function PersonForm({ open, person, companyId, onClose }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { meta, staff } = useCompanies();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      person
        ? { ...person, owner_id: person.owner?.id || null }
        : { phones: [{ value: '', label: '' }], emails: [{ value: '', label: '' }], messengers: {}, position: companyId ? { companyId, isPrimary: true } : {} }
    );
  }, [open, person, companyId, form]);

  const submit = async () => {
    const values = await form.validateFields();
    values.phones = (values.phones || []).filter((item) => item?.value);
    values.emails = (values.emails || []).filter((item) => item?.value);
    if (!values.position?.companyId) delete values.position;
    setBusy(true);
    try {
      const { data } = person ? await cmpApi.updatePerson(person.id, values) : await cmpApi.createPerson(values);
      message.success(person ? t('common.saved') : t('companies.personCreated'));
      onClose(data.person);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const countryOptions = Object.entries(meta?.countries || {})
    .filter(([code]) => code !== 'OTHER')
    .map(([code, profile]) => ({ value: code, label: `${profile.flag}  ${profile.name[locale] || profile.name.en}` }));
  const customFields = (meta?.settings?.customFields || []).filter((field) => field.entity === 'person');

  return (
    <Drawer
      open={open}
      onClose={() => onClose(null)}
      width={680}
      destroyOnHidden
      title={person ? t('companies.editPerson') : t('companies.newPerson')}
      className="cmp-drawer"
      footer={
        <div className="cmp-drawer__foot">
          <Button onClick={() => onClose(null)}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} onClick={submit}>{person ? t('common.save') : t('companies.create')}</Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false} className="cmp-form">
        <div className="cmp-grid cmp-grid--3">
          <Form.Item name="last_name" label={t('companies.p.last_name')}>
            <Input size="large" autoFocus />
          </Form.Item>
          <Form.Item name="first_name" label={t('companies.p.first_name')} rules={[{ required: true, message: t('companies.required') }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="middle_name" label={t('companies.p.middle_name')}>
            <Input size="large" />
          </Form.Item>
        </div>

        {!person && (
          <section className="cmp-subcard">
            <h4>{t('companies.workplace')}</h4>
            <div className="cmp-grid">
              <Form.Item name={['position', 'companyId']} label={t('companies.f.company')} className="is-wide">
                <CompanyPicker />
              </Form.Item>
              <Form.Item name={['position', 'title']} label={t('companies.p.title')}>
                <AutoComplete options={titleOptions(locale)} filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())} />
              </Form.Item>
              <Form.Item name={['position', 'department']} label={t('companies.p.department')}>
                <Input />
              </Form.Item>
              <Form.Item name={['position', 'startedOn']} label={t('companies.p.startedOn')} {...dateProps}>
                <DateField style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name={['position', 'isDecisionMaker']} valuePropName="checked" label={<HintLabel id="companies.decisionMaker">{t('companies.p.decisionMaker')}</HintLabel>}>
                <Switch />
              </Form.Item>
            </div>
          </section>
        )}

        <div className="cmp-grid">
          <Form.Item label={t('companies.f.phones')} className="is-wide">
            <Rows name="phones" type="tel" placeholder="+996 …" add={t('companies.addPhone')} />
          </Form.Item>
          <Form.Item label={t('companies.f.emails')} className="is-wide">
            <Rows name="emails" type="email" placeholder="name@company.com" add={t('companies.addEmail')} />
          </Form.Item>
          <Form.Item name={['messengers', 'telegram']} label="Telegram">
            <Input placeholder="@username" />
          </Form.Item>
          <Form.Item name={['messengers', 'whatsapp']} label="WhatsApp">
            <Input placeholder="+996 …" />
          </Form.Item>
          <Form.Item name={['messengers', 'linkedin']} label="LinkedIn">
            <Input />
          </Form.Item>
          <Form.Item name="birthday" label={t('companies.p.birthday')} {...dateProps}>
            <DateField style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="gender" label={t('companies.p.gender')}>
            <Select allowClear options={[{ value: 'm', label: t('companies.p.male') }, { value: 'f', label: t('companies.p.female') }]} />
          </Form.Item>
          <Form.Item name="country" label={t('companies.f.country')}>
            <Select allowClear showSearch optionFilterProp="label" options={countryOptions} />
          </Form.Item>
          <Form.Item name="city" label={t('companies.p.city')}>
            <Input />
          </Form.Item>
          <Form.Item name="languages" label={t('companies.p.languages')}>
            <Select mode="tags" options={languageOptions(locale)} />
          </Form.Item>
          <Form.Item name="owner_id" label={t('companies.f.owner')}>
            <Select allowClear showSearch optionFilterProp="label" options={staff.map((user) => ({ value: user.id, label: user.name }))} placeholder={t('companies.nobody')} />
          </Form.Item>
          <Form.Item name="tags" label={t('companies.f.tags')}>
            <Select mode="tags" tokenSeparators={[',']} />
          </Form.Item>
          {customFields.map((field) => (
            <Form.Item key={field.key} name={['custom', field.key]} label={field.label} {...(field.type === 'date' ? dateProps : {})}>
              {field.type === 'date' ? <DateField style={{ width: '100%' }} /> : field.type === 'select' ? <Select allowClear options={field.options.map((value) => ({ value, label: value }))} /> : <Input />}
            </Form.Item>
          ))}
          <Form.Item name="notes" label={t('companies.section.notes')} className="is-wide">
            <Input.TextArea autoSize={{ minRows: 3 }} />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
