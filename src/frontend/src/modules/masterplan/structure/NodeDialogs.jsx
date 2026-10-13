import { useEffect, useState } from 'react';
import { App, Form, Input, InputNumber, Modal, Segmented, Select } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { mpApi } from '../api';
import { useMp } from '../MpContext';
import { nodeLabel } from '../lib';

const KINDS = ['level', 'object', 'plot', 'unit'];

/** The parent picker: every level and object of the project (units cannot hold children here). */
function parentOptions(tree, t) {
  const out = [{ value: 0, label: t('mp.st.root') }];
  const walk = (list, depth) => {
    for (const node of list) {
      if (node.kind === 'unit') continue;
      out.push({ value: node.id, label: `${' '.repeat(depth)}${nodeLabel(node)}` });
      walk(node.children || [], depth + 1);
    }
  };
  const build = (parentId) => tree.kids(parentId).map((node) => ({ ...node, children: build(node.id) }));
  walk(build(0), 1);
  return out;
}

function KindFields({ kind, levels }) {
  const { t } = useLocale();
  const { types } = useMp();
  return kind === 'level' ? (
    <Form.Item name="levelKey" label={t('mp.st.levelType')} rules={[{ required: true }]}>
      <Select options={levels.map((level) => ({ value: level.key, label: level.name }))} />
    </Form.Item>
  ) : (
    <Form.Item name="typeId" label={t('mp.st.type')} rules={[{ required: true, message: t('mp.st.typeRequired') }]}>
      <Select showSearch optionFilterProp="label" options={types.filter((type) => type.nodeKind === kind).map((type) => ({ value: type.id, label: `${type.name}${type.sellable ? '' : ` · ${t('mp.st.notSellable')}`}` }))} />
    </Form.Item>
  );
}

