import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { App, Avatar, Button, Checkbox, Modal, Skeleton, Tabs, Tooltip } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { MenuIcon } from '../../components/icons/menuIcons';
import { errorMessage } from '../../lib/errors';
import { fmtSmart } from '../../lib/datetime';
import { initials } from '../../lib/format';
import { moduleById } from '../registry';
import api from '../../services/api';
import { approvalsApi, inboxChanged } from './api';
import { MODULE_LOOK, formatMoney, groupItems, tOr, tr, useApprovalsMeta } from './lib';
import { DueBadge, StatusPill, UrgencyTag } from './components/bits';
import QuestionPopover from './components/QuestionPopover';
import ProcessDrawer from './components/ProcessDrawer';
import TourButton from '../../tour/TourButton';

const POLL_MS = 60_000;

function moduleName(id, t, meta, locale) {
  const module = moduleById(id);
  if (module) return t(module.labelKey);
  const type = meta?.types?.find((item) => item.module === id);
  if (type) return tr(type.title, locale);
  return tOr(t, `approvals.modules.${id}`, id);
}

function ModuleIcon({ module }) {
  const look = MODULE_LOOK[module] || { color: '#64748B', icon: moduleById(module)?.icon || 'inbox' };
  return (
    <span className="apr-row__icon" style={{ '--c': look.color }}>
      <MenuIcon name={moduleById(module)?.icon || look.icon} variant="mono" />
    </span>
  );
}

/** One line of the inbox: what, who, how much, by when, and the buttons. */
function InboxRow({ item, meta, selected, onSelect, onOpen, onAct, busy }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const isApproval = item.provider === 'approvals' && item.kind === 'approval';
  const soonHours = meta?.settings?.soonHours || 24;
  const typeName = item.meta?.typeTitle ? tr(item.meta.typeTitle, locale) : moduleName(item.module, t, meta, locale);
  const open = () => (item.provider === 'approvals' ? onOpen(item) : item.url && navigate(item.url));
  // Items of other modules may carry a direct endpoint for «Принять» (Tasks: meta.acceptPath).
  const acceptPath = item.actions.includes('accept') && /^\/api\/app\//.test(String(item.meta?.acceptPath || '')) ? item.meta.acceptPath : null;
  const otherActions = item.provider !== 'approvals' && item.inline ? item.actions.filter((action) => action !== 'open' && !(action === 'accept' && acceptPath)) : [];
  return (
    <li className={`apr-row${item.overdue ? ' is-overdue' : ''}${selected ? ' is-selected' : ''}`} data-tour="apr.row">
      <div className="apr-row__check">
        {isApproval ? <Checkbox checked={selected} onChange={(event) => onSelect(item, event.target.checked)} aria-label={t('approvals.inbox.select')} /> : <span />}
      </div>
      <button type="button" className="apr-row__main" onClick={open}>
        <ModuleIcon module={item.module} />
        <span className="apr-row__text">
          <span className="apr-row__eyebrow">
            {typeName}
            {item.number && <b>{item.number}</b>}
            {item.kind === 'question' && <span className="apr-chip is-question">{t('approvals.kind.question')}</span>}
            {item.kind === 'returned' && <span className="apr-chip is-returned">{t('approvals.kind.returned')}</span>}
            {item.provider !== 'approvals' && item.kind && <span className="apr-chip">{tOr(t, `approvals.kind.${item.kind}`, item.kind)}</span>}
          </span>
          <span className="apr-row__title">{item.title}</span>
          <span className="apr-row__sub">
            {item.author && (
              <span className="apr-row__author">
                <Avatar size={18} src={item.author.avatarUrl || undefined}>
                  {initials(item.author.name || '?')}
                </Avatar>
                {item.author.name}
              </span>
            )}
            {isApproval && item.meta?.stagesTotal > 1 && (
              <span className="apr-row__stage">{t('approvals.inbox.stageOf', { n: item.meta.stage + 1, total: item.meta.stagesTotal, name: item.meta.stageName || '' })}</span>
            )}
            {item.kind === 'question' && item.meta?.question && <span className="apr-row__quote">«{item.meta.question}»</span>}
            {item.kind === 'returned' && item.meta?.comment && <span className="apr-row__quote">«{item.meta.comment}»</span>}
          </span>
        </span>
      </button>
      <div className="apr-row__facts">
        {item.amount !== null && <span className="apr-row__money">{formatMoney(item.amount, item.currency, locale)}</span>}
        <span className="apr-row__flags">
          {item.urgency && <UrgencyTag meta={meta} value={item.urgency} />}
          {item.kind === 'approval' || item.dueAt ? <DueBadge dueAt={item.dueAt} soonHours={soonHours} /> : null}
        </span>
      </div>
      <div className="apr-row__actions" data-tour="apr.actions">
        {isApproval && (
          <>
            <Button type="primary" size="small" className="apr-btn-approve" loading={busy === 'approve'} onClick={() => onAct(item, 'approve')}>
              {t('approvals.actions.approve')}
            </Button>
            <QuestionPopover author={item.author} onSubmit={(comment, to) => onAct(item, 'question', { comment, to })}>
              <Button size="small" loading={busy === 'question'}>
                {t('approvals.actions.question')}
              </Button>
            </QuestionPopover>
          </>
        )}
        {item.kind === 'question' && item.provider === 'approvals' && (
          <QuestionPopover mode="answer" onSubmit={(comment) => onAct(item, 'answer', { comment })}>
            <Button type="primary" size="small" loading={busy === 'answer'}>
              {t('approvals.actions.answer')}
            </Button>
          </QuestionPopover>
        )}
        {acceptPath && (
          <>
            <Button type="primary" size="small" className="apr-btn-approve" loading={busy === 'accept'} onClick={() => onAct(item, 'accept')}>
              {t('approvals.inline.accept')}
            </Button>
            <QuestionPopover mode="accept" onSubmit={(comment) => onAct(item, 'accept', { comment })}>
              <Tooltip title={t('approvals.accept.withComment')}>
                <Button size="small" aria-label={t('approvals.accept.withComment')}>
                  💬
                </Button>
              </Tooltip>
            </QuestionPopover>
          </>
        )}
        {otherActions.map((action) => (
          <Button key={action} size="small" type="primary" loading={busy === action} onClick={() => onAct(item, action)}>
            {tOr(t, `approvals.inline.${action}`, action)}
          </Button>
        ))}
        <Button size="small" type="text" onClick={() => (item.url ? navigate(item.url) : open())}>
          {t('approvals.actions.open')}
        </Button>
      </div>
    </li>
  );
}

