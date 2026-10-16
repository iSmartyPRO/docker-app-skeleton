import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Checkbox, Drawer, Form, Input, InputNumber, Segmented, Select, Switch, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { DateField } from '../../../components/ui/DateTimeField';
import { HintLabel } from '../../../help/Hint';
import { contractsApi } from '../api';
import { useContracts } from '../ContractsContext';
import { typeLabel } from '../lib';
import { UserSelect } from './bits';
import ModuleHint from '../../../components/ModuleHint';

const DRAFT_KEY = (userId) => `ctr_form_draft:${userId || 0}`;
const readDraft = (userId) => {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY(userId)) || 'null');
  } catch {
    return null;
  }
};
const writeDraft = (userId, values) => {
  try {
    if (values) localStorage.setItem(DRAFT_KEY(userId), JSON.stringify(values));
    else localStorage.removeItem(DRAFT_KEY(userId));
  } catch {
    /* storage blocked: the draft lives only in the form */
  }
};

/** Counterparty: a company of Counterparties (search) or plain text. */
function CompanySelect({ id, value, onChange, initialLabel }) {
  const { t } = useLocale();
  const [options, setOptions] = useState(value && initialLabel ? [{ value, label: initialLabel }] : []);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const search = (q) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      contractsApi
        .companies(q)
        .then((res) => setOptions((res.data.companies || []).map((company) => ({ value: company.id, label: company.name, name: company.name }))))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 250);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Select
      id={id}
      showSearch
      allowClear
      value={value ?? undefined}
      placeholder={t('contracts.form.companySearch')}
      filterOption={false}
      onSearch={search}
      onFocus={() => !options.length && search('')}
      loading={loading}
      options={options}
      onChange={(next, option) => onChange?.(next ?? null, option?.name || option?.label || null)}
      notFoundContent={loading ? null : t('contracts.form.companyNone')}
      aria-label={t('contracts.fields.counterparty')}
    />
  );
}

/**
 * Create or edit a contract in one column: the essentials first (title,
 * counterparty, amount), everything else can follow. A new contract may get
 * its file right away; an unfinished new form is kept as a draft.
 */
