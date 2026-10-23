import { useEffect, useMemo, useState } from 'react';
import { App, Button, DatePicker, Divider, Drawer, Form, Input, Select } from 'antd';
import Segmented from '../../components/ui/Segmented';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLocale } from '../../context/LocaleContext';
import { UnitSelect, useOrg } from '../org/public';
import EmployeePicker from './EmployeePicker';
import { empApi } from './api';
import { useEmp } from './EmpContext';
import { empError } from './lib';

const DATES = ['hireDate', 'terminationDate', 'birthDate'];

export function employeeToForm(employee) {
  if (!employee) return { status: 'active', employment: 'staff' };
  return {
    lastName: employee.lastName,
    firstName: employee.firstName,
    middleName: employee.middleName || '',
    positionId: employee.position?.id || null,
    unitId: employee.unit?.id || null,
    siteId: employee.site?.id || null,
    managerId: employee.manager?.id || null,
    personnelNo: employee.personnelNo || '',
    hireDate: employee.hireDate ? dayjs(employee.hireDate) : null,
    terminationDate: employee.terminationDate ? dayjs(employee.terminationDate) : null,
    birthDate: employee.birthDate ? dayjs(employee.birthDate) : null,
    status: employee.status,
    employment: employee.employment || 'staff',
    workEmail: employee.work?.email || '',
    workPhone: employee.work?.phone || '',
    workMobile: employee.work?.mobile || '',
    workLocation: employee.work?.location || '',
    personalEmail: employee.personal?.email || '',
    personalPhone: employee.personal?.phone || '',
    personalAddress: employee.personal?.address || '',
    emergencyContact: employee.personal?.emergency || '',
    hrNotes: employee.hrNotes || '',
    adAccount: employee.adAccount || '',
  };
}

function toPayload(values) {
  const out = { ...values };
  for (const key of DATES) if (key in out) out[key] = out[key] ? dayjs(out[key]).format('YYYY-MM-DD') : null;
  return out;
}

/**
 * Create / edit an employee card (HR). The person themselves edits only their
 * own contacts (`selfOnly`). Calls onSaved(result) with the server answer.
 */
