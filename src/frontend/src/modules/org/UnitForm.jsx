import { useEffect, useMemo } from 'react';
import { Form, Input, Select } from 'antd';
import Segmented from '../../components/ui/Segmented';
import { useLocale } from '../../context/LocaleContext';
import { MenuIcon } from '../../components/icons/menuIcons';
import { zoneOptions } from '../../lib/datetime';
import HeadSelect from './HeadSelect';
import UnitSelect from './UnitSelect';
import { descendantsOf, purposeLabel, typeLabel, typeOf } from './lib';

/** Form values ↔ API payload. */
export function unitToForm(unit, defaults = {}) {
  if (!unit) return { status: 'active', purposes: [], ...defaults };
  return {
    name: unit.name,
    type: unit.type,
    code: unit.code || '',
    parentId: unit.parentId || null,
    legalEntityId: unit.legalEntityId || null,
    head: unit.headEmployeeId ? { kind: 'employee', id: unit.headEmployeeId } : unit.headUserId ? { kind: 'user', id: unit.headUserId } : null,
    address: unit.address || '',
    timeZone: unit.timeZone || null,
    status: unit.status || 'active',
    purposes: unit.purposes || [],
    note: unit.note || '',
  };
}

export function formToPayload(values) {
  const { head, ...rest } = values;
  return {
    ...rest,
    code: rest.code || null,
    legalEntityId: rest.legalEntityId || null,
    timeZone: rest.timeZone || null,
    headUserId: head?.kind === 'user' ? head.id : null,
    headEmployeeId: head?.kind === 'employee' ? head.id : null,
  };
}

/**
 * The fields of a unit (create dialog and the details panel). `unit` is the
 * edited unit (null for a new one); `units` the flat list (to forbid moving
 * a unit under itself); `meta` types, purposes, legal entities, portal zone.
 */
export default function UnitForm({ form, unit, units = [], meta, initialValues, onValuesChange, disabled }) {
  const { t } = useLocale();
  const zones = useMemo(() => zoneOptions(), []);
  const type = Form.useWatch('type', form);
  const parentId = Form.useWatch('parentId', form);
  const typeDef = typeOf(meta, type);
  const exclude = useMemo(() => (unit ? [unit.id, ...descendantsOf(units, unit.id)] : []), [unit, units]);
  const inherited = useMemo(() => {
    const parent = units.find((item) => item.id === parentId);
    return parent?.effectiveTimeZone || meta?.portalTimeZone || 'UTC';
  }, [units, parentId, meta]);

  useEffect(() => {
    form.setFieldsValue(initialValues);
  }, [form, initialValues]);

  return (
    <Form form={form} layout="vertical" initialValues={initialValues} onValuesChange={onValuesChange} disabled={disabled} className="org-form">
      <Form.Item name="name" label={t('org.fields.name')} rules={[{ required: true, whitespace: true, message: t('org.errors.NAME_REQUIRED') }]}>
        <Input maxLength={200} placeholder={t('org.fields.namePlaceholder')} />
      </Form.Item>
      <div className="org-form__row">
        <Form.Item name="type" label={t('org.fields.type')} rules={[{ required: true, message: t('org.errors.BAD_TYPE') }]}>
          <Select
            options={(meta?.types || []).map((item) => ({
              value: item.key,
              label: (
                <span className="org-opt">
                  <span className="org-opt__icon" style={{ '--c': item.color }}>
                    <MenuIcon name={item.icon} variant="mono" />
                  </span>
                  {typeLabel(item, t)}
                </span>
              ),
            }))}
          />
        </Form.Item>
        <Form.Item name="code" label={t('org.fields.code')} tooltip={t('org.fields.codeHint')}>
          <Input maxLength={40} placeholder="HQ-01" />
        </Form.Item>
      </div>
      <Form.Item name="parentId" label={t('org.fields.parent')} extra={t('org.fields.parentHint')}>
        <UnitSelect exclude={exclude} placeholder={t('org.fields.topLevel')} />
      </Form.Item>
      {typeDef.legal && (
        <Form.Item name="legalEntityId" label={t('org.fields.legalEntity')} extra={t('org.fields.legalEntityHint')}>
          <Select allowClear options={(meta?.legalEntities || []).map((entity) => ({ value: entity.id, label: entity.label }))} placeholder="—" />
        </Form.Item>
      )}
      <Form.Item name="head" label={t('org.fields.head')} extra={t('org.fields.headHint')}>
        <HeadSelect />
      </Form.Item>
      <Form.Item name="purposes" label={t('org.fields.purposes')} extra={t('org.fields.purposesHint')}>
        <Select mode="multiple" allowClear options={(meta?.purposes || []).map((item) => ({ value: item.key, label: purposeLabel(item, t) }))} placeholder={t('org.fields.purposesPlaceholder')} />
      </Form.Item>
      <Form.Item name="address" label={t('org.fields.address')}>
        <Input maxLength={400} />
      </Form.Item>
      <Form.Item name="timeZone" label={t('org.fields.timeZone')} extra={t('org.fields.timeZoneHint')}>
        <Select
          allowClear
          showSearch
          options={zones}
          placeholder={t('org.fields.timeZoneInherit', { zone: inherited })}
          filterOption={(input, item) => String(item?.search || '').includes(input.toLowerCase())}
        />
      </Form.Item>
      <Form.Item name="status" label={t('org.fields.status')}>
        <Segmented options={[{ value: 'active', label: t('org.status.active') }, { value: 'closed', label: t('org.status.closed') }]} />
      </Form.Item>
      <Form.Item name="note" label={t('org.fields.note')}>
        <Input.TextArea rows={2} maxLength={1000} />
      </Form.Item>
    </Form>
  );
}
