import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Button, DatePicker, Grid, Input, InputNumber, Modal, Popover, Progress, Radio, Result, Skeleton, Switch, Table, Tabs, TreeSelect } from 'antd';
import { PlusOutlined, QrcodeOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { HelpButton } from '../../../help/Hint';
import { fmtDate, fmtDateTime, dayFromPicker, dayToPicker } from '../../../lib/datetime';
import { PrintLabelsDialog } from '../../../components/ui/Labels';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { binLabel, categoryTree, formatQty, whError } from '../lib';
import { Empty, Hero, Money, PersonSelect, StatusPill, WarehouseSelect } from '../components/bits';

const STATUS_COLORS = { draft: '#94A3B8', counting: '#0EA5E9', review: '#8B5CF6', finished: '#10B981', cancelled: '#A1A1AA' };
const AREA_COLORS = { todo: '#94A3B8', counting: '#0EA5E9', done: '#10B981', recount: '#F59E0B' };
const CHIPS = ['active', 'counting', 'review', 'finished', 'cancelled'];

function SessionStatus({ status }) {
  const { t } = useLocale();
  return (
    <span className="wh-status" style={{ '--c': STATUS_COLORS[status] || '#94A3B8' }}>
      <span className="wh-status__dot" aria-hidden="true" />
      {t(`whm.inv.status.${status}`)}
    </span>
  );
}

function scopeText(session, t) {
  const parts = [...session.scope.bins.map((b) => b.path), ...session.scope.categories.map((c) => c.name)];
  return parts.length ? parts.join(', ') : t('whm.inv.full');
}

/** Bins of a warehouse as a tree for the scope picker. */
function useBinTree(warehouseId, enabled) {
  const [bins, setBins] = useState([]);
  useEffect(() => {
    if (!warehouseId || !enabled) {
      setBins([]);
      return;
    }
    whApi.bins(warehouseId).then((res) => setBins(res.data.bins)).catch(() => setBins([]));
  }, [warehouseId, enabled]);
  const tree = useMemo(() => {
    const byParent = new Map();
    for (const b of bins) byParent.set(b.parentId || 0, [...(byParent.get(b.parentId || 0) || []), b]);
    const build = (parent) => (byParent.get(parent) || []).map((b) => ({ value: b.id, title: b.path, children: build(b.id) }));
    return build(0);
  }, [bins]);
  return { bins, tree };
}

/** «Новая инвентаризация»: warehouse, scope (bins / categories), blind mode, freeze policy, counters. */
function CreateDialog({ open, onClose, onCreated, schedule }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { meta, warehouses } = useWh();
  const [form, setForm] = useState({ warehouseId: null, title: '', binIds: [], categoryIds: [], blind: false, freezePolicy: 'block', counters: [], start: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const own = warehouses.filter((w) => (w.rights || []).includes('inventory'));
    setForm((f) => ({
      ...f,
      warehouseId: schedule?.warehouse?.id || f.warehouseId || (own.length === 1 ? own[0].id : null),
      title: schedule?.title || f.title,
      categoryIds: schedule ? schedule.categories.map((c) => c.id) : f.categoryIds,
      binIds: schedule ? schedule.bins.map((b) => b.id) : f.binIds,
      blind: schedule ? schedule.blind : f.blind,
    }));
  }, [open, schedule, warehouses]);
  const wh = warehouses.find((w) => w.id === form.warehouseId);
  const { tree } = useBinTree(form.warehouseId, wh?.binsEnabled);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await whApi.createInventory({ ...form, scheduleId: schedule?.id });
      message.success(t('whm.inv.created', { number: res.data.session.number }));
      onCreated(res.data.session);
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onCancel={onClose} title={t('whm.inv.new')} okText={form.start ? t('whm.inv.createStart') : t('whm.inv.createDraft')} onOk={submit} okButtonProps={{ disabled: !form.warehouseId, loading: busy }} width={640} destroyOnClose>
      <div className="wh-stack whi-form">
        <label>
          <span>{t('wh.fields.warehouse')}</span>
          <WarehouseSelect value={form.warehouseId} onChange={(warehouseId) => setForm({ ...form, warehouseId, binIds: [] })} right="inventory" size="large" style={{ width: '100%' }} />
        </label>
        <label>
          <span>{t('whm.inv.titleField')}</span>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} placeholder={t('whm.inv.titlePlaceholder')} />
        </label>
        <div className="wh-form-grid">
          {wh?.binsEnabled && (
            <label>
              <span>{t('whm.inv.bins')}</span>
              <TreeSelect treeData={tree} value={form.binIds} onChange={(binIds) => setForm({ ...form, binIds })} multiple treeCheckable showCheckedStrategy={TreeSelect.SHOW_PARENT} placeholder={t('whm.inv.allBinsField')} style={{ width: '100%' }} allowClear />
            </label>
          )}
          <label>
            <span>{t('whm.inv.categories')}</span>
            <TreeSelect treeData={categoryTree(meta.categories)} value={form.categoryIds} onChange={(categoryIds) => setForm({ ...form, categoryIds })} multiple treeCheckable showCheckedStrategy={TreeSelect.SHOW_PARENT} placeholder={t('whm.inv.allCategories')} style={{ width: '100%' }} allowClear />
          </label>
        </div>
        <div className="whi-option">
          <Switch checked={form.blind} onChange={(blind) => setForm({ ...form, blind })} />
          <div>
            <strong>{t('whm.inv.blind')}</strong>
            <p className="wh-muted">{t('whm.inv.blindHelp')}</p>
          </div>
        </div>
        <div>
          <span className="whi-label">{t('whm.inv.freeze')}</span>
          <Radio.Group value={form.freezePolicy} onChange={(e) => setForm({ ...form, freezePolicy: e.target.value })} className="whi-radios">
            <Radio value="block"><strong>{t('whm.inv.freezeBlock')}</strong><em>{t('whm.inv.freezeBlockHelp')}</em></Radio>
            <Radio value="record"><strong>{t('whm.inv.freezeRecord')}</strong><em>{t('whm.inv.freezeRecordHelp')}</em></Radio>
          </Radio.Group>
        </div>
        <label>
          <span>{t('whm.inv.counters')}</span>
          <PersonSelect mode="multiple" value={form.counters} onChange={(counters) => setForm({ ...form, counters: counters || [] })} placeholder={t('whm.inv.countersPlaceholder')} style={{ width: '100%' }} />
        </label>
        <div className="whi-option">
          <Switch checked={form.start} onChange={(start) => setForm({ ...form, start })} />
          <div>
            <strong>{t('whm.inv.startNow')}</strong>
            <p className="wh-muted">{t('whm.inv.startNowHelp')}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Areas (bins) with status and counters; select several and assign them to a person. */
function AreasTab({ card, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [selected, setSelected] = useState([]);
  const [person, setPerson] = useState(null);
  const [labels, setLabels] = useState(null);
  const s = card.session;
  const assign = async (userId) => {
    try {
      const res = await whApi.inventoryAssign(s.id, { binIds: selected.map((id) => id || 0), userId });
      onChanged(res.data);
      setSelected([]);
      message.success(t('whm.inv.assigned'));
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  const addPeople = async (ids) => {
    try {
      const res = await whApi.inventoryPeople(s.id, { userIds: ids });
      onChanged(res.data);
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  const toggle = (binId) => setSelected((list) => (list.includes(binId) ? list.filter((x) => x !== binId) : [...list, binId]));
  const groups = useMemo(() => {
    const out = new Map();
    for (const a of card.areas) {
      const zone = a.path ? a.path.split('-')[0] : '—';
      out.set(zone, [...(out.get(zone) || []), a]);
    }
    return [...out.entries()];
  }, [card.areas]);
  return (
    <div className="wh-stack">
      <div className="whi-people">
        <strong>{t('whm.inv.counters')}</strong>
        {s.people.map((p) => <span key={p.id} className="whi-person">{p.name}</span>)}
        {card.my.assign && <PersonSelect value={null} onChange={(id) => id && addPeople([id])} placeholder={t('whm.inv.addCounter')} style={{ minWidth: 220 }} allowClear={false} />}
      </div>
      {card.my.assign && (
        <div className="mod-toolbar whi-assignbar">
          <span>{t('whm.inv.selected', { n: selected.length })}</span>
          <PersonSelect value={person} onChange={setPerson} placeholder={t('whm.inv.assignTo')} style={{ minWidth: 220 }} />
          <Button type="primary" disabled={!selected.length || !person} onClick={() => assign(person)}>{t('whm.inv.assign')}</Button>
          <Button disabled={!selected.length} onClick={() => assign(null)}>{t('whm.inv.unassign')}</Button>
          <Button onClick={() => setSelected(selected.length ? [] : card.areas.map((a) => a.binId))}>{selected.length ? t('whm.inv.selectNone') : t('whm.inv.selectAll')}</Button>
          {s.warehouse.binsEnabled && <Button icon={<QrcodeOutlined />} onClick={() => setLabels(card.areas.filter((a) => a.binId && (!selected.length || selected.includes(a.binId))).map((a) => binLabel({ id: a.binId, path: a.path }, s.warehouse)))}>{t('whm.inv.printBins')}</Button>}
        </div>
      )}
      {groups.map(([zone, areas]) => (
        <section key={zone} className="whi-zone">
          {groups.length > 1 && (
            <button type="button" className="whi-zone__head" onClick={() => setSelected((list) => (areas.every((a) => list.includes(a.binId)) ? list.filter((x) => !areas.some((a) => a.binId === x)) : [...new Set([...list, ...areas.map((a) => a.binId)])]))}>
              {zone === '—' ? t('whm.inv.noBin') : zone} · {areas.filter((a) => a.status === 'done').length}/{areas.length}
            </button>
          )}
          <div className="whi-areas">
            {areas.map((a) => (
              <button key={a.id} type="button" className={`whi-area${selected.includes(a.binId) ? ' is-selected' : ''}`} style={{ '--c': AREA_COLORS[a.status] }} onClick={() => card.my.assign && toggle(a.binId)} aria-pressed={selected.includes(a.binId)}>
                <strong>{a.path || t('whm.inv.noBin')}</strong>
                <em>{t(`whm.inv.area.${a.status}`)}{a.counted ? ` · ${a.counted}` : ''}</em>
                <small>{a.assignee?.name || t('whm.inv.nobody')}{a.counters > 1 ? ` · ${t('whm.inv.nCounters', { n: a.counters })}` : ''}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
      <PrintLabelsDialog open={Boolean(labels)} items={labels || []} onClose={() => setLabels(null)} defaultFormat="58x40" />
    </div>
  );
}

/** Reconciliation «учёт / факт / разница / сумма разницы» (spec §6.3). */
function ReconcileTab({ card, data, onlyDiff, setOnlyDiff, reload, setData }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const s = card.session;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;
  const sum = data.summary;
  const recount = async (row, whole = false) => {
    try {
      await whApi.inventoryAction(s.id, 'recount', { binId: row.binId || 0, itemId: whole ? null : row.itemId });
      message.success(t('whm.inv.recountSent'));
      reload();
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  const decide = async (row, qty) => {
    try {
      const res = await whApi.inventoryFinal(s.id, { binId: row.binId, itemId: row.itemId, instanceId: row.instanceId, qty, onlyDiff: onlyDiff ? '1' : undefined });
      setData(res.data);
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  const decidePopover = (row) => (
    <div className="whi-decide">
      {row.counters.map((c) => (
        <Button key={c.counterId} size="small" onClick={() => decide(row, c.qty)}>{c.name}: {formatQty(c.qty, locale)}</Button>
      ))}
      <Button size="small" onClick={() => decide(row, row.counters.reduce((a, c) => a + c.qty, 0))}>{t('whm.inv.takeSum')}</Button>
      <InputNumber size="small" min={0} placeholder={t('whm.inv.manual')} onPressEnter={(e) => decide(row, e.target.value)} />
      {row.final !== null && <Button size="small" type="link" onClick={() => decide(row, null)}>{t('whm.inv.clearDecision')}</Button>}
    </div>
  );
  const columns = [
    { key: 'bin', title: t('wh.fields.bin'), width: 110, render: (_, r) => r.bin?.path || <span className="wh-muted">{t('whm.inv.noBin')}</span> },
    {
      key: 'item',
      title: t('wh.fields.item'),
      render: (_, r) => (
        <span className="wh-item-cell">
          <strong>{r.item.name}</strong>
          <em>{[r.item.sku, r.instance?.inventoryNo, r.item.category].filter(Boolean).join(' · ')}</em>
          {r.elsewhere && <em className="wh-red">{t('whm.inv.elsewhere')}</em>}
        </span>
      ),
    },
    { key: 'book', title: t('whm.inv.book'), align: 'right', width: 100, render: (_, r) => `${formatQty(r.book, locale)} ${r.item.baseUnit || ''}` },
    {
      key: 'counted',
      title: t('whm.inv.counted'),
      align: 'right',
      width: 150,
      render: (_, r) => (
        <span className="whi-counted">
          <strong>{formatQty(r.counted, locale)}</strong>
          {r.counters.length > 1 && <small>{r.counters.map((c) => `${c.name.split(' ')[0]} ${formatQty(c.qty, locale)}`).join(' + ')}</small>}
          {r.conflict && <span className="wh-flag is-amber">{t('whm.inv.conflict')}</span>}
          {r.final !== null && <span className="wh-flag is-green">{t('whm.inv.decided')}</span>}
        </span>
      ),
    },
    { key: 'diff', title: t('whm.inv.diff'), align: 'right', width: 100, render: (_, r) => (r.diff === null ? <span className="wh-muted">{t('whm.inv.area.todo')}</span> : <strong className={r.diff > 0 ? 'whi-plus' : r.diff < 0 ? 'whi-minus' : ''}>{r.diff > 0 ? '+' : ''}{formatQty(r.diff, locale)}</strong>) },
    data.cost && { key: 'sum', title: t('whm.inv.diffSum'), align: 'right', width: 120, render: (_, r) => (r.sum ? <span className={r.sum > 0 ? 'whi-plus' : 'whi-minus'}><Money amount={r.sum} /></span> : '—') },
    {
      key: 'act',
      title: '',
      width: 190,
      render: (_, r) =>
        card.my.recount && (
          <span className="wh-inline">
            {r.recount ? <span className="wh-flag is-amber">{t('whm.inv.recountAsked')}</span> : <Button size="small" onClick={() => recount(r)}>{t('whm.inv.recountBtn')}</Button>}
            {(r.conflict || r.final !== null || r.counters.length > 1) && (
              <Popover content={decidePopover(r)} trigger="click" title={t('whm.inv.decide')}>
                <Button size="small" type="link">{t('whm.inv.decide')}</Button>
              </Popover>
            )}
          </span>
        ),
    },
  ].filter(Boolean);
  const rowClass = (r) => (r.status === 'shortage' ? 'is-red' : r.status === 'surplus' ? 'is-green' : r.conflict ? 'is-amber' : '');
  return (
    <div className="wh-stack">
      <div className="whi-kpis">
        <div><span>{t('whm.inv.kpi.compared')}</span><strong>{sum.compared}</strong></div>
        <div className="is-green"><span>{t('whm.inv.kpi.matches')}</span><strong>{sum.matches}</strong></div>
        <div className="is-blue"><span>{t('whm.inv.kpi.surplus')}</span><strong>{sum.surplus}</strong>{data.cost && <Money amount={sum.surplusSum} />}</div>
        <div className="is-red"><span>{t('whm.inv.kpi.shortage')}</span><strong>{sum.shortage}</strong>{data.cost && <Money amount={sum.shortageSum} />}</div>
        <div className="is-amber"><span>{t('whm.inv.kpi.conflicts')}</span><strong>{sum.conflicts}</strong></div>
        {sum.pending > 0 && <div><span>{t('whm.inv.kpi.pending')}</span><strong>{sum.pending}</strong></div>}
      </div>
      {data.approvalExpected && <div className="wh-banner is-amber">{t('whm.inv.approvalExpected', { amount: data.approvalThreshold.amount, currency: data.approvalThreshold.currency })}</div>}
      {data.moves.length > 0 && (
        <div className="wh-banner is-amber">
          <span>
            <strong>{t('whm.inv.movesTitle', { n: data.moves.length })}</strong>
            <br />
            {data.moves.slice(0, 6).map((m) => `${m.doc.number}: ${m.item.name} ${m.qty > 0 ? '+' : ''}${formatQty(m.qty, locale)}`).join(' · ')}
          </span>
        </div>
      )}
      <div className="mod-toolbar">
        <label className="wh-inline">
          <Switch checked={onlyDiff} onChange={setOnlyDiff} />
          <span>{t('whm.inv.onlyDiff')}</span>
        </label>
      </div>
      {!data.rows.length ? (
        <Empty icon="✅" title={onlyDiff ? t('whm.inv.noDiff') : t('whm.inv.noRows')} />
      ) : screens.md ? (
        <section className="panel wh-table">
          <Table size="small" rowKey="key" columns={columns} dataSource={data.rows} pagination={data.rows.length > 100 ? { pageSize: 100 } : false} rowClassName={rowClass} scroll={{ x: 'max-content' }} />
        </section>
      ) : (
        <div className="wh-mlines">
          {data.rows.map((r) => (
            <div key={r.key} className={`wh-mline whi-mrow ${rowClass(r)}`}>
              {columns[1].render(null, r)}
              <span className="wh-mline__side">
                <small>{r.bin?.path || t('whm.inv.noBin')}</small>
                <span>{formatQty(r.book, locale)} → <strong>{formatQty(r.counted, locale)}</strong></span>
                {columns[4].render(null, r)}
                {r.conflict && <span className="wh-flag is-amber">{t('whm.inv.conflict')}</span>}
                {card.my.recount && !r.recount && <Button size="small" onClick={() => recount(r)}>{t('whm.inv.recountBtn')}</Button>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One inventory session: progress by bins, assignment, reconciliation, finish → one act. */
function SessionView({ id }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { touch } = useWh();
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('areas');
  const [rec, setRec] = useState(null);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => whApi.inventory(id).then((res) => setCard(res.data)).catch(setError), [id]);
  const loadRec = useCallback(() => {
    whApi
      .inventoryReconcile(id, { onlyDiff: onlyDiff ? '1' : undefined })
      .then((res) => setRec(res.data))
      .catch((err) => {
        setRec(null);
        if (err?.response?.data?.code === 'BLIND') message.info(whError(err, t));
      });
  }, [id, onlyDiff, message, t]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (tab === 'reconcile' && card?.my?.reconcile) loadRec();
  }, [tab, card?.my?.reconcile, loadRec]);
  useEffect(() => {
    // Counting goes on on the phones: refresh the progress.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        load();
        if (tab === 'reconcile') loadRec();
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [load, loadRec, tab]);
  const act = async (action, payload, done) => {
    setBusy(action);
    try {
      const res = await whApi.inventoryAction(id, action, payload);
      setCard(res.data);
      if (done) message.success(done);
      touch();
      return res.data;
    } catch (err) {
      message.error(whError(err, t));
      return null;
    } finally {
      setBusy(null);
    }
  };
  const finish = async () => {
    let summary = rec;
    try {
      summary = (await whApi.inventoryReconcile(id, {})).data;
    } catch {
      /* the server checks again */
    }
    const notDone = summary?.notDone ?? card.areas.filter((a) => a.status !== 'done').length;
    modal.confirm({
      title: t('whm.inv.finishTitle'),
      width: 520,
      content: (
        <div className="wh-confirm">
          <p>{t('whm.inv.finishText')}</p>
          {summary && <p>{t('whm.inv.finishSummary', { matches: summary.summary.matches, surplus: summary.summary.surplus, shortage: summary.summary.shortage })}</p>}
          {summary?.cost && summary.summary.grossSum !== null && <p><Money amount={summary.summary.netSum} strong /></p>}
          {summary?.summary?.conflicts > 0 && <div className="wh-banner is-amber">{t('whm.inv.finishConflicts', { n: summary.summary.conflicts })}</div>}
          {notDone > 0 && <div className="wh-banner is-amber">{t('whm.inv.finishNotDone', { n: notDone })}</div>}
          {summary?.approvalExpected && <div className="wh-banner">{t('whm.inv.approvalExpected', { amount: summary.approvalThreshold.amount, currency: summary.approvalThreshold.currency })}</div>}
        </div>
      ),
      okText: t('whm.inv.finishOk'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const out = await act('finish', { force: notDone > 0 });
        if (!out) return;
        if (out.postError) message.warning(whError({ response: { data: { code: out.postError.code, error: out.postError.message } } }, t));
        else message.success(out.session.doc?.status === 'pending' ? t('whm.inv.finishedApproval', { number: out.session.doc.number }) : t('whm.inv.finishedPosted', { number: out.session.doc?.number }));
      },
    });
  };
  if (error) return <Result status={error?.response?.status === 404 ? '404' : 'warning'} title={whError(error, t)} extra={<Button onClick={() => navigate('/app/warehouse/inventory')}>{t('whm.back')}</Button>} />;
  if (!card) return <Skeleton active paragraph={{ rows: 10 }} />;
  const s = card.session;
  const my = card.my;
  return (
    <div className="wh-page whi-page">
      <header className="whi-head">
        <div className="whi-head__main">
          <div className="wh-card__eyebrow">
            <span className="wh-card__no">{s.number}</span>
            <SessionStatus status={s.status} />
            {s.blind && <span className="wh-flag">{t('whm.inv.blind')}</span>}
            <span className="wh-flag">{s.freezePolicy === 'block' ? t('whm.inv.freezeBlock') : t('whm.inv.freezeRecord')}</span>
          </div>
          <h1>{s.title || t('whm.inv.untitled')}</h1>
          <p className="wh-muted">{s.warehouse.name} · {scopeText(s, t)} · {s.startedAt ? fmtDateTime(s.startedAt) : fmtDateTime(s.createdAt)}{s.createdBy ? ` · ${s.createdBy.name}` : ''}</p>
        </div>
        <div className="whi-head__progress">
          <Progress type="circle" percent={s.progress.percent} size={76} strokeColor="#10B981" />
          <span>{t('whm.inv.progress', { done: s.progress.done, total: s.progress.total })}</span>
        </div>
      </header>
      {s.freezes && <div className="wh-banner is-red">🔒 {t('whm.freeze.blocked', { scope: scopeText(s, t) })}</div>}
      {s.doc && (
        <div className={`wh-banner ${s.doc.status === 'posted' ? 'is-green' : s.doc.status === 'pending' ? 'is-amber' : ''}`}>
          <span>{t('whm.inv.act', { number: s.doc.number })} · <StatusPill status={s.doc.status} size="small" /></span>
          <Button size="small" onClick={() => navigate(s.doc.url)}>{t('whm.done.open')}</Button>
        </div>
      )}
      <div className="wh-card__actions">
        {my.start && <Button type="primary" loading={busy === 'start'} onClick={() => act('start', null, t('whm.inv.started'))}>{t('whm.inv.start')}</Button>}
        {my.finish && <Button type="primary" loading={busy === 'finish'} onClick={finish} data-testid="inv-finish">{t('whm.inv.finish')}</Button>}
        {my.close && <Button loading={busy === 'close'} onClick={() => act('close', null, t('whm.inv.closedDone'))}>{t('whm.inv.close')}</Button>}
        {my.reopen && <Button loading={busy === 'reopen'} onClick={() => act('reopen')}>{t('whm.inv.reopen')}</Button>}
        {my.count && <Button onClick={() => navigate(`/app/warehouse/m/inventory/${s.id}`)}>{t('whm.inv.countOnPhone')}</Button>}
        {my.cancel && <Button danger onClick={() => modal.confirm({ title: t('whm.inv.cancelTitle'), content: t('whm.inv.cancelText'), okText: t('whm.inv.cancel'), okButtonProps: { danger: true }, cancelText: t('common.cancel'), onOk: () => act('cancel') })}>{t('whm.inv.cancel')}</Button>}
      </div>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'areas', label: `${t('whm.inv.tabAreas')} · ${s.progress.done}/${s.progress.total}`, children: <AreasTab card={card} onChanged={setCard} /> },
          my.reconcile && { key: 'reconcile', label: t('whm.inv.tabReconcile'), children: <ReconcileTab card={card} data={rec} onlyDiff={onlyDiff} setOnlyDiff={setOnlyDiff} reload={() => { load(); loadRec(); }} setData={setRec} /> },
        ].filter(Boolean)}
      />
    </div>
  );
}

/** Regular partial counts: «каждые N дней по категории X» with a reminder (spec §6.5). */
function SchedulesTab({ onStart }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const { meta, warehouses } = useWh();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => whApi.inventorySchedules().then((res) => setList(res.data.schedules)).catch(() => setList([])), []);
  useEffect(() => {
    load();
  }, [load]);
  const wh = warehouses.find((w) => w.id === edit?.warehouseId);
  const { tree } = useBinTree(edit?.warehouseId, wh?.binsEnabled);
  const save = async () => {
    try {
      const res = await whApi.saveInventorySchedule(edit.id, edit);
      setList(res.data.schedules);
      setEdit(null);
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  const remove = (s) =>
    modal.confirm({
      title: t('whm.sched.deleteTitle'),
      okButtonProps: { danger: true },
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: () => whApi.deleteInventorySchedule(s.id).then((res) => setList(res.data.schedules)).catch((err) => message.error(whError(err, t))),
    });
  const columns = [
    { key: 'title', title: t('whm.inv.titleField'), render: (_, s) => <span className="wh-item-cell"><strong>{s.title || t('whm.inv.untitled')}</strong><em>{s.warehouse.name}</em></span> },
    { key: 'scope', title: t('whm.sched.scope'), render: (_, s) => [...s.categories.map((c) => c.name), ...s.bins.map((b) => b.path)].join(', ') || t('whm.inv.full') },
    { key: 'every', title: t('whm.sched.every'), width: 130, render: (_, s) => t('whm.sched.everyN', { n: s.everyDays }) },
    { key: 'next', title: t('whm.sched.next'), width: 130, render: (_, s) => <span className={s.nextOn <= new Date().toISOString().slice(0, 10) ? 'wh-red' : ''}>{fmtDate(s.nextOn)}</span> },
    {
      key: 'act',
      title: '',
      width: 260,
      render: (_, s) => (
        <span className="wh-inline">
          {s.active ? <span className="wh-flag">{s.active.number}</span> : <Button size="small" type="primary" onClick={() => onStart(s)}>{t('whm.sched.startNow')}</Button>}
          <Button size="small" onClick={() => setEdit({ id: s.id, warehouseId: s.warehouse.id, title: s.title, categoryIds: s.categories.map((c) => c.id), binIds: s.bins.map((b) => b.id), everyDays: s.everyDays, nextOn: s.nextOn, blind: s.blind, enabled: s.enabled })}>{t('common.edit')}</Button>
          <Button size="small" danger type="text" onClick={() => remove(s)}>✕</Button>
        </span>
      ),
    },
  ];
  return (
    <div className="wh-stack">
      <p className="wh-muted">{t('whm.sched.lead')}</p>
      <div>
        <Button icon={<PlusOutlined />} onClick={() => setEdit({ id: null, warehouseId: null, title: '', categoryIds: [], binIds: [], everyDays: 30, nextOn: new Date().toISOString().slice(0, 10), blind: false, enabled: true })}>{t('whm.sched.add')}</Button>
      </div>
      {!list ? <Skeleton active /> : list.length ? (
        <section className="panel wh-table">
          <Table size="small" rowKey="id" columns={columns} dataSource={list} pagination={false} scroll={{ x: 'max-content' }} />
        </section>
      ) : <Empty icon="🗓" title={t('whm.sched.empty')} text={t('whm.sched.emptyText')} />}
      <Modal open={Boolean(edit)} onCancel={() => setEdit(null)} title={edit?.id ? t('whm.sched.edit') : t('whm.sched.add')} onOk={save} okButtonProps={{ disabled: !edit?.warehouseId }} destroyOnClose>
        {edit && (
          <div className="wh-stack whi-form">
            <label><span>{t('wh.fields.warehouse')}</span><WarehouseSelect value={edit.warehouseId} onChange={(warehouseId) => setEdit({ ...edit, warehouseId, binIds: [] })} right="inventory" style={{ width: '100%' }} /></label>
            <label><span>{t('whm.inv.titleField')}</span><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder={t('whm.sched.titlePlaceholder')} /></label>
            <label><span>{t('whm.inv.categories')}</span><TreeSelect treeData={categoryTree(meta.categories)} value={edit.categoryIds} onChange={(categoryIds) => setEdit({ ...edit, categoryIds })} multiple treeCheckable showCheckedStrategy={TreeSelect.SHOW_PARENT} placeholder={t('whm.inv.allCategories')} style={{ width: '100%' }} /></label>
            {wh?.binsEnabled && <label><span>{t('whm.inv.bins')}</span><TreeSelect treeData={tree} value={edit.binIds} onChange={(binIds) => setEdit({ ...edit, binIds })} multiple treeCheckable showCheckedStrategy={TreeSelect.SHOW_PARENT} placeholder={t('whm.inv.allBinsField')} style={{ width: '100%' }} /></label>}
            <div className="wh-form-grid">
              <label><span>{t('whm.sched.every')}</span><InputNumber min={1} max={366} value={edit.everyDays} onChange={(everyDays) => setEdit({ ...edit, everyDays })} addonAfter={t('whm.sched.days')} style={{ width: '100%' }} /></label>
              <label><span>{t('whm.sched.next')}</span><DatePicker value={dayToPicker(edit.nextOn)} onChange={(d) => setEdit({ ...edit, nextOn: dayFromPicker(d) })} style={{ width: '100%' }} /></label>
            </div>
            <label className="wh-inline"><Switch checked={edit.blind} onChange={(blind) => setEdit({ ...edit, blind })} /><span>{t('whm.inv.blind')}</span></label>
            <label className="wh-inline"><Switch checked={edit.enabled} onChange={(enabled) => setEdit({ ...edit, enabled })} /><span>{t('whm.sched.enabled')}</span></label>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** /app/warehouse/inventory[/:id] — inventory sessions (spec §6, §8.6). */
export default function InventoryPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { id } = useParams();
  const screens = Grid.useBreakpoint();
  const { version } = useWh();
  const [search, setSearch] = useSearchParams();
  const [chip, setChip] = useState('active');
  const [data, setData] = useState(null);
  const [view, setView] = useState(search.get('tab') === 'schedules' ? 'schedules' : 'sessions');
  const [create, setCreate] = useState(false);
  const [schedule, setSchedule] = useState(null);
  useEffect(() => {
    const scheduleId = Number(search.get('schedule'));
    if (!scheduleId) return;
    whApi
      .inventorySchedules()
      .then((res) => {
        const found = res.data.schedules.find((s) => s.id === scheduleId);
        if (found) {
          setSchedule(found);
          setCreate(true);
        }
      })
      .catch(() => {});
    const next = new URLSearchParams(search);
    next.delete('schedule');
    setSearch(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (id) return;
    whApi
      .inventories(chip === 'active' ? { active: '1' } : chip === 'all' ? {} : { status: chip })
      .then((res) => setData(res.data))
      .catch(() => setData({ items: [], counters: {} }));
  }, [chip, id, version]);
  if (id) return <SessionView key={id} id={Number(id)} />;
  const columns = [
    { key: 'number', title: t('wh.fields.number'), width: 120, render: (_, s) => <span className="wh-no">{s.number}</span> },
    { key: 'title', title: t('whm.inv.titleField'), render: (_, s) => <span className="wh-item-cell"><strong>{s.title || t('whm.inv.untitled')}</strong><em>{s.warehouse.name} · {scopeText(s, t)}</em></span> },
    { key: 'status', title: t('wh.fields.status'), width: 150, render: (_, s) => <SessionStatus status={s.status} /> },
    { key: 'progress', title: t('whm.inv.progressCol'), width: 180, render: (_, s) => <span className="whi-progress"><Progress percent={s.progress.percent} size="small" strokeColor="#10B981" /><small>{t('whm.inv.progress', { done: s.progress.done, total: s.progress.total })}</small></span> },
    { key: 'people', title: t('whm.inv.counters'), width: 180, ellipsis: true, render: (_, s) => s.people.map((p) => p.name).join(', ') || '—' },
    { key: 'doc', title: t('whm.inv.actCol'), width: 140, render: (_, s) => (s.doc ? <StatusPill status={s.doc.status} size="small" /> : '—') },
    { key: 'date', title: t('wh.fields.date'), width: 140, render: (_, s) => fmtDateTime(s.startedAt || s.createdAt) },
  ];
  return (
    <div className="wh-page">
      <Hero icon="checklist" title={t('whm.nav.inventory')} lead={t('whm.inv.lead')}>
        <HelpButton id="warehouse" section="inventory" />
        {data?.canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setSchedule(null); setCreate(true); }}>{t('whm.inv.new')}</Button>}
      </Hero>
      <Tabs activeKey={view} onChange={setView} items={[{ key: 'sessions', label: t('whm.inv.tabSessions') }, data?.canCreate && { key: 'schedules', label: t('whm.inv.tabSchedules') }].filter(Boolean)} />
      {view === 'schedules' ? (
        <SchedulesTab onStart={(s) => { setSchedule(s); setCreate(true); }} />
      ) : (
        <>
          <div className="wh-chips" role="tablist">
            {[...CHIPS, 'all'].map((c) => (
              <button key={c} type="button" className={`wh-chip${chip === c ? ' is-active' : ''}`} onClick={() => setChip(c)}>
                {t(`whm.inv.chips.${c}`)}
                {data?.counters?.[c] !== undefined && <em>{data.counters[c]}</em>}
              </button>
            ))}
          </div>
          {!data ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : !data.items.length ? (
            <Empty icon="📋" title={t('whm.inv.emptyTitle')} text={data.canCreate ? t('whm.inv.emptyManage') : t('whm.inv.emptyText')} />
          ) : screens.md ? (
            <section className="panel wh-table">
              <Table rowKey="id" size="middle" columns={columns} dataSource={data.items} onRow={(s) => ({ onClick: () => navigate(`/app/warehouse/inventory/${s.id}`) })} pagination={false} scroll={{ x: 'max-content' }} />
            </section>
          ) : (
            <div className="wh-cards">
              {data.items.map((s) => (
                <button key={s.id} type="button" className="wh-tile" onClick={() => navigate(`/app/warehouse/inventory/${s.id}`)}>
                  <span className="wh-tile__top"><span className="wh-no">{s.number}</span><SessionStatus status={s.status} /></span>
                  <strong>{s.title || t('whm.inv.untitled')}</strong>
                  <span className="wh-muted">{s.warehouse.name} · {scopeText(s, t)}</span>
                  <Progress percent={s.progress.percent} size="small" strokeColor="#10B981" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <CreateDialog open={create} schedule={schedule} onClose={() => setCreate(false)} onCreated={(s) => { setCreate(false); navigate(`/app/warehouse/inventory/${s.id}`); }} />
    </div>
  );
}
