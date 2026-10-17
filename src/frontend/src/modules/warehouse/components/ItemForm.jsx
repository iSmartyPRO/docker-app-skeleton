import { useEffect, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Drawer, Form, Grid, Input, InputNumber, Select, Switch, TreeSelect } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { ScanButton } from '../../../components/ui/BarcodeScanner';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { categoryTree, whError } from '../lib';

/** Extra units with factors: «уп = 24 шт», with a live preview. */
function UnitsEditor({ value = [], onChange, baseUnit }) {
  const { t } = useLocale();
  const set = (index, patch) => onChange(value.map((unit, i) => (i === index ? { ...unit, ...patch } : unit)));
  return (
    <div className="wh-units">
      {value.map((unit, index) => (
        <div key={index} className="wh-units__row">
          <span className="wh-units__one">1</span>
          <Input value={unit.code} onChange={(e) => set(index, { code: e.target.value })} placeholder={t('wh.itemForm.unitCode')} maxLength={16} style={{ width: 110 }} />
          <span>=</span>
          <InputNumber min={0} value={unit.factor} onChange={(factor) => set(index, { factor })} style={{ width: 110 }} />
          <span className="wh-muted">{baseUnit}</span>
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={t('common.delete')} />
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...value, { code: '', factor: null }])}>
        {t('wh.itemForm.addUnit')}
      </Button>
    </div>
  );
}

/** Barcodes as tags, with the camera scanner. */
function BarcodesInput({ value = [], onChange }) {
  const { t } = useLocale();
  const [text, setText] = useState('');
  const add = (code) => {
    const clean = String(code || '').trim();
    if (clean && !value.some((b) => b.code === clean)) onChange([...value, { code: clean }]);
    setText('');
  };
  return (
    <div className="wh-barcodes">
      <div className="wh-barcodes__tags">
        {value.map((b) => (
          <span key={b.code} className="wh-tag">
            <code>{b.code}</code>
            {b.unit && <em>{b.unit}</em>}
            <button type="button" onClick={() => onChange(value.filter((x) => x.code !== b.code))} aria-label={t('common.delete')}>✕</button>
          </span>
        ))}
      </div>
      <Input value={text} onChange={(e) => setText(e.target.value)} onPressEnter={(e) => { e.preventDefault(); add(text); }} placeholder={t('wh.item.barcodePlaceholder')} addonAfter={<ScanButton onScan={add} />} />
    </div>
  );
}

