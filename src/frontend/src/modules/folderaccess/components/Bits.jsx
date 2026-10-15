import { Alert, Tag, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { useFolderAccess } from '../FolderAccessContext';

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
  const { notice, setNotice } = useFolderAccess();
  if (!notice) return null;
  return <Alert className="fa-notice" type="info" showIcon closable onClose={() => setNotice(false)} message={t('folderAccess.logonNotice')} description={t('folderAccess.logonNoticeText')} />;
}

/** Why the section is read-only for this person. */
export function ReadOnlyBanner() {
  const { t } = useLocale();
  const { info } = useFolderAccess();
  if (!info || info.canWrite || !info.role) return null;
  return <Alert className="fa-notice" type="warning" showIcon message={t(`folderAccess.readOnly.${info.readOnly || 'forbidden'}`)} />;
}