/** One node: { parentId, kind, levelKey | typeId, code, name, price?, area? }. */
export function CreateNodeDialog({ open, project, tree, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { typeById } = useMp();
  const [form] = Form.useForm();
  const [kind, setKind] = useState('level');
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ parentId: open.parentId || 0, levelKey: project.settings.levels[0]?.key });
    setKind(open.kind || 'level');
  }, [open, form, project]);
  if (!open) return null;
  const submit = async () => {
    const values = await form.validateFields();
    const type = typeById(values.typeId);
    try {
      const res = await mpApi.createNode({
        projectId: project.id,
        parentId: values.parentId || null,
        kind,
        levelKey: values.levelKey,
        typeId: values.typeId,
        code: values.code,
        name: values.name,
        unit: type?.sellable ? { price: values.price, areaTotal: values.areaTotal, areaPlot: values.areaPlot } : undefined,
      });
      message.success(t('mp.st.created'));
      onClose(res.data.node);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  return (
    <Modal open title={t('mp.st.add')} onCancel={() => onClose(null)} onOk={submit} okText={t('common.create')} cancelText={t('common.cancel')} destroyOnClose>
      <Segmented block value={kind} onChange={setKind} options={KINDS.map((key) => ({ value: key, label: t(`mp.kind.${key}`) }))} />
      <Form form={form} layout="vertical" className="mp-form-top">
        <Form.Item name="parentId" label={t('mp.st.parent')}>
          <Select showSearch optionFilterProp="label" options={parentOptions(tree, t)} />
        </Form.Item>
        <KindFields kind={kind} levels={project.settings.levels} />
        <div className="form-grid-2">
          <Form.Item name="code" label={t('mp.st.code')}>
            <Input maxLength={60} placeholder="A-1" />
          </Form.Item>
          <Form.Item name="name" label={t('mp.st.name')}>
            <Input maxLength={200} />
          </Form.Item>
        </div>
        <Form.Item noStyle shouldUpdate={(a, b) => a.typeId !== b.typeId}>
          {({ getFieldValue }) =>
            typeById(getFieldValue('typeId'))?.sellable && (
              <div className="form-grid-2">
                <Form.Item name="price" label={t('mp.f.price')}>
                  <InputNumber min={0} style={{ width: '100%' }} addonAfter={project.currency} />
                </Form.Item>
                <Form.Item name={kind === 'plot' ? 'areaPlot' : 'areaTotal'} label={kind === 'plot' ? t('mp.f.areaPlot') : t('mp.f.areaTotal')}>
                  <InputNumber min={0} style={{ width: '100%' }} addonAfter="м²" />
                </Form.Item>
              </div>
            )
          }
        </Form.Item>
      </Form>
    </Modal>
  );
}

/**
 * Bulk creation (§4.2): a line of plots "A-1-01 … A-1-15", or apartments of a
 * section: floors × per floor.
 */
export function BulkDialog({ open, project, tree, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { typeById } = useMp();
  const [form] = Form.useForm();
  const [mode, setMode] = useState('line');
  const [kind, setKind] = useState('object');
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ parentId: open.parentId || 0, prefix: 'A-1-', from: 1, count: 15, pad: 2, floorFrom: 1, floorTo: 9, perFloor: 4, startNumber: 1, numbering: 'through', levelKey: project.settings.levels[0]?.key });
    setMode('line');
  }, [open, form, project]);
  const wPrefix = Form.useWatch('prefix', form);
  const wFrom = Form.useWatch('from', form);
  const wCount = Form.useWatch('count', form);
  const wPad = Form.useWatch('pad', form);
  if (!open) return null;
  const submit = async () => {
    const v = await form.validateFields();
    const type = typeById(v.typeId);
    const k = mode === 'grid' ? 'unit' : kind;
    try {
      const res = await mpApi.bulkNodes({
        projectId: project.id,
        parentId: v.parentId || null,
        kind: k,
        typeId: v.typeId,
        levelKey: v.levelKey,
        prefix: v.prefix || '',
        from: v.from,
        count: v.count,
        pad: v.pad,
        nameTemplate: v.nameTemplate,
        grid: mode === 'grid' ? { floorFrom: v.floorFrom, floorTo: v.floorTo, perFloor: v.perFloor, startNumber: v.startNumber, numbering: v.numbering } : undefined,
        unit: type?.sellable ? { price: v.price, areaTotal: v.areaTotal, areaPlot: v.areaPlot, rooms: v.rooms, bedrooms: v.bedrooms } : undefined,
      });
      message.success(t('mp.st.bulkDone', { n: res.data.count }));
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  const preview = (() => {
    const p = wPrefix || '';
    const from = Number(wFrom || 1);
    const count = Number(wCount || 0);
    const pad = Number(wPad || 0);
    if (!count) return '';
    const code = (n) => `${p}${String(n).padStart(pad, '0')}`;
    return count > 1 ? `${code(from)} … ${code(from + count - 1)}` : code(from);
  })();
  return (
    <Modal open title={t('mp.st.bulk')} onCancel={() => onClose(false)} onOk={submit} okText={t('common.create')} cancelText={t('common.cancel')} destroyOnClose width={600}>
      <Segmented block value={mode} onChange={(value) => { setMode(value); if (value === 'grid') setKind('unit'); }} options={[{ value: 'line', label: t('mp.st.bulkLine') }, { value: 'grid', label: t('mp.st.bulkGrid') }]} />
      <Form form={form} layout="vertical" className="mp-form-top">
        <Form.Item name="parentId" label={t('mp.st.parent')}>
          <Select showSearch optionFilterProp="label" options={parentOptions(tree, t)} />
        </Form.Item>
        {mode === 'line' && (
          <Form.Item label={t('mp.st.kind')}>
            <Segmented value={kind} onChange={setKind} options={KINDS.map((key) => ({ value: key, label: t(`mp.kind.${key}`) }))} />
          </Form.Item>
        )}
        <KindFields kind={mode === 'grid' ? 'unit' : kind} levels={project.settings.levels} />
        {mode === 'line' ? (
          <div className="mp-grid-4">
            <Form.Item name="prefix" label={t('mp.st.prefix')}><Input maxLength={40} /></Form.Item>
            <Form.Item name="from" label={t('mp.st.from')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="count" label={t('mp.st.count')} rules={[{ required: true }]}><InputNumber min={1} max={500} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="pad" label={t('mp.st.pad')}><InputNumber min={0} max={6} style={{ width: '100%' }} /></Form.Item>
          </div>
        ) : (
          <div className="mp-grid-4">
            <Form.Item name="floorFrom" label={t('mp.st.floorFrom')}><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="floorTo" label={t('mp.st.floorTo')}><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="perFloor" label={t('mp.st.perFloor')}><InputNumber min={1} max={40} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="startNumber" label={t('mp.st.startNumber')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="prefix" label={t('mp.st.prefix')}><Input maxLength={40} placeholder="H1-" /></Form.Item>
            <Form.Item name="numbering" label={t('mp.st.numbering')}>
              <Select options={[{ value: 'through', label: t('mp.st.numThrough') }, { value: 'floor', label: t('mp.st.numFloor') }]} />
            </Form.Item>
          </div>
        )}
        <Form.Item name="nameTemplate" label={t('mp.st.nameTemplate')} extra={t('mp.st.nameTemplateHint')}>
          <Input maxLength={120} placeholder={mode === 'grid' ? 'Квартира {n}' : 'Участок {code}'} />
        </Form.Item>
        {mode === 'line' && preview && <p className="dialog-note">{t('mp.st.preview', { codes: preview })}</p>}
        <Form.Item noStyle shouldUpdate={(a, b) => a.typeId !== b.typeId}>
          {({ getFieldValue }) =>
            typeById(getFieldValue('typeId'))?.sellable && (
              <div className="mp-grid-4">
                <Form.Item name="price" label={t('mp.f.price')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="areaTotal" label={t('mp.f.areaTotal')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                {mode === 'line' ? <Form.Item name="areaPlot" label={t('mp.f.areaPlot')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item> : <Form.Item name="rooms" label={t('mp.f.rooms')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>}
                <Form.Item name="bedrooms" label={t('mp.f.bedrooms')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
              </div>
            )
          }
        </Form.Item>
      </Form>
    </Modal>
  );
}
