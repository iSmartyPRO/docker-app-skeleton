import { useEffect, useState } from 'react';
import { App, AutoComplete, DatePicker, Form, Input, Modal, Radio, Switch } from 'antd';
import dayjs from 'dayjs';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { cmpApi } from '../api';
import { CompanyPicker } from './pickers';
import { TITLES } from './PersonForm';
import { HintLabel } from '../../../help/Hint';

const dateProps = {
  getValueProps: (value) => ({ value: value ? dayjs(value) : null }),
  normalize: (value) => (value ? value.format('YYYY-MM-DD') : null),
};

function JobFields({ prefix = [], withCompany = true, excludeId }) {
  const { t } = useLocale();
  return (
    <div className="cmp-grid">
      {withCompany && (
        <Form.Item name={[...prefix, 'companyId']} label={t('companies.f.company')} className="is-wide" rules={[{ required: true, message: t('companies.required') }]}>
          <CompanyPicker excludeId={excludeId} />
        </Form.Item>
      )}
      <Form.Item name={[...prefix, 'title']} label={t('companies.p.title')}>
        <AutoComplete options={TITLES.map((value) => ({ value }))} filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())} />
      </Form.Item>
      <Form.Item name={[...prefix, 'department']} label={t('companies.p.department')}>
        <Input />
      </Form.Item>
      <Form.Item name={[...prefix, 'startedOn']} label={t('companies.p.startedOn')} {...dateProps}>
        <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name={[...prefix, 'isDecisionMaker']} valuePropName="checked" label={<HintLabel id="companies.decisionMaker">{t('companies.p.decisionMaker')}</HintLabel>}>
        <Switch />
      </Form.Item>
      <Form.Item name={[...prefix, 'workPhone']} label={t('companies.p.workPhone')}>
        <Input />
      </Form.Item>
      <Form.Item name={[...prefix, 'workEmail']} label={t('companies.p.workEmail')}>
        <Input />
      </Form.Item>
    </div>
  );
}

/** Add a job to a person, or edit an existing one. */
export function JobDialog({ open, personId, position, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (position) form.setFieldsValue({ ...position });
    }
  }, [open, position, form]);
  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const { data } = position ? await cmpApi.updatePosition(position.id, values) : await cmpApi.addPosition(personId, values);
      onClose(data.person);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} title={position ? t('companies.editJob', { company: position.companyName }) : t('companies.addJob')} onCancel={() => onClose(null)} onOk={submit} okText={t('common.save')} cancelText={t('common.cancel')} confirmLoading={busy} width={640} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} className="cmp-form">
        <JobFields withCompany={!position} />
        {position && !position.current && (
          <Form.Item name="endedOn" label={t('companies.p.endedOn')} {...dateProps}>
            <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

const REASONS = ['resigned', 'moved', 'dismissed', 'reorganized', 'retired', 'other'];

/**
 * The person leaves a company. The job stays in their career history;
 * optionally they move on to another company in the same step.
 */
export function LeaveDialog({ open, position, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const next = Form.useWatch('next', form);
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ endedOn: dayjs().format('YYYY-MM-DD'), reasonKey: 'resigned', next: 'none' });
    }
  }, [open, form]);
  const submit = async () => {
    const values = await form.validateFields();
    const reason = values.reasonKey === 'other' ? values.reason : [t(`companies.reason.${values.reasonKey}`), values.reason].filter(Boolean).join('. ');
    setBusy(true);
    try {
      const { data } = await cmpApi.endPosition(position.id, {
        endedOn: values.endedOn,
        reason,
        to: values.next === 'company' ? values.to : undefined,
      });
      message.success(values.next === 'company' ? t('companies.moved') : t('companies.left'));
      onClose(data.person);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  if (!position) return null;
  return (
    <Modal open={open} title={t('companies.leaveTitle', { company: position.companyName })} onCancel={() => onClose(null)} onOk={submit} okText={t('common.save')} cancelText={t('common.cancel')} confirmLoading={busy} width={640} destroyOnHidden>
      <p className="cmp-muted">{t('companies.leaveLead')}</p>
      <Form form={form} layout="vertical" requiredMark={false} className="cmp-form">
        <div className="cmp-grid">
          <Form.Item name="endedOn" label={t('companies.p.endedOn')} {...dateProps}>
            <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reasonKey" label={t('companies.p.reason')}>
            <Radio.Group optionType="button" size="small" options={REASONS.map((value) => ({ value, label: t(`companies.reason.${value}`) }))} className="cmp-reasons" />
          </Form.Item>
          <Form.Item name="reason" label={t('companies.p.reasonText')} className="is-wide">
            <Input.TextArea autoSize={{ minRows: 1 }} />
          </Form.Item>
        </div>
        <Form.Item name="next" label={<HintLabel id="companies.leaveNext">{t('companies.whereNext')}</HintLabel>}>
          <Radio.Group
            className="cmp-next"
            options={[
              { value: 'none', label: t('companies.nextNone') },
              { value: 'company', label: t('companies.nextCompany') },
            ]}
          />
        </Form.Item>
        {next === 'company' && (
          <section className="cmp-subcard">
            <JobFields prefix={['to']} excludeId={position.companyId} />
          </section>
        )}
      </Form>
    </Modal>
  );
}