export default function ContractForm({ open, contract, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { settings, modules, legalEntities, me } = useContracts();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [companyMode, setCompanyMode] = useState('company');
  const [restored, setRestored] = useState(false);
  const editing = Boolean(contract);
  const framework = Form.useWatch('framework', form);
  const autoRenew = Form.useWatch('autoRenew', form);

  const initial = useMemo(() => {
    if (contract) {
      return {
        title: contract.title,
        typeKey: contract.typeKey || undefined,
        direction: contract.direction || 'supplier',
        companyId: contract.companyId || null,
        counterparty: contract.counterparty || '',
        extNumber: contract.extNumber || '',
        legalEntityId: contract.legalEntityId || undefined,
        framework: contract.framework,
        amount: contract.amount,
        currency: contract.currency || settings.defaultCurrency,
        paymentTerms: contract.paymentTerms || '',
        concludedOn: contract.concludedOn,
        startsOn: contract.startsOn,
        endsOn: contract.endsOn,
        autoRenew: contract.autoRenew,
        noticeDays: contract.noticeDays,
        lawyerId: contract.lawyer?.id || null,
        ownerId: contract.owner?.id || null,
        description: contract.description || '',
      };
    }
    return {
      direction: 'supplier',
      currency: settings.defaultCurrency || 'KGS',
      legalEntityId: legalEntities.find((entity) => entity.isDefault)?.id || legalEntities[0]?.id,
      ownerId: user?.id,
      // A lawyer creating a contract handles it.
      lawyerId: me.isLegal ? user?.id : null,
      framework: false,
      autoRenew: false,
    };
  }, [contract, settings.defaultCurrency, legalEntities, user?.id, me.isLegal]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setFile(null);
    setRestored(false);
    const draft = !editing ? readDraft(user?.id) : null;
    form.setFieldsValue(draft ? { ...initial, ...draft } : initial);
    if (draft) setRestored(true);
    setCompanyMode(modules.companies && (!editing || contract.companyId || !contract.counterparty) ? 'company' : 'text');
  }, [open, initial, editing, form, user?.id, modules.companies, contract]);

  const saveDraft = useRef(null);
  const onValuesChange = (_, all) => {
    if (editing) return;
    clearTimeout(saveDraft.current);
    saveDraft.current = setTimeout(() => writeDraft(user?.id, all), 400);
  };

  const submit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const payload = { ...values };
    if (companyMode === 'text' || !modules.companies) payload.companyId = null;
    if (payload.framework) payload.amount = null;
    if (!payload.autoRenew) payload.noticeDays = null;
    setBusy(true);
    try {
      if (editing) {
        const res = await contractsApi.update(contract.id, payload);
        message.success(t('contracts.form.saved'));
        onClose(res.data);
      } else {
        const res = await contractsApi.create(payload);
        writeDraft(user?.id, null);
        if (file) {
          try {
            await contractsApi.upload(res.data.contract.id, file, { comment: t('contracts.versions.firstComment') });
          } catch (err) {
            message.warning(`${t('contracts.versions.uploadFailed')}: ${errorMessage(err)}`);
          }
        }
        message.success(t('contracts.form.created', { number: res.data.contract.number }));
        onClose(res.data);
      }
    } catch (err) {
      const field = err.response?.data?.info?.field;
      if (field) form.setFields([{ name: field, errors: [errorMessage(err)] }]);
      else message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const currencies = settings.currencies?.length ? settings.currencies : ['KGS', 'USD', 'RUB'];

  return (
    <Drawer
      open={open}
      onClose={() => onClose(null)}
      width={560}
      title={editing ? t('contracts.form.editTitle', { number: contract.number }) : t('contracts.form.newTitle')}
      destroyOnClose
      className="ctr-form-drawer"
      footer={
        <div className="ctr-form-foot">
          {!editing && restored && (
            <button
              type="button"
              className="ctr-link-btn"
              onClick={() => {
                writeDraft(user?.id, null);
                form.resetFields();
                form.setFieldsValue(initial);
                setRestored(false);
              }}
            >
              {t('contracts.form.clearDraft')}
            </button>
          )}
          <span className="ctr-grow" />
          <Button onClick={() => onClose(null)}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} onClick={submit}>
            {editing ? t('common.save') : t('contracts.form.create')}
          </Button>
        </div>
      }
    >
      {!editing && restored && <div className="ctr-form-note">{t('contracts.form.draftRestored')}</div>}
      <Form form={form} layout="vertical" onValuesChange={onValuesChange} className="ctr-form">
        <Form.Item name="title" label={t('contracts.fields.title')} rules={[{ required: true, whitespace: true, message: t('contracts.form.titleRequired') }]}>
          <Input maxLength={300} placeholder={t('contracts.form.titlePh')} autoFocus />
        </Form.Item>

        <Form.Item label={t('contracts.fields.counterparty')} className="ctr-form__cp">
          {modules.companies && (
            <Segmented
              size="small"
              value={companyMode}
              onChange={setCompanyMode}
              options={[
                { value: 'company', label: t('contracts.form.fromCompanies') },
                { value: 'text', label: t('contracts.form.asText') },
              ]}
              className="ctr-form__cp-mode"
            />
          )}
          {modules.companies && companyMode === 'company' ? (
            <Form.Item name="companyId" noStyle>
              <CompanySelect initialLabel={contract?.counterparty} onChange={(id, name) => form.setFieldsValue({ companyId: id, counterparty: name || '' })} />
            </Form.Item>
          ) : (
            <Form.Item name="counterparty" noStyle>
              <Input maxLength={300} placeholder={t('contracts.form.counterpartyPh')} />
            </Form.Item>
          )}
          <ModuleHint module="companies" what={t('platform.hintWhat.contractsCounterparty')} />
        </Form.Item>
        {modules.companies && companyMode === 'company' && (
          <Form.Item name="counterparty" hidden>
            <Input />
          </Form.Item>
        )}

        <div className="ctr-form__row">
          <Form.Item name="amount" label={t('contracts.fields.amount')} className="ctr-grow">
            <InputNumber min={0} style={{ width: '100%' }} disabled={framework} placeholder={framework ? t('contracts.fields.frameworkShort') : '0'} />
          </Form.Item>
          <Form.Item name="currency" label={t('contracts.fields.currency')}>
            <Select options={currencies.map((code) => ({ value: code, label: code }))} style={{ width: 96 }} />
          </Form.Item>
        </div>
        <Form.Item name="framework" valuePropName="checked" className="ctr-form__inline">
          <Checkbox>
            <HintLabel id="contracts.framework">{t('contracts.fields.framework')}</HintLabel>
          </Checkbox>
        </Form.Item>

        {!editing && (
          <Form.Item label={t('contracts.form.file')} extra={t('contracts.form.fileHint')}>
            <Upload.Dragger
              maxCount={1}
              beforeUpload={(next) => {
                setFile(next);
                return false;
              }}
              onRemove={() => setFile(null)}
              fileList={file ? [{ uid: 'f', name: file.name, status: 'done' }] : []}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">{t('contracts.versions.drop')}</p>
            </Upload.Dragger>
          </Form.Item>
        )}

        <div className="ctr-form__section">{t('contracts.form.details')}</div>
        <div className="ctr-form__row">
          <Form.Item name="typeKey" label={t('contracts.fields.type')} className="ctr-grow">
            <Select allowClear options={(settings.types || []).map((type) => ({ value: type.key, label: typeLabel(settings, type.key, t) }))} placeholder={t('contracts.form.typePh')} />
          </Form.Item>
          <Form.Item name="direction" label={t('contracts.fields.direction')}>
            <Segmented options={[{ value: 'supplier', label: t('contracts.direction.supplier') }, { value: 'client', label: t('contracts.direction.client') }]} />
          </Form.Item>
        </div>
        <div className="ctr-form__row">
          <Form.Item name="legalEntityId" label={t('contracts.fields.legalEntity')} className="ctr-grow">
            <Select allowClear options={legalEntities.map((entity) => ({ value: entity.id, label: entity.label || entity.name }))} placeholder="—" />
          </Form.Item>
          <Form.Item name="extNumber" label={t('contracts.fields.extNumber')} className="ctr-grow">
            <Input maxLength={80} placeholder={t('contracts.form.extNumberPh')} />
          </Form.Item>
        </div>
        <Form.Item name="paymentTerms" label={t('contracts.fields.paymentTerms')}>
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={1000} placeholder={t('contracts.form.paymentTermsPh')} />
        </Form.Item>

        <div className="ctr-form__section">{t('contracts.form.dates')}</div>
        <div className="ctr-form__row ctr-form__row--3">
          <Form.Item name="concludedOn" label={t('contracts.fields.concludedOn')}>
            <DateField style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="startsOn" label={t('contracts.fields.startsOn')}>
            <DateField style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="endsOn"
            label={t('contracts.fields.endsOn')}
            dependencies={['startsOn']}
            rules={[
              ({ getFieldValue }) => ({
                validator: (_, value) => (!value || !getFieldValue('startsOn') || value >= getFieldValue('startsOn') ? Promise.resolve() : Promise.reject(new Error(t('contracts.form.endBeforeStart')))),
              }),
            ]}
          >
            <DateField style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <div className="ctr-form__row ctr-form__row--center">
          <Form.Item name="autoRenew" valuePropName="checked" label={<HintLabel id="contracts.autoRenew">{t('contracts.fields.autoRenew')}</HintLabel>}>
            <Switch />
          </Form.Item>
          {autoRenew && (
            <Form.Item name="noticeDays" label={<HintLabel id="contracts.noticeDays">{t('contracts.fields.noticeDays')}</HintLabel>} className="ctr-grow">
              <InputNumber min={0} max={3650} addonAfter={t('contracts.form.days')} style={{ width: '100%' }} />
            </Form.Item>
          )}
        </div>

        <div className="ctr-form__section">{t('contracts.form.people')}</div>
        <div className="ctr-form__row">
          <Form.Item name="ownerId" label={t('contracts.fields.owner')} className="ctr-grow">
            <UserSelect placeholder="—" />
          </Form.Item>
          <Form.Item name="lawyerId" label={t('contracts.fields.lawyer')} className="ctr-grow">
            <UserSelect placeholder="—" />
          </Form.Item>
        </div>
        <Form.Item name="description" label={t('contracts.fields.description')}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} maxLength={5000} />
        </Form.Item>
        {!me.canCreate && !editing && <div className="ctr-form-note is-warn">{t('contracts.form.noRight')}</div>}
      </Form>
    </Drawer>
  );
}
