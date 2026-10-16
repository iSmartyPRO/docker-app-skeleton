import { useNavigate } from 'react-router-dom';
import { Alert, Button, Result, Tag, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useLocale } from '../../../../context/LocaleContext';
import { useAccess } from '../AccessContext';
import { ACCESS_ROOT } from '../api';

/** "Full access" / "Read only" tag. */
export function TypeTag({ type }) {
  const { t } = useLocale();
  if (type === 'full') return <Tag color="green">{t('folderAccess.type.full')}</Tag>;
  if (type === 'read') return <Tag color="blue">{t('folderAccess.type.read')}</Tag>;
  return <Tag>{t('folderAccess.type.other')}</Tag>;
}

/** "Needs review" with the reasons on hover. */
export function ReviewTag({ issues }) {
  const { t } = useLocale();
  if (!issues?.length) return null;
  return (
    <Tooltip title={issues.map((issue) => t(`folderAccess.issues.${issue}`)).join(' · ')}>
      <Tag color="orange">{t('folderAccess.needsReview')}</Tag>
    </Tooltip>
  );
}

export function StatusTag({ person }) {
  const { t } = useLocale();
  if (person.enabled === false) return <Tag>{t('folderAccess.disabled')}</Tag>;
  if (person.enabled === true) return <Tag color="green">{t('folderAccess.enabled')}</Tag>;
  return <Tag>{t('folderAccess.unknown')}</Tag>;
}

/** After a membership change: it applies at the person's next Windows logon. */
export function LogonNotice() {
  const { t } = useLocale();
  const { notice, setNotice } = useAccess();
  if (!notice) return null;
  return <Alert className="fa-notice" type="info" showIcon closable onClose={() => setNotice(false)} message={t('folderAccess.logonNotice')} description={t('folderAccess.logonNoticeText')} />;
}

/** Why the section is read-only for this person. */
export function ReadOnlyBanner() {
  const { t } = useLocale();
  const { info } = useAccess();
  if (!info || info.canWrite || !info.role) return null;
  return <Alert className="fa-notice" type="warning" showIcon message={t(`folderAccess.readOnly.${info.readOnly || 'forbidden'}`)} />;
}

/** Active Directory is not connected: what to do, by role. */
export function AdOff({ role }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const superadmin = role === 'superadmin';
  const extra = [
    superadmin && (
      <Button key="ad" type="primary" onClick={() => navigate('/admin/settings/ad')}>
        {t('folderAccess.adOff.integrations')}
      </Button>
    ),
    superadmin && (
      <Button key="settings" onClick={() => navigate('/admin/settings/drive')}>
        {t('folderAccess.adOff.settings')}
      </Button>
    ),
    <Button key="journal" onClick={() => navigate(`${ACCESS_ROOT}/journal`)}>
      {t('folderAccess.adOff.journal')}
    </Button>,
  ].filter(Boolean);
  return <Result status="warning" title={t('folderAccess.adOff.title')} subTitle={t(superadmin ? 'folderAccess.adOff.super' : 'folderAccess.adOff.sysadmin')} extra={extra} />;
}

/** "N group pairs open this folder": a quiet line above the pairs. */
export function PairsNote({ n }) {
  const { t } = useLocale();
  return (
    <div className="fa-pairs-note">
      <InfoCircleOutlined /> {t('folderAccess.panel.severalPairs', { n })}
    </div>
  );
}
