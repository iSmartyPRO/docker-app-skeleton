import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, DatePicker, Drawer, Grid, Input, InputNumber, Result, Segmented, Skeleton, Table } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { HelpButton } from '../../../help/Hint';
import { fmtDate, fmtDateTime, dayFromPicker, dayToPicker } from '../../../lib/datetime';
import { PrintLabelsDialog } from '../../../components/ui/Labels';
import { ScanButton } from '../../../components/ui/BarcodeScanner';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { scanFeedback, toolLabel, whError } from '../lib';
import { Chips, Empty, FilesBlock, Hero, Money, TypeTag } from '../components/bits';

const TOOL_CHIPS = ['mine', 'issued', 'in_stock', 'repair', 'service_soon'];

/** «Где сейчас»: a warehouse (and bin), a person or an object. */
export function WhereNow({ where }) {
  const { t } = useLocale();
  if (!where) return <span className="wh-muted">—</span>;
  return (
    <span className={`wh-where is-${where.type}`}>
      <span className="wh-where__dot" />
      <span>
        <strong>{where.label}</strong>
        <em>{where.type === 'warehouse' ? where.bin?.path || t('wh.holders.warehouse') : t(`wh.holders.${where.type}`)}</em>
      </span>
    </span>
  );
}

export function ServiceBadge({ tool }) {
  const { t } = useLocale();
  if (!tool.nextServiceOn) return <span className="wh-muted">—</span>;
  return <span className={`wh-flag ${tool.serviceState === 'overdue' ? 'is-red' : tool.serviceState === 'soon' ? 'is-amber' : ''}`}>{t('wh.tools.serviceBy', { date: fmtDate(tool.nextServiceOn) })}</span>;
}

