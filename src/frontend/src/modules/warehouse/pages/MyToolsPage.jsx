import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Checkbox, Input, InputNumber, Modal, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { UserAvatar } from '../../shared/People';
import { inboxChanged } from '../../approvals/public';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { formatQty, whError } from '../lib';
import { Empty, Hero, PersonSelect, Qty } from '../components/bits';
import { ServiceBadge } from './ToolsPage';

/** Hand-over dialog: choose tools and quantities, the colleague confirms (spec §4.2). */
function HandoverDialog({ data, open, onClose, onDone, me }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [to, setTo] = useState(null);
  const [picked, setPicked] = useState([]);
  const [qty, setQty] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await whApi.handover({ toUserId: to, instanceIds: picked, items: Object.entries(qty).filter(([, n]) => n > 0).map(([itemId, n]) => ({ itemId: Number(itemId), qty: n })), comment });
      message.success(t('wh.my.handoverSent'));
      onDone();
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  const empty = !picked.length && !Object.values(qty).some((n) => n > 0);
  return (
    <Modal open={open} onCancel={onClose} title={t('wh.my.handoverTitle')} okText={t('wh.my.handoverSend')} okButtonProps={{ disabled: !to || empty }} onOk={submit} confirmLoading={busy} destroyOnClose>
      <label className="wh-label">{t('wh.my.toWhom')}</label>
      <PersonSelect value={to} onChange={setTo} exclude={[me]} style={{ width: '100%' }} placeholder={t('wh.holders.pickPerson')} />
      <label className="wh-label">{t('wh.my.what')}</label>
      <div className="wh-pick">
        {data.tools.map((tool) => (
          <Checkbox key={tool.id} checked={picked.includes(tool.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, tool.id] : picked.filter((id) => id !== tool.id))}>
            <strong>{tool.item.name}</strong> <span className="wh-muted">{tool.inventoryNo}</span>
          </Checkbox>
        ))}
        {data.items.map((row) => (
          <div key={row.item.id} className="wh-pick__qty">
            <span>{row.item.name} <span className="wh-muted">({formatQty(row.qty)} {row.item.baseUnit})</span></span>
            <InputNumber min={0} max={row.qty} value={qty[row.item.id]} onChange={(n) => setQty({ ...qty, [row.item.id]: n })} addonAfter={row.item.baseUnit} style={{ width: 150 }} />
          </div>
        ))}
      </div>
      <Input.TextArea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('wh.my.comment')} autoSize={{ minRows: 1, maxRows: 4 }} maxLength={2000} />
    </Modal>
  );
}

/** «Мой инструмент»: what is on me, hand-overs to confirm, what to return. */
export default function MyToolsPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { meta, touch, version } = useWh();
  const [data, setData] = useState(null);
  const [handover, setHandover] = useState(false);
  const [busy, setBusy] = useState(null);
  const load = () => whApi.myTools().then((res) => setData(res.data)).catch(() => setData({ tools: [], items: [], incoming: [], outgoing: [], returnBy: [] }));
  useEffect(() => {
    load();
  }, [version]);
  const act = async (docId, action) => {
    setBusy(`${docId}:${action}`);
    try {
      await whApi.action(docId, action);
      message.success(t(action === 'confirm' ? 'wh.done.confirmed' : 'wh.done.declined'));
      inboxChanged();
      touch();
      load();
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(null);
    }
  };
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;
  const nothing = !data.tools.length && !data.items.length;
  return (
    <div className="wh-page">
      <Hero icon="user" title={t('wh.nav.myTools')} lead={t('wh.my.lead')}>
        {!nothing && <Button type="primary" onClick={() => setHandover(true)}>{t('wh.my.handover')}</Button>}
      </Hero>
      {data.incoming.length > 0 && (
        <section className="wh-group">
          <header className="wh-group__head"><strong>{t('wh.my.incoming')}</strong></header>
          {data.incoming.map((h) => (
            <div key={h.id} className="wh-banner is-violet">
              <UserAvatar user={h.from} size={26} />
              <span>{t('wh.my.incomingText', { name: h.from?.name || '', number: h.number })}{h.comment ? ` — ${h.comment}` : ''}</span>
              <Button size="small" onClick={() => navigate(`/app/warehouse/documents/${h.id}`)}>{t('wh.my.open')}</Button>
              <Button size="small" type="primary" loading={busy === `${h.id}:confirm`} onClick={() => act(h.id, 'confirm')}>{t('wh.actions.confirm')}</Button>
              <Button size="small" danger loading={busy === `${h.id}:decline`} onClick={() => act(h.id, 'decline')}>{t('wh.actions.decline')}</Button>
            </div>
          ))}
        </section>
      )}
      {data.outgoing.length > 0 && (
        <section className="wh-group">
          <header className="wh-group__head"><strong>{t('wh.my.outgoing')}</strong></header>
          {data.outgoing.map((h) => (
            <div key={h.id} className="wh-banner">
              <UserAvatar user={h.to} size={26} />
              <span>{t('wh.my.outgoingText', { name: h.to?.name || '', number: h.number })}</span>
              <Button size="small" loading={busy === `${h.id}:decline`} onClick={() => act(h.id, 'decline')}>{t('wh.my.withdraw')}</Button>
            </div>
          ))}
        </section>
      )}
      {nothing ? (
        <Empty icon="🧰" title={t('wh.my.empty')} text={t('wh.my.emptyText')} />
      ) : (
        <>
          {data.tools.length > 0 && (
            <section className="wh-group">
              <header className="wh-group__head"><strong>{t('wh.my.tools')}</strong><span className="wh-muted">{data.tools.length}</span></header>
              <div className="wh-cards is-grid">
                {data.tools.map((tool) => (
                  <button key={tool.id} type="button" className={`wh-tile${tool.serviceState === 'overdue' ? ' is-red' : ''}`} onClick={() => navigate(`/app/warehouse/tools/${tool.id}`)}>
                    <span className="wh-tile__top"><span className="wh-no">{tool.inventoryNo}</span><ServiceBadge tool={tool} /></span>
                    <strong>{tool.item.name}</strong>
                    <span className="wh-tile__row"><span className="wh-muted">{tool.since ? t('wh.tools.since', { date: fmtDateTime(tool.since) }) : ''}</span></span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {data.items.length > 0 && (
            <section className="wh-group">
              <header className="wh-group__head"><strong>{t('wh.my.materials')}</strong></header>
              <ul className="wh-list">
                {data.items.map((row) => (
                  <li key={row.item.id}><strong>{row.item.name}</strong><Qty value={row.qty} unit={row.item.baseUnit} strong /></li>
                ))}
              </ul>
            </section>
          )}
          {data.returnBy.length > 0 && (
            <section className="wh-group">
              <header className="wh-group__head"><strong>{t('wh.my.returnBy')}</strong></header>
              <ul className="wh-list">
                {data.returnBy.map((d) => <li key={d.id} className="is-click" onClick={() => navigate(`/app/warehouse/documents/${d.id}`)}><span className="wh-no">{d.number}</span><span>{fmtDate(d.returnBy)}</span></li>)}
              </ul>
            </section>
          )}
        </>
      )}
      {handover && <HandoverDialog data={data} open onClose={() => setHandover(false)} me={meta.me} onDone={() => { setHandover(false); load(); touch(); }} />}
    </div>
  );
}
