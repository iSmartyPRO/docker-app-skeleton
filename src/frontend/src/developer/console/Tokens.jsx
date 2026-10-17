import { useCallback, useEffect, useState } from 'react';
import { App, Button, Dropdown, Input, Select } from 'antd';
import Segmented from '../../components/ui/Segmented';
import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatRelative } from '../../lib/format';
import { consoleApi } from '../client';
import { EmptyState, GlyphIcon, ScopeChips, StatePill, templateName } from '../components';
import { areaKey } from '../policy';
import { localeTag } from '../../i18n/languages';

/** One token as a card row; shared with the personal page. */
export function TokenRow({ token, onEdit, onRotate, onRevoke, onDelete, showOwner = true }) {
  const { t, locale } = useLocale();
  const tpl = token.template;
  const limits = Object.entries(token.limits || {});
  const menu = [
    token.state === 'active' && { key: 'edit', label: t('api.edit'), onClick: () => onEdit(token) },
    token.state === 'active' && { key: 'rotate', label: t('api.rotate'), onClick: () => onRotate(token) },
    token.state === 'active' && { type: 'divider' },
    token.state === 'active' && { key: 'revoke', danger: true, label: t('api.revoke'), onClick: () => onRevoke(token) },
    token.state !== 'active' && { key: 'delete', danger: true, label: t('api.delete'), onClick: () => onDelete(token) },
  ].filter(Boolean);
  return (
    <article className={`ax-token is-${token.state}`}>
      <div className="ax-token__key" style={{ '--tpl': tpl?.color || '#64748B' }}>
        <GlyphIcon name={tpl?.icon || 'key'} />
      </div>
      <div className="ax-token__main">
        <div className="ax-token__title">
          <button type="button" className="ax-token__name" onClick={() => token.state === 'active' && onEdit(token)}>
            {token.name}
          </button>
          <code>{token.prefix}…</code>
          <StatePill state={token.state} />
        </div>
        <div className="ax-token__meta">
          {showOwner && (
            <span className="ax-token__owner">
              <span className="ax-avatar is-xs">{(token.user.name || '?').slice(0, 1)}</span>
              {token.user.name}
              {token.kind === 'service' && <em>· {t('api.kind.service')}</em>}
            </span>
          )}
          <span className="ax-tag" style={{ '--tpl': tpl?.color || '#64748B' }}>
            {tpl ? templateName(t, tpl) : t('api.noTemplate')}
            {Object.keys(token.scopes || {}).length > 0 && <b>+{Object.keys(token.scopes).length}</b>}
          </span>
          {limits.map(([key, ids]) => (
            <span key={key} className="ax-tag is-plain">
              {t(`api.resources.${areaKey(key)}`)}: {ids.length}
            </span>
          ))}
          {token.rules.length > 0 && <span className="ax-tag is-plain">{t('api.editor.rulesTitle')}: {token.rules.length}</span>}
          {token.ipAllow.length > 0 && <span className="ax-tag is-plain">🔒 {t('api.ipLocked', { n: token.ipAllow.length })}</span>}
        </div>
        <ScopeChips scopes={token.effective.scopes} />
      </div>
      <div className="ax-token__stats">
        <span title={token.lastUsedAt ? formatDateTime(token.lastUsedAt, locale) : ''}>
          {t('api.lastUsed')}: <b>{token.lastUsedAt ? formatRelative(token.lastUsedAt, locale) : t('api.never')}</b>
        </span>
        <span>{t('api.requests', { n: token.useCount.toLocaleString(localeTag(locale)) })}</span>
        <span className={token.expiresAt && new Date(token.expiresAt) - Date.now() < 7 * 86400000 && token.state === 'active' ? 'is-warn' : ''}>
          {token.expiresAt ? t('api.expires', { date: formatDateTime(token.expiresAt, locale, { dateStyle: 'medium' }) }) : t('api.noExpiry')}
        </span>
      </div>
      <Dropdown menu={{ items: menu }} trigger={['click']} placement="bottomRight">
        <button type="button" className="ax-more" aria-label="…">
          ⋯
        </button>
      </Dropdown>
    </article>
  );
}

/** Confirm-and-call helpers for token actions. */
export function useTokenActions(client, { onChanged, showSecret }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const run = async (fn, ok) => {
    try {
      const res = await fn();
      if (ok) message.success(ok);
      onChanged?.();
      return res;
    } catch (err) {
      message.error(errorMessage(err));
      return null;
    }
  };
  return {
    rotate: (token) =>
      modal.confirm({
        title: token.name,
        content: t('api.rotateConfirm'),
        okText: t('api.rotate'),
        onOk: async () => {
          const res = await run(() => client.rotateToken(token.id));
          if (res) showSecret(res.data.secret);
        },
      }),
    revoke: (token) =>
      modal.confirm({
        title: token.name,
        content: t('api.revokeConfirm'),
        okText: t('api.revoke'),
        okButtonProps: { danger: true },
        onOk: () => run(() => client.revokeToken(token.id), t('api.revoked')),
      }),
    remove: (token) =>
      modal.confirm({
        title: token.name,
        content: t('api.deleteConfirm'),
        okText: t('api.delete'),
        okButtonProps: { danger: true },
        onOk: () => run(() => client.deleteToken(token.id)),
      }),
  };
}

export default function Tokens({ meta, openEditor, tokensVersion, reload, showSecret }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [tokens, setTokens] = useState(null);
  const [state, setState] = useState('active');
  const [owner, setOwner] = useState();
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await consoleApi.tokens({ state: state === 'all' ? undefined : state, userId: owner, q: q || undefined });
      setTokens(res.data.tokens);
    } catch (err) {
      message.error(errorMessage(err));
    }
  }, [state, owner, q, message]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, tokensVersion, q]);

  const actions = useTokenActions(consoleApi, {
    onChanged: () => {
      load();
      reload();
    },
    showSecret,
  });

  return (
    <div className="ax-stack">
      <div className="ax-toolbar">
        <Input.Search allowClear placeholder={t('api.search')} value={q} onChange={(event) => setQ(event.target.value)} className="ax-toolbar__search" />
        <Segmented
          value={state}
          onChange={setState}
          options={[
            { value: 'active', label: t('api.state.active') },
            { value: 'expired', label: t('api.state.expired') },
            { value: 'revoked', label: t('api.state.revoked') },
            { value: 'all', label: t('api.allStates') },
          ]}
        />
        <Select
          allowClear
          showSearch
          placeholder={t('api.owner')}
          value={owner}
          onChange={setOwner}
          optionFilterProp="search"
          style={{ minWidth: 200 }}
          options={(meta?.people || []).map((person) => ({ value: person.id, search: `${person.name} ${person.username}`.toLowerCase(), label: person.name }))}
        />
        <span className="ax-grow" />
        <Button type="primary" onClick={() => openEditor()} icon={<PlusOutlined />}>
          {t('api.newToken')}
        </Button>
      </div>
      {tokens === null ? (
        <div className="ax-skeleton" />
      ) : tokens.length ? (
        <div className="ax-tokens">
          {tokens.map((token) => (
            <TokenRow key={token.id} token={token} onEdit={openEditor} onRotate={actions.rotate} onRevoke={actions.revoke} onDelete={actions.remove} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="key"
          title={t('api.noTokens')}
          text={t('api.noTokensText')}
          action={
            <Button type="primary" size="large" onClick={() => openEditor()} icon={<PlusOutlined />}>
              {t('api.newToken')}
            </Button>
          }
        />
      )}
    </div>
  );
}

