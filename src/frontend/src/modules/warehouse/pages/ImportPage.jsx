import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Segmented, Switch, Table, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { HelpButton } from '../../../help/Hint';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { whError } from '../lib';
import { Hero, WarehouseSelect } from '../components/bits';
import { ITEM_COLUMNS, OPENING_COLUMNS, importTemplate, readImportFile } from '../xlsx';
import { pick } from '../../../i18n/languages';

/** Example rows of the templates, in the person's language. */
const EXAMPLE_TEXTS = {
  ru: { name: 'Цемент М500 Д0', category: 'Материалы / Сухие смеси', unit: 'кг', bag: 'мешок', supplier: 'ОсОО «Стройснаб»' },
  en: { name: 'Cement M500 D0', category: 'Materials / Dry mixes', unit: 'kg', bag: 'bag', supplier: 'Stroysnab LLC' },
  ky: { name: 'Цемент М500 Д0', category: 'Материалдар / Кургак аралашмалар', unit: 'кг', bag: 'кап', supplier: '«Стройснаб» ЖЧК' },
  tr: { name: 'Çimento M500 D0', category: 'Malzemeler / Kuru karışımlar', unit: 'kg', bag: 'torba', supplier: 'Stroysnab Ltd. Şti.' },
  zh: { name: '水泥 M500 D0', category: '材料 / 干混料', unit: 'kg', bag: '袋', supplier: 'Stroysnab 有限责任公司' },
};

/** Import from Excel / CSV (spec §11): items and opening balances, checked first, with a report of errors. */
export default function ImportPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { touch } = useWh();
  const [kind, setKind] = useState('items');
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [report, setReport] = useState(null);
  const [warehouseId, setWarehouseId] = useState(null);
  const [post, setPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const columns = kind === 'items' ? ITEM_COLUMNS : OPENING_COLUMNS;
  const reset = () => {
    setFile(null);
    setParsed(null);
    setReport(null);
  };
  const read = async (f) => {
    reset();
    setFile(f);
    try {
      const result = await readImportFile(f, columns);
      setParsed(result);
      if (!result.rows.length) message.warning(t('wh.import.noRows'));
    } catch (err) {
      message.error(whError(err, t));
    }
    return false;
  };
  const send = async (dryRun) => {
    setBusy(true);
    try {
      const res = kind === 'items' ? await whApi.importItems({ rows: parsed.rows, dryRun }) : await whApi.importOpening({ rows: parsed.rows, warehouseId, dryRun, post });
      setReport({ ...res.data, dryRun });
      if (!dryRun && res.data.ok) {
        message.success(t('wh.import.done'));
        touch();
        if (res.data.document) navigate(`/app/warehouse/documents/${res.data.document.id}`);
      }
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  const sample = EXAMPLE_TEXTS[locale] || EXAMPLE_TEXTS.en;
  const example =
    kind === 'items'
      ? { name: sample.name, sku: 'CEM-500', category: sample.category, unit: sample.unit, units: `${sample.bag}=50`, barcodes: '4600000000017', tracking: t('wh.tracking.batch'), brand: 'Kant', supplier: sample.supplier, price: 0.12, minQty: 500, warehouse: '' }
      : { sku: 'CEM-500', qty: 40, unit: sample.bag, price: 6, batch: 'P-0425', expiresOn: '2026-12-31', bin: 'A-01-1' };
  return (
    <div className="wh-page">
      <Hero icon="upload" title={t('wh.nav.import')} lead={t('wh.import.lead')}>
        <HelpButton id="warehouse" section="import" />
      </Hero>
      <Segmented value={kind} onChange={(next) => { setKind(next); reset(); }} options={[{ value: 'items', label: t('wh.import.items') }, { value: 'opening', label: t('wh.import.opening') }]} />
      <div className="wh-import">
        <p className="wh-muted">{t(kind === 'items' ? 'wh.import.itemsHelp' : 'wh.import.openingHelp')}</p>
        <Button onClick={() => importTemplate(columns, example, locale, kind === 'items' ? 'warehouse-items-template.xlsx' : 'warehouse-opening-template.xlsx')}>{t('wh.import.template')}</Button>
        {kind === 'opening' && (
          <div className="wh-subform__row">
            <WarehouseSelect right="admin" value={warehouseId} onChange={setWarehouseId} style={{ minWidth: 220 }} />
            <Switch checked={post} onChange={setPost} /> <span>{t('wh.import.postAtOnce')}</span>
          </div>
        )}
        <Upload.Dragger accept=".xlsx,.csv" maxCount={1} showUploadList={false} beforeUpload={read}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">{file ? file.name : t('wh.import.drop')}</p>
          <p className="ant-upload-hint">{t('wh.import.dropHint')}</p>
        </Upload.Dragger>
        {parsed && (
          <>
            <div className="wh-import__headers">
              {parsed.headers.map((h, i) => <span key={i} className={`wh-flag ${h.key ? 'is-green' : ''}`}>{h.text}{h.key ? ' ✓' : ` — ${t('wh.import.ignored')}`}</span>)}
            </div>
            <p>{t('wh.import.rows', { n: parsed.rows.length })}</p>
            <div className="wh-subform__row">
              <Button loading={busy} disabled={!parsed.rows.length || (kind === 'opening' && !warehouseId)} onClick={() => send(true)}>{t('wh.import.check')}</Button>
              <Button type="primary" loading={busy} disabled={!parsed.rows.length || (kind === 'opening' && !warehouseId) || (report && !report.ok)} onClick={() => send(false)}>{t('wh.import.run')}</Button>
            </div>
          </>
        )}
        {report && (
          <div className={`wh-banner ${report.ok ? 'is-green' : 'is-red'}`}>
            {report.ok ? (report.dryRun ? t('wh.import.checkOk', { n: report.rows }) : t('wh.import.resultOk', { created: report.created ?? 0, updated: report.updated ?? 0, n: report.rows })) : t('wh.import.errorsFound', { n: report.errors.length })}
          </div>
        )}
        {report?.errors?.length > 0 && (
          <Table size="small" rowKey={(e, i) => `${e.row}:${e.field}:${i}`} dataSource={report.errors} pagination={report.errors.length > 50 ? { pageSize: 50 } : false} columns={[
            { key: 'row', title: t('wh.import.row'), dataIndex: 'row', width: 80 },
            { key: 'field', title: t('wh.import.field'), dataIndex: 'field', width: 140, render: (field) => { const col = columns.find((c) => c.key === field); return col ? pick(col, locale) : field; } },
            { key: 'message', title: t('wh.import.problem'), render: (_, e) => { const known = t(`wh.errors.${e.code}`); return known.startsWith('wh.errors.') ? e.message : `${known} (${e.message})`; } },
          ]} />
        )}
      </div>
    </div>
  );
}