/** Item create / edit (spec §4.1): identification, units, tracking, norms are on the card. */
export default function ItemForm({ item = null, initial = {}, onClose, onSaved }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { meta } = useWh();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const start = useMemo(
    () =>
      item
        ? {
            name: item.name,
            sku: item.sku,
            categoryId: item.category?.id ?? null,
            brand: item.brand,
            tracking: item.tracking,
            trackExpiry: item.trackExpiry,
            baseUnit: item.baseUnit,
            units: item.units,
            receiptUnit: item.receiptUnit,
            issueUnit: item.issueUnit,
            purchaseMultiple: item.purchaseMultiple,
            supplierName: item.supplier?.name || '',
            supplierCompanyId: item.supplier?.companyId || null,
            lastPrice: item.lastPrice,
            planPrice: item.planPrice,
            barcodes: item.barcodes,
            serviceIntervalDays: item.serviceIntervalDays,
            description: item.description,
            attrs: item.attrs || {},
          }
        : { tracking: 'quantity', baseUnit: 'шт', units: [], barcodes: [], attrs: {}, ...initial },
    [item, initial]
  );
  const tracking = Form.useWatch('tracking', form) || start.tracking;
  const baseUnit = Form.useWatch('baseUnit', form) || start.baseUnit;
  const units = Form.useWatch('units', form) || start.units || [];
  const categoryId = Form.useWatch('categoryId', form);
  const attrDefs = meta.categories.find((c) => c.id === categoryId)?.attrs || [];
  const unitChoices = [baseUnit, ...units.map((u) => u.code).filter(Boolean)].map((code) => ({ value: code, label: code }));
  useEffect(() => {
    if (!meta.modules?.companies) return;
    whApi.lookup('companies', {}).then((res) => setSuppliers(res.data.items)).catch(() => {});
  }, [meta.modules?.companies]);
  const save = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const payload = { ...values, units: (values.units || []).filter((u) => u.code && u.factor > 0) };
      if (!meta.rights.cost) {
        delete payload.lastPrice;
        delete payload.planPrice;
      }
      const res = item ? await whApi.updateItem(item.id, payload) : await whApi.createItem(payload);
      message.success(t('wh.saved'));
      onSaved?.(res.data.item);
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} width={screens.md ? 620 : '100%'} title={item ? t('wh.itemForm.editTitle') : t('wh.itemForm.newTitle')} destroyOnClose extra={<Button type="primary" loading={busy} onClick={save}>{t('common.save')}</Button>}>
      <Form form={form} layout="vertical" initialValues={start} requiredMark={false}>
        <Form.Item name="name" label={t('wh.fields.name')} rules={[{ required: true, message: t('wh.itemForm.nameRequired') }]}>
          <Input maxLength={300} autoFocus={!item} placeholder={t('wh.itemForm.namePlaceholder')} />
        </Form.Item>
        <div className="wh-form-grid">
          <Form.Item name="sku" label={t('wh.fields.sku')}><Input maxLength={60} /></Form.Item>
          <Form.Item name="brand" label={t('wh.fields.brand')}><Input maxLength={120} /></Form.Item>
        </div>
        <Form.Item name="categoryId" label={t('wh.fields.category')}>
          <TreeSelect allowClear treeData={categoryTree(meta.categories)} treeDefaultExpandAll placeholder={t('wh.itemForm.noCategory')} />
        </Form.Item>
        <Form.Item name="tracking" label={t('wh.fields.tracking')} extra={t(`wh.trackingHelp.${tracking}`)}>
          <Segmented block options={meta.enums.tracking.map((value) => ({ value, label: t(`wh.tracking.${value}`) }))} disabled={Boolean(item)} />
        </Form.Item>
        {tracking === 'batch' && (
          <Form.Item name="trackExpiry" label={t('wh.itemForm.trackExpiry')} valuePropName="checked"><Switch /></Form.Item>
        )}
        <div className="wh-form-grid">
          <Form.Item name="baseUnit" label={t('wh.fields.baseUnit')} rules={[{ required: true }]}>
            <AutoComplete options={(meta.settings.units || []).map((u) => ({ value: u }))} disabled={Boolean(item)} />
          </Form.Item>
          {tracking !== 'serial' && <Form.Item name="purchaseMultiple" label={t('wh.fields.purchaseMultiple')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>}
        </div>
        {tracking !== 'serial' && (
          <>
            <Form.Item name="units" label={t('wh.fields.units')} extra={t('wh.itemForm.unitsHelp')}>
              <UnitsEditor baseUnit={baseUnit} />
            </Form.Item>
            <div className="wh-form-grid">
              <Form.Item name="receiptUnit" label={t('wh.fields.receiptUnit')}><Select allowClear options={unitChoices} /></Form.Item>
              <Form.Item name="issueUnit" label={t('wh.fields.issueUnit')}><Select allowClear options={unitChoices} /></Form.Item>
            </div>
          </>
        )}
        {tracking === 'serial' && (
          <Form.Item name="serviceIntervalDays" label={t('wh.fields.serviceInterval')} extra={t('wh.itemForm.serviceHelp')}>
            <InputNumber min={0} max={3650} addonAfter={t('wh.days')} style={{ width: 200 }} />
          </Form.Item>
        )}
        <Form.Item name="barcodes" label={t('wh.fields.barcodes')}>
          <BarcodesInput />
        </Form.Item>
        <Form.Item name="supplierName" label={t('wh.fields.supplier')}>
          <AutoComplete options={suppliers.map((s) => ({ value: s.label, id: s.id }))} onSelect={(_, option) => form.setFieldValue('supplierCompanyId', option.id)} filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())} />
        </Form.Item>
        <Form.Item name="supplierCompanyId" hidden><Input /></Form.Item>
        {meta.rights.cost && (
          <div className="wh-form-grid">
            <Form.Item name="lastPrice" label={`${t('wh.fields.lastPrice')}, ${meta.settings.currency}`}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="planPrice" label={`${t('wh.fields.planPrice')}, ${meta.settings.currency}`}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          </div>
        )}
        {attrDefs.length > 0 && (
          <div className="wh-attrs">
            <strong>{t('wh.itemForm.attrs')}</strong>
            {attrDefs.map((def) => (
              <Form.Item key={def.key} name={['attrs', def.key]} label={def.label}>
                {def.type === 'number' ? <InputNumber style={{ width: '100%' }} /> : def.type === 'select' ? <Select allowClear options={(def.options || []).map((o) => ({ value: o, label: o }))} /> : <Input maxLength={300} />}
              </Form.Item>
            ))}
          </div>
        )}
        <Form.Item name="description" label={t('wh.fields.description')}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={5000} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
