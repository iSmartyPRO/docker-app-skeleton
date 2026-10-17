import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Input, Modal, Popconfirm, Spin, Switch, Tag, Tooltip } from 'antd';
import Segmented from '../../../components/ui/Segmented';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getRegional, inZone, nowInZone, todayISO } from '../../../lib/datetime';
import { DateField } from '../../../components/ui/DateTimeField';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { kbApi } from '../api';
import { Hint } from '../../../help/Hint';

const PRESETS = [
  { value: 'never', days: 0 },
  { value: '1', days: 1 },
  { value: '7', days: 7 },
  { value: '30', days: 30 },
  { value: 'custom', days: null },
];

function linkOf(slug) {
  return `${window.location.origin}/s/${slug}`;
}

/** Live availability check of a custom link name, with a suggestion when taken. */
function useSlugCheck(slug, excludeId) {
  const [state, setState] = useState({ status: 'idle' });
  const timer = useRef();
  useEffect(() => {
    clearTimeout(timer.current);
    if (!slug) {
      setState({ status: 'idle' });
      return undefined;
    }
    setState({ status: 'checking' });
    timer.current = setTimeout(() => {
      kbApi
        .checkSlug({ slug, exclude: excludeId })
        .then((res) => setState({ status: res.data.available ? 'free' : 'busy', ...res.data }))
        .catch(() => setState({ status: 'idle' }));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [slug, excludeId]);
  return state;
}

function ShareForm({ folder, config, share, onDone }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [title, setTitle] = useState(share?.title || folder.name);
  const [slug, setSlug] = useState(share?.slug || '');
  const [usePassword, setUsePassword] = useState(Boolean(share?.hasPassword) || config.requireSharePassword);
  const [password, setPassword] = useState('');
  const [preset, setPreset] = useState(share?.expiresAt ? 'custom' : config.maxShareDays ? String(Math.min(30, config.maxShareDays)) : 'never');
  // A custom expiry is a calendar day of the person: the link works to the end of it (23:59:59 in their zone).
  const [expiresAt, setExpiresAt] = useState(share?.expiresAt ? inZone(share.expiresAt).format('YYYY-MM-DD') : null);
  const [allowDownload, setAllowDownload] = useState(share?.allowDownload !== false);
  const [saving, setSaving] = useState(false);
  const check = useSlugCheck(slug, share?.id);

  // Suggest a link name from the folder name for new links.
  useEffect(() => {
    if (share || slug) return;
    kbApi.checkSlug({ from: folder.name }).then((res) => {
      setSlug(res.data.available ? res.data.slug : res.data.suggestion || res.data.slug || '');
    });
  }, [folder.name, share, slug]);

  const expiry = () => {
    // The server allows at most maxShareDays from now: the last allowed day ends at that moment.
    const cap = (iso) => {
      if (!config.maxShareDays) return iso;
      const limit = dayjs().add(config.maxShareDays * 86400 - 60, 'second');
      return dayjs(iso).isAfter(limit) ? limit.toISOString() : iso;
    };
    if (preset === 'custom') return expiresAt ? cap(dayjs.tz(expiresAt, getRegional().timeZone).endOf('day').toISOString()) : null;
    const found = PRESETS.find((item) => item.value === preset);
    return found?.days ? cap(nowInZone().add(found.days, 'day').toISOString()) : null;
  };

  const submit = async () => {
    if (check.status !== 'free' && slug !== share?.slug) return;
    setSaving(true);
    try {
      const payload = { title, slug, expiresAt: expiry(), allowDownload };
      if (usePassword && password) payload.password = password;
      if (!usePassword && share?.hasPassword) payload.removePassword = true;
      if (share) await kbApi.updateShare(share.id, payload);
      else await kbApi.createShare(folder.id, payload);
      message.success(t('common.saved'));
      onDone();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const slugHelp = {
    checking: <span className="slug-state">{t('kb.share.checking')}</span>,
    free: <span className="slug-state is-free">✓ {t('kb.share.free')}</span>,
    busy:
      check.reason === 'TAKEN' ? (
        <span className="slug-state is-busy">
          {t('kb.share.taken')}
          {check.suggestion && (
            <button type="button" onClick={() => setSlug(check.suggestion)}>
              {t('kb.share.use', { slug: check.suggestion })}
            </button>
          )}
        </span>
      ) : (
        <span className="slug-state is-busy">{t(`kb.share.reason_${check.reason}`)}</span>
      ),
  }[check.status];

  return (
    <div className="share-form">
      <label>{t('kb.share.name')}</label>
      <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
      <label>{t('kb.share.link')} <Hint id="kb.shareSlug" /></label>
      <Input
        addonBefore={`${window.location.host}/s/`}
        value={slug}
        onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-'))}
        maxLength={64}
        status={check.status === 'busy' ? 'error' : undefined}
      />
      <div className="share-form__help">{slug === share?.slug ? null : slugHelp}</div>

      <div className="share-form__row">
        <div>
          <strong>{t('kb.share.password')} <Hint id="kb.sharePassword" /></strong>
          <span>{config.requireSharePassword ? t('kb.share.passwordRequired') : t('kb.share.passwordDesc')}</span>
        </div>
        <Switch checked={usePassword} onChange={setUsePassword} disabled={config.requireSharePassword} />
      </div>
      {usePassword && (
        <Input.Password
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={share?.hasPassword ? t('kb.share.passwordKeep') : t('kb.share.passwordNew')}
          autoComplete="new-password"
        />
      )}

      <div className="share-form__row">
        <div>
          <strong>{t('kb.share.expiry')} <Hint id="kb.shareExpiry" /></strong>
          <span>{config.maxShareDays ? t('kb.share.expiryMax', { days: config.maxShareDays }) : t('kb.share.expiryDesc')}</span>
        </div>
      </div>
      <Segmented
        block
        value={preset}
        onChange={setPreset}
        options={PRESETS.filter((item) => !(config.maxShareDays && item.value === 'never')).map((item) => ({
          value: item.value,
          label: t(`kb.share.preset_${item.value}`),
        }))}
      />
      {preset === 'custom' && (
        <DateField
          value={expiresAt}
          onChange={setExpiresAt}
          disabledDate={(date) => date.format('YYYY-MM-DD') < todayISO() || Boolean(config.maxShareDays && date.format('YYYY-MM-DD') > nowInZone().add(config.maxShareDays, 'day').format('YYYY-MM-DD'))}
          style={{ width: '100%', marginTop: 8 }}
        />
      )}

      <div className="share-form__row">
        <div>
          <strong>{t('kb.share.download')}</strong>
          <span>{t('kb.share.downloadDesc')}</span>
        </div>
        <Switch checked={allowDownload} onChange={setAllowDownload} />
      </div>

      <div className="share-form__actions">
        <Button onClick={onDone}>{t('common.cancel')}</Button>
        <Button
          type="primary"
          loading={saving}
          disabled={!slug || (slug !== share?.slug && check.status !== 'free') || (usePassword && !password && !share?.hasPassword)}
          onClick={submit}
        >
          {share ? t('common.save') : t('kb.share.create')}
        </Button>
      </div>
    </div>
  );
}

/** Public links of a folder: list, create, edit, revoke, copy. */
export default function ShareDialog({ open, folder, config, onClose }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [shares, setShares] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    kbApi
      .shares(folder.id)
      .then((res) => {
        setShares(res.data.shares);
        if (!res.data.shares.length) setEditing('new');
      })
      .catch((err) => message.error(errorMessage(err)));
  }, [folder.id, message]);

  useEffect(() => {
    if (open) {
      setShares(null);
      setEditing(null);
      load();
    }
  }, [open, load]);

  const copy = async (slug) => {
    await navigator.clipboard?.writeText(linkOf(slug));
    message.success(t('kb.share.copied'));
  };

  const act = async (request) => {
    try {
      await request();
      load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={t('kb.share.title', { name: folder.name })} width={600} destroyOnHidden>
      {!shares ? (
        <div className="viewer-loading" style={{ minHeight: 160 }}><Spin /></div>
      ) : editing ? (
        <ShareForm
          folder={folder}
          config={config}
          share={editing === 'new' ? null : editing}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      ) : (
        <div className="shares">
          {shares.map((share) => {
            const state = share.revoked ? 'revoked' : share.expired ? 'expired' : 'active';
            return (
              <div key={share.id} className={`share-card is-${state}`}>
                <div className="share-card__head">
                  <strong>{share.title || share.slug}</strong>
                  <Tag bordered={false} color={state === 'active' ? 'green' : 'default'}>{t(`kb.share.state_${state}`)}</Tag>
                  {share.hasPassword && <Tag bordered={false}>🔒 {t('kb.share.password')}</Tag>}
                </div>
                <button type="button" className="share-card__url" onClick={() => copy(share.slug)} title={t('kb.share.copy')}>
                  {linkOf(share.slug)}
                  <span>⧉</span>
                </button>
                <div className="share-card__meta">
                  {share.expiresAt ? t('kb.share.until', { date: formatDateTime(share.expiresAt, locale) }) : t('kb.share.noExpiry')}
                  {' · '}
                  {t('kb.share.views', { count: share.viewCount })}
                  {!share.allowDownload && ` · ${t('kb.share.noDownload')}`}
                </div>
                <div className="share-card__actions">
                  <Button size="small" onClick={() => setEditing(share)}>{t('common.edit')}</Button>
                  {share.revoked ? (
                    <Button size="small" onClick={() => act(() => kbApi.updateShare(share.id, { revoked: false }))}>{t('kb.share.restore')}</Button>
                  ) : (
                    <Tooltip title={t('kb.share.revokeHint')}>
                      <Button size="small" onClick={() => act(() => kbApi.updateShare(share.id, { revoked: true }))}>{t('kb.share.revoke')}</Button>
                    </Tooltip>
                  )}
                  <Popconfirm title={t('kb.share.confirmDelete')} okButtonProps={{ danger: true }} onConfirm={() => act(() => kbApi.deleteShare(share.id))}>
                    <Button size="small" type="text" danger>{t('common.delete')}</Button>
                  </Popconfirm>
                </div>
              </div>
            );
          })}
          <Button type="primary" block size="large" onClick={() => setEditing('new')} icon={<PlusOutlined />}>
            {t('kb.share.new')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
