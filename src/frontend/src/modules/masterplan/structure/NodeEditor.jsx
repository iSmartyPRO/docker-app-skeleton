import { useEffect, useState } from 'react';
import { App, Button, Checkbox, Collapse, Form, Input, InputNumber, Popconfirm, Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { DateField } from '../../../components/ui/DateTimeField';
import { userOptions } from '../../shared/People';
import { mpApi } from '../api';
import { useMp } from '../MpContext';
import { formatPercent } from '../lib';
import { conflictText } from '../components/StatusDialog';
import { StatusTag, TypeIcon } from '../components/bits';

/** Free attributes offered in the editor (stored in attrs JSONB; any other key survives too). */
export const ATTRS = {
  object: ['series', 'architect', 'material', 'foundation', 'roof', 'floors', 'permit'],
  plot: ['cadastral', 'relief', 'view', 'orientation', 'utilities', 'restrictions', 'shape'],
  unit: ['view', 'orientation', 'features', 'tour'],
  level: [],
};

const NUM = (props) => <InputNumber min={0} style={{ width: '100%' }} {...props} />;

/** Stage plan / fact / percent of a construction object (build.edit). */
function StagesEditor({ node }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  useEffect(() => {
    mpApi.node(node.id).then((res) => setData(res.data.stages)).catch(() => setData(null));
  }, [node.id]);
  if (!data || data.inherited) return null;
  const save = async (stage, patch) => {
    try {
      const res = await mpApi.updateStage(node.id, stage.id, patch);
      setData((prev) => ({ ...prev, ...res.data }));
    } catch (err) {
      message.error(conflictText(err, t));
    }
  };
  return (
    <div className="mp-stage-edit">
      <p className="mp-muted mp-small">{t('mp.st.stagesHint', { value: formatPercent(data.readiness, locale) })}</p>
      <table>
        <thead>
          <tr>
            <th>{t('mp.con.stage')}</th>
            <th>{t('mp.st.planStart')}</th>
            <th>{t('mp.st.planEnd')}</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {data.stages.map((stage) => (
            <tr key={stage.id}>
              <td>{stage.name} <span className="mp-muted">· {stage.weight}</span></td>
              <td><DateField size="small" value={stage.planStart} onChange={(day) => save(stage, { planStart: day })} /></td>
              <td><DateField size="small" value={stage.planEnd} onChange={(day) => save(stage, { planEnd: day })} /></td>
              <td><InputNumber size="small" min={0} max={100} step={5} defaultValue={stage.percent} onBlur={(event) => { const v = Number(event.target.value); if (v !== stage.percent && !Number.isNaN(v)) save(stage, { percent: v }); }} style={{ width: 72 }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The editor of one node in the Structure page (administrators; characteristics for unit editors). */
export default function NodeEditor({ node, project, onSaved, onDeleted, onAddChild, onBulk }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { types, users, meta, settings } = useMp();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    form.resetFields();
    const u = node.unit || {};
    form.setFieldsValue({
      code: node.code,
      name: node.name,
      typeId: node.type?.id,
      area: node.area,
      description: node.description,
      buildUserId: node.buildUserId,
      salesUserId: node.salesUserId,
      contractor: node.contractor,
      planStart: node.planStart,
      planEnd: node.planEnd,
      handover: node.handover,
      attrs: node.attrs || {},
      unit: {
        price: u.price,
        currency: u.currency,
        minPrice: u.minPrice,
        discountPct: u.discountPct,
        areaTotal: u.areaTotal,
        areaLiving: u.areaLiving,
        areaPlot: u.areaPlot,
        areaTerrace: u.areaTerrace,
        rooms: u.rooms,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        levels: u.levels,
        ceiling: u.ceiling,
        floor: u.floor,
        number: u.number,
        riser: u.riser,
        finishing: u.finishing,
        paymentForms: u.paymentForms,
        noPublish: u.noPublish,
      },
    });
  }, [node, form]);

  const save = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const unit = node.unit ? Object.fromEntries(Object.entries(values.unit || {}).map(([key, value]) => [key, value === undefined ? null : value])) : undefined;
      if (unit && unit.price === node.unit.price) delete unit.price;
      if (unit && unit.minPrice === undefined) delete unit.minPrice;
      const payload = {
        code: values.code || '',
        name: values.name || '',
        area: values.area ?? null,
        description: values.description || '',
        buildUserId: values.buildUserId || null,
        salesUserId: values.salesUserId || null,
        contractor: values.contractor || '',
        planStart: values.planStart || null,
        planEnd: values.planEnd || null,
        handover: values.handover || null,
        attrs: values.attrs,
        unit,
        version: node.unit?.version,
        reason: t('mp.st.editReason'),
      };
      if (values.typeId && values.typeId !== node.type?.id) payload.typeId = values.typeId;
      const res = await mpApi.updateNode(node.id, payload);
      message.success(t('common.saved'));
      onSaved(res.data.node);
    } catch (err) {
      message.error(conflictText(err, t));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await mpApi.deleteNode(node.id);
      message.success(t('mp.st.deleted'));
      onDeleted();
    } catch (err) {
      message.error(conflictText(err, t) || errorMessage(err));
    }
  };

  const attrKeys = [...new Set([...(ATTRS[node.kind] || []), ...Object.keys(node.attrs || {})])];
  return (
    <div className="mp-editor">
      <div className="mp-editor__head">
        <TypeIcon node={node} size={22} />
        <div>
          <h3>{node.code || node.name}</h3>
          <span>{node.kind === 'level' ? project.settings.levels.find((level) => level.key === node.levelKey)?.name : node.type?.name}</span>
        </div>
        {node.unit?.status && <StatusTag status={node.unit.status} />}
        <span className="mod-toolbar__grow" />
        {node.kind !== 'unit' && <Button size="small" onClick={onAddChild}>＋ {t('mp.st.child')}</Button>}
        {node.kind !== 'unit' && <Button size="small" onClick={onBulk}>{t('mp.st.bulk')}</Button>}
        <Popconfirm title={t('mp.st.deleteConfirm', { name: node.code || node.name })} description={t('mp.st.deleteText')} onConfirm={remove} okText={t('common.delete')} okButtonProps={{ danger: true }} cancelText={t('common.cancel')}>
          <Button size="small" danger>{t('common.delete')}</Button>
        </Popconfirm>
      </div>
      <Form form={form} layout="vertical" requiredMark={false}>
        <div className="form-grid-2">
          <Form.Item name="code" label={t('mp.st.code')}><Input maxLength={60} /></Form.Item>
          <Form.Item name="name" label={t('mp.st.name')}><Input maxLength={200} /></Form.Item>
        </div>
        {node.kind !== 'level' && (
          <div className="form-grid-2">
            <Form.Item name="typeId" label={t('mp.st.type')}>
              <Select showSearch optionFilterProp="label" options={types.filter((type) => type.nodeKind === node.kind).map((type) => ({ value: type.id, label: type.name }))} />
            </Form.Item>
            {!node.unit && <Form.Item name="area" label={t('mp.f.area')}><NUM addonAfter="м²" /></Form.Item>}
          </div>
        )}
        {node.unit && (
          <>
            <div className="mp-grid-4">
              <Form.Item name={['unit', 'price']} label={t('mp.f.price')}><NUM /></Form.Item>
              <Form.Item name={['unit', 'currency']} label={t('mp.projects.currency')}><Select options={(settings.currencies || []).map((code) => ({ value: code, label: code }))} /></Form.Item>
              {node.unit.minPrice !== undefined && <Form.Item name={['unit', 'minPrice']} label={t('mp.f.minPrice')}><NUM /></Form.Item>}
              <Form.Item name={['unit', 'discountPct']} label={t('mp.f.discount')}><NUM max={100} addonAfter="%" /></Form.Item>
            </div>
            <div className="mp-grid-4">
              <Form.Item name={['unit', 'areaTotal']} label={t('mp.f.areaTotal')}><NUM /></Form.Item>
              <Form.Item name={['unit', 'areaLiving']} label={t('mp.f.areaLiving')}><NUM /></Form.Item>
              <Form.Item name={['unit', 'areaPlot']} label={t('mp.f.areaPlot')}><NUM /></Form.Item>
              <Form.Item name={['unit', 'areaTerrace']} label={t('mp.f.areaTerrace')}><NUM /></Form.Item>
              <Form.Item name={['unit', 'rooms']} label={t('mp.f.rooms')}><NUM precision={0} /></Form.Item>
              <Form.Item name={['unit', 'bedrooms']} label={t('mp.f.bedrooms')}><NUM precision={0} /></Form.Item>
              <Form.Item name={['unit', 'bathrooms']} label={t('mp.f.bathrooms')}><NUM precision={0} /></Form.Item>
              <Form.Item name={['unit', 'levels']} label={t('mp.f.levels')}><NUM precision={0} /></Form.Item>
              <Form.Item name={['unit', 'floor']} label={t('mp.f.floor')}><InputNumber precision={0} style={{ width: '100%' }} /></Form.Item>
              <Form.Item name={['unit', 'number']} label={t('mp.f.number')}><Input maxLength={20} /></Form.Item>
              <Form.Item name={['unit', 'riser']} label={t('mp.f.riser')}><NUM precision={0} /></Form.Item>
              <Form.Item name={['unit', 'ceiling']} label={t('mp.f.ceiling')}><NUM step={0.1} addonAfter="м" /></Form.Item>
            </div>
            <div className="form-grid-2">
              <Form.Item name={['unit', 'finishing']} label={t('mp.f.finishing')}>
                <Select allowClear options={(meta?.finishings || []).map((key) => ({ value: key, label: t(`mp.finishing.${key}`) }))} />
              </Form.Item>
              <Form.Item name={['unit', 'paymentForms']} label={t('mp.f.paymentForms')}>
                <Select mode="multiple" options={(meta?.paymentForms || []).map((key) => ({ value: key, label: t(`mp.payment.${key}`) }))} />
              </Form.Item>
            </div>
            <Form.Item name={['unit', 'noPublish']} valuePropName="checked"><Checkbox>{t('mp.f.noPublish')}</Checkbox></Form.Item>
          </>
        )}
        <Collapse
          size="small"
          className="mp-editor__more"
          items={[
            node.kind !== 'unit' && {
              key: 'build',
              label: t('mp.st.buildSection'),
              children: (
                <>
                  <div className="form-grid-2">
                    <Form.Item name="buildUserId" label={t('mp.f.buildUser')}><Select allowClear showSearch optionFilterProp="search" options={userOptions(users)} /></Form.Item>
                    <Form.Item name="salesUserId" label={t('mp.f.salesUser')}><Select allowClear showSearch optionFilterProp="search" options={userOptions(users)} /></Form.Item>
                    <Form.Item name="planStart" label={t('mp.st.planStart')}><DateField style={{ width: '100%' }} /></Form.Item>
                    <Form.Item name="planEnd" label={t('mp.st.planEnd')}><DateField style={{ width: '100%' }} /></Form.Item>
                    {node.kind !== 'level' && <Form.Item name="contractor" label={t('mp.f.contractor')}><Input maxLength={200} /></Form.Item>}
                    {node.kind !== 'level' && (
                      <Form.Item name="handover" label={t('mp.f.handover')}>
                        <Select allowClear options={(meta?.finishings || []).map((key) => ({ value: key, label: t(`mp.finishing.${key}`) }))} />
                      </Form.Item>
                    )}
                  </div>
                  {node.type?.stageSet && <StagesEditor node={node} />}
                </>
              ),
            },
            attrKeys.length > 0 && {
              key: 'attrs',
              label: t('mp.st.attrs'),
              children: (
                <div className="form-grid-2">
                  {attrKeys.map((key) => (
                    <Form.Item key={key} name={['attrs', key]} label={t(`mp.attr.${key}`) === `mp.attr.${key}` ? key : t(`mp.attr.${key}`)}>
                      {key === 'features' ? <Select mode="tags" /> : <Input maxLength={300} />}
                    </Form.Item>
                  ))}
                </div>
              ),
            },
            {
              key: 'desc',
              label: t('mp.st.description'),
              children: (
                <Form.Item name="description" noStyle>
                  <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} maxLength={10000} />
                </Form.Item>
              ),
            },
          ].filter(Boolean)}
        />
        <div className="mp-editor__foot">
          <Button type="primary" loading={busy} onClick={save}>{t('common.save')}</Button>
        </div>
      </Form>
    </div>
  );
}
