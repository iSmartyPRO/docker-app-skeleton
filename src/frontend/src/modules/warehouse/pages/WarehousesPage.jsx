import { useEffect, useState } from 'react';
import { App, Button, Checkbox, DatePicker, Drawer, Form, Grid, Input, Select, Skeleton, Switch, Tabs } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { HelpButton } from '../../../help/Hint';
import { PrintLabelsDialog } from '../../../components/ui/Labels';
import { dayFromPicker, dayToPicker } from '../../../lib/datetime';
import { UserAvatar } from '../../shared/People';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { binLabel, whError } from '../lib';
import { Empty, Hero, PersonSelect } from '../components/bits';

/** The bin tree: zone → rack → shelf; series «A-01 … A-10» in one go; labels. */
function BinsTab({ warehouse }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [bins, setBins] = useState(null);
  const [form, setForm] = useState({ kind: 'zone', parentId: null, codes: '' });
  const [labels, setLabels] = useState(null);
  const load = () => whApi.bins(warehouse.id).then((res) => setBins(res.data.bins)).catch(() => setBins([]));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouse.id]);
  const expand = (text) => {
    // «1-5» → 1,2,3,4,5 (keeps leading zeros: «01-10»).
    const out = [];
    for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
      const range = /^([A-Za-zА-Яа-я]*)(\d+)-(\d+)$/.exec(part);
      if (range) {
        const [, prefix, a, b] = range;
        for (let n = Number(a); n <= Number(b) && out.length < 200; n += 1) out.push(`${prefix}${String(n).padStart(a.length, '0')}`);
      } else out.push(part);
    }
    return out;
  };
  const add = async () => {
    try {
      const res = await whApi.createBins(warehouse.id, { kind: form.kind, parentId: form.parentId, codes: expand(form.codes) });
      setBins(res.data.bins);
      setForm({ ...form, codes: '' });
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  const archive = async (bin) => {
    try {
      const res = await whApi.updateBin(bin.id, { archived: true });
      setBins(res.data.bins.filter((b) => !b.archived));
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  if (!bins) return <Skeleton active />;
  const depth = (bin) => (bin.path.match(/-/g) || []).length;
  return (
    <div className="wh-stack">
      <p className="wh-muted">{t('wh.bins.lead')}</p>
      {bins.length > 0 && (
        <>
          <Button onClick={() => setLabels(bins.map((b) => binLabel(b, warehouse)))}>{t('wh.bins.printAll')}</Button>
          <ul className="wh-bins">
            {bins.map((bin) => (
              <li key={bin.id} style={{ paddingLeft: depth(bin) * 18 }}>
                <span className={`wh-flag is-${bin.kind}`}>{t(`wh.binKinds.${bin.kind}`)}</span>
                <code className="wh-code">{bin.path}</code>
                <span className="wh-muted">{bin.stock ? t('wh.bins.holds', { n: bin.stock }) : t('wh.bins.empty')}</span>
                <Button size="small" type="text" onClick={() => setLabels([binLabel(bin, warehouse)])}>🏷</Button>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => archive(bin)} aria-label={t('common.delete')} />
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="wh-subform">
        <strong>{t('wh.bins.add')}</strong>
        <div className="wh-subform__row">
          <Select value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={['zone', 'rack', 'shelf'].map((value) => ({ value, label: t(`wh.binKinds.${value}`) }))} style={{ width: 130 }} />
          <Select allowClear value={form.parentId ?? undefined} onChange={(parentId) => setForm({ ...form, parentId: parentId ?? null })} placeholder={t('wh.bins.parent')} options={bins.map((b) => ({ value: b.id, label: b.path }))} style={{ minWidth: 140 }} showSearch optionFilterProp="label" />
          <Input value={form.codes} onChange={(e) => setForm({ ...form, codes: e.target.value })} placeholder={t('wh.bins.codesPlaceholder')} onPressEnter={add} />
          <Button type="primary" onClick={add} disabled={!form.codes.trim()}>{t('wh.bins.create')}</Button>
        </div>
        <small className="wh-muted">{t('wh.bins.codesHelp')}</small>
      </div>
      <PrintLabelsDialog open={Boolean(labels)} items={labels || []} onClose={() => setLabels(null)} defaultFormat="58x40" />
    </div>
  );
}

const RIGHTS = ['view', 'request', 'operate', 'writeoff', 'inventory', 'cost', 'backdate', 'admin'];

/** Zone of responsibility: who holds which rights on this warehouse. */
function AccessTab({ warehouse }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [entries, setEntries] = useState(null);
  const [groups, setGroups] = useState([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    whApi.access(warehouse.id).then((res) => setEntries(res.data.entries)).catch((err) => { message.error(whError(err, t)); setEntries([]); });
    whApi.groups().then((res) => setGroups(res.data.groups)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouse.id]);
  const set = (next) => {
    setEntries(next);
    setDirty(true);
  };
  const save = async () => {
    try {
      const res = await whApi.saveAccess(warehouse.id, entries);
      setEntries(res.data.entries);
      setDirty(false);
      message.success(t('wh.saved'));
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  if (!entries) return <Skeleton active />;
  return (
    <div className="wh-stack">
      <p className="wh-muted">{t('wh.access.lead')}</p>
      {entries.length === 0 && <p className="wh-muted">{t('wh.access.none')}</p>}
      {entries.map((entry, index) => (
        <div key={`${entry.subjectType}:${entry.subjectId}`} className="wh-access-row">
          <span className="wh-access-row__who">
            {entry.subjectType === 'user' ? <UserAvatar user={{ name: entry.name, avatarUrl: entry.avatarUrl }} size={24} /> : <span className="wh-flag">{t('wh.access.group')}</span>}
            <strong>{entry.name}</strong>
          </span>
          <Checkbox.Group value={entry.rights} onChange={(rights) => set(entries.map((e, i) => (i === index ? { ...e, rights } : e)))} options={RIGHTS.map((right) => ({ value: right, label: t(`wh.rights.${right}`) }))} />
          <DatePicker value={dayToPicker(entry.until)} onChange={(d) => set(entries.map((e, i) => (i === index ? { ...e, until: dayFromPicker(d) } : e)))} placeholder={t('wh.access.until')} />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => set(entries.filter((_, i) => i !== index))} />
        </div>
      ))}
      <div className="wh-subform__row">
        <PersonSelect value={null} onChange={(id) => id && !entries.some((e) => e.subjectType === 'user' && e.subjectId === id) && set([...entries, { subjectType: 'user', subjectId: id, name: `#${id}`, rights: ['view', 'operate'] }])} placeholder={t('wh.access.addPerson')} style={{ minWidth: 220 }} />
        <Select value={null} onChange={(id) => id && set([...entries, { subjectType: 'group', subjectId: id, name: groups.find((g) => g.id === id)?.name, rights: ['view'] }])} placeholder={t('wh.access.addGroup')} options={groups.map((g) => ({ value: g.id, label: g.name }))} style={{ minWidth: 200 }} />
        <Button type="primary" disabled={!dirty} onClick={save}>{t('common.save')}</Button>
      </div>
    </div>
  );
}

function WarehouseForm({ warehouse, onClose, onSaved }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { meta } = useWh();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('main');
  const save = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const res = warehouse ? await whApi.updateWarehouse(warehouse.id, values) : await whApi.createWarehouse(values);
      message.success(t('wh.saved'));
      onSaved(res.data.warehouse);
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  const main = (
    <Form form={form} layout="vertical" requiredMark={false} initialValues={warehouse ? { name: warehouse.name, code: warehouse.code, kind: warehouse.kind, molId: warehouse.mol?.id || null, address: warehouse.address, binsEnabled: warehouse.binsEnabled, allowNegative: warehouse.allowNegative, note: warehouse.note } : { kind: 'main', binsEnabled: false, allowNegative: false }}>
      <div className="wh-form-grid">
        <Form.Item name="name" label={t('wh.fields.name')} rules={[{ required: true, message: t('wh.itemForm.nameRequired') }]}><Input maxLength={160} /></Form.Item>
        <Form.Item name="code" label={t('wh.warehouses.code')}><Input maxLength={20} /></Form.Item>
      </div>
      <Form.Item name="kind" label={t('wh.warehouses.kind')}>
        <Select options={meta.enums.warehouseKinds.map((value) => ({ value, label: t(`wh.kinds.${value}`) }))} />
      </Form.Item>
      <Form.Item name="molId" label={t('wh.warehouses.mol')} extra={t('wh.warehouses.molHelp')}><PersonSelect /></Form.Item>
      <Form.Item name="address" label={t('wh.warehouses.address')}><Input maxLength={300} /></Form.Item>
      <Form.Item name="binsEnabled" label={t('wh.warehouses.bins')} valuePropName="checked" extra={t('wh.warehouses.binsHelp')}><Switch /></Form.Item>
      <Form.Item name="allowNegative" label={t('wh.warehouses.negative')} valuePropName="checked" extra={t('wh.warehouses.negativeHelp')}><Switch /></Form.Item>
      <Form.Item name="note" label={t('wh.fields.comment')}><Input.TextArea autoSize={{ minRows: 2 }} maxLength={1000} /></Form.Item>
    </Form>
  );
  return (
    <Drawer open onClose={onClose} width={screens.md ? 720 : '100%'} title={warehouse ? warehouse.name : t('wh.warehouses.new')} destroyOnClose extra={tab === 'main' ? <Button type="primary" loading={busy} onClick={save}>{t('common.save')}</Button> : null}>
      {warehouse ? (
        <Tabs activeKey={tab} onChange={setTab} items={[
          { key: 'main', label: t('wh.warehouses.main'), children: main },
          { key: 'bins', label: t('wh.warehouses.binsTab'), children: <BinsTab warehouse={warehouse} /> },
          { key: 'access', label: t('wh.warehouses.access'), children: <AccessTab warehouse={warehouse} /> },
        ]} />
      ) : main}
    </Drawer>
  );
}

/** Warehouses and bins (warehouse.admin): types, MOL, addressed storage, zones of responsibility. */
export default function WarehousesPage() {
  const { t } = useLocale();
  const { reload } = useWh();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [archived, setArchived] = useState(false);
  const load = () => whApi.warehouses(true).then((res) => setList(res.data.warehouses)).catch(() => setList([]));
  useEffect(() => {
    load();
  }, []);
  const shown = (list || []).filter((w) => archived || !w.archived);
  return (
    <div className="wh-page">
      <Hero icon="building" title={t('wh.nav.warehouses')} lead={t('wh.warehouses.lead')}>
        <HelpButton id="warehouse" section="warehouses" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEdit('new')}>{t('wh.warehouses.new')}</Button>
      </Hero>
      <div className="mod-toolbar wh-toolbar">
        <span className="mod-toolbar__grow" />
        <Switch size="small" checked={archived} onChange={setArchived} /> <span className="wh-muted">{t('wh.warehouses.showArchived')}</span>
      </div>
      {!list ? <Skeleton active /> : !shown.length ? <Empty icon="🏬" title={t('wh.warehouses.none')} text={t('wh.warehouses.noneText')} action={<Button type="primary" onClick={() => setEdit('new')}>{t('wh.warehouses.new')}</Button>} /> : (
        <div className="wh-wh-grid">
          {shown.map((w) => (
            <button key={w.id} type="button" className={`wh-wh-card is-${w.kind}${w.archived ? ' is-archived' : ''}`} onClick={() => setEdit(w)}>
              <span className="wh-wh-card__kind">{t(`wh.kinds.${w.kind}`)}</span>
              <strong>{w.name}</strong>
              <span className="wh-muted">{[w.code, w.address].filter(Boolean).join(' · ')}</span>
              <span className="wh-wh-card__row">
                {w.mol ? <span className="wh-person"><UserAvatar user={w.mol} size={22} tip={false} />{w.mol.name}</span> : <span className="wh-muted">{t('wh.warehouses.noMol')}</span>}
                {w.binsEnabled && <span className="wh-flag">{t('wh.warehouses.binsOn')}</span>}
                {w.allowNegative && <span className="wh-flag is-amber">{t('wh.warehouses.negativeOn')}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {edit && <WarehouseForm warehouse={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={(w) => { load(); reload(); setEdit(edit === 'new' ? w : null); }} />}
    </div>
  );
}
