import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../../../context/LocaleContext';
import OfficeEditor from '../../office/OfficeEditor';
import { driveApi, folderUrl, shareSource } from '../api';
import { useDrive } from '../DriveContext';

function decodePath(raw) {
  return (raw || '')
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join('/');
}

/** /app/drive/e/:shareId/<path> — a file of the file server in the online editor (Collabora). */
export default function EditPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const params = useParams();
  const shareId = Number(params.shareId);
  const path = decodePath(params['*']);
  const parent = path.split('/').slice(0, -1).join('/');
  const name = path.split('/').pop();
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const { shares } = useDrive();
  const share = shares?.find((item) => item.id === shareId);
  const where = [share?.title, ...parent.split('/').filter(Boolean)].filter(Boolean).join(' / ') || t('apps.drive.name');
  return (
    <OfficeEditor
      key={`${shareId}:${path}`}
      open={(options) => driveApi.openEditor(shareId, path, options)}
      name={name}
      ext={ext}
      where={where}
      backTo={{ label: where, go: () => navigate(folderUrl(shareId, parent)) }}
      downloadUrl={shareSource(shareId).file({ path }, { download: true })}
      previewTo={`/app/drive/v/${shareId}/${path.split('/').map(encodeURIComponent).join('/')}`}
    />
  );
}
