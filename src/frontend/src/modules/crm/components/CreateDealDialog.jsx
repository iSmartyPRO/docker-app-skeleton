import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { App, DatePicker, Form, Input, InputNumber, Modal, Select, Space } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import { openStages } from '../lib';
import ClientPicker, { clientPayload } from './ClientPicker';
import { FieldInput } from './fields';
import UserSelect from './UserSelect';

/**
 * New deal. `open` = { pipelineId, stageId, quick } or null. Quick mode asks
 * for the title, amount and client only; the full one adds the owner, close
 * date, source and the custom fields of the «О сделке» section.
 */
export default function CreateDealDialog({ open, onClose }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { message } = App.useApp();
  const { pipelines, settings, defaultPipeline, pipelineById } = useCrm();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const pipelineId = Form.useWatch('pipelineId', form);
  const currency = Form.useWatch('currency', form);
  const quick = Boolean(open?.quick);
  const pipeline = pipelineById(pipelineId) || defaultPipeline;
  const stages = openStages(pipeline);
  const aboutFields = useMemo(() => (settings.fields || []).filter((field) => (field.section || 'about') === 'about'), [settings.fields]);

  useEffect(() => {
    if (!open) return;
    const start = pipelineById(open.pipelineId) || defaultPipeline;
    form.resetFields();
    form.setFieldsValue({
      pipelineId: start?.id,
      stageId: open.stageId || openStages(start)[0]?.id,
      currency: settings.currency || 'KGS',
      ownerId: user.id,
      custom: {},
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    try {
      const { client, closeDate, custom, ...rest } = values;
      const res = await crmApi.createDeal({
        ...rest,
        amount: rest.amount || 0,
        ...clientPayload(client),
        closeDate: closeDate ? closeDate.format('YYYY-MM-DD') : null,
        custom: custom || {},
      });
      message.success(t('crm.create.done', { title: res.data.deal.title }));
      onClose(res.data.deal);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(open)}
      title={quick ? t('crm.create.quickTitle') : t('crm.create.title')}
      okText={t('common.create')}
      cancelText={t('common.cancel')}
      onOk={submit}
      confirmLoading={busy}
      onCancel={() => onClose(null)}
      width={quick ? 460 : 620}
      destroyOnHidden
      className="crm-create-dialog"
    >
      <Form form={form} layout="vertical" requiredMark={false} preserve={false} onFinish={submit}>
        {!quick && pipelines.length > 0 && (
          <div className="form-grid-2">
            <Form.Item name="pipelineId" label={t('crm.pipeline')}>
              <Select
                options={pipelines.map((item) => ({ value: item.id, label: <span className="status-option"><span className="mod-dot" style={{ '--c': item.color }} />{item.name}</span> }))}
                onChange={(id) => form.setFieldsValue({ stageId: openStages(pipelineById(id))[0]?.id })}
              />
            </Form.Item>
            <Form.Item name="stageId" label={t('crm.fields.stage')}>
              <Select options={stages.map((stage) => ({ value: stage.id, label: <span className="status-option"><span className="status-pip" style={{ '--c': stage.color }} />{stage.name}</span> }))} />
            </Form.Item>
          </div>
        )}
        {quick && (
          <>
            <Form.Item name="pipelineId" hidden><Input /></Form.Item>
            <Form.Item name="stageId" hidden><Input /></Form.Item>
          </>
        )}
        <Form.Item name="title" label={t('crm.fields.title')} rules={[{ required: true, whitespace: true, message: t('crm.create.titleRequired') }]}>
          <Input autoFocus maxLength={300} placeholder={t('crm.create.titlePlaceholder')} />
        </Form.Item>
        <Form.Item label={t('crm.fields.amount')}>
          <Space.Compact block>
            <Form.Item name="amount" noStyle>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
            <Form.Item name="currency" noStyle>
              <Select style={{ width: 96 }} options={(settings.currencies || ['KGS']).map((code) => ({ value: code, label: code }))} aria-label={t('crm.fields.currency')} />
            </Form.Item>
          </Space.Compact>
        </Form.Item>
        <Form.Item name="client" label={t('crm.fields.client')}>
          <ClientPicker />
        </Form.Item>
        {!quick && (
          <>
            <div className="form-grid-2">
              <Form.Item name="ownerId" label={t('crm.fields.owner')}>
                <UserSelect allowClear={false} />
              </Form.Item>
              <Form.Item name="closeDate" label={t('crm.fields.closeDate')}>
                <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} disabledDate={(date) => date.isBefore(dayjs().subtract(1, 'year'))} />
              </Form.Item>
            </div>
            <Form.Item name="source" label={t('crm.fields.source')}>
              <Select allowClear options={(settings.sources || []).map((value) => ({ value, label: value }))} placeholder={t('crm.fields.choose')} />
            </Form.Item>
            {aboutFields.map((field) => (
              <Form.Item
                key={field.key}
                name={['custom', field.key]}
                label={field.label}
                valuePropName={field.type === 'bool' ? 'checked' : 'value'}
                rules={field.required ? [{ required: true, message: t('common.required') }] : []}
              >
                <FieldProxy field={field} currency={currency} />
              </Form.Item>
            ))}
          </>
        )}
      </Form>
    </Modal>
  );
}

/** antd Form passes value/checked + onChange; FieldInput wants value + onChange. */
function FieldProxy({ field, value, checked, onChange, currency }) {
  return <FieldInput field={field} value={field.type === 'bool' ? checked : value} onChange={onChange} currency={currency} />;
}
