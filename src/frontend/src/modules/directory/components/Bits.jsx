import { Tag, Tooltip } from 'antd';
import { ClusterOutlined, DesktopOutlined, ExperimentOutlined, LockOutlined, SafetyCertificateOutlined, TeamOutlined, UnlockOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, fmtDateTime, useRegional } from '../../../lib/datetime';
import { daysSince, hueOf, initialsOf } from '../lib';

/** Photo (thumbnailPhoto) or initials on a colour of the name. */
export function Avatar({ object, size = 36 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38), '--h': hueOf(object?.login || object?.name) };
  if (object?.photo) return <img className="ad-avatar" src={object.photo} alt="" style={style} />;
  const kind = object?.kind;
  return (
    <span className={`ad-avatar ad-avatar--${kind || 'user'}`} style={style} aria-hidden="true">
      {kind === 'group' ? <TeamOutlined /> : kind === 'computer' ? <DesktopOutlined /> : initialsOf(object?.name)}
    </span>
  );
}

export function KindIcon({ kind }) {
  if (kind === 'group') return <TeamOutlined />;
  if (kind === 'computer') return <DesktopOutlined />;
  if (kind === 'ou' || kind === 'container') return <ClusterOutlined />;
  return <UserOutlined />;
}

/** Enabled / disabled, locked, password expired, must change — the chips of a row or a card. */
export function StatusTags({ object, compact = false }) {
  const { t } = useLocale();
  if (!object || (object.kind !== 'user' && object.kind !== 'computer')) return null;
  const tags = [];
  if (object.enabled === false) tags.push(<Tag key="off" className="ad-tag ad-tag--off">{t('directory.status.disabled')}</Tag>);
  else if (!compact) tags.push(<Tag key="on" className="ad-tag ad-tag--on">{t('directory.status.enabled')}</Tag>);
  if (object.locked) tags.push(<Tag key="lock" className="ad-tag ad-tag--warn" icon={<LockOutlined />}>{t('directory.status.locked')}</Tag>);
  if (object.kind === 'user' && object.mustChange) tags.push(<Tag key="must" className="ad-tag ad-tag--info">{t('directory.status.mustChange')}</Tag>);
  else if (object.kind === 'user' && object.pwdExpired) tags.push(<Tag key="exp" className="ad-tag ad-tag--warn">{t('directory.status.pwdExpired')}</Tag>);
  if (object.protected) tags.push(<Tag key="prot" className="ad-tag ad-tag--info" icon={<SafetyCertificateOutlined />}>{t('directory.status.protected')}</Tag>);
  if (compact && !tags.length) tags.push(<Tag key="on" className="ad-tag ad-tag--on">{t('directory.status.enabled')}</Tag>);
  return <span className="ad-tags">{tags}</span>;
}

/** «Last sign-in»: a date, «never», and a muted note when it was long ago. */
export function LastLogon({ value, inactiveDays = 90 }) {
  const { t } = useLocale();
  useRegional();
  if (!value) return <span className="ad-muted">{t('directory.never')}</span>;
  const days = daysSince(value);
  return (
    <Tooltip title={fmtDateTime(value)}>
      <span className={days >= inactiveDays ? 'ad-stale' : undefined}>{days < 1 ? t('directory.today') : fmtDate(value)}</span>
    </Tooltip>
  );
}

export function DateText({ value, time = false }) {
  useRegional();
  if (!value) return <span className="ad-muted">—</span>;
  return <span>{time ? fmtDateTime(value) : fmtDate(value)}</span>;
}

/** «Demo directory» / «LDAPS» / «StartTLS» / «No secure channel». */
export function ModeBadge({ info }) {
  const { t } = useLocale();
  if (!info) return null;
  if (info.mode === 'demo')
    return (
      <Tooltip title={t('directory.demoBadgeHint')}>
        <span className="ad-badge ad-badge--demo" data-tour="directory.demo">
          <ExperimentOutlined /> {t('directory.demoBadge')}
        </span>
      </Tooltip>
    );
  if (info.mode !== 'ldap') return null;
  if (info.channel)
    return (
      <Tooltip title={t('directory.channel.secureHint')}>
        <span className="ad-badge ad-badge--ok">
          <LockOutlined /> {info.channel === 'ldaps' ? 'LDAPS' : 'StartTLS'}
        </span>
      </Tooltip>
    );
  return (
    <Tooltip title={t('directory.channel.plainHint')}>
      <span className="ad-badge ad-badge--warn">
        <UnlockOutlined /> {t('directory.channel.plain')}
      </span>
    </Tooltip>
  );
}

/** A label / value row of a card. */
export function Field({ label, children, wide = false }) {
  return (
    <div className={`ad-field${wide ? ' ad-field--wide' : ''}`}>
      <dt>{label}</dt>
      <dd>{children ?? <span className="ad-muted">—</span>}</dd>
    </div>
  );
}

/** «Read only: folder access group» and friends. */
export function ReadOnlyNote({ reason }) {
  const { t } = useLocale();
  if (!reason) return null;
  return (
    <span className="ad-readonly">
      <WarningOutlined /> {t(`directory.readOnly.${reason}`)}
    </span>
  );
}

/** «HQ › Users» */
export function PathText({ path }) {
  const { t } = useLocale();
  if (!path?.length) return <span className="ad-muted">{t('directory.rootShort')}</span>;
  return <span className="ad-path">{path.join(' › ')}</span>;
}