/** The instance card: where it is, its whole history, state and service. */
function ToolCard({ id, onClose, onChanged }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [labels, setLabels] = useState(false);
  const load = () => whApi.tool(id).then((res) => setData(res.data)).catch(setError);
  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const update = async (patch) => {
    try {
      const res = await whApi.updateTool(id, patch);
      setData(res.data);
      onChanged?.();
      message.success(t('wh.saved'));
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  const tool = data?.tool;
  return (
    <Drawer open onClose={onClose} width={screens.md ? 640 : '100%'} className="wh-card" destroyOnClose mask={!screens.md} title={tool ? <div className="wh-card__head"><div><div className="wh-card__eyebrow"><span className="wh-card__no">{tool.inventoryNo}</span><span className={`wh-flag ${tool.state === 'repair' ? 'is-amber' : tool.state === 'written_off' ? 'is-red' : 'is-green'}`}>{t(`wh.instanceStates.${tool.state}`)}</span></div><h2 className="wh-card__title">{tool.item.name}</h2><div className="wh-card__facts">{tool.serialNo && <span>S/N {tool.serialNo}</span>}<Money amount={tool.cost} /></div></div></div> : <Skeleton.Input active size="small" />}>
      {error ? (
        <Result status="404" title={t('wh.tools.notFound')} />
      ) : !data ? (
        <Skeleton active />
      ) : (
        <div className="wh-stack">
          <div className="wh-where-big">
            <span className="wh-muted">{t('wh.tools.whereNow')}</span>
            <WhereNow where={tool.where} />
            {tool.since && <small className="wh-muted">{t('wh.tools.since', { date: fmtDateTime(tool.since) })}</small>}
          </div>
          <div className="wh-card__actions">
            <Button onClick={() => setLabels(true)}>{t('wh.labels.print')}</Button>
            {data.my.canEdit && tool.state === 'ok' && <Button onClick={() => update({ state: 'repair' })}>{t('wh.tools.toRepair')}</Button>}
            {data.my.canEdit && tool.state === 'repair' && <Button onClick={() => update({ state: 'ok' })}>{t('wh.tools.repaired')}</Button>}
            {data.my.canEdit && tool.nextServiceOn && <Button onClick={() => update({ serviced: true })}>{t('wh.tools.serviced')}</Button>}
            {data.my.canHandover && <Button type="primary" onClick={() => navigate('/app/warehouse/my-tools')}>{t('wh.tools.handover')}</Button>}
          </div>
          <dl className="wh-facts">
            <dt>{t('wh.tools.nextService')}</dt>
            <dd>{data.my.canEdit ? <DatePicker value={dayToPicker(tool.nextServiceOn)} onChange={(d) => update({ nextServiceOn: dayFromPicker(d) })} /> : tool.nextServiceOn ? fmtDate(tool.nextServiceOn) : '—'} <ServiceBadge tool={tool} /></dd>
            <dt>{t('wh.tools.interval')}</dt>
            <dd>{data.my.canEdit ? <InputNumber min={0} defaultValue={tool.serviceIntervalDays ?? undefined} onBlur={(e) => update({ serviceIntervalDays: e.target.value || null })} addonAfter={t('wh.days')} /> : tool.serviceIntervalDays || '—'}</dd>
            <dt>{t('wh.tools.warranty')}</dt>
            <dd>{data.my.canEdit ? <DatePicker value={dayToPicker(tool.warrantyUntil)} onChange={(d) => update({ warrantyUntil: dayFromPicker(d) })} /> : tool.warrantyUntil ? fmtDate(tool.warrantyUntil) : '—'}</dd>
            <dt>{t('wh.tools.purchased')}</dt>
            <dd>{tool.purchasedOn ? fmtDate(tool.purchasedOn) : '—'}</dd>
            {data.my.canEdit && (
              <>
                <dt>{t('wh.fields.comment')}</dt>
                <dd><Input.TextArea defaultValue={tool.note} onBlur={(e) => e.target.value !== tool.note && update({ note: e.target.value })} autoSize={{ minRows: 1, maxRows: 4 }} /></dd>
              </>
            )}
          </dl>
          <h3>{t('wh.tools.history')}</h3>
          <ul className="wh-moves">
            {data.history.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => navigate(`/app/warehouse/documents/${h.docId}`)}>
                  <TypeTag type={h.type} compact />
                  <span className="wh-moves__text"><strong>{h.to.label}</strong><em>{h.number} · {fmtDateTime(h.at)}</em></span>
                </button>
              </li>
            ))}
          </ul>
          <h3>{t('wh.item.tabs.photos')}</h3>
          <FilesBlock owner="tools" ownerId={tool.id} files={data.files} canEdit={data.my.canEdit} kind="photo" accept="image/*" onChanged={load} />
        </div>
      )}
      <PrintLabelsDialog open={labels} items={tool ? [toolLabel(tool)] : []} onClose={() => setLabels(false)} />
    </Drawer>
  );
}