export default function EmployeeForm({ open, employee, selfOnly = false, onClose, onSaved, defaults }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const { meta, positions, touch } = useEmp();
  const { meta: orgMeta } = useOrg();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [newPosition, setNewPosition] = useState('');
  const siteTypes = useMemo(() => (orgMeta?.types || []).filter((type) => type.site).map((type) => type.key), [orgMeta]);
  const initial = useMemo(() => ({ ...employeeToForm(employee), ...(defaults || {}) }), [employee, defaults]);
  useEffect(() => {
    if (open) form.setFieldsValue(initial);
    if (!open) form.resetFields();
  }, [open, initial, form]);
  const hr = Boolean(meta?.rights?.hr) && !selfOnly;

  const addPosition = async () => {
    const name = newPosition.trim();
    if (!name) return;
    try {
      const res = await empApi.createPosition({ name });
      touch();
      form.setFieldValue('positionId', res.data.position.id);
      setNewPosition('');
    } catch (err) {
      message.error(empError(err, t));
    }
  };

  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const payload = toPayload(values);
      const res = employee ? await empApi.update(employee.id, payload) : await empApi.create(payload);
      message.success(t(employee ? 'common.saved' : 'emp.form.created'));
      touch();
      onSaved?.(res.data);
      if (res.data.offerBlock) offerBlock(res.data.employee);
    } catch (err) {
      message.error(empError(err, t));
      const field = err?.response?.data?.info?.field;
      if (field) form.setFields([{ name: field, errors: [empError(err, t)] }]);
    } finally {
      setBusy(false);
    }
  };

  const offerBlock = (card) => {
    if (!meta?.rights?.manageUsers || !card.user) return;
    modal.confirm({
      title: t('emp.terminate.blockTitle'),
      content: t('emp.terminate.blockText', { user: card.user.username }),
      okText: t('emp.terminate.blockOk'),
      cancelText: t('emp.terminate.keep'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await empApi.blockAccount(card.id, true);
          onSaved?.(res.data);
          message.success(t('emp.account.blocked'));
        } catch (err) {
          message.error(empError(err, t));
        }
      },
    });
  };

  const positionOptions = positions.map((position) => ({ value: position.id, label: position.name }));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={Math.min(640, typeof window !== 'undefined' ? window.innerWidth : 640)}
      title={employee ? (selfOnly ? t('emp.form.editMine') : t('emp.form.edit')) : t('emp.form.new')}
      destroyOnClose
      extra={
        <Button type="primary" loading={busy} onClick={submit}>
          {employee ? t('common.save') : t('emp.form.create')}
        </Button>
      }
    >
      <Form form={form} layout="vertical" initialValues={initial} className="emp-form">
        {!selfOnly && (
          <>
            <div className="emp-form__grid3">
              <Form.Item name="lastName" label={t('emp.fields.lastName')} rules={[{ required: true, whitespace: true, message: t('emp.errors.NAME_REQUIRED') }]}>
                <Input maxLength={80} autoFocus={!employee} />
              </Form.Item>
              <Form.Item name="firstName" label={t('emp.fields.firstName')} rules={[{ required: true, whitespace: true, message: t('emp.errors.NAME_REQUIRED') }]}>
                <Input maxLength={80} />
              </Form.Item>
              <Form.Item name="middleName" label={t('emp.fields.middleName')}>
                <Input maxLength={80} />
              </Form.Item>
            </div>
            <Form.Item name="positionId" label={t('emp.fields.position')}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={positionOptions}
                placeholder={t('emp.fields.positionPlaceholder')}
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    {(meta?.rights?.hr || meta?.rights?.admin) && (
                      <>
                        <Divider style={{ margin: '6px 0' }} />
                        <div className="emp-form__addpos" onMouseDown={(event) => event.stopPropagation()}>
                          <Input size="small" value={newPosition} onChange={(event) => setNewPosition(event.target.value)} placeholder={t('emp.fields.newPosition')} onKeyDown={(event) => event.stopPropagation()} />
                          <Button size="small" type="text" icon={<PlusOutlined />} onClick={addPosition}>
                            {t('emp.fields.addPosition')}
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                )}
              />
            </Form.Item>
            <div className="emp-form__grid2">
              <Form.Item name="unitId" label={t('emp.fields.unit')}>
                <UnitSelect />
              </Form.Item>
              <Form.Item name="siteId" label={t('emp.fields.site')} extra={t('emp.fields.siteHint')}>
                <UnitSelect types={siteTypes.length ? siteTypes : undefined} placeholder={t('emp.fields.sitePlaceholder')} />
              </Form.Item>
            </div>
            <Form.Item name="managerId" label={t('emp.fields.manager')} extra={t('emp.fields.managerHint')}>
              <EmployeePicker exclude={employee ? [employee.id] : []} />
            </Form.Item>
            <div className="emp-form__grid2">
              <Form.Item name="status" label={t('emp.fields.status')}>
                <Select options={(meta?.statuses || []).map((status) => ({ value: status, label: t(`emp.status.${status}`) }))} />
              </Form.Item>
              {hr && (
                <Form.Item name="employment" label={t('emp.fields.employment')}>
                  <Select options={(meta?.employment || []).map((kind) => ({ value: kind, label: t(`emp.employment.${kind}`) }))} />
                </Form.Item>
              )}
            </div>
            {hr && (
              <>
                <h4 className="emp-form__section">{t('emp.sections.hr')}</h4>
                <div className="emp-form__grid2">
                  <Form.Item name="personnelNo" label={t('emp.fields.personnelNo')}>
                    <Input maxLength={40} />
                  </Form.Item>
                  <Form.Item name="birthDate" label={t('emp.fields.birthDate')}>
                    <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="hireDate" label={t('emp.fields.hireDate')}>
                    <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="terminationDate" label={t('emp.fields.terminationDate')}>
                    <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
                  </Form.Item>
                </div>
              </>
            )}
          </>
        )}
        <h4 className="emp-form__section">{t('emp.sections.work')}</h4>
        <div className="emp-form__grid2">
          {!selfOnly && (
            <Form.Item name="workEmail" label={t('emp.fields.workEmail')} rules={[{ type: 'email', message: t('emp.errors.BAD_EMAIL') }]}>
              <Input maxLength={255} inputMode="email" />
            </Form.Item>
          )}
          <Form.Item name="workPhone" label={t('emp.fields.workPhone')}>
            <Input maxLength={40} inputMode="tel" />
          </Form.Item>
          <Form.Item name="workMobile" label={t('emp.fields.workMobile')}>
            <Input maxLength={40} inputMode="tel" />
          </Form.Item>
          <Form.Item name="workLocation" label={t('emp.fields.workLocation')}>
            <Input maxLength={160} placeholder={t('emp.fields.workLocationPlaceholder')} />
          </Form.Item>
        </div>
        {(hr || selfOnly) && (
          <>
            <h4 className="emp-form__section">{t('emp.sections.personal')}</h4>
            <p className="emp-muted">{t('emp.sections.personalHint')}</p>
            <div className="emp-form__grid2">
              <Form.Item name="personalEmail" label={t('emp.fields.personalEmail')} rules={[{ type: 'email', message: t('emp.errors.BAD_EMAIL') }]}>
                <Input maxLength={255} inputMode="email" />
              </Form.Item>
              <Form.Item name="personalPhone" label={t('emp.fields.personalPhone')}>
                <Input maxLength={40} inputMode="tel" />
              </Form.Item>
            </div>
            <Form.Item name="personalAddress" label={t('emp.fields.personalAddress')}>
              <Input maxLength={400} />
            </Form.Item>
            <Form.Item name="emergencyContact" label={t('emp.fields.emergencyContact')}>
              <Input maxLength={300} placeholder={t('emp.fields.emergencyPlaceholder')} />
            </Form.Item>
          </>
        )}
        {hr && (
          <>
            <Form.Item name="hrNotes" label={t('emp.fields.hrNotes')} extra={t('emp.fields.hrNotesHint')}>
              <Input.TextArea rows={3} maxLength={8000} />
            </Form.Item>
            {meta?.ad && (
              <Form.Item name="adAccount" label={t('emp.fields.adAccount')} extra={t('emp.fields.adAccountHint')}>
                <Input maxLength={200} placeholder="ivanov.i" />
              </Form.Item>
            )}
          </>
        )}
      </Form>
    </Drawer>
  );
}

/** «Статус» as a segmented control for quick filters (exported for the registry). */
export function StatusSegmented({ value, onChange, statuses, t }) {
  return <Segmented value={value} onChange={onChange} options={statuses.map((status) => ({ value: status, label: t(`emp.status.${status}`) }))} />;
}