function Group({ title, tone, items, children }) {
  if (!items.length) return null;
  return (
    <section className={`apr-group${tone ? ` is-${tone}` : ''}`}>
      <h3 className="apr-group__title">
        <span>{title}</span>
        <em>{items.length}</em>
      </h3>
      <ul className="apr-list">{children}</ul>
    </section>
  );
}

function Empty({ icon, title, text, action }) {
  return (
    <div className="apr-empty">
      <span className="apr-empty__icon">{icon}</span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="apr-skeleton">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} active avatar paragraph={{ rows: 1 }} />
      ))}
    </div>
  );
}

/** «Мои на согласовании» and «Решённые мной»: simple rows opening the side card. */
function ProcessRows({ items, meta, onOpen, decided }) {
  const { t, locale } = useLocale();
  const soonHours = meta?.settings?.soonHours || 24;
  return (
    <ul className="apr-list">
      {items.map((item) => (
        <li key={item.key} className={`apr-row is-plain${item.overdue ? ' is-overdue' : ''}`}>
          <div className="apr-row__check" />
          <button type="button" className="apr-row__main" onClick={() => onOpen(item)}>
            <ModuleIcon module={item.module} />
            <span className="apr-row__text">
              <span className="apr-row__eyebrow">
                {tr(item.meta?.typeTitle, locale)}
                {item.number && <b>{item.number}</b>}
              </span>
              <span className="apr-row__title">{item.title}</span>
              <span className="apr-row__sub">
                {decided ? (
                  <>
                    <span className={`apr-decision is-${item.meta.decision}`}>{t(`approvals.decided.${item.meta.decision}`)}</span>
                    <span>{fmtSmart(item.meta.decidedAt)}</span>
                    {item.meta.decisionComment && <span className="apr-row__quote">«{item.meta.decisionComment}»</span>}
                  </>
                ) : (
                  <>
                    {item.meta?.status === 'pending' && item.meta.stagesTotal > 0 && (
                      <span className="apr-row__stage">{t('approvals.inbox.stageOf', { n: item.meta.stage + 1, total: item.meta.stagesTotal, name: item.meta.stageName || '' })}</span>
                    )}
                    {item.meta?.waitingFor?.length > 0 && (
                      <span className="apr-row__waiting">
                        {t('approvals.mine.waitingFor')}{' '}
                        {item.meta.waitingFor.map((who) => who.name).join(', ')}
                      </span>
                    )}
                  </>
                )}
              </span>
            </span>
          </button>
          <div className="apr-row__facts">
            {item.amount !== null && <span className="apr-row__money">{formatMoney(item.amount, item.currency, locale)}</span>}
            <span className="apr-row__flags">
              <StatusPill status={item.meta?.status} />
              {item.urgency && <UrgencyTag meta={meta} value={item.urgency} compact />}
              {!decided && item.meta?.status === 'pending' && <DueBadge dueAt={item.dueAt} soonHours={soonHours} />}
            </span>
          </div>
          <div className="apr-row__actions" />
        </li>
      ))}
    </ul>
  );
}