/** Tools and equipment (spec §8.5): the registry with «где сейчас», chips «у меня», «в ремонте», «ТО скоро». */
export default function ToolsPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { id } = useParams();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { version, touch } = useWh();
  const [chip, setChip] = useState(undefined);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [view, setView] = useState('list');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    let alive = true;
    setData(null);
    whApi.tools({ chip, q: query || undefined }).then((res) => alive && setData(res.data)).catch(() => alive && setData({ items: [] }));
    return () => {
      alive = false;
    };
  }, [chip, query, version]);
  const openId = id && /^\d+$/.test(id) ? Number(id) : null;
  const onScan = async (code) => {
    try {
      const res = await whApi.resolve(code);
      scanFeedback(true);
      if (res.data.instance) navigate(`/app/warehouse/tools/${res.data.instance.id}`);
      else message.info(t('wh.tools.notATool'));
    } catch (err) {
      scanFeedback(false);
      message.warning(whError(err, t));
    }
  };
  const groups = new Map();
  for (const tool of data?.items || []) {
    const key = tool.where ? `${tool.where.type}:${tool.where.id}` : 'none';
    if (!groups.has(key)) groups.set(key, { where: tool.where, tools: [] });
    groups.get(key).tools.push(tool);
  }
  const columns = [
    { key: 'inv', title: t('wh.tools.inventoryNo'), width: 140, render: (_, tool) => <span className="wh-no">{tool.inventoryNo}</span> },
    { key: 'item', title: t('wh.fields.item'), render: (_, tool) => <span className="wh-item-cell"><strong>{tool.item.name}</strong><em>{tool.serialNo ? `S/N ${tool.serialNo}` : ''}</em></span> },
    { key: 'where', title: t('wh.tools.whereNow'), width: 230, render: (_, tool) => <WhereNow where={tool.where} /> },
    { key: 'state', title: t('wh.fields.status'), width: 120, render: (_, tool) => <span className={`wh-flag ${tool.state === 'repair' ? 'is-amber' : tool.state === 'written_off' ? 'is-red' : 'is-green'}`}>{t(`wh.instanceStates.${tool.state}`)}</span> },
    { key: 'service', title: t('wh.tools.nextService'), width: 150, render: (_, tool) => <ServiceBadge tool={tool} /> },
  ];
  return (
    <div className="wh-page">
      <Hero icon="wrench" title={t('wh.nav.tools')} lead={t('wh.tools.lead')}>
        <HelpButton id="warehouse" section="tools" />
        <ScanButton onScan={onScan} type="default" tooltip={t('wh.scan.find')} />
      </Hero>
      <Chips chips={TOOL_CHIPS} value={chip} onChange={setChip} prefix="wh.toolChips" />
      <div className="mod-toolbar wh-toolbar">
        <Input allowClear prefix={<SearchOutlined />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('wh.tools.search')} className="wh-search" />
        <span className="mod-toolbar__grow" />
        <Segmented value={view} onChange={setView} options={[{ value: 'list', label: t('wh.tools.viewList') }, { value: 'where', label: t('wh.tools.viewWhere') }]} />
      </div>
      {!data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !data.items.length ? (
        <Empty icon="🔧" title={chip || query ? t('wh.empty.filtered') : t('wh.tools.none')} text={chip || query ? null : t('wh.tools.noneText')} />
      ) : view === 'where' ? (
        <div className="wh-where-grid">
          {[...groups.values()].map((group) => (
            <section key={group.where ? `${group.where.type}:${group.where.id}` : 'none'} className={`wh-where-card is-${group.where?.type || 'none'}`}>
              <header>
                <WhereNow where={group.where} />
                <em>{group.tools.length}</em>
              </header>
              <ul>
                {group.tools.map((tool) => (
                  <li key={tool.id}>
                    <button type="button" onClick={() => navigate(`/app/warehouse/tools/${tool.id}`)}>
                      <span className="wh-no">{tool.inventoryNo}</span>
                      <span>{tool.item.name}</span>
                      <ServiceBadge tool={tool} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : screens.md ? (
        <section className="panel wh-table">
          <Table rowKey="id" size="middle" columns={columns} dataSource={data.items} onRow={(tool) => ({ onClick: () => navigate(`/app/warehouse/tools/${tool.id}`) })} rowClassName={(tool) => `${tool.id === openId ? 'is-open' : ''}${tool.serviceState === 'overdue' ? ' is-red' : ''}`} pagination={data.items.length > 50 ? { pageSize: 50, showSizeChanger: false } : false} />
        </section>
      ) : (
        <div className="wh-cards">
          {data.items.map((tool) => (
            <button key={tool.id} type="button" className="wh-tile" onClick={() => navigate(`/app/warehouse/tools/${tool.id}`)}>
              <span className="wh-tile__top"><span className="wh-no">{tool.inventoryNo}</span><ServiceBadge tool={tool} /></span>
              <strong>{tool.item.name}</strong>
              <WhereNow where={tool.where} />
            </button>
          ))}
        </div>
      )}
      {openId && <ToolCard id={openId} onClose={() => navigate('/app/warehouse/tools')} onChanged={touch} />}
    </div>
  );
}
