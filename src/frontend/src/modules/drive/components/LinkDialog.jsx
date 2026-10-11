import { useEffect, useState } from 'react';
import { App, Button, DatePicker, Input, Modal, Popconfirm, Segmented, Skeleton, Switch, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { copyText, driveApi } from '../api';
import { EntryIcon } from './EntryList';
import { Hint } from '../../../help/Hint';

export const linkUrl = (link) => `${window.location.origin}/d/${link.token}`;

export function LinkStatus({ link }) {
  const { t } = useLocale();
  const color = { active: 'green', expired: 'orange', revoked: 'default', owner_inactive: 'red' }[link.status] || 'default';
  return <Tag color={color} bordered={false}>{t(`drive.linkStatus.${link.status}`)}</Tag>;
}

export function LinkRow({ link, onChange, showItem, showOwner }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const run = async (action) => {
    try {
      await action();
      onChange?.();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  const active = link.status === 'active';
  return (
    <div className={`fs-link dv-link is-${link.status}`}>
      {showItem && (
        <div className="dv-link__item">
          <EntryIcon entry={{ dir: link.kind === 'dir', ext: (link.name.split('.').pop() || '').toLowerCase() }} size={26} />
          <div>
            <strong>{link.name}</strong>
            <span>{link.shareTitle}{link.path ? ` / ${link.path}` : ''}</span>
          </div>
        </div>
      )}
      <div className="fs-link__url">
        <code>{linkUrl(link)}</code>
        <Tooltip title={t('common.copy')}>
          <Button size="small" disabled={!active} onClick={() => copyText(linkUrl(link)).then(() => message.success(t('common.copied')))}>⧉</Button>
        </Tooltip>
      </div>
      <div className="fs-link__meta">
        <LinkStatus link={link} />
        <Tag bordered={false}>{link.audience === 'employees' ? `🏢 ${t('drive.audience.employees')}` : `🌐 ${t('drive.audience.anyone')}`}</Tag>
        {link.hasPassword && <Tag bordered={false}>🔒 {t('files.withPassword')}</Tag>}
        {!link.allowDownload && <Tag bordered={false}>{t('files.viewOnly')}</Tag>}
        <span>{link.expiresAt ? t('files.until', { date: formatDateTime(link.expiresAt, locale) }) : t('files.noExpiry')}</span>
        <span>· {t('files.viewsN', { n: link.views })}</span>
        {showOwner && link.owner && <span>· {link.owner.name}</span>}
      </div>
      <div className="fs-link__actions">
        {link.status !== 'owner_inactive' && (
          <Button size="small" type="text" onClick={() => run(() => driveApi.updateLink(link.id, { revoked: link.status !== 'revoked' }))}>
            {link.status === 'revoked' ? t('files.restoreLink') : t('files.revokeLink')}
          </Button>
        )}
        <Popconfirm title={t('files.deleteLinkConfirm')} onConfirm={() => run(() => driveApi.deleteLink(link.id))}>
          <Button size="small" type="text" danger>{t('common.delete')}</Button>
        </Popconfirm>
      </div>
    </div>
  );
}

function LinkForm({ config, onCreate }) {
  const { t } = useLocale();
  const employeesOnly = config.linkAudience === 'employees';
  const [audience, setAudience] = useState(employeesOnly ? 'employees' : 'anyone');
  const [password, setPassword] = useState('');
  const [expires, setExpires] = useState(null);
  const [download, setDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const presets = [1, 7, 30].filter((days) => !config.maxLinkDays || days <= config.maxLinkDays);
  return (
    <div className="fs-linkform dv-linkform">
      <div className="fs-linkform__row">
        <span>{t('drive.audience.title')} <Hint id="drive.linkAudience" /></span>
        <Segmented
          block
          value={audience}
          onChange={setAudience}
          options={[
            { value: 'anyone', label: `🌐 ${t('drive.audience.anyone')}`, disabled: employeesOnly },
            { value: 'employees', label: `🏢 ${t('drive.audience.employees')}` },
          ]}
        />
      </div>
      <p className="dv-linkform__hint">{t(`drive.audience.${audience}Hint`)}</p>
      <div className="fs-linkform__row">
        <span>{t('files.linkPassword')}</span>
        <Input.Password value={password} onChange={(event) => setPassword(event.target.value)} placeholder={config.requireLinkPassword ? t('files.passwordRequired') : t('files.passwordOptional')} autoComplete="new-password" />
      </div>
      <div className="fs-linkform__row">
        <span>{t('files.linkExpires')} <Hint id="drive.linkExpires" /></span>
        <div className="fs-linkform__expiry">
          <DatePicker
            value={expires}
            onChange={setExpires}
            showTime={{ format: 'HH:mm' }}
            format="DD.MM.YYYY HH:mm"
            placeholder={config.maxLinkDays ? t('files.maxDays', { n: config.maxLinkDays }) : t('files.noExpiry')}
            disabledDate={(day) => day.isBefore(dayjs(), 'day') || (config.maxLinkDays && day.isAfter(dayjs().add(config.maxLinkDays, 'day')))}
          />
          {presets.map((days) => (
            <Button key={days} size="small" onClick={() => setExpires(dayjs().add(days, 'day'))}>{t('files.days', { n: days })}</Button>
          ))}
        </div>
      </div>
      <div className="fs-linkform__row">
        <span>{t('files.allowDownload')}</span>
        <Switch checked={download} onChange={setDownload} />
      </div>
      <Button
        type="primary"
        block
        size="large"
        loading={busy}
        disabled={config.requireLinkPassword && !password}
        onClick={async () => {
          setBusy(true);
          try {
            await onCreate({ audience, password: password || undefined, expiresAt: expires ? expires.toISOString() : null, allowDownload: download });
            setPassword('');
            setExpires(null);
          } finally {
            setBusy(false);
          }
        }}
      >
        + {t('files.createLink')}
      </Button>
    </div>
  );
}

/** Public links for one file or folder of the drive. */
export default function LinkDialog({ open, shareId, entry, config, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [links, setLinks] = useState(null);
  const load = () =>
    driveApi
      .links({ shareId, path: entry.path })
      .then((res) => setLinks(res.data.links))
      .catch((err) => message.error(errorMessage(err)));
  useEffect(() => {
    if (open && entry) {
      setLinks(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shareId, entry?.path]);
  if (!entry) return null;
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={640} destroyOnHidden title={null} className="dv-linkdialog">
      <div className="dv-linkdialog__head">
        <EntryIcon entry={entry} size={44} />
        <div>
          <span className="share-hero__eyebrow">{t('drive.shareLink')}</span>
          <h2>{entry.name}</h2>
        </div>
      </div>
      <div className="dv-linkdialog__trust">
        <span aria-hidden="true">🛡</span>
        <p>{t('drive.linkTrust')}</p>
      </div>
      {!config.publicLinks ? (
        <div className="fs-share__empty">{t('files.linksDisabled')}</div>
      ) : !links ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <div className="fs-links">
          {links.map((link) => (
            <LinkRow key={link.id} link={link} onChange={load} />
          ))}
          <LinkForm
            config={config}
            onCreate={async (payload) => {
              try {
                const { data } = await driveApi.createLink(shareId, { ...payload, path: entry.path });
                await copyText(linkUrl(data.link));
                message.success(t('drive.linkCreated'));
                await load();
              } catch (err) {
                message.error(errorMessage(err));
              }
            }}
          />
        </div>
      )}
    </Modal>
  );
}