/** «Ждёт меня»: everything that needs my decision, my documents in approval, and what I decided. */
export default function InboxPage() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const meta = useApprovalsMeta();
  const [params, setParams] = useSearchParams();
  const tab = ['inbox', 'mine', 'decided'].includes(params.get('tab')) ? params.get('tab') : 'inbox';
  const moduleFilter = params.get('module') || '';
  const [inbox, setInbox] = useState(null);
  const [mine, setMine] = useState(null);
  const [decided, setDecided] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState({});
  const [openId, setOpenId] = useState(params.get('process') ? Number(params.get('process')) : null);
  const seq = useRef(0);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const loadInbox = useCallback(() => {
    const mineSeq = ++seq.current;
    return approvalsApi
      .inbox()
      .then((res) => {
        if (mineSeq !== seq.current) return;
        setInbox(res.data);
        setError(null);
        setSelected((prev) => new Set([...prev].filter((key) => res.data.items.some((item) => item.key === key))));
      })
      .catch((err) => setError(err));
  }, []);
  const loadMine = useCallback(() => approvalsApi.mine().then((res) => setMine(res.data.items)).catch((err) => setError(err)), []);
  const loadDecided = useCallback(
    (before) =>
      approvalsApi
        .decided({ before })
        .then((res) => setDecided((prev) => ({ items: before ? [...(prev?.items || []), ...res.data.items] : res.data.items, next: res.data.next })))
        .catch((err) => setError(err)),
    []
  );

  const refresh = useCallback(() => {
    loadInbox();
    if (tab === 'mine') loadMine();
    if (tab === 'decided') loadDecided();
  }, [loadInbox, loadMine, loadDecided, tab]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => document.visibilityState === 'visible' && loadInbox(), POLL_MS);
    const onChange = () => loadInbox();
    window.addEventListener('approvals:changed', onChange);
    window.addEventListener('focus', onChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener('approvals:changed', onChange);
      window.removeEventListener('focus', onChange);
    };
  }, [refresh, loadInbox]);

  const items = useMemo(() => (inbox?.items || []).filter((item) => !moduleFilter || item.module === moduleFilter), [inbox, moduleFilter]);
  const groups = useMemo(() => groupItems(items), [items]);
  const counts = inbox?.counts || { total: 0, overdue: 0, today: 0, byModule: {} };
  const ordered = useMemo(() => [...groups.overdue, ...groups.today, ...groups.rest], [groups]);
  const drawerList = tab === 'inbox' ? ordered.filter((item) => item.provider === 'approvals') : tab === 'mine' ? mine || [] : decided?.items || [];
  const drawerIndex = drawerList.findIndex((item) => item.id === openId);

  const openItem = (item) => {
    setOpenId(item.id);
  };
  // ↑ / ↓ move through the documents while the side card is open.
  useEffect(() => {
    if (!openId) return undefined;
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, [contenteditable="true"], .ant-select')) return;
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const index = drawerList.findIndex((item) => item.id === openId);
      const next = drawerList[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) {
        event.preventDefault();
        setOpenId(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, drawerList]);

  const act = async (item, action, payload = {}) => {
    setBusy((prev) => ({ ...prev, [item.key]: action }));
    try {
      if (action === 'accept' && typeof item.meta?.acceptPath === 'string') {
        // The module's own endpoint (relative to /api), e.g. Tasks' acceptance.
        await api.post(item.meta.acceptPath.replace(/^\/api(?=\/)/, ''), payload.comment ? { comment: payload.comment } : {});
      } else {
        await approvalsApi.act({ provider: item.provider, id: item.id, action, round: item.meta?.round, stage: item.meta?.stage, ...payload });
      }
      message.success(tOr(t, `approvals.done.${action}`, t('approvals.done.generic')));
      // The row leaves at once; the list reloads behind it.
      setInbox((prev) => (prev ? { ...prev, items: prev.items.filter((row) => row.key !== item.key) } : prev));
      inboxChanged();
    } catch (err) {
      message.error(errorMessage(err));
      loadInbox();
      throw err;
    } finally {
      setBusy((prev) => ({ ...prev, [item.key]: null }));
    }
  };

  const selectable = ordered.filter((item) => item.provider === 'approvals' && item.kind === 'approval');
  const selectedItems = selectable.filter((item) => selected.has(item.key));
  const bulkApprove = () => {
    Modal.confirm({
      title: t('approvals.bulk.title', { n: selectedItems.length }),
      content: (
        <ul className="apr-bulk-list">
          {selectedItems.slice(0, 8).map((item) => (
            <li key={item.key}>
              {item.number ? `${item.number} · ` : ''}
              {item.title}
              {item.amount !== null ? ` — ${formatMoney(item.amount, item.currency, locale)}` : ''}
            </li>
          ))}
          {selectedItems.length > 8 && <li>{t('approvals.bulk.more', { n: selectedItems.length - 8 })}</li>}
        </ul>
      ),
      okText: t('approvals.bulk.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const res = await approvalsApi.bulk(selectedItems.map((item) => ({ id: item.id, round: item.meta.round, stage: item.meta.stage })));
          const failed = res.data.results.filter((row) => !row.ok);
          if (failed.length) message.warning(t('approvals.bulk.partial', { ok: res.data.approved, failed: failed.length }));
          else message.success(t('approvals.bulk.done', { n: res.data.approved }));
          setSelected(new Set());
          inboxChanged();
          loadInbox();
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });
  };

  const modules = Object.entries(counts.byModule || {}).sort((a, b) => b[1] - a[1]);
  const rowsOf = (list) =>
    list.map((item) => (
      <InboxRow
        key={item.key}
        item={item}
        meta={meta}
        selected={selected.has(item.key)}
        busy={busy[item.key]}
        onSelect={(row, on) =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (on) next.add(row.key);
            else next.delete(row.key);
            return next;
          })
        }
        onOpen={openItem}
        onAct={act}
      />
    ));

  const inboxTab = (
    <>
      <div className="apr-kpis" data-tour="apr.kpis">
        <button type="button" className={`apr-kpi${!moduleFilter ? ' is-active' : ''}`} onClick={() => setParam('module', '')}>
          <strong>{counts.total}</strong>
          <span>{t('approvals.inbox.all')}</span>
        </button>
        <div className={`apr-kpi is-static${counts.overdue ? ' is-red' : ''}`}>
          <strong>{counts.overdue}</strong>
          <span>{t('approvals.groups.overdue')}</span>
        </div>
        <div className={`apr-kpi is-static${counts.today ? ' is-amber' : ''}`}>
          <strong>{counts.today}</strong>
          <span>{t('approvals.groups.today')}</span>
        </div>
        {modules.length > 1 &&
          modules.map(([id, n]) => (
            <button key={id} type="button" className={`apr-chip-filter${moduleFilter === id ? ' is-active' : ''}`} onClick={() => setParam('module', moduleFilter === id ? '' : id)}>
              <ModuleIcon module={id} />
              {moduleName(id, t, meta, locale)}
              <em>{n}</em>
            </button>
          ))}
      </div>
      {selectedItems.length > 0 && (
        <div className="apr-bulkbar" role="region" aria-label={t('approvals.bulk.region')}>
          <Checkbox
            checked={selectedItems.length === selectable.length}
            indeterminate={selectedItems.length > 0 && selectedItems.length < selectable.length}
            onChange={(event) => setSelected(event.target.checked ? new Set(selectable.map((item) => item.key)) : new Set())}
          />
          <span>{t('approvals.bulk.selected', { n: selectedItems.length })}</span>
          <Button type="primary" className="apr-btn-approve" onClick={bulkApprove}>
            ✓ {t('approvals.bulk.approve', { n: selectedItems.length })}
          </Button>
          <Button type="text" onClick={() => setSelected(new Set())}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {!inbox && !error ? (
        <ListSkeleton />
      ) : !items.length ? (
        <Empty icon="🎉" title={t('approvals.inbox.emptyTitle')} text={t('approvals.inbox.emptyText')} />
      ) : (
        <>
          <Group title={t('approvals.groups.overdue')} tone="red" items={groups.overdue}>
            {rowsOf(groups.overdue)}
          </Group>
          <Group title={t('approvals.groups.today')} tone="amber" items={groups.today}>
            {rowsOf(groups.today)}
          </Group>
          <Group title={t('approvals.groups.rest')} items={groups.rest}>
            {rowsOf(groups.rest)}
          </Group>
        </>
      )}
      {inbox?.failed?.length > 0 && <p className="apr-footnote">{t('approvals.inbox.partial')}</p>}
    </>
  );

  const mineTab =
    mine === null ? (
      <ListSkeleton />
    ) : mine.length ? (
      <ProcessRows items={mine} meta={meta} onOpen={openItem} />
    ) : (
      <Empty icon="📭" title={t('approvals.mine.emptyTitle')} text={t('approvals.mine.emptyText')} />
    );

  const decidedTab =
    decided === null ? (
      <ListSkeleton />
    ) : decided.items.length ? (
      <>
        <ProcessRows items={decided.items} meta={meta} onOpen={openItem} decided />
        {decided.next && (
          <div className="apr-more">
            <Button onClick={() => loadDecided(decided.next)}>{t('approvals.decided.more')}</Button>
          </div>
        )}
      </>
    ) : (
      <Empty icon="🗂" title={t('approvals.decided.emptyTitle')} text={t('approvals.decided.emptyText')} />
    );

  return (
    <div className="apr-page">
      <header className="apr-hero">
        <div>
          <div className="apr-hero__eyebrow">{t('apps.approvals.name')}</div>
          <h1>{t('approvals.inbox.title')}</h1>
          <p>{t('approvals.inbox.lead')}</p>
        </div>
        <div className="apr-hero__actions">
          <TourButton module="approvals" />
          <Link to="/account/substitute" className="apr-link" data-tour="apr.substitute">
            👤 {t('approvals.substitutes.mine')}
          </Link>
          {meta?.canManageRoutes && (
            <Tooltip title={t('approvals.settings.title')}>
              <Link to="/app/approvals/settings" className="apr-link">
                ⚙ {t('approvals.settings.short')}
              </Link>
            </Tooltip>
          )}
        </div>
      </header>
      {error && !inbox && <div className="apr-error">{errorMessage(error)} <Button size="small" onClick={refresh}>{t('common.retry')}</Button></div>}
      <Tabs
        activeKey={tab}
        onChange={(key) => setParam('tab', key === 'inbox' ? '' : key)}
        items={[
          { key: 'inbox', label: <span>{t('approvals.tabs.inbox')} {counts.total > 0 && <em className={`apr-tab-count${counts.overdue ? ' is-red' : ''}`}>{counts.total}</em>}</span>, children: inboxTab },
          { key: 'mine', label: <span data-tour="apr.tab.mine">{t('approvals.tabs.mine')} {mine?.length > 0 && <em className="apr-tab-count">{mine.length}</em>}</span>, children: mineTab },
          { key: 'decided', label: t('approvals.tabs.decided'), children: decidedTab },
        ]}
      />
      <ProcessDrawer
        processId={openId}
        position={drawerIndex >= 0 && drawerList.length > 1 ? `${drawerIndex + 1} / ${drawerList.length} · ↑↓` : null}
        onClose={() => {
          setOpenId(null);
          if (params.get('process')) setParam('process', '');
        }}
        onChanged={() => {
          loadInbox();
          if (tab === 'mine') loadMine();
          if (tab === 'decided') loadDecided();
        }}
      />
    </div>
  );
}
