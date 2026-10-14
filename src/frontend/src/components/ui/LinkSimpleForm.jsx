import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { App, Button, Input, Popover, Spin, Switch, Tooltip } from 'antd';
import {
  CheckOutlined,
  CopyOutlined,
  DownloadOutlined,
  DownOutlined,
  EyeOutlined,
  LinkOutlined,
  QrcodeOutlined,
  SlidersOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { formatDateTime } from '../../lib/format';
import { getRegional, inZone, nowInZone, todayISO } from '../../lib/datetime';
import { DateField } from './DateTimeField';
import { permissionSentence, presetOf } from './LinkPermissions';
import SlugField from './SlugField';
import MessengerPreview from './MessengerPreview';
import { Hint } from '../../help/Hint';
import './linkShare.css';

/*
 * The share-link form used by Files and Drive: simple by default, everything
 * else one click away.
 *
 *   Simple card   what the recipient can do (View / View and download, and
 *                 "More…" for folders), expiry chips, an optional password
 *                 (with a generator) and the link address (SlugField).
 *   Advanced      collapsed; the module passes its own content (presets and
 *                 toggles of LinkPermissionsPicker, upload rules, title, who
 *                 can open…) and a summary of what is customised. A link that
 *                 uses anything beyond the simple fields opens expanded.
 *
 * The form only collects; the server checks every value again.
 */

const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** An easy-to-dictate password: three groups of four, no look-alike characters. */
export function generatePassword() {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/** "until 21.10" (year added when it is not this year). */
export function shortUntil(value, locale) {
  if (!value) return '';
  const sameYear = inZone(value)?.year() === nowInZone().year();
  return formatDateTime(value, locale, sameYear ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** The link as a QR code (made in the browser), with a PNG download. */
export function LinkQr({ url, name }) {
  const { t } = useLocale();
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((mod) => (mod.default || mod).toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M', color: { dark: '#0F172A', light: '#FFFFFF' } }))
      .then((data) => alive && setSrc(data))
      .catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="sl-qr">
      {src === null ? <Spin /> : src ? <img src={src} alt={t('linkShare.qr')} width={200} height={200} /> : <em>—</em>}
      <span>{t('linkShare.qrHint')}</span>
      {src && (
        <Button size="small" icon={<DownloadOutlined />} href={src} download={`${String(name || 'link').replace(/[\\/:*?"<>|]/g, '_')}-qr.png`}>
          {t('linkShare.qrDownload')}
        </Button>
      )}
    </div>
  );
}

export function QrButton({ url, name, disabled, size, children }) {
  const { t } = useLocale();
  return (
    <Popover trigger="click" destroyOnHidden content={<LinkQr url={url} name={name} />}>
      <Tooltip title={children ? null : t('linkShare.qr')}>
        <Button size={size} icon={<QrcodeOutlined />} disabled={disabled} aria-label={t('linkShare.qr')}>
          {children}
        </Button>
      </Tooltip>
    </Popover>
  );
}

/** Which simple choice a permission list is: 'view', 'viewDownload' or 'more'. */
export function simpleAccessOf(perms, isFolder) {
  const preset = presetOf(perms, isFolder);
  return preset === 'view' || preset === 'viewDownload' ? preset : 'more';
}

function expiryFrom(initial) {
  if (!initial?.expiresAt) return { choice: 'none', day: null, touched: false };
  return { choice: 'date', day: inZone(initial.expiresAt)?.format('YYYY-MM-DD') || null, touched: false };
}

/**
 * The form.
 *   isFolder, name        — the shared item
 *   initial               — the link being edited, or null to create
 *   perms, onPermsChange  — permission keys (owned by the module: the advanced picker edits them too)
 *   allowed               — keys the person may grant
 *   config                — { maxLinkDays, requireLinkPassword }
 *   writePasswordRequired — the current permissions need a password (module rule)
 *   host, path, checkSlug — address prefix ("portal.example.com", "/l/") and availability check
 *   advanced, advancedHint, advancedSummary — the module's advanced content and its summary (strings)
 *   notes                 — extra lines under the simple card (e.g. "employees only")
 *   onSubmit(basics)      — { permissions, expiresAt?, password?, slug? } (only changed fields when editing)
 */
export default function LinkSimpleForm({
  isFolder,
  name,
  initial = null,
  perms,
  onPermsChange,
  allowed,
  config = {},
  writePasswordRequired = false,
  host,
  path,
  checkSlug,
  advanced,
  advancedHint,
  advancedSummary = [],
  notes,
  onSubmit,
  onCancel,
}) {
  const { t, locale } = useLocale();
  const { modal } = App.useApp();
  const access = simpleAccessOf(perms, isFolder);
  const [advOpen, setAdvOpen] = useState(() => access === 'more' || advancedSummary.length > 0);
  const advRef = useRef(null);
  const [expiry, setExpiry] = useState(() => expiryFrom(initial));
  const [pickerOpen, setPickerOpen] = useState(false);
  const passwordRequired = Boolean(config.requireLinkPassword || writePasswordRequired);
  const [passwordOn, setPasswordOn] = useState(Boolean(initial?.hasPassword) || passwordRequired);
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [slug, setSlug] = useState(initial?.slug || '');
  const [slugState, setSlugState] = useState({ ok: true, pending: false });
  const [busy, setBusy] = useState(false);
  const allowedSet = useMemo(() => new Set(allowed || ['view', 'download']), [allowed]);
  const maxDays = Number(config.maxLinkDays) || 0;
  const presets = [1, 7, 30].filter((days) => !maxDays || days <= maxDays);

  useEffect(() => {
    if (passwordRequired) setPasswordOn(true);
  }, [passwordRequired]);

  const keepsPassword = Boolean(initial?.hasPassword) && passwordOn && !password;
  const passwordShort = passwordOn && password && password.length < 4;
  const passwordMissing = passwordOn && !password && !keepsPassword;
  const blocked = busy || passwordShort || passwordMissing || !slugState.ok || slugState.pending;

  const pickAccess = (value) => {
    if (value === 'more') {
      setAdvOpen(true);
      setTimeout(() => advRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return;
    }
    onPermsChange(value === 'view' ? ['view'] : ['view', 'download']);
  };

  const expiryValue = () => {
    if (expiry.choice === 'none') return null;
    if (expiry.choice === 'date') {
      if (!expiry.day) return null;
      if (!expiry.touched && initial?.expiresAt) return initial.expiresAt;
      // The end of that day in the person's zone (capped by the administrator's limit).
      let end = dayjs.tz(`${expiry.day}T23:59:59`, getRegional().timeZone);
      if (maxDays) {
        const cap = nowInZone().add(maxDays, 'day').subtract(1, 'minute');
        if (end.isAfter(cap)) end = cap;
      }
      return end.toISOString();
    }
    return nowInZone().add(Number(expiry.choice), 'day').second(0).millisecond(0).toISOString();
  };

  const submit = async () => {
    const basics = { permissions: perms };
    if (!initial || expiry.touched) basics.expiresAt = expiryValue();
    if (passwordOn && password) basics.password = password;
    else if (!passwordOn && initial?.hasPassword) basics.password = '';
    else if (!initial && !passwordOn) basics.password = undefined;
    const oldSlug = initial?.slug || '';
    if (!initial) basics.slug = slug || undefined;
    else if (slug !== oldSlug) basics.slug = slug;
    const go = async () => {
      setBusy(true);
      try {
        await onSubmit(basics, { password: passwordOn ? password : '' });
      } finally {
        setBusy(false);
      }
    };
    if (initial && oldSlug && slug !== oldSlug) {
      modal.confirm({
        title: t('linkShare.slugChangeTitle'),
        content: t('linkShare.slugChangeText', { old: `${host}${path}${oldSlug}` }),
        okText: t('linkShare.slugChangeOk'),
        onOk: go,
      });
      return;
    }
    await go();
  };

  const expiryChip = (choice, label) => (
    <button
      key={choice}
      type="button"
      role="radio"
      aria-checked={expiry.choice === choice}
      className={`sl-chip${expiry.choice === choice ? ' is-active' : ''}`}
      onClick={() => {
        if (choice === 'date') {
          setExpiry((current) => ({ choice: 'date', day: current.day || nowInZone().add(Math.min(14, maxDays || 14), 'day').format('YYYY-MM-DD'), touched: true }));
          setPickerOpen(true);
        } else setExpiry({ choice, day: null, touched: true });
      }}
    >
      {label}
    </button>
  );

  const disabledDay = (day) => {
    const value = day.format('YYYY-MM-DD');
    return value < todayISO() || Boolean(maxDays && value > nowInZone().add(maxDays, 'day').format('YYYY-MM-DD'));
  };
  const presetName = access === 'more' ? (presetOf(perms, isFolder) === 'custom' ? permissionSentence(perms, t) : t(`linkPerms.preset.${presetOf(perms, isFolder)}`)) : '';

  return (
    <div className="sl-form" data-testid="link-form">
      <div className="sl-card">
        <section className="sl-row">
          <div className="sl-row__label">{t('linkShare.access')}</div>
          <div className="sl-seg" role="radiogroup" aria-label={t('linkShare.access')}>
            {[
              ['view', <EyeOutlined key="i" />, t('linkShare.view')],
              ['viewDownload', <DownloadOutlined key="i" />, t('linkShare.viewDownload')],
            ].map(([value, icon, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={access === value}
                disabled={value === 'viewDownload' && !allowedSet.has('download')}
                className={`sl-seg__opt${access === value ? ' is-active' : ''}`}
                onClick={() => pickAccess(value)}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
            {(isFolder || access === 'more') && (
              <Tooltip title={access === 'more' ? null : t('linkShare.moreHint')}>
                <button type="button" role="radio" aria-checked={access === 'more'} className={`sl-seg__opt is-more${access === 'more' ? ' is-active' : ''}`} onClick={() => pickAccess('more')}>
                  <span>{t('linkShare.more')}</span>
                </button>
              </Tooltip>
            )}
          </div>
          {access === 'more' && <div className="sl-row__sub">{t('linkShare.customized', { what: presetName })}</div>}
        </section>

        <section className="sl-row">
          <div className="sl-row__label">{t('linkShare.expiry')}</div>
          <div className="sl-chips" role="radiogroup" aria-label={t('linkShare.expiry')}>
            {expiryChip('none', maxDays ? t('linkShare.expiryMax', { n: maxDays }) : t('linkShare.expiryNone'))}
            {presets.map((days) => expiryChip(String(days), t(`linkShare.expiryDays.${days}`)))}
            {expiryChip('date', expiry.choice === 'date' && expiry.day ? t('linkShare.until', { date: shortUntil(dayjs.tz(`${expiry.day}T12:00:00`, getRegional().timeZone).toISOString(), locale) }) : t('linkShare.expiryDate'))}
          </div>
          {expiry.choice === 'date' && (
            <div className="sl-row__date">
              <DateField
                value={expiry.day}
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onChange={(day) => setExpiry({ choice: day ? 'date' : 'none', day, touched: true })}
                disabledDate={disabledDay}
                allowClear={false}
                aria-label={t('linkShare.expiryDate')}
              />
              <span className="sl-row__sub">
                {expiry.day && (!initial?.expiresAt || expiry.touched)
                  ? t('linkShare.expiryEndOfDay', { date: formatDateTime(`${expiry.day}`, locale, { dateStyle: 'medium' }) })
                  : initial?.expiresAt
                    ? formatDateTime(initial.expiresAt, locale)
                    : ''}
              </span>
            </div>
          )}
          {maxDays > 0 && <div className="sl-row__sub">{t('linkShare.expiryCapped', { n: maxDays })}</div>}
        </section>

        <section className="sl-row">
          <div className="sl-row__head">
            <label className="sl-row__label" htmlFor="sl-password-switch">
              {t('linkShare.password')}
            </label>
            <Switch
              id="sl-password-switch"
              checked={passwordOn}
              disabled={passwordRequired && passwordOn}
              onChange={(on) => {
                setPasswordOn(on);
                if (!on) setPassword('');
              }}
              data-testid="password-switch"
            />
          </div>
          {passwordRequired && <div className="sl-row__sub">{config.requireLinkPassword ? t('linkShare.passwordRequired') : t('linkShare.passwordWriteRequired')}</div>}
          {passwordOn && (
            <div className="sl-password">
              <Input.Password
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={initial?.hasPassword ? t('linkShare.passwordKeep') : t('linkShare.passwordPh')}
                autoComplete="new-password"
                maxLength={200}
                visibilityToggle={{ visible: revealed, onVisibleChange: setRevealed }}
                status={passwordShort || passwordMissing ? 'warning' : undefined}
                aria-label={t('linkShare.password')}
                data-testid="password-input"
              />
              <Button
                icon={<ThunderboltOutlined />}
                onClick={() => {
                  setPassword(generatePassword());
                  setRevealed(true);
                }}
              >
                {t('linkShare.generate')}
              </Button>
            </div>
          )}
          {passwordOn && !passwordShort && <div className="sl-row__sub">{t('linkShare.passwordHint')}</div>}
          {passwordShort && <div className="sl-row__sub is-warn">{t('linkShare.passwordShort')}</div>}
        </section>

        <section className="sl-row">
          <div className="sl-row__label">
            {t('linkShare.slug')} <Hint id="files.linkSlug" />
          </div>
          <SlugField host={host} path={path} value={slug} onChange={setSlug} check={checkSlug} current={initial?.slug || ''} name={name} onState={setSlugState} guessHint={!passwordOn} />
        </section>
        {notes}
      </div>

      {advanced && (
        <div className={`sl-adv${advOpen ? ' is-open' : ''}`} ref={advRef}>
          <button type="button" className="sl-adv__toggle" aria-expanded={advOpen} onClick={() => setAdvOpen((open) => !open)} data-testid="advanced-toggle">
            <span className="sl-adv__icon"><SlidersOutlined /></span>
            <span className="sl-adv__text">
              <span className="sl-adv__title">{t('linkShare.advanced')}</span>
              {!advOpen && <span className="sl-adv__hint">{advancedSummary.length ? advancedSummary.join(' · ') : advancedHint}</span>}
            </span>
            {!advOpen && advancedSummary.length > 0 && <span className="sl-adv__dot" aria-hidden="true" />}
            <DownOutlined className="sl-adv__caret" />
          </button>
          {advOpen && <div className="sl-adv__body">{advanced}</div>}
        </div>
      )}

      <div className="sl-foot">
        {onCancel && <Button size="large" onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button type="primary" size="large" icon={initial ? <CheckOutlined /> : <LinkOutlined />} loading={busy} disabled={blocked && !busy} onClick={submit} data-testid="link-submit">
          {initial ? t('linkShare.save') : t('linkShare.create')}
        </Button>
      </div>
    </div>
  );
}

/** After creating: the link (already copied), the password reminder, QR, "open as recipient". */
export function LinkCreated({ url, host, path, address, password, previewUrl, copied, name, onDone, onAnother }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const copy = (text) => copyToClipboard(text).then((ok) => (ok ? message.success(t('common.copied')) : null));
  return (
    <div className="sl-done" data-testid="link-created">
      <div className="sl-done__badge" aria-hidden="true">
        <CheckOutlined />
      </div>
      <h3 className="sl-done__title">{copied ? t('linkShare.created') : t('linkShare.createdNoCopy')}</h3>
      <div className="sl-done__url">
        <span className="sl-done__address" title={url}>
          <span className="sl-done__host">{host}{path}</span>
          <b>{address}</b>
        </span>
        <Button type="primary" icon={<CopyOutlined />} onClick={() => copy(url)} aria-label={t('linkShare.copyLink')}>
          {t('linkShare.copy')}
        </Button>
      </div>
      {password && (
        <div className="sl-done__password">
          <span>{t('linkShare.passwordLabel')}:</span>
          <code>{password}</code>
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(password)} aria-label={t('linkShare.copy')} />
          <div className="sl-done__hint">{t('linkShare.sendPassword')}</div>
        </div>
      )}
      <div className="sl-done__actions">
        <QrButton url={url} name={name}>{t('linkShare.qr')}</QrButton>
        <Button icon={<EyeOutlined />} href={previewUrl || url} target="_blank" rel="noopener noreferrer">
          {t('linkShare.openAsRecipient')}
        </Button>
      </div>
      <MessengerPreview url={url} />
      <div className="sl-foot">
        {onAnother && <Button size="large" onClick={onAnother}>{t('linkShare.another')}</Button>}
        <Button type="primary" size="large" onClick={onDone} data-testid="link-done">
          {t('linkShare.done')}
        </Button>
      </div>
    </div>
  );
}
