import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Drawer, Dropdown, Input, Select, Switch } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatRelative } from '../../lib/format';
import { consoleApi } from '../client';
import { AreaIcon, CodeBlock, EmptyState, GlyphIcon, LimitsPicker, SecretModal, eventLabel, statusClass } from '../components';
import { areaKey } from '../policy';
import { HintLabel } from '../../help/Hint';

function WebhookEditor({ open, webhook, meta, me, onClose, onSaved, onSecret }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft({
        name: webhook?.name || '',
        description: webhook?.description || '',
        url: webhook?.url || 'https://',
        events: webhook?.events || ['task.created', 'task.completed'],
        userId: webhook?.user?.id || me,
        limits: { ...(webhook?.limits || {}) },
        active: webhook ? webhook.active : true,
      });
    }
  }, [open, webhook, me]);
  const groups = useMemo(() => {
    const out = new Map();
    for (const event of meta.events) {
      if (!out.has(event.area)) out.set(event.area, []);
      out.get(event.area).push(event.type);
    }
    return [...out.entries()];
  }, [meta.events]);
  if (!draft) return null;
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const prefixOf = (types) => `${types[0].split('.')[0]}.*`;
  const toggleGroup = (types, on) => {
    const prefix = prefixOf(types);
    const rest = draft.events.filter((item) => item !== prefix && !types.includes(item));
    set({ events: on ? [...rest, prefix] : rest });
  };
  const toggleEvent = (type, types, on) => {
    const prefix = prefixOf(types);
    let list = draft.events.includes(prefix) ? [...draft.events.filter((item) => item !== prefix), ...types] : [...draft.events];
    list = on ? [...new Set([...list, type])] : list.filter((item) => item !== type);
    if (types.every((item) => list.includes(item))) list = [...list.filter((item) => !types.includes(item)), prefix];
    set({ events: list });
  };
  const save = async () => {
    setSaving(true);
    try {
      if (webhook) {
        await consoleApi.updateWebhook(webhook.id, draft);
        message.success(t('api.saved'));
      } else {
        const res = await consoleApi.createWebhook(draft);
        onSecret(res.data.secret);
      }
      onSaved();
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      className="ax-drawer"
      title={webhook ? t('api.webhooks.editTitle') : t('api.webhooks.createTitle')}
      destroyOnHidden
      footer={
        <div className="ax-drawer__foot">
          <Button type="primary" size="large" loading={saving} onClick={save}>
            {webhook ? t('common.save') : t('common.create')}
          </Button>
          <Button size="large" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <span className="ax-grow" />
          <label className="ax-inline">
            <Switch checked={draft.active} onChange={(active) => set({ active })} /> {draft.active ? t('api.webhooks.active') : t('api.webhooks.paused')}
          </label>
        </div>
      }
    >
      <div className="ax-editor__main">
        <section className="ax-sec">
          <label className="ax-field">
            <span>{t('api.webhooks.name')}</span>
            <Input size="large" value={draft.name} onChange={(event) => set({ name: event.target.value })} autoFocus placeholder="1C · tasks" />
          </label>
          <label className="ax-field">
            <span>{t('api.webhooks.url')}</span>
            <Input size="large" value={draft.url} onChange={(event) => set({ url: event.target.value })} spellCheck={false} className="ax-mono" />
            <em className="ax-hint">{t('api.webhooks.urlHint')}</em>
          </label>
        </section>
        <section className="ax-sec">
          <h3>{t('api.webhooks.events')}</h3>
          <p className="ax-hint">{t('api.webhooks.eventsHint')}</p>
          <div className="ax-events">
            {groups.map(([area, types]) => {
              const all = draft.events.includes(prefixOf(types)) || draft.events.includes('*');
              return (
                <div key={area} className="ax-events__group">
                  <label className="ax-events__head">
                    <AreaIcon area={area} />
                    <strong>{t(`api.eventGroups.${areaKey(area)}`)}</strong>
                    <Checkbox checked={all} indeterminate={!all && types.some((type) => draft.events.includes(type))} onChange={(event) => toggleGroup(types, event.target.checked)}>
                      {t('api.webhooks.allOf', { group: t(`api.eventGroups.${areaKey(area)}`).toLowerCase() })}
                    </Checkbox>
                  </label>
                  <div className="ax-events__list">
                    {types.map((type) => (
                      <Checkbox key={type} checked={all || draft.events.includes(type)} onChange={(event) => toggleEvent(type, types, event.target.checked)}>
                        {eventLabel(t, type)} <code>{type}</code>
                      </Checkbox>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="ax-sec">
          <label className="ax-field">
            <span><HintLabel id="api.runAs">{t('api.webhooks.runAs')}</HintLabel></span>
            <Select
              size="large"
              showSearch
              value={draft.userId}
              onChange={(userId) => set({ userId })}
              optionFilterProp="search"
              options={meta.people.map((person) => ({ value: person.id, search: `${person.name} ${person.username}`.toLowerCase(), label: `${person.name} · @${person.username}` }))}
            />
            <em className="ax-hint">{t('api.webhooks.runAsHint')}</em>
          </label>
          <h3>{t('api.webhooks.limits')}</h3>
          <LimitsPicker kinds={meta.resourceKinds} options={meta.resources} value={draft.limits} onChange={(limits) => set({ limits })} areas={meta.areas} />
        </section>
      </div>
    </Drawer>
  );
}

function Deliveries({ webhookId }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => {
    try {
      const res = await consoleApi.deliveries({ webhookId, limit: 30 });
      setList(res.data.deliveries);
    } catch (err) {
      message.error(errorMessage(err));
    }
  }, [webhookId, message]);
  useEffect(() => {
    load();
  }, [load]);
  const again = async (id) => {
    try {
      await consoleApi.redeliver(id);
      load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  if (!list) return <div className="ax-skeleton is-small" />;
  if (!list.length) return <p className="ax-muted ax-pad">{t('api.webhooks.noDeliveries')}</p>;
  return (
    <ul className="ax-deliveries">
      {list.map((item) => (
        <li key={item.id} className={open === item.id ? 'is-open' : ''}>
          <button type="button" className="ax-delivery" onClick={() => setOpen(open === item.id ? null : item.id)}>
            <span className={`ax-dot is-${item.status}`} />
            <span className="ax-delivery__event">{eventLabel(t, item.event)}</span>
            <code>{item.event}</code>
            <span className={`ax-status ${item.responseStatus ? statusClass(item.responseStatus) : 'is-none'}`}>{item.responseStatus || '—'}</span>
            <span className="ax-muted">{item.ms != null ? `${item.ms} ${t('api.log.ms')}` : ''}</span>
            <span className="ax-muted" title={formatDateTime(item.createdAt, locale)}>
              {formatRelative(item.createdAt, locale)}
            </span>
          </button>
          {open === item.id && (
            <div className="ax-delivery__body">
              <div className="ax-delivery__meta">
                <span>{t(`api.webhooks.status.${item.status}`)}</span>
                <span>{t('api.webhooks.attempts', { n: item.attempts })}</span>
                {item.nextAttemptAt && <span>{t('api.webhooks.nextAttempt', { time: formatRelative(item.nextAttemptAt, locale) })}</span>}
                {item.error && <span className="is-bad">{item.error}</span>}
                <span className="ax-grow" />
                <Button size="small" onClick={() => again(item.id)}>
                  ↻ {t('api.webhooks.redeliver')}
                </Button>
              </div>
              <div className="ax-split">
                <div>
                  <h5>{t('api.webhooks.payload')}</h5>
                  <CodeBlock code={JSON.stringify(item.payload, null, 2)} maxHeight={320} />
                </div>
                <div>
                  <h5>{t('api.webhooks.response')}</h5>
                  <CodeBlock code={item.responseBody || '—'} lang="text" maxHeight={320} />
                </div>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function Webhooks({ meta, overview, reload }) {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { message, modal } = App.useApp();
  const [hooks, setHooks] = useState(null);
  const [editor, setEditor] = useState({ open: false, webhook: null });
  const [expanded, setExpanded] = useState(null);
  const [secret, setSecret] = useState(null);
  const [pinging, setPinging] = useState(null);
  const load = useCallback(async () => {
    try {
      const res = await consoleApi.webhooks();
      setHooks(res.data.webhooks);
    } catch (err) {
      message.error(errorMessage(err));
    }
  }, [message]);
  useEffect(() => {
    load();
  }, [load]);

  const ping = async (hook) => {
    setPinging(hook.id);
    try {
      const res = await consoleApi.pingWebhook(hook.id);
      const r = res.data.result;
      if (r.ok) message.success(t('api.webhooks.pingOk', { status: r.status, ms: r.ms }));
      else message.error(t('api.webhooks.pingFail', { error: r.error || `HTTP ${r.status}` }));
      setExpanded(hook.id);
      load();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setPinging(null);
    }
  };
  const toggle = async (hook, active) => {
    try {
      await consoleApi.updateWebhook(hook.id, { active });
      load();
      reload();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  const rotate = (hook) =>
    modal.confirm({
      title: hook.name,
      content: t('api.webhooks.rotateConfirm'),
      onOk: async () => {
        const res = await consoleApi.rotateWebhook(hook.id);
        setSecret(res.data.secret);
      },
    });
  const remove = (hook) =>
    modal.confirm({
      title: hook.name,
      content: t('api.webhooks.deleteConfirm'),
      okButtonProps: { danger: true },
      okText: t('common.delete'),
      onOk: async () => {
        await consoleApi.deleteWebhook(hook.id);
        load();
        reload();
      },
    });

  if (!meta || !hooks) return <div className="ax-skeleton" />;
  const me = user?.id;
  return (
    <div className="ax-stack">
      <div className="ax-toolbar">
        <p className="ax-muted ax-toolbar__lead">{t('api.webhooks.lead')}</p>
        <span className="ax-grow" />
        <Button type="primary" onClick={() => setEditor({ open: true, webhook: null })} disabled={overview?.config?.webhooks === false}>
          ＋ {t('api.newWebhook')}
        </Button>
      </div>
      {hooks.length === 0 ? (
        <EmptyState
          icon="send"
          title={t('api.webhooks.noWebhooks')}
          text={t('api.webhooks.noWebhooksText')}
          action={
            <Button type="primary" size="large" onClick={() => setEditor({ open: true, webhook: null })}>
              ＋ {t('api.newWebhook')}
            </Button>
          }
        />
      ) : (
        hooks.map((hook) => {
          const health = !hook.active ? 'off' : hook.lastStatus === 'failed' ? 'bad' : hook.lastStatus === 'retrying' ? 'warn' : 'ok';
          return (
            <article key={hook.id} className={`ax-hook is-${health}`}>
              <div className="ax-hook__row">
                <span className="ax-hook__pulse" />
                <div className="ax-hook__main">
                  <div className="ax-hook__title">
                    <strong>{hook.name}</strong>
                    {!hook.active && <span className="ax-state is-revoked">{hook.disabledReason === 'failures' ? t('api.webhooks.disabledFailures') : t('api.webhooks.paused')}</span>}
                  </div>
                  <code className="ax-hook__url">POST {hook.url}</code>
                  <div className="ax-hook__events">
                    {hook.events.map((event) => (
                      <span key={event} className="ax-tag is-plain">
                        {event.endsWith('*') ? `${event}` : eventLabel(t, event)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ax-hook__stats">
                  <span>{t('api.webhooks.last7', { total: hook.stats?.total || 0, failed: hook.stats?.failed || 0 })}</span>
                  {hook.stats?.pending > 0 && <span className="is-warn">{t('api.webhooks.pending', { n: hook.stats.pending })}</span>}
                  {hook.lastDeliveryAt && <span title={formatDateTime(hook.lastDeliveryAt, locale)}>{formatRelative(hook.lastDeliveryAt, locale)}</span>}
                  <span className="ax-muted">
                    {t('api.webhooks.runAs')}: {hook.user?.name || '—'}
                  </span>
                </div>
                <div className="ax-hook__actions">
                  <Switch size="small" checked={hook.active} onChange={(active) => toggle(hook, active)} />
                  <Button size="small" onClick={() => ping(hook)} loading={pinging === hook.id}>
                    {t('api.webhooks.ping')}
                  </Button>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'edit', label: t('api.edit'), onClick: () => setEditor({ open: true, webhook: hook }) },
                        { key: 'rotate', label: t('api.webhooks.rotate'), onClick: () => rotate(hook) },
                        { type: 'divider' },
                        { key: 'delete', danger: true, label: t('common.delete'), onClick: () => remove(hook) },
                      ],
                    }}
                  >
                    <button type="button" className="ax-more">
                      ⋯
                    </button>
                  </Dropdown>
                </div>
              </div>
              <button type="button" className="ax-hook__toggle" onClick={() => setExpanded(expanded === hook.id ? null : hook.id)}>
                <GlyphIcon name="inbox" /> {t('api.webhooks.deliveries')} {expanded === hook.id ? '▴' : '▾'}
              </button>
              {expanded === hook.id && <Deliveries webhookId={hook.id} />}
            </article>
          );
        })
      )}
      <WebhookEditor
        open={editor.open}
        webhook={editor.webhook}
        meta={meta}
        me={me}
        onClose={() => setEditor({ open: false, webhook: null })}
        onSaved={() => {
          load();
          reload();
        }}
        onSecret={setSecret}
      />
      <SecretModal open={Boolean(secret)} secret={secret} kind="webhook" onClose={() => setSecret(null)} />
    </div>
  );
}
