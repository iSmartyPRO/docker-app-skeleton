import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Result, Spin, Tag } from 'antd';
import { FolderOpenOutlined, ReloadOutlined, SafetyOutlined } from '@ant-design/icons';
import { useLocale } from '../../../../context/LocaleContext';
import ModuleHeader from '../../../shared/ModuleHeader';
import { folderUrl as driveFolderUrl } from '../../api';
import { ACCESS_ROOT, faApi, faError, ntfsUrl } from '../api';
import { useAccess } from '../AccessContext';
import { LogonNotice, PairsNote, ReadOnlyBanner } from '../components/Bits';
import { InheritedList, PairBlock } from '../components/Pairs';
import { DeleteGroupDialog, DescriptionDialog } from '../components/GroupDialogs';

/** A folder: its path, project, File server folder, review reasons and every group pair that opens it. */
export default function FolderPage() {
  const { t } = useLocale();
  const { key } = useParams();
  const navigate = useNavigate();
  const { info } = useAccess();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [describing, setDescribing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: next } = await faApi.folder(key);
      setData(next);
      setError(null);
    } catch (err) {
      setError(faError(err, t));
    }
  }, [key, t]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (error) return <Result status="warning" title={error} extra={<Button onClick={() => navigate(ACCESS_ROOT)}>{t('folderAccess.backToFolders')}</Button>} />;
  if (!data) return <div className="fa-loading"><Spin /></div>;
  const { folder, members, inherited } = data;
  const share = (info?.config?.shares || []).find((row) => row.shareId === folder.shareId);
  const superadmin = info?.role === 'superadmin';

  return (
    <div className="fs-page fa-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('folderAccess.folders.title'), to: ACCESS_ROOT }, ...(folder.project ? [{ key: 'project', label: folder.project }] : []), { key: 'cur', label: folder.name || folder.path }]}
        title={folder.path || folder.name}
        description={share ? t('folderAccess.onShare', { share: share.title || `#${share.shareId}`, path: folder.relPath || '/' }) : folder.kind === 'sg' && folder.path ? t('folderAccess.folders.unmappedHint') : null}
        meta={folder.project ? <Tag bordered={false}>{t('folderAccess.project')}: {folder.project}</Tag> : null}
        actions={[
          folder.mapped && { key: 'open', icon: <FolderOpenOutlined />, label: t('folderAccess.openInDrive'), onClick: () => navigate(driveFolderUrl(folder.shareId, folder.relPath || '')) },
          folder.mapped && superadmin && { key: 'ntfs', icon: <SafetyOutlined />, label: t('folderAccess.mode.ntfs'), onClick: () => navigate(ntfsUrl(folder.shareId, folder.relPath || '')) },
          { key: 'refresh', icon: <ReloadOutlined />, label: t('folderAccess.refresh'), onClick: load },
        ].filter(Boolean)}
      />
      <ReadOnlyBanner />
      <LogonNotice />
      {folder.needsReview && (
        <Alert className="fa-notice" type="warning" showIcon message={t('folderAccess.needsReview')} description={folder.issues.map((issue) => t(`folderAccess.issues.${issue}`)).join(' · ')} />
      )}
      {(folder.root || folder.protected) && !superadmin && <Alert className="fa-notice" type="info" showIcon message={t('folderAccess.protectedText')} />}
      {folder.pairs.length > 1 && <PairsNote n={folder.pairs.length} />}
      {folder.pairs.map((pair) => (
        <PairBlock key={pair.key} pair={pair} members={members} onChanged={load} onDescribe={setDescribing} onDelete={setDeleting} showHead={folder.pairs.length > 1 || folder.kind === 'sg'} />
      ))}
      <InheritedList folders={inherited} />
      <DescriptionDialog group={describing} onClose={(done) => { setDescribing(null); if (done) load(); }} />
      <DeleteGroupDialog group={deleting} onClose={(done) => { setDeleting(null); if (done) load().catch(() => {}); }} />
    </div>
  );
}
